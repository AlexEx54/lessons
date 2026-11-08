(() => {
  'use strict';

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const role = pathParts[0] === 'call' ? 'guest' : 'teacher';
  const roomReference = decodeURIComponent(pathParts[1] || '');
  const roomEndpoint = role === 'teacher'
    ? `/api/video-calls/${encodeURIComponent(roomReference)}`
    : `/api/public/video-calls/${encodeURIComponent(roomReference)}`;
  const exitPath = role === 'teacher' ? '/video-calls' : '/';
  // The room is permanent, so either participant may come first and wait for the other.
  const peerTitle = role === 'teacher' ? 'Ученик' : 'Преподаватель';
  const waitingStatus = role === 'teacher' ? 'Ждём ученика' : 'Ждём преподавателя';
  const callEndedText = role === 'teacher' ? 'Вы завершили видеозвонок.' : 'Преподаватель завершил видеозвонок.';
  const STATUS_TEXT = {
    connecting: ['Подключаемся к комнате…'],
    waiting: [waitingStatus],
    'peer-joining': [`${peerTitle} подключается…`],
    connected: ['Соединение установлено', 'connected'],
    interrupted: ['Соединение прервано, восстанавливаем…', 'error'],
    'peer-left': [`${peerTitle} вышел`],
    offline: ['Нет соединения с сервером', 'error'],
    'socket-error': ['Ошибка соединения', 'error'],
    unsupported: ['Браузер не смог создать медиасоединение', 'error'],
    'negotiation-failed': ['Не удалось настроить медиасоединение', 'error'],
  };
  const elements = {
    brand: document.getElementById('room-brand'),
    connection: document.getElementById('room-connection'),
    prejoin: document.getElementById('prejoin'),
    previewVideo: document.getElementById('preview-video'),
    previewPlaceholder: document.getElementById('preview-placeholder'),
    guestNameField: document.getElementById('guest-name-field'),
    participantName: document.getElementById('participant-name'),
    prejoinMic: document.getElementById('prejoin-mic'),
    prejoinCamera: document.getElementById('prejoin-camera'),
    prejoinBackgroundOptions: document.getElementById('prejoin-background-options'),
    prejoinError: document.getElementById('prejoin-error'),
    join: document.getElementById('join-call'),
    stage: document.getElementById('call-stage'),
    localVideo: document.getElementById('local-video'),
    localPlaceholder: document.getElementById('local-placeholder'),
    remoteVideo: document.getElementById('remote-video'),
    remotePlaceholder: document.getElementById('remote-placeholder'),
    remotePlaceholderText: document.getElementById('remote-placeholder-text'),
    prejoinInvite: document.getElementById('prejoin-invite'),
    remoteInvite: document.getElementById('remote-invite'),
    remoteName: document.getElementById('remote-name'),
    remoteMuted: document.getElementById('remote-muted'),
    toggleMic: document.getElementById('toggle-mic'),
    toggleCamera: document.getElementById('toggle-camera'),
    toggleBackground: document.getElementById('toggle-background'),
    toggleScreen: document.getElementById('toggle-screen'),
    screenAudioStatus: document.getElementById('screen-audio-status'),
    callBackgroundPanel: document.getElementById('call-background-panel'),
    callBackgroundOptions: document.getElementById('call-background-options'),
    closeBackgroundPanel: document.getElementById('close-background-panel'),
    leave: document.getElementById('leave-call'),
    leaveLabel: document.getElementById('leave-label'),
    ended: document.getElementById('room-ended'),
    endedTitle: document.getElementById('room-ended-title'),
    endedMessage: document.getElementById('room-ended-message'),
    rejoinLink: document.getElementById('room-rejoin-link'),
    exitLink: document.getElementById('room-exit-link'),
  };

  const recordingButton = document.getElementById('toggle-recording');
  const recordingStatus = document.getElementById('recording-status');
  const recorder = window.CallRecorder.control({
    getSources: recordingSources, canStart: () => !leaving, onChange: renderRecording,
  });
  let recordingPublished = false;

  function recordingSources() {
    const remote = connection.remote();
    const remoteStream = connection.remoteStream;
    return {
      localVideo: media.outboundVideoTrack(),
      remoteVideo: (remote.screen || remote.video !== false) ? remoteStream.getVideoTracks()[0] : null,
      localScreen: media.sentState().screen,
      remoteScreen: remote.screen,
      remoteName: elements.remoteName.textContent,
      audio: [media.outboundAudioTrack(), ...remoteStream.getAudioTracks()],
    };
  }

  function renderRecording() {
    if (role !== 'teacher') return;
    const state = recorder.state();
    recordingButton.disabled = leaving || state.busy || !window.CallRecorder.supported();
    recordingButton.setAttribute('aria-pressed', String(state.recording));
    recordingButton.querySelector('span').textContent = state.recording ? 'Остановить запись' : 'Записать';
    recordingStatus.hidden = !state.message;
    recordingStatus.textContent = state.message;
    // The recording flag goes out with this side's media state.
    if (state.recording !== recordingPublished) {
      recordingPublished = state.recording;
      connection.publishMediaState();
    }
  }

  recordingButton.hidden = role !== 'teacher';
  if (role !== 'teacher') {
    recordingButton.remove();
    recordingStatus.remove();
  }
  if (role === 'teacher' && !window.CallRecorder?.supported()) {
    recordingButton.disabled = true;
    recordingButton.title = 'Для записи нужен настольный Chrome или Edge';
  }
  recordingButton.addEventListener('click', () => { if (role === 'teacher' && !leaving) void recorder.toggle(); });
  window.addEventListener('beforeunload', event => {
    if (recorder.state().unsaved) { event.preventDefault(); event.returnValue = ''; }
  });

  let room = null;
  let joined = false;
  let leaving = false;
  const media = window.CallMedia.create({
    diagnostic: (event, details) => connection.diagnostic(event, details),
    applyAudio: () => connection.applyAudio(),
    applyVideo: () => connection.applyVideo(),
    publish: () => connection.publishMediaState(),
    onChange: renderMedia,
  });
  const connection = window.CallConnection.create({
    role,
    socketUrl: websocketUrl,
    iceEndpoint: roomEndpoint,
    media,
    localDetails: () => ({
      recording: role === 'teacher' && recorder.state().recording,
      // Without a typed name the teacher keeps the room name as the student's label.
      name: role === 'guest' ? elements.participantName.value.trim() : 'Преподаватель',
    }),
    remoteVideo: elements.remoteVideo,
    onStatus: renderStatus,
    onRemote: renderRemote,
    onMessage: message => {
      if (message.type === 'chat-message') window.RoomChat?.receive(message.message);
      else if (message.type === 'connected') window.RoomChat?.sync();
    },
    onEnded: reason => (reason === 'elsewhere'
      ? finishCall('Звонок продолжается в другой вкладке или на другом устройстве. '
        + 'Чтобы вернуть его сюда, нажмите «Подключиться снова».', 'Звонок открыт в другом месте')
      : finishCall(callEndedText)),
  });

  elements.brand.href = exitPath;
  elements.exitLink.href = exitPath;
  elements.exitLink.textContent = role === 'teacher' ? 'К списку звонков' : 'На главную';
  elements.leaveLabel.textContent = role === 'teacher' ? 'Завершить' : 'Выйти';
  elements.guestNameField.hidden = role !== 'guest';
  document.addEventListener('visibilitychange', () => media.setPageHidden(document.hidden));

  function setConnection(text, state = '') {
    elements.connection.dataset.state = state;
    elements.connection.lastChild.textContent = ` ${text}`;
  }

  function renderBackgroundOptions(container) {
    const fragment = document.createDocumentFragment();
    window.CallMedia.BACKGROUND_OPTIONS.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'background-option';
      button.dataset.backgroundOption = option.id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', option.label);

      const preview = document.createElement('span');
      preview.className = `background-option__preview ${option.previewClass || ''}`.trim();
      if (option.src) preview.style.backgroundImage = `url("${option.src}")`;
      const label = document.createElement('span');
      label.textContent = option.label;
      button.append(preview, label);
      button.addEventListener('click', () => media.selectBackground(option.id));
      fragment.append(button);
    });
    container.replaceChildren(fragment);
  }

  const EFFECT_STAGES = {
    worker: 'Запускаем обработку',
    wasm: 'Загружаем модель',
    segmenter: 'Настраиваем модель',
    'background-image': 'Загружаем фон',
    'first-frame': 'Обрабатываем первый кадр',
  };

  // progress: null hides the notice, { stage } shows preparation, { failed: background } offers a retry.
  function renderEffectProgress(progress) {
    document.querySelectorAll('.effect-progress').forEach(notice => {
      notice.hidden = !progress;
      if (!progress) return;
      const failed = Boolean(progress.failed);
      notice.dataset.state = failed ? 'error' : 'loading';
      notice.querySelector('.effect-progress__title').textContent = failed ? 'Не удалось включить фон' : 'Готовим фон';
      notice.querySelector('.effect-progress__stage').textContent = failed
        ? '' : `${EFFECT_STAGES[progress.stage] || EFFECT_STAGES.worker}…`;
      notice.querySelector('[data-effect-action="cancel"]').hidden = failed;
      notice.querySelector('[data-effect-action="retry"]').hidden = !failed;
      notice.querySelector('[data-effect-action="close"]').hidden = !failed;
    });
  }

  // A new srcObject restarts the video element, so the preview is replaced only with its track.
  let previewTrack;
  function updateLocalPreview() {
    const next = media.previewTrack() || null;
    if (next === previewTrack) return;
    previewTrack = next;
    const previewStream = next ? new MediaStream([next]) : new MediaStream();
    elements.previewVideo.srcObject = previewStream;
    elements.localVideo.srcObject = previewStream;
    elements.previewPlaceholder.hidden = Boolean(next);
    elements.localPlaceholder.hidden = Boolean(next);
  }

  function renderMedia() {
    const state = media.snapshot();
    elements.prejoinMic.setAttribute('aria-pressed', String(state.microphone));
    elements.prejoinMic.textContent = state.microphone ? 'Микрофон включён' : 'Микрофон выключен';
    elements.prejoinCamera.setAttribute('aria-pressed', String(state.camera));
    elements.prejoinCamera.textContent = state.camera ? 'Камера включена' : 'Камера выключена';
    elements.toggleMic.setAttribute('aria-pressed', String(state.microphone));
    elements.toggleCamera.setAttribute('aria-pressed', String(state.camera));
    elements.toggleScreen.setAttribute('aria-pressed', String(state.screen));
    elements.localVideo.dataset.screen = String(state.screen);
    elements.toggleScreen.disabled = state.screenShareBusy;
    elements.screenAudioStatus.hidden = !state.screenAudioStatus;
    elements.screenAudioStatus.textContent = state.screenAudioStatus;
    document.querySelectorAll('[data-background-option]').forEach(button => {
      button.setAttribute('aria-checked', String(button.dataset.backgroundOption === state.background));
    });
    elements.toggleBackground.setAttribute('aria-pressed', String(state.background !== 'none'));
    document.querySelectorAll('.background-picker__status').forEach(status => {
      status.textContent = state.backgroundStatus.text;
      status.dataset.state = state.backgroundStatus.state;
    });
    renderEffectProgress(state.effectProgress);
    elements.prejoinError.textContent = state.error;
    elements.prejoinError.hidden = !state.error;
    updateLocalPreview();
  }

  function renderStatus(status, details) {
    if (status === 'reconnecting') setConnection(`Переподключение ${details.attempt}/${details.attempts}…`, 'error');
    else if (STATUS_TEXT[status]) setConnection(...STATUS_TEXT[status]);
    renderRemote();
  }

  function remotePlaceholderText(remote) {
    if (remote.present) {
      return remote.video === false && !remote.screen ? 'Камера участника выключена' : 'Ожидаем видео участника…';
    }
    if (connection.status === 'peer-left') return `${waitingStatus} — звонок возобновится автоматически.`;
    if (connection.status === 'waiting') return `${peerTitle} ещё не подключился. Звонок начнётся автоматически.`;
    return 'Подключаемся к комнате…';
  }

  function renderRemote() {
    const remote = connection.remote();
    elements.remoteName.textContent = remote.name || room?.name || peerTitle;
    elements.remoteMuted.hidden = remote.audio !== false;
    elements.remotePlaceholder.hidden = remote.videoVisible;
    elements.remotePlaceholderText.textContent = remotePlaceholderText(remote);
    // The room address opens only for its teacher, so the student's invite is offered right here.
    elements.remoteInvite.hidden = remote.present || !room?.guestPath;
  }

  function websocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({ role });
    if (role === 'guest') params.set('token', roomReference);
    return `${protocol}//${window.location.host}/ws/video-calls/${encodeURIComponent(room.id)}?${params}`;
  }

  async function toggleScreenShare() {
    if (leaving) return;
    try {
      await media.toggleScreenShare();
    } catch (error) {
      setConnection(error.message, 'error');
    }
  }

  async function finishCall(message = 'Спасибо за занятие!', title = 'Звонок завершён') {
    if (leaving) return;
    leaving = true;
    // The recorder is asked to stop first, so it keeps everything up to this moment; closing the
    // connection right away stops signaling that would otherwise arrive while the file is saved.
    const saving = recorder.stop();
    connection.close();
    await saving;
    media.stop();
    elements.prejoin.hidden = true;
    elements.stage.hidden = true;
    elements.ended.hidden = false;
    elements.endedTitle.textContent = title;
    elements.endedMessage.textContent = message;
    // The link is permanent, so a fresh page load joins the same room again.
    elements.rejoinLink.hidden = !room;
    elements.rejoinLink.href = window.location.pathname;
    setConnection('Звонок завершён');
    window.RoomChat?.open();
    window.RoomChat?.sync();
  }

  async function leaveCall() {
    if (leaving) return;
    if (role === 'teacher') {
      elements.leave.disabled = true;
      try {
        const response = await fetch(`/api/video-calls/${encodeURIComponent(room.id)}/end`, { method: 'POST' });
        if (!response.ok) throw new Error('Не удалось завершить звонок.');
      } catch (_error) {
        elements.leave.disabled = false;
        setConnection('Не удалось завершить звонок. Попробуйте ещё раз.', 'error');
        return;
      }
      finishCall(callEndedText);
    } else {
      connection.leave();
      finishCall('Вы вышли из видеозвонка.');
    }
  }

  async function joinCall() {
    if (!room || joined) return;
    elements.join.disabled = true;
    elements.join.textContent = 'Подключаемся…';
    // Only the chat link reaches the join without media. A pending prompt is not awaited: it may never
    // settle, and media.prepare() sends the tracks once the browser answers.
    if (media.preparation.state === 'idle') await media.prepare();
    joined = true;
    elements.prejoin.hidden = true;
    elements.stage.hidden = false;
    renderMedia();
    await connection.join();
  }

  function setupInviteButton(button) {
    const label = button.textContent;
    let resetTimer = null;
    button.addEventListener('click', async () => {
      try {
        await window.CopyText.copyText(new URL(room.guestPath, location.origin).href);
        button.textContent = 'Ссылка скопирована';
      } catch (_error) {
        button.textContent = 'Не удалось скопировать ссылку';
      }
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => { button.textContent = label; }, 2500);
    });
  }

  function setBackgroundPanelOpen(open) {
    elements.callBackgroundPanel.hidden = !open;
    elements.toggleBackground.setAttribute('aria-expanded', String(open));
  }

  async function loadRoom() {
    if (!roomReference) {
      finishCall('Некорректная ссылка на видеозвонок.');
      return;
    }
    try {
      const response = await fetch(roomEndpoint);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Комната недоступна.');
      room = payload.call;
      elements.prejoinInvite.hidden = !room.guestPath;
      if (room.name) document.title = `${room.name} — видеозвонок EasyClass`;
      renderRemote();
      window.RoomChat.init({ role, reference: roomReference });
      setConnection('Комната готова');
      if (new URLSearchParams(location.search).has('chat')) {
        window.RoomChat.open();
        return;
      }
      await media.prepare();
    } catch (error) {
      elements.prejoin.hidden = true;
      elements.ended.hidden = false;
      elements.endedMessage.textContent = error.message || 'Ссылка на видеозвонок недействительна.';
      setConnection('Комната недоступна', 'error');
    }
  }

  elements.prejoinMic.addEventListener('click', () => media.toggle('audio'));
  elements.prejoinCamera.addEventListener('click', () => media.toggle('video'));
  elements.toggleMic.addEventListener('click', () => media.toggle('audio'));
  elements.toggleCamera.addEventListener('click', () => media.toggle('video'));
  elements.toggleBackground.addEventListener('click', event => {
    event.stopPropagation();
    setBackgroundPanelOpen(elements.toggleBackground.getAttribute('aria-expanded') !== 'true');
  });
  elements.closeBackgroundPanel.addEventListener('click', () => setBackgroundPanelOpen(false));
  document.querySelectorAll('[data-effect-action]').forEach(button => button.addEventListener('click', () => {
    const action = button.dataset.effectAction;
    if (action === 'cancel') void media.cancelBackground();
    else if (action === 'retry') void media.retryBackground();
    else media.dismissEffectNotice();
  }));
  elements.toggleScreen.addEventListener('click', toggleScreenShare);
  elements.leave.addEventListener('click', leaveCall);
  elements.join.addEventListener('click', joinCall);
  setupInviteButton(elements.prejoinInvite);
  setupInviteButton(elements.remoteInvite);
  window.addEventListener('pagehide', event => {
    if (!leaving) {
      connection.diagnostic('page-lifecycle', { state: 'pagehide', persisted: event.persisted });
      connection.leave('pagehide');
      void recorder.stop();
      media.stop();
    }
  });

  document.addEventListener('click', event => {
    if (!elements.callBackgroundPanel.hidden
      && !elements.callBackgroundPanel.contains(event.target)
      && event.target !== elements.toggleBackground) {
      setBackgroundPanelOpen(false);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setBackgroundPanelOpen(false);
  });

  renderBackgroundOptions(elements.prejoinBackgroundOptions);
  renderBackgroundOptions(elements.callBackgroundOptions);
  renderMedia();
  renderRemote();

  loadRoom();
})();
