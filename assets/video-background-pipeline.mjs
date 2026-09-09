// Browser-specific transport; segmentation/compositing always runs in the worker.
export function chooseTransport(workerCapabilities, scope = globalThis) {
  if (workerCapabilities.native) return 'worker-track';
  if (typeof scope.MediaStreamTrackProcessor === 'function'
    && typeof scope.MediaStreamTrackGenerator === 'function') return 'transferred-streams';
  return 'canvas-worker';
}

export function createBackgroundPipeline({ camera, config, onDiagnostic, onFailure }) {
  const worker = new Worker(new URL('./video-background-worker.js', import.meta.url));
  let stopped = false, settled = false, initialized = false;
  let source, output, video, canvas, context, readable, writable;
  let transport = 'pending', details = { model: config.model?.id,
    mode: config.mode === 'blur' ? 'blur' : 'replacement', targetFps: config.targetFps }, destroyTimer;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const report = (event, extra = {}) => onDiagnostic(event, { pipelineVersion: 3, transport, ...details, ...extra });
  const timeout = setTimeout(() => fail(new Error('Не удалось получить обработанный кадр за 30 секунд')), 30_000);
  const session = {
    ready,
    get track() { return output; },
    get details() { return { pipelineVersion: 3, transport, ...details }; },
    visibility(hidden) {
      config.hidden = hidden;
      if (!stopped) worker.postMessage({ type: 'visibility', hidden });
    },
    stop() {
      if (stopped) return;
      stopped = true;
      clearTimeout(timeout);
      source?.stop();
      output?.stop();
      if (video) { video.pause(); video.srcObject = null; }
      if (!settled) { settled = true; rejectReady(new DOMException('Effect stopped', 'AbortError')); }
      worker.postMessage({ type: 'stop' });
      // Give the worker a chance to close streams and the model, then force cleanup.
      destroyTimer = setTimeout(() => worker.terminate(), 1000);
      if (readable && !readable.locked) void readable.cancel().catch(() => {});
      if (writable && !writable.locked) void writable.abort().catch(() => {});
    },
  };
  function fail(error) {
    if (stopped) return;
    const wasReady = settled;
    if (!settled) { settled = true; rejectReady(error); }
    report('background-effect-failure', { state: 'failed', errorText: `${error.name}: ${error.message}` });
    session.stop();
    if (wasReady) onFailure(error);
  }
  async function initialize(capabilities) {
    if (initialized || stopped) return;
    initialized = true;
    if (!capabilities.offscreen) throw new Error('Браузер не поддерживает обработку фона в Worker');
    transport = chooseTransport(capabilities);
    source = camera.clone();
    const settings = source.getSettings();
    const sourceWidth = settings.width || 1280;
    const sourceHeight = settings.height || 720;
    const width = Math.max(2, Math.round(Math.min(sourceWidth, config.maxWidth) / 2) * 2);
    const height = Math.max(2, Math.round(width * sourceHeight / sourceWidth / 2) * 2);
    const message = { type: 'init', transport, config: { ...config, width, height } };
    const transfer = [];
    if (transport === 'worker-track') {
      message.track = source;
      transfer.push(source);
    } else if (transport === 'transferred-streams') {
      readable = new MediaStreamTrackProcessor({ track: source, maxBufferSize: 1 }).readable;
      output = new MediaStreamTrackGenerator({ kind: 'video' });
      writable = output.writable;
      Object.assign(message, { readable, writable });
      transfer.push(readable, writable);
    } else {
      canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      context = canvas.getContext('2d');
      // Until the first processed frame, the output remains a neutral surface.
      context.fillStyle = '#242136'; context.fillRect(0, 0, width, height);
      const manual = typeof CanvasCaptureMediaStreamTrack !== 'undefined'
        && typeof CanvasCaptureMediaStreamTrack.prototype.requestFrame === 'function';
      output = canvas.captureStream(manual ? 0 : config.targetFps).getVideoTracks()[0];
      video = document.createElement('video');
      video.muted = true; video.playsInline = true;
      video.srcObject = new MediaStream([source]);
      await video.play();
      if (stopped) return;
    }
    worker.postMessage(message, transfer);
    report('background-effect-ready', { state: 'starting' });
  }
  async function handle(data) {
    if (data.type === 'stopped') { clearTimeout(destroyTimer); worker.terminate(); return; }
    if (stopped) { data.frame?.close(); data.track?.stop(); return; }
    switch (data.type) {
      case 'capabilities': await initialize(data); break;
      case 'track': output = data.track; break;
      case 'ready':
        if (!output || output.readyState !== 'live') throw new Error('Обработанный видеотрек недоступен');
        details = data.details;
        clearTimeout(timeout);
        if (!settled) { settled = true; resolveReady(session); }
        break;
      case 'pull': {
        if (video.readyState < 2) { worker.postMessage({ type: 'empty' }); break; }
        const frame = await createImageBitmap(video, { resizeWidth: canvas.width, resizeHeight: canvas.height });
        if (stopped) { frame.close(); break; }
        try { worker.postMessage({ type: 'frame', frame }, [frame]); }
        catch (error) { frame.close(); throw error; }
        break;
      }
      case 'frame':
        try { context.drawImage(data.frame, 0, 0, canvas.width, canvas.height); output.requestFrame?.(); }
        finally { data.frame.close(); }
        worker.postMessage({ type: 'ack' });
        break;
      case 'stats': report('background-effect-stats', data.details); break;
      case 'health': report('background-effect-health', data.details); break;
      case 'diagnostic': report('background-effect-health', data); break;
      case 'failure': throw new Error(data.errorText);
    }
  }
  worker.onmessage = ({ data }) => { void handle(data).catch(fail); };
  worker.onerror = event => { event.preventDefault(); fail(new Error(event.message || 'Video worker failed')); };
  worker.onmessageerror = () => fail(new Error('Не удалось передать видеоданные Worker'));
  return session;
}
