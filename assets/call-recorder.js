/* Local-only recording. Never uploads media or stops the call's source tracks. */
(() => {
  'use strict';
  const MIME = 'video/webm;codecs=vp8,opus';
  const MAX_PENDING_BYTES = 32 * 1024 * 1024;

  function supported() {
    return Boolean(window.isSecureContext && window.showSaveFilePicker
      && window.MediaRecorder?.isTypeSupported(MIME)
      && window.AudioContext && HTMLCanvasElement.prototype.captureStream);
  }

  async function start({ getSources, canStart = () => true }) {
    if (!supported()) throw new Error('Для записи откройте занятие в настольном Chrome или Edge.');
    const handle = await window.showSaveFilePicker({
      suggestedName: `lesson-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`,
      types: [{ description: 'Видеозапись WebM', accept: { 'video/webm': ['.webm'] } }],
    });
    if (!canStart()) throw new DOMException('Звонок завершён.', 'AbortError');
    const file = await handle.createWritable();
    let context, output, timer, recorder;
    const videos = [document.createElement('video'), document.createElement('video')];
    const audioNodes = new Map();
    let writes = Promise.resolve();
    let pendingBytes = 0;
    let failure = null;
    let stopping = false;

    function cleanup() {
      clearInterval(timer);
      for (const node of audioNodes.values()) node.disconnect();
      audioNodes.clear();
      for (const video of videos) { video.pause(); video.srcObject = null; }
      output?.getTracks().forEach(track => track.stop());
      if (context) void context.close().catch(() => {});
    }

    function fail(error) {
      failure ??= error;
      if (recorder?.state !== 'inactive' && recorder) recorder.stop();
    }

    try {
      if (!canStart()) throw new DOMException('Звонок завершён.', 'AbortError');
      context = new AudioContext();
      await context.resume();
      if (!canStart()) throw new DOMException('Звонок завершён.', 'AbortError');
      const mix = context.createMediaStreamDestination();
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const paint = canvas.getContext('2d', { alpha: false });
      for (const video of videos) { video.muted = true; video.playsInline = true; }

      function tile(video, x, y, width, height, label) {
        paint.fillStyle = '#242236';
        paint.fillRect(x, y, width, height);
        if (video.srcObject && video.readyState >= 2 && video.videoWidth) {
          const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
          const w = video.videoWidth * scale;
          const h = video.videoHeight * scale;
          paint.drawImage(video, x + (width - w) / 2, y + (height - h) / 2, w, h);
        } else {
          paint.fillStyle = '#ffffff';
          paint.font = '24px sans-serif';
          paint.fillText('Нет видео', x + 24, y + height / 2);
        }
        paint.fillStyle = '#17152a';
        paint.fillRect(x, y + height - 38, width, 38);
        paint.fillStyle = '#ffffff';
        paint.font = '18px sans-serif';
        paint.fillText(label, x + 12, y + height - 12, width - 24);
      }

      function update() {
        const sources = getSources();
        const tracks = [sources.localVideo, sources.remoteVideo];
        tracks.forEach((track, index) => {
          const next = track?.readyState === 'live' && track.enabled && !track.muted ? track : null;
          if (videos[index].srcObject?.getVideoTracks()[0] !== (next || undefined)) {
            videos[index].srcObject = next ? new MediaStream([next]) : null;
            if (next) void videos[index].play().catch(() => {});
          }
        });
        const audio = new Set(sources.audio.filter(track => track?.readyState === 'live'));
        for (const [track, node] of audioNodes) {
          if (!audio.has(track)) { node.disconnect(); audioNodes.delete(track); }
        }
        for (const track of audio) {
          if (audioNodes.has(track)) continue;
          const node = context.createMediaStreamSource(new MediaStream([track]));
          node.connect(mix);
          audioNodes.set(track, node);
        }
        paint.fillStyle = '#17152a';
        paint.fillRect(0, 0, 1280, 720);
        const names = ['Преподаватель', sources.remoteName || 'Ученик'];
        const main = sources.localScreen ? 0 : sources.remoteScreen ? 1 : -1;
        if (main >= 0) {
          tile(videos[main], 0, 0, 1280, 720, names[main]);
          tile(videos[1 - main], 970, 16, 294, 180, names[1 - main]);
        } else {
          tile(videos[0], 0, 0, 632, 720, names[0]);
          tile(videos[1], 648, 0, 632, 720, names[1]);
        }
      }

      update();
      output = canvas.captureStream(24);
      output.addTrack(mix.stream.getAudioTracks()[0]);
      recorder = new MediaRecorder(output, {
        mimeType: MIME, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 128_000,
      });
      recorder.ondataavailable = ({ data }) => {
        if (!data.size || failure) return;
        if (pendingBytes + data.size > MAX_PENDING_BYTES) {
          fail(new Error('Диск не успевает сохранять запись. Освободите место и попробуйте снова.'));
          return;
        }
        pendingBytes += data.size;
        writes = writes.then(async () => {
          if (!failure) await file.write(data);
        }).catch(fail).finally(() => { pendingBytes -= data.size; });
      };
      recorder.onerror = event => fail(event.error || new Error('Ошибка записи видео.'));
      const finished = new Promise((resolve, reject) => {
        recorder.onstop = async () => {
          stopping = true;
          clearInterval(timer);
          try {
            await writes;
            if (failure) throw failure;
            await file.close();
            resolve();
          } catch (error) {
            await file.abort().catch(() => {});
            reject(error);
          } finally { cleanup(); }
        };
      });
      recorder.start(1000);
      timer = setInterval(() => {
        if (stopping || failure) return;
        try { update(); } catch (error) { fail(error); }
      }, 1000 / 24);
      return {
        finished,
        stop() {
          stopping = true;
          if (recorder.state !== 'inactive') recorder.stop();
          return finished;
        },
      };
    } catch (error) {
      cleanup();
      await file.abort().catch(() => {});
      throw error;
    }
  }

  window.CallRecorder = { supported, start };
})();
