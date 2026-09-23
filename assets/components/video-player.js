(function initVideoPlayer(root) {
  'use strict';
  function normalizeVideoPlayer(data) {
    if (!data || data.type !== 'videoPlayer' || !/^[a-z][a-z0-9-]*$/.test(data.id) || typeof data.title !== 'string' || !data.title.trim()) throw new Error('Некорректный видеоплеер.');
    if (data.videoSrc && !/^\/api\/(?:lesson-draft-assets|library|classes)\/[a-zA-Z0-9/_-]+\.mp4$/.test(data.videoSrc)) throw new Error('Некорректный источник видео.');
    return { type: data.type, id: data.id, title: data.title.trim(), ...(data.videoSrc ? { videoSrc: data.videoSrc } : {}) };
  }
  function renderVideoPlayer(data, options = {}, documentRef = root.document) {
    let current = normalizeVideoPlayer(data);
    const doc = documentRef;
    const live = typeof options.sendMedia === 'function';
    let connected = options.connected !== false, peerPresent = Boolean(options.peerPresent), disposed = false;
    let blockedPlayback = false;
    let busy = false, pendingPosition = null, revision = -1, lastStatus = 0, desiredPlaying = false, playAttempt = 0;
    const section = doc.createElement('section');
    section.className = 'video-player'; section.dataset.componentId = current.id;
    const title = doc.createElement('h2'); title.textContent = current.title;
    const video = doc.createElement('video');
    video.preload = 'metadata'; video.playsInline = true;
    video.setAttribute('playsinline', '');
    const controls = doc.createElement('div'); controls.className = 'video-player__controls';
    const transport = doc.createElement('div'); transport.className = 'video-player__transport';
    controls.append(transport);
    const icons = {
      play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
      pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
      align: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
    };
    function setIcon(node, icon, label) {
      if (node.dataset.icon !== icon) {
        node.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[icon]}</svg>`;
        node.dataset.icon = icon;
      }
      node.className = 'video-player__icon-button'; node.title = label; node.setAttribute('aria-label', label);
    }
    function button(label, handler) {
      const node = doc.createElement('button'); node.type = 'button'; node.textContent = label;
      node.addEventListener('click', handler); transport.append(node); return node;
    }
    const status = doc.createElement('p'); status.className = 'video-player__status'; status.setAttribute('aria-live', 'polite');
    const time = doc.createElement('span');
    const seek = doc.createElement('input'); seek.type = 'range'; seek.min = '0'; seek.max = '0'; seek.step = '0.1'; seek.value = '0'; seek.setAttribute('aria-label', 'Позиция видео');
    const peerStatus = doc.createElement('p'); peerStatus.className = 'video-player__peer-status';
    peerStatus.textContent = peerPresent ? 'Позиция ученика недоступна' : 'Ученик не подключён';
    const fmt = value => { const seconds = Math.max(0, Math.floor(value || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
    function send(message) { if (live && connected && !disposed) options.sendMedia({ ...message, componentId: current.id }); }
    function report(force = false, blocked = blockedPlayback) {
      if (options.viewerRole !== 'student' || !live || (!force && Date.now() - lastStatus < 1000)) return;
      lastStatus = Date.now();
      send({ type: 'media-status', position: video.currentTime || 0, paused: video.paused, buffering: video.readyState < 3, blocked });
    }
    async function play() {
      desiredPlaying = true;
      const attempt = ++playAttempt;
      try {
        await video.play();
        if (!desiredPlaying || disposed) video.pause();
        if (attempt === playAttempt) { enable.hidden = true; blockedPlayback = false; status.textContent = ''; report(true); }
      } catch {
        if (attempt !== playAttempt || !desiredPlaying || disposed) return;
        blockedPlayback = true; enable.hidden = false; status.textContent = 'Нажмите «Включить просмотр», чтобы разрешить воспроизведение.'; report(true, true);
      }
    }
    function pause() { blockedPlayback = false; desiredPlaying = false; playAttempt++; video.pause(); enable.hidden = true; }
    const toggle = button('', () => {
      const action = video.paused ? 'play' : 'pause';
      // Start directly within the gesture to satisfy browser autoplay policies.
      if (action === 'play') play(); else pause();
      send({ type: 'media-command', action });
    });
    const align = options.viewerRole === 'teacher' && live ? button('', () => send({ type: 'media-align', position: video.currentTime })) : null;
    if (align) { setIcon(align, 'align', 'Перемотать ученика к моей позиции'); controls.append(peerStatus); }
    transport.append(seek, time); time.className = 'video-player__time';
    const enable = button('Включить просмотр', () => play()); enable.hidden = true;
    const volume = doc.createElement('input'); volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '0.05'; volume.value = '1'; volume.setAttribute('aria-label', 'Громкость');
    volume.addEventListener('input', () => { video.volume = Number(volume.value); }); transport.append(volume);
    button('⛶', () => section.requestFullscreen?.().catch(() => {})).setAttribute('aria-label', 'Полный экран');
    seek.addEventListener('input', () => { video.currentTime = Number(seek.value); });
    function paint() {
      const ready = Boolean(current.videoSrc) && !busy && (!live || connected);
      toggle.disabled = !ready; enable.disabled = !ready; seek.disabled = !ready || !Number.isFinite(video.duration);
      if (align) align.disabled = !ready || !peerPresent || !Number.isFinite(video.duration);
      setIcon(toggle, video.paused ? 'play' : 'pause', video.paused ? 'Смотреть' : 'Пауза');
      seek.max = String(Number.isFinite(video.duration) ? video.duration : 0); seek.value = String(video.currentTime || 0);
      time.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
    }
    for (const event of ['play', 'pause', 'timeupdate', 'waiting', 'playing', 'seeked', 'ended']) video.addEventListener(event, () => { paint(); report(event !== 'timeupdate'); });
    video.addEventListener('loadedmetadata', () => {
      if (pendingPosition !== null) { video.currentTime = Math.min(pendingPosition, video.duration); pendingPosition = null; }
      paint(); report(true);
    });
    video.addEventListener('error', () => { status.textContent = 'Не удалось загрузить видео. Попробуйте открыть урок заново.'; });
    const fileControls = doc.createElement('div'); fileControls.className = 'video-player__files';
    if (options.onUpload) {
      const input = doc.createElement('input'); input.type = 'file'; input.accept = 'video/mp4,.mp4'; input.hidden = true;
      const upload = doc.createElement('button'); upload.type = 'button'; upload.textContent = 'Загрузить / заменить видео'; upload.addEventListener('click', () => input.click());
      const remove = doc.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить видео';
      async function change(file) {
        if (busy) return;
        if (file && file.size > 300 * 1024 * 1024) { status.textContent = 'Видео должно быть не больше 300 МБ.'; return; }
        busy = true; upload.disabled = remove.disabled = true; pause(); paint(); status.textContent = file ? 'Загружаем и проверяем видео…' : 'Удаляем видео…';
        try {
          current = normalizeVideoPlayer(await (file ? options.onUpload(file, current.id) : options.onDelete(current.id)));
          setSource(); status.textContent = file ? 'Видео загружено.' : 'Видео удалено.';
        } catch (error) { status.textContent = error.message || 'Не удалось сохранить видео.'; }
        finally { busy = false; upload.disabled = remove.disabled = false; paint(); }
      }
      input.addEventListener('change', () => { if (input.files[0]) change(input.files[0]); input.value = ''; });
      remove.addEventListener('click', () => change(null));
      const hint = doc.createElement('span'); hint.textContent = 'MP4 · H.264/AAC · до 300 МБ';
      fileControls.append(upload, remove, input, hint);
    }
    function setSource() {
      pause(); pendingPosition = null;
      if (current.videoSrc) video.src = current.videoSrc;
      else video.removeAttribute('src');
      video.hidden = controls.hidden = !current.videoSrc;
      video.load(); paint();
    }
    let peerUpdated = 0;
    const timer = live ? root.setInterval(() => {
      report(true);
      if (align && Date.now() - peerUpdated > 3500) { peerStatus.textContent = peerPresent ? 'Позиция ученика недоступна' : 'Ученик не подключён'; }
    }, 1000) : null;
    section.receiveMedia = message => {
      if (message.type === 'media-status') {
        if (!align) return;
        peerUpdated = Date.now();
        peerStatus.textContent = `Позиция ученика: ${fmt(message.position)}${message.blocked ? ' · требуется включить просмотр' : message.buffering ? ' · загружается…' : message.paused ? ' · пауза' : ''}`;
        return;
      }
      if (message.revision <= revision) return;
      revision = message.revision;
      if (message.type === 'media-align') {
        if (video.readyState > 0) video.currentTime = Math.min(message.position, video.duration);
        else pendingPosition = message.position;
      } else if (message.action === 'play') play(); else pause();
    };
    section.setMediaConnection = (value, peer) => {
      if (!value) revision = -1;
      connected = value; peerPresent = peer;
      if (!connected || !peerPresent) { pause(); peerUpdated = 0; if (align) { peerStatus.textContent = 'Ученик не подключён'; } }
      paint();
    };
    section.dispose = () => { disposed = true; if (timer) root.clearInterval(timer); pause(); video.removeAttribute('src'); video.load(); };
    section.append(title, video, controls, fileControls, status); setSource();
    if (!current.videoSrc) status.textContent = 'Видео пока не загружено.';
    return section;
  }
  const api = { normalizeVideoPlayer, renderVideoPlayer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VideoPlayerComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
