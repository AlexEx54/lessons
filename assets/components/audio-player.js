(function initAudioPlayerComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s|^\s*(?:[-*+]\s|\d+\.\s)/m;
  const COMPONENT_KEYS = ['type', 'id', 'title', 'script', 'audioSrc'];
  const PLAYBACK_RATES = [1, 1.25, 1.5, 2];

  function normalizeTitle(value) {
    if (typeof value !== 'string') throw new Error('AudioPlayer title must be a string.');
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (!normalized) throw new Error('AudioPlayer requires title.');
    if (MARKUP.test(normalized)) throw new Error('AudioPlayer does not allow HTML or Markdown in title.');
    return normalized;
  }

  function normalizeScript(value) {
    if (typeof value !== 'string') throw new Error('AudioPlayer script must be a string.');
    const normalized = value.replace(/\r\n?/g, '\n').split('\n').map(line => line.replace(/\s+$/g, '')).join('\n').trim();
    if (!normalized) throw new Error('AudioPlayer requires script.');
    if (MARKUP.test(normalized)) throw new Error('AudioPlayer does not allow HTML or Markdown in script.');
    return normalized;
  }

  function normalizeAudioSrc(value) {
    if (value == null) return '';
    if (typeof value !== 'string') throw new Error('AudioPlayer audioSrc must be a string.');
    const normalized = value.trim();
    if (!normalized) throw new Error('AudioPlayer requires a non-empty audioSrc.');
    return normalized;
  }

  function normalizeAudioPlayer(data) {
    if (!data || data.type !== 'audioPlayer' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('AudioPlayer requires type "audioPlayer" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !COMPONENT_KEYS.includes(key))) {
      throw new Error('AudioPlayer contains unsupported fields.');
    }
    const normalized = {
      type: 'audioPlayer',
      id: data.id,
      title: normalizeTitle(data.title),
      script: normalizeScript(data.script),
    };
    const audioSrc = normalizeAudioSrc(data.audioSrc);
    if (audioSrc) normalized.audioSrc = audioSrc;
    return normalized;
  }

  function slotRenderMode(data) {
    if (data && data.audioSrc) return 'player';
    return 'script';
  }

  function previewScript(script) {
    const lines = String(script || '').split('\n').filter(line => line.trim());
    const preview = lines.slice(0, 2).join('\n');
    return lines.length > 2 ? `${preview}…` : preview;
  }

  function formatPlayerTime(seconds) {
    const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
  }

  function formatPlaybackRate(rate) {
    const value = Number(rate);
    if (!Number.isFinite(value) || value === 1) return '1x';
    return `${String(value).replace(/\.0$/, '')}x`;
  }

  function nextPlaybackRate(rate) {
    const index = PLAYBACK_RATES.indexOf(Number(rate));
    return PLAYBACK_RATES[index < 0 || index === PLAYBACK_RATES.length - 1 ? 0 : index + 1];
  }

  function canUseBlobSource(globalRef) {
    return Boolean(
      globalRef
      && globalRef.window === globalRef
      && typeof globalRef.fetch === 'function'
      && globalRef.URL
      && typeof globalRef.URL.createObjectURL === 'function'
    );
  }

  function createAudioIcon(doc) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    [['path', { d: 'M5 9v6h4l5 4V5L9 9z' }],
      ['path', { d: 'M17 8.2a5.2 5.2 0 0 1 0 7.6' }],
      ['path', { d: 'M19.5 5.7a8.7 8.7 0 0 1 0 12.6' }]]
      .forEach(([tag, attributes]) => {
        const shape = doc.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, value));
        svg.append(shape);
      });
    return svg;
  }

  function createPlayIcon(doc) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8.4 6.2v11.6L18.2 12z');
    svg.append(path);
    return svg;
  }

  function createPauseIcon(doc) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    [['7.4', '6.2', '3.2', '11.6'], ['13.4', '6.2', '3.2', '11.6']].forEach(([x, y, width, height]) => {
      const bar = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bar.setAttribute('x', x);
      bar.setAttribute('y', y);
      bar.setAttribute('width', width);
      bar.setAttribute('height', height);
      bar.setAttribute('rx', '0.8');
      svg.append(bar);
    });
    return svg;
  }

  function createEyeIcon(doc) {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const eye = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    eye.setAttribute('d', 'M2.7 12s3.4-6 9.3-6 9.3 6 9.3 6-3.4 6-9.3 6-9.3-6-9.3-6Z');
    const pupil = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pupil.setAttribute('cx', '12');
    pupil.setAttribute('cy', '12');
    pupil.setAttribute('r', '2.6');
    svg.append(eye, pupil);
    return svg;
  }

  function renderAudioPlayer(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('AudioPlayer requires a document.');

    let current = normalizeAudioPlayer(data);
    let editing = false;
    let saving = false;
    let audioBusy = false;
    let initialSnapshot = '';
    let playbackRate = 1;
    let seeking = false;
    let objectUrl = '';
    let objectUrlFor = '';
    let sourcePromise = null;
    let scriptText = null;

    const section = doc.createElement('section');
    section.className = 'audio-player';
    section.dataset.componentId = current.id;

    const header = doc.createElement('header');
    header.className = 'audio-player__header';
    const title = doc.createElement('h2');
    title.className = 'audio-player__title';
    title.dataset.placeholder = 'Введите заголовок';
    const actions = doc.createElement('div');
    actions.className = 'audio-player__actions';
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'audio-player__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать аудио');
    header.append(title, actions);

    const slot = doc.createElement('div');
    slot.className = 'audio-player__slot';
    const audio = doc.createElement('audio');
    audio.preload = 'metadata';
    audio.setAttribute('playsinline', '');

    function releaseObjectUrl() {
      if (objectUrl && root.URL && typeof root.URL.revokeObjectURL === 'function') {
        root.URL.revokeObjectURL(objectUrl);
      }
      objectUrl = '';
      objectUrlFor = '';
    }

    function resetAudioElement() {
      if (typeof audio.pause === 'function') audio.pause();
      audio.removeAttribute('src');
      if (typeof audio.load === 'function') audio.load();
      releaseObjectUrl();
      sourcePromise = null;
    }

    function loadAudioSource(src) {
      if (!src) return Promise.resolve();
      if (objectUrlFor === src && objectUrl) {
        if (audio.getAttribute('src') !== objectUrl) audio.src = objectUrl;
        return Promise.resolve();
      }
      if (sourcePromise && sourcePromise.src === src) return sourcePromise.promise;

      const promise = (async () => {
        if (canUseBlobSource(root)) {
          const response = await root.fetch(src, { credentials: 'same-origin' });
          if (!response.ok) throw new Error('Не удалось загрузить аудио.');
          const type = String(response.headers.get('content-type') || '').split(';')[0].trim();
          const blob = new Blob([await response.arrayBuffer()], { type: type || 'application/octet-stream' });
          const nextUrl = root.URL.createObjectURL(blob);
          releaseObjectUrl();
          objectUrl = nextUrl;
          objectUrlFor = src;
          audio.src = objectUrl;
        } else {
          audio.src = src;
          objectUrlFor = src;
        }
        if (typeof audio.load === 'function') audio.load();
      })();

      sourcePromise = { src, promise };
      return promise.catch((error) => {
        if (sourcePromise && sourcePromise.src === src) sourcePromise = null;
        throw error;
      });
    }

    function notify(message) {
      if (typeof settings.onMessage === 'function') settings.onMessage(message);
    }

    function snapshot() {
      return JSON.stringify({
        title: normalizeTitle(title.textContent || ''),
        script: normalizeScript(scriptText ? scriptText.textContent : current.script),
      });
    }

    function setDirty(dirty) {
      section.classList.toggle('audio-player--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function updateDirty() {
      if (!editing) return;
      try {
        setDirty(snapshot() !== initialSnapshot);
      } catch (_error) {
        setDirty(true);
      }
    }

    function safeDuration() {
      const duration = Number(audio.duration);
      return Number.isFinite(duration) && duration > 0 ? duration : 0;
    }

    function paintPlayButton(playing) {
      playButton.replaceChildren(playing ? createPauseIcon(doc) : createPlayIcon(doc));
      playButton.setAttribute('aria-label', playing ? 'Пауза' : 'Слушать');
      playButton.classList.toggle('audio-player__play--paused', !playing);
    }

    function paintProgress() {
      const duration = safeDuration();
      const currentTime = Number(audio.currentTime);
      const time = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0;
      const percent = duration ? Math.min(100, (time / duration) * 100) : 0;
      if (!seeking) slider.value = String(Math.round(percent * 10));
      setProgressPercent(percent);
      timeLabel.textContent = formatPlayerTime(time);
    }

    function applyPlaybackRate() {
      audio.playbackRate = playbackRate;
      speedButton.textContent = formatPlaybackRate(playbackRate);
      speedButton.setAttribute('aria-label', `Скорость воспроизведения ${formatPlaybackRate(playbackRate)}`);
    }

    async function togglePlayback() {
      if (!current.audioSrc || typeof audio.play !== 'function') return;
      if (audio.paused === false) {
        if (typeof audio.pause === 'function') audio.pause();
        return;
      }
      try {
        if (objectUrlFor !== current.audioSrc || !audio.getAttribute('src')) {
          await loadAudioSource(current.audioSrc);
        }
        applyPlaybackRate();
        const result = audio.play();
        if (result && typeof result.catch === 'function') await result;
      } catch (_error) {
        notify('Не удалось воспроизвести аудио.');
      }
    }

    function setProgressPercent(percent) {
      const value = `${Math.max(0, Math.min(100, percent))}%`;
      track.style.setProperty('--audio-player-progress', value);
    }

    function seekFromSlider() {
      const duration = safeDuration();
      if (!duration) return;
      audio.currentTime = (Number(slider.value) / 1000) * duration;
      paintProgress();
    }

    const player = doc.createElement('div');
    player.className = 'audio-player__controls';
    const playButton = doc.createElement('button');
    playButton.type = 'button';
    playButton.className = 'audio-player__play';
    playButton.addEventListener('click', () => togglePlayback());
    const track = doc.createElement('div');
    track.className = 'audio-player__track';
    const ticks = doc.createElement('span');
    ticks.className = 'audio-player__ticks';
    ticks.setAttribute('aria-hidden', 'true');
    const slider = doc.createElement('input');
    slider.type = 'range';
    slider.className = 'audio-player__slider';
    slider.min = '0';
    slider.max = '1000';
    slider.value = '0';
    slider.step = '1';
    slider.setAttribute('aria-label', 'Положение в аудио');
    slider.addEventListener('pointerdown', () => { seeking = true; });
    slider.addEventListener('pointerup', () => { seeking = false; seekFromSlider(); });
    slider.addEventListener('input', () => {
      const duration = safeDuration();
      const percent = Number(slider.value) / 10;
      setProgressPercent(percent);
      if (duration) timeLabel.textContent = formatPlayerTime((percent / 100) * duration);
    });
    slider.addEventListener('change', () => {
      seeking = false;
      seekFromSlider();
    });
    track.append(ticks, slider);
    const timeLabel = doc.createElement('span');
    timeLabel.className = 'audio-player__time';
    const speedButton = doc.createElement('button');
    speedButton.type = 'button';
    speedButton.className = 'audio-player__speed';
    speedButton.addEventListener('click', () => {
      playbackRate = nextPlaybackRate(playbackRate);
      applyPlaybackRate();
    });
    player.append(playButton, track, timeLabel, speedButton);

    if (typeof audio.addEventListener === 'function') {
      audio.addEventListener('loadedmetadata', paintProgress);
      audio.addEventListener('timeupdate', paintProgress);
      audio.addEventListener('play', () => paintPlayButton(true));
      audio.addEventListener('pause', () => paintPlayButton(false));
      audio.addEventListener('ended', () => {
        audio.currentTime = 0;
        paintPlayButton(false);
        paintProgress();
      });
      audio.addEventListener('error', () => {
        if (!current.audioSrc || !audio.getAttribute('src')) return;
        notify('Не удалось воспроизвести аудио.');
      });
    }

    async function copyScript(button) {
      try {
        const clipboard = root.navigator && root.navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('Clipboard unavailable');
        await clipboard.writeText(editing && scriptText ? scriptText.textContent : current.script);
        button.classList.add('audio-player__copy--done');
        notify('Текст для озвучки скопирован.');
        root.setTimeout(() => button.classList.remove('audio-player__copy--done'), 900);
      } catch (_error) {
        notify('Не удалось скопировать текст для озвучки.');
      }
    }

    async function uploadAudio(file) {
      if (!file || audioBusy || typeof settings.onUpload !== 'function') return;
      const editorDraft = editing ? {
        title: title.textContent,
        script: scriptText ? scriptText.textContent : current.script,
      } : null;
      audioBusy = true;
      section.classList.add('audio-player--busy');
      try {
        const saved = await settings.onUpload(file, current.id);
        current = normalizeAudioPlayer(saved);
        renderSlot();
        if (editorDraft) {
          title.textContent = editorDraft.title;
          scriptText.textContent = editorDraft.script;
          updateDirty();
        }
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        audioBusy = false;
        section.classList.remove('audio-player--busy');
      }
    }

    async function deleteAudio() {
      if (audioBusy || typeof settings.onDelete !== 'function') return;
      if (typeof root.confirm === 'function' && !root.confirm('Удалить аудиофайл?')) {
        return;
      }
      const editorDraft = editing ? {
        title: title.textContent,
        script: scriptText ? scriptText.textContent : current.script,
      } : null;
      audioBusy = true;
      section.classList.add('audio-player--busy');
      try {
        const saved = await settings.onDelete(current.id);
        current = normalizeAudioPlayer(saved);
        resetAudioElement();
        renderSlot();
        if (editorDraft) {
          title.textContent = editorDraft.title;
          scriptText.textContent = editorDraft.script;
          updateDirty();
        }
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        audioBusy = false;
        section.classList.remove('audio-player--busy');
      }
    }

    function fileControls(hasAudio) {
      const controls = doc.createElement('div');
      controls.className = 'audio-player__file-actions';
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'audio/mpeg,audio/mp3,audio/wav,audio/wave,audio/x-wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a';
      input.hidden = true;
      const upload = doc.createElement('button');
      upload.type = 'button';
      upload.className = 'audio-player__file-action';
      upload.textContent = hasAudio ? 'Заменить' : 'Загрузить';
      upload.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        uploadAudio(file);
        input.value = '';
      });
      controls.append(upload, input);
      if (hasAudio && typeof settings.onDelete === 'function') {
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'audio-player__file-action audio-player__file-action--remove';
        remove.textContent = 'Удалить';
        remove.addEventListener('click', () => deleteAudio());
        controls.append(remove);
      }
      return controls;
    }

    function renderScriptBox(full, includeFileControls = false, hasAudio = false) {
      const scriptBox = doc.createElement('div');
      scriptBox.className = full
        ? 'audio-player__script audio-player__script--full'
        : 'audio-player__script audio-player__script--preview';
      const icon = doc.createElement('span');
      icon.className = 'audio-player__script-icon';
      icon.append(createAudioIcon(doc));
      scriptText = doc.createElement('pre');
      scriptText.className = 'audio-player__script-text';
      scriptText.textContent = current.script;
      scriptText.contentEditable = editing ? 'true' : 'false';
      if (editing) {
        scriptText.setAttribute('role', 'textbox');
        scriptText.setAttribute('aria-label', 'Транскрипция аудио');
        scriptText.setAttribute('aria-multiline', 'true');
      }
      scriptText.addEventListener('input', () => { if (editing) updateDirty(); });
      scriptText.addEventListener('paste', (event) => {
        if (!editing) return;
        event.preventDefault();
        const plainText = event.clipboardData?.getData('text/plain') || '';
        if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
      });
      const scriptActions = doc.createElement('div');
      scriptActions.className = 'audio-player__script-actions';
      const showTranscriptButton = doc.createElement('button');
      showTranscriptButton.type = 'button';
      showTranscriptButton.className = 'audio-player__show';
      showTranscriptButton.dataset.studentVisibilityControl = '';
      showTranscriptButton.append(createEyeIcon(doc), doc.createTextNode('Показать'));
      showTranscriptButton.setAttribute('aria-label', 'Показать транскрипцию ученику');
      const copy = doc.createElement('button');
      copy.type = 'button';
      copy.className = 'audio-player__copy';
      copy.textContent = '⧉';
      copy.title = 'Скопировать текст для озвучки';
      copy.setAttribute('aria-label', 'Скопировать текст для озвучки');
      copy.addEventListener('click', () => copyScript(copy));
      scriptActions.append(copy);
      scriptBox.append(icon, scriptText, scriptActions, showTranscriptButton);
      if (includeFileControls && typeof settings.onUpload === 'function') {
        scriptBox.append(fileControls(hasAudio));
      }
      return scriptBox;
    }

    function renderSlot() {
      const canUpload = typeof settings.onUpload === 'function';
      const mode = slotRenderMode(current, editing, canUpload);
      slot.hidden = mode === 'hidden';
      slot.replaceChildren();
      scriptText = null;
      if (mode === 'hidden') {
        resetAudioElement();
        return;
      }
      if (mode === 'player') {
        loadAudioSource(current.audioSrc).catch(() => {
          notify('Не удалось загрузить аудио.');
        });
        applyPlaybackRate();
        paintPlayButton(false);
        paintProgress();
        slot.append(player, audio, renderScriptBox(true, editing && canUpload, true));
        return;
      }

      slot.append(renderScriptBox(true, editing && canUpload));
    }

    function paint(value, replaceCurrent = false) {
      current = normalizeAudioPlayer(replaceCurrent ? value : { ...current, ...value });
      title.textContent = current.title;
      section.classList.toggle('audio-player--editing', editing);
      renderSlot();
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      title.contentEditable = 'false';
      if (scriptText) scriptText.contentEditable = 'false';
      title.removeAttribute('role');
      title.removeAttribute('aria-label');
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать аудио');
      section.classList.remove('audio-player--editing', 'audio-player--saving');
      setDirty(false);
      title.textContent = current.title;
      renderSlot();
    }

    function enterEditMode() {
      if (editing) return;
      editing = true;
      title.contentEditable = 'true';
      title.setAttribute('role', 'textbox');
      title.setAttribute('aria-label', 'Заголовок аудио');
      initialSnapshot = JSON.stringify({ title: current.title, script: current.script });
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить аудиоплеер');
      section.classList.add('audio-player--editing');
      renderSlot();
      scriptText.focus();
    }

    function cancelEditing() {
      if (!editing || saving) return;
      paint(current);
      leaveEditMode();
      editButton.focus();
    }

    async function saveEditing() {
      if (!editing || saving) return;
      let changes;
      try {
        changes = {
          title: normalizeTitle(title.textContent || ''),
          script: normalizeScript(scriptText ? scriptText.textContent : ''),
        };
        normalizeAudioPlayer({ ...current, ...changes });
      } catch (_error) {
        notify('Введите заголовок и транскрипцию аудио.');
        return;
      }
      saving = true;
      section.classList.add('audio-player--saving');
      editButton.disabled = true;
      try {
        const saved = await settings.onSave(changes, current.id);
        paint(saved || { ...current, ...changes }, Boolean(saved));
        leaveEditMode();
      } catch (_error) {
        saving = false;
        section.classList.remove('audio-player--saving');
        editButton.disabled = false;
        scriptText.focus();
      }
    }

    editButton.addEventListener('click', () => (editing ? saveEditing() : enterEditMode()));
    title.addEventListener('input', () => { if (editing) updateDirty(); });
    title.addEventListener('paste', (event) => {
      if (!editing) return;
      event.preventDefault();
      const plainText = event.clipboardData?.getData('text/plain') || '';
      if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
    });
    title.addEventListener('keydown', (event) => {
      if (editing && event.key === 'Enter') event.preventDefault();
    });
    section.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });

    paint(current);
    if (typeof settings.onSave === 'function') actions.append(editButton);
    section.append(header, slot);
    return section;
  }

  const api = {
    normalizeAudioPlayer,
    previewScript,
    slotRenderMode,
    formatPlayerTime,
    formatPlaybackRate,
    nextPlaybackRate,
    canUseBlobSource,
    renderAudioPlayer,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.AudioPlayerComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
