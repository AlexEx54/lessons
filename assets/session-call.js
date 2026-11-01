/* The session's video call in a side panel of the lesson page, a floating mini window on narrow screens.
   Nobody joins on page load: the teacher may prepare the lesson alone and the student may do homework.
   Each join gets fresh CallMedia and CallConnection, so a stopped camera is never reused. */
(() => {
  'use strict';

  const COLLAPSED_KEY = 'easyclass.sessionCallCollapsed';
  const EFFECT_STAGES = {
    worker: 'Запускаем обработку',
    wasm: 'Загружаем модель',
    segmenter: 'Настраиваем модель',
    'background-image': 'Загружаем фон',
    'first-frame': 'Обрабатываем первый кадр',
  };

  function readCollapsed() {
    try {
      return window.localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch (_error) {
      return false;
    }
  }

  function writeCollapsed(collapsed) {
    try {
      window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
    } catch (_error) {
      // The panel still opens and closes; only the next visit forgets the choice.
    }
  }

  // role is 'teacher' or 'student'; notify(text) shows the lesson page's toast.
  // Returns { presence({ teacher, student }) } for the lesson socket to report who is in the call.
  function create({ sessionId, role, notify }) {
    const byId = id => document.getElementById(id);
    const panel = byId('call-panel');
    const toggleButton = byId('call-toggle');
    const elements = {
      toggleLabel: byId('call-toggle-label'),
      collapse: byId('call-panel-collapse'),
      status: byId('call-panel-status'),
      lobby: byId('call-lobby'),
      join: byId('call-join'),
      room: byId('call-room'),
      remoteVideo: byId('call-remote-video'),
      remotePlaceholder: byId('call-remote-placeholder'),
      remoteName: byId('call-remote-name'),
      remoteMuted: byId('call-remote-muted'),
      stageOpen: byId('call-stage-open'),
      stage: byId('call-stage'),
      stageVideo: byId('call-stage-video'),
      stageName: byId('call-stage-name'),
      stageClose: byId('call-stage-close'),
      localVideo: byId('call-local-video'),
      localPlaceholder: byId('call-local-placeholder'),
      effect: byId('call-effect'),
      effectText: byId('call-effect-text'),
      effectCancel: byId('call-effect-cancel'),
      effectRetry: byId('call-effect-retry'),
      effectClose: byId('call-effect-close'),
      mic: byId('call-mic'),
      camera: byId('call-camera'),
      background: byId('call-background'),
      backgrounds: byId('call-backgrounds'),
      backgroundOptions: byId('call-background-options'),
      backgroundStatus: byId('call-background-status'),
      more: byId('call-more'),
      moreMenu: byId('call-more-menu'),
      screen: byId('call-screen'),
      record: byId('call-record'),
      leave: byId('call-leave'),
      note: byId('call-note'),
    };
    const peerRole = role === 'teacher' ? 'student' : 'teacher';
    const peerTitle = role === 'teacher' ? 'Ученик' : 'Учитель';
    const callEndpoint = `/api/sessions/${sessionId}/call?role=${role}`;
    const STATUS = {
      connecting: ['Подключаемся…'],
      'peer-joining': [`${peerTitle} подключается…`],
      connected: ['Соединение установлено', 'connected'],
      interrupted: ['Связь прервалась, восстанавливаем…', 'error'],
      offline: ['Нет соединения с сервером', 'error'],
      'socket-error': ['Ошибка соединения', 'error'],
      unsupported: ['Браузер не смог создать медиасоединение', 'error'],
      'negotiation-failed': ['Не удалось настроить медиасоединение', 'error'],
    };
    const ENDED = {
      ended: role === 'teacher' ? '' : 'Учитель завершил звонок.',
      elsewhere: 'Звонок продолжается в другой вкладке. Чтобы вернуть его сюда, войдите снова.',
      occupied: 'В звонке уже другой ученик класса. Войти можно, когда он выйдет.',
    };

    let names = { teacher: 'Учитель', student: 'Ученик' };
    let available = true;
    // { teacher, student } from the lesson socket; null until its first snapshot.
    let presence = null;
    // { media, connection, status, details } while this tab is in the call.
    let call = null;
    // The teacher's request to end the call for both is on its way.
    let ending = false;
    // Why the last call ended, or why the call is unavailable; cleared by the next join.
    let note = '';
    // The open popover: 'more', 'backgrounds' or null.
    let popover = null;
    // The peer's screen share opens over the lesson once; after closing it waits for the next share.
    let peerSharing = false;
    let stageOpen = false;
    let previewTrack = null;
    let recordingPublished = false;
    const backgroundButtons = window.CallMedia.BACKGROUND_OPTIONS.map(backgroundButton);

    const peerName = () => names[peerRole];
    const recorder = role === 'teacher' ? window.CallRecorder.control({
      getSources: recordingSources, canStart: () => Boolean(call), onChange: render,
    }) : null;

    function recordingSources() {
      const remote = call.connection.remote();
      const remoteStream = call.connection.remoteStream;
      return {
        localVideo: call.media.outboundVideoTrack(),
        remoteVideo: (remote.screen || remote.video !== false) ? remoteStream.getVideoTracks()[0] : null,
        localScreen: call.media.sentState().screen,
        remoteScreen: remote.screen,
        remoteName: elements.remoteName.textContent,
        audio: [call.media.outboundAudioTrack(), ...remoteStream.getAudioTracks()],
      };
    }

    function startCall() {
      const current = { status: 'idle', details: null };
      // Callbacks of a call that already ended must not touch the panel of the next one.
      const live = handler => (...args) => { if (call === current) handler(...args); };
      current.media = window.CallMedia.create({
        diagnostic: (event, details) => current.connection.diagnostic(event, details),
        applyAudio: () => current.connection.applyAudio(),
        applyVideo: () => current.connection.applyVideo(),
        publish: () => current.connection.publishMediaState(),
        onChange: live(render),
      });
      current.connection = window.CallConnection.create({
        role: role === 'teacher' ? 'teacher' : 'guest',
        socketUrl: () => `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
          + `/ws/session-calls/${sessionId}?role=${role}`,
        iceEndpoint: callEndpoint,
        media: current.media,
        localDetails: () => ({ name: names[role], recording: Boolean(recorder?.state().recording) }),
        remoteVideo: elements.remoteVideo,
        onStatus: live((status, details) => {
          current.status = status;
          current.details = details;
          render();
        }),
        onRemote: live(render),
        onMessage: () => {},
        onEnded: live(reason => { void finish(ENDED[reason] ?? ''); }),
      });
      return current;
    }

    function join() {
      if (call || !available) return;
      note = '';
      recordingPublished = false;
      call = startCall();
      render();
      // The prompt is not awaited: it may never settle, and CallMedia sends the tracks once the browser answers.
      void call.media.prepare();
      void call.connection.join();
    }

    async function finish(message) {
      const current = call;
      if (!current) return;
      // The recorder stops first, so it keeps everything up to this moment.
      const saving = recorder?.stop();
      call = null;
      ending = false;
      note = message;
      popover = null;
      current.connection.close();
      render();
      await saving;
      current.media.stop();
    }

    async function leave() {
      if (!call || ending) return;
      if (role !== 'teacher') {
        call.connection.leave();
        void finish('');
        return;
      }
      ending = true;
      render();
      try {
        const response = await fetch(`/api/sessions/${sessionId}/call/end`, { method: 'POST' });
        if (!response.ok) throw new Error('Не удалось завершить звонок.');
      } catch (_error) {
        ending = false;
        notify('Не удалось завершить звонок. Попробуйте ещё раз.');
        render();
        return;
      }
      void finish('');
    }

    function receivePresence(next) {
      const previous = presence?.[peerRole];
      presence = { teacher: Boolean(next?.teacher), student: Boolean(next?.student) };
      if (previous !== undefined && previous !== presence[peerRole]) {
        notify(presence[peerRole] ? `В звонке: ${peerName()}` : `${peerName()} больше не в звонке`);
      }
      render();
    }

    function setCollapsed(collapsed) {
      panel.hidden = collapsed;
      writeCollapsed(collapsed);
      if (collapsed) popover = null;
      render();
    }

    function statusLine() {
      if (call) {
        if (ending) return ['Завершаем звонок…'];
        if (call.status === 'reconnecting') return [`Переподключение ${call.details.attempt}/${call.details.attempts}…`, 'error'];
        if (['waiting', 'peer-left'].includes(call.status)) return [`${peerName()} пока не в звонке`];
        return STATUS[call.status] || ['Подключаемся…'];
      }
      if (!available || !presence) return [''];
      return presence[peerRole] ? [`${peerName()} уже в звонке`, 'connected'] : [`${peerName()} пока не в звонке`];
    }

    // A new srcObject restarts the video element, so the preview is replaced only with its track.
    function renderLocalVideo() {
      const next = call?.media.previewTrack() || null;
      if (next === previewTrack) return;
      previewTrack = next;
      elements.localVideo.srcObject = next ? new MediaStream([next]) : null;
      elements.localPlaceholder.hidden = Boolean(next);
    }

    function setStageOpen(open) {
      stageOpen = open;
      render();
    }

    function renderStage() {
      const sharing = Boolean(call?.connection.remote().screen);
      if (sharing !== peerSharing) {
        peerSharing = sharing;
        stageOpen = sharing;
      }
      elements.stage.hidden = !stageOpen;
      elements.stageOpen.hidden = !peerSharing || stageOpen;
      elements.stageName.textContent = `Экран: ${elements.remoteName.textContent}`;
      const stream = stageOpen ? call.connection.remoteStream : null;
      if (elements.stageVideo.srcObject !== stream) elements.stageVideo.srcObject = stream;
    }

    function renderRemote() {
      const remote = call.connection.remote();
      elements.remoteVideo.dataset.screen = String(remote.screen);
      elements.remoteName.textContent = remote.name || peerName();
      elements.remoteMuted.hidden = !remote.present || remote.audio !== false;
      elements.remotePlaceholder.hidden = remote.videoVisible;
      if (remote.present) {
        elements.remotePlaceholder.textContent = remote.video === false && !remote.screen ? 'Камера выключена' : 'Ожидаем видео…';
      } else {
        elements.remotePlaceholder.textContent = ['waiting', 'peer-left'].includes(call.status)
          ? 'Звонок начнётся, когда собеседник войдёт.' : 'Подключаемся…';
      }
    }

    function renderMedia() {
      const state = call.media.snapshot();
      elements.mic.setAttribute('aria-pressed', String(state.microphone));
      elements.camera.setAttribute('aria-pressed', String(state.camera));
      elements.background.dataset.active = String(state.background !== 'none');
      backgroundButtons.forEach(button => {
        button.setAttribute('aria-checked', String(button.dataset.backgroundOption === state.background));
      });
      elements.backgroundStatus.textContent = state.backgroundStatus.text;
      elements.backgroundStatus.dataset.state = state.backgroundStatus.state;
      elements.localVideo.dataset.screen = String(state.screen);
      elements.screen.textContent = state.screen ? 'Остановить показ экрана' : 'Показать экран';
      elements.screen.disabled = state.screenShareBusy;
      const progress = state.effectProgress;
      elements.effect.hidden = !progress;
      if (progress) {
        const failed = Boolean(progress.failed);
        elements.effect.dataset.state = failed ? 'error' : 'loading';
        elements.effectText.textContent = failed
          ? 'Не удалось включить фон' : `Готовим фон: ${(EFFECT_STAGES[progress.stage] || EFFECT_STAGES.worker).toLowerCase()}…`;
        elements.effectCancel.hidden = failed;
        elements.effectRetry.hidden = !failed;
        elements.effectClose.hidden = !failed;
      }
      return [state.error, state.screenAudioStatus];
    }

    function renderRecording() {
      if (!recorder) return '';
      const state = recorder.state();
      elements.record.hidden = false;
      elements.record.disabled = !call || state.busy || !window.CallRecorder.supported();
      elements.record.title = window.CallRecorder.supported() ? '' : 'Для записи нужен настольный Chrome или Edge';
      elements.record.textContent = state.recording ? 'Остановить запись' : 'Записать звонок';
      // The recording flag goes out with this side's media state.
      if (call && state.recording !== recordingPublished) {
        recordingPublished = state.recording;
        call.connection.publishMediaState();
      }
      return state.message;
    }

    function render() {
      const joined = Boolean(call);
      const peerIn = Boolean(presence?.[peerRole]);
      document.body.classList.toggle('lesson-call-open', !panel.hidden);
      toggleButton.setAttribute('aria-expanded', String(!panel.hidden));
      toggleButton.dataset.call = joined ? 'joined' : (peerIn ? 'peer' : '');
      elements.toggleLabel.textContent = joined ? 'В звонке' : 'Звонок';
      toggleButton.title = !joined && peerIn ? `${peerName()} уже в звонке` : '';

      const [statusText, statusState = ''] = statusLine();
      elements.status.textContent = statusText;
      elements.status.dataset.state = statusState;
      elements.lobby.hidden = joined;
      elements.room.hidden = !joined;
      elements.join.disabled = !available;
      elements.leave.disabled = ending;

      const notes = [note];
      if (joined) {
        renderRemote();
        notes.push(...renderMedia());
      }
      renderStage();
      renderLocalVideo();
      notes.push(renderRecording());
      const text = notes.filter(Boolean).join(' ');
      elements.note.hidden = !text;
      elements.note.textContent = text;

      elements.moreMenu.hidden = popover !== 'more';
      elements.more.setAttribute('aria-expanded', String(popover === 'more'));
      elements.backgrounds.hidden = popover !== 'backgrounds';
      elements.background.setAttribute('aria-expanded', String(popover === 'backgrounds'));
    }

    function backgroundButton(option) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'call-background-option';
      button.dataset.backgroundOption = option.id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-label', option.label);
      const preview = document.createElement('span');
      preview.className = `call-background-option__preview ${option.previewClass || ''}`.trim();
      if (option.src) preview.style.backgroundImage = `url("${option.src}")`;
      const label = document.createElement('span');
      label.textContent = option.label;
      button.append(preview, label);
      button.addEventListener('click', () => call?.media.selectBackground(option.id));
      return button;
    }

    function togglePopover(name) {
      popover = popover === name ? null : name;
      render();
    }

    async function toggleScreenShare() {
      popover = null;
      render();
      try {
        await call?.media.toggleScreenShare();
      } catch (error) {
        notify(error.message);
      }
    }

    elements.leave.setAttribute('aria-label', role === 'teacher' ? 'Завершить звонок для всех' : 'Выйти из звонка');
    elements.leave.title = elements.leave.getAttribute('aria-label');
    // Phones and tablets cannot share their screen from a browser.
    elements.screen.hidden = !navigator.mediaDevices?.getDisplayMedia;
    if (!recorder) elements.record.remove();
    toggleButton.hidden = false;
    toggleButton.addEventListener('click', () => setCollapsed(!panel.hidden));
    elements.collapse.addEventListener('click', () => setCollapsed(true));
    elements.stageOpen.addEventListener('click', () => setStageOpen(true));
    elements.stageClose.addEventListener('click', () => setStageOpen(false));
    elements.join.addEventListener('click', join);
    elements.leave.addEventListener('click', leave);
    elements.mic.addEventListener('click', () => call?.media.toggle('audio'));
    elements.camera.addEventListener('click', () => call?.media.toggle('video'));
    elements.background.addEventListener('click', () => togglePopover('backgrounds'));
    elements.more.addEventListener('click', () => togglePopover('more'));
    elements.screen.addEventListener('click', toggleScreenShare);
    elements.record.addEventListener('click', () => {
      popover = null;
      void recorder.toggle();
    });
    elements.effectCancel.addEventListener('click', () => call?.media.cancelBackground());
    elements.effectRetry.addEventListener('click', () => call?.media.retryBackground());
    elements.effectClose.addEventListener('click', () => call?.media.dismissEffectNotice());
    const popoverParts = [elements.moreMenu, elements.backgrounds, elements.more, elements.background];
    document.addEventListener('click', event => {
      if (popover && !popoverParts.some(part => part.contains(event.target))) {
        popover = null;
        render();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (popover) {
        popover = null;
        render();
      } else if (stageOpen) {
        setStageOpen(false);
      }
    });
    document.addEventListener('visibilitychange', () => call?.media.setPageHidden(document.hidden));
    window.addEventListener('beforeunload', event => {
      if (call || recorder?.state().unsaved) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
    window.addEventListener('pagehide', event => {
      if (!call) return;
      call.connection.diagnostic('page-lifecycle', { state: 'pagehide', persisted: event.persisted });
      call.connection.leave('pagehide');
      void recorder?.stop();
      call.media.stop();
    });

    panel.hidden = readCollapsed();
    elements.backgroundOptions.replaceChildren(...backgroundButtons);
    render();
    fetch(callEndpoint, { cache: 'no-store' }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Звонок этого занятия недоступен.');
      names = payload.names;
    }).catch(error => {
      available = false;
      note = error.message;
    }).finally(render);

    return { presence: receivePresence };
  }

  window.SessionCall = { create };
})();
