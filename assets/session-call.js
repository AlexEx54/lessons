/* The session's video call: the call tab of the session panel (assets/session-panel.js).
   Nobody joins on page load: the teacher may prepare the lesson alone and the student may do homework.
   Each join gets fresh CallMedia and a fresh connection, so a stopped camera is never reused:
   CallConnection peer to peer in an individual class, CallRoom through LiveKit in a group. */
(() => {
  'use strict';

  const EFFECT_STAGES = {
    worker: 'Запускаем обработку',
    wasm: 'Загружаем модель',
    segmenter: 'Настраиваем модель',
    'background-image': 'Загружаем фон',
    'first-frame': 'Обрабатываем первый кадр',
  };

  // role is 'teacher' or 'student'; notify(text) shows the lesson page's toast;
  // onState({ joined, peerIn, peerName }) tells the panel what its header button shows.
  // Returns { presence } for the lesson socket to report who is in the call ({ teacher, student } in an individual class,
  // { teacher, students: [names] } in a group), and setVisible(visible) for the panel to say whether the call tab is on screen.
  function create({ sessionId, role, notify, onState, group = false }) {
    const byId = id => document.getElementById(id);
    const elements = {
      status: byId('call-panel-status'),
      lobby: byId('call-lobby'),
      join: byId('call-join'),
      room: byId('call-room'),
      tiles: byId('call-tiles'),
      remoteTile: byId('call-remote-tile'),
      localTile: byId('call-local-tile'),
      audio: byId('call-audio'),
      peerMenu: byId('call-peer-menu'),
      peerMenuName: byId('call-peer-menu-name'),
      peerMuteMicrophone: byId('call-peer-mute-microphone'),
      peerMuteCamera: byId('call-peer-mute-camera'),
      peerRemove: byId('call-peer-remove'),
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
      removed: 'Учитель убрал вас из звонка.',
      lost: 'Связь со звонком прервалась. Войдите снова.',
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
    // The open popover: 'more', 'backgrounds', 'peer' (the teacher's menu of the student menuPeer) or null.
    let popover = null;
    let menuPeer = null;
    // The peer's screen share opens over the lesson once; after closing it waits for the next share.
    let peerSharing = false;
    let stageOpen = false;
    let previewTrack = null;
    let recordingPublished = false;
    // A group call's tiles of the others: identity → { tile, video, placeholder, name, muted, track }.
    const peerTiles = new Map();
    let stageTrack = null;
    let stagePeer = null;
    const backgroundButtons = window.CallMedia.BACKGROUND_OPTIONS.map(backgroundButton);

    // In a group the others are named in one line: «Учитель, Маша и Петя».
    const listNames = list => list.length > 1 ? `${list.slice(0, -1).join(', ')} и ${list.at(-1)}` : list.join('');
    const others = () => {
      if (!group) return presence?.[peerRole] ? [peerName()] : [];
      if (role === 'teacher') return presence?.students || [];
      return [...(presence?.teacher ? ['Учитель'] : []), ...(presence?.students || [])];
    };
    const peerName = () => names[peerRole];
    const recorder = role === 'teacher' && !group ? window.CallRecorder.control({
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
      if (group) {
        const sync = async () => current.room.sync();
        current.media = window.CallMedia.create({ diagnostic: () => {}, applyAudio: sync, applyVideo: sync, publish: sync,
          onChange: live(render) });
        current.room = window.CallRoom.create({ endpoint: callEndpoint, media: current.media, onChange: live(render),
          onEnded: live((reason, message) => { void finish(ENDED[reason] ?? message); }) });
        return current;
      }
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
      void (call.room || call.connection).join();
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
      (current.room || current.connection).close();
      render();
      await saving;
      current.media.stop();
    }

    async function leave() {
      if (!call || ending) return;
      if (role !== 'teacher') {
        call.connection?.leave();
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

    // In a group the student hears about the teacher and the teacher about the students, and only outside the call:
    // inside it the tiles show who comes and goes.
    function receivePresence(next) {
      const before = presence && others();
      presence = group ? { teacher: Boolean(next?.teacher), students: next?.students || [] }
        : { teacher: Boolean(next?.teacher), student: Boolean(next?.student) };
      if (before && !(group && call)) {
        const now = others();
        const heard = name => !group || role === 'teacher' || name === 'Учитель';
        now.filter(name => !before.includes(name) && heard(name)).forEach(name => notify(`В звонке: ${name}`));
        before.filter(name => !now.includes(name) && heard(name)).forEach(name => notify(`${name} больше не в звонке`));
      }
      render();
    }

    // A hidden call keeps playing; only its menus close.
    function setVisible(visible) {
      if (!visible && popover) {
        popover = null;
        render();
      }
    }

    function statusLine() {
      if (group) {
        if (ending) return ['Завершаем звонок…'];
        if (call) {
          const status = call.room.status();
          if (status === 'reconnecting') return STATUS.interrupted;
          if (status === 'connecting') return STATUS.connecting;
          return call.room.peers().length ? STATUS.connected : ['Пока в звонке только вы'];
        }
        const names = others();
        return names.length ? [`${listNames(names)} уже в звонке`, 'connected'] : [presence ? 'В звонке пока никого' : ''];
      }
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

    // In a group the stage shows the screen whose tile was expanded, or else the first one sharing.
    function renderStage() {
      const sharing = call?.room?.peers().filter(peer => peer.screen) || [];
      const sharer = sharing.find(peer => peer.identity === stagePeer) || sharing[0];
      const shared = group ? Boolean(sharer) : Boolean(call?.connection.remote().screen);
      if (shared !== peerSharing) {
        peerSharing = shared;
        stageOpen = shared;
      }
      elements.stage.hidden = !stageOpen;
      elements.stageOpen.hidden = group || !peerSharing || stageOpen;
      elements.stageName.textContent = `Экран: ${group ? sharer?.name || '' : elements.remoteName.textContent}`;
      if (group) {
        const next = stageOpen ? sharer?.screen || null : null;
        if (next === stageTrack) return;
        stageTrack?.detach(elements.stageVideo);
        next?.attach(elements.stageVideo);
        stageTrack = next;
        return;
      }
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

    function peerTile(identity) {
      const parts = { tile: document.createElement('article'), video: document.createElement('video'),
        placeholder: document.createElement('p'), name: document.createElement('span'), muted: elements.remoteMuted.cloneNode(true),
        expand: elements.stageOpen.cloneNode(true), menu: document.createElement('button'), track: null };
      parts.tile.className = 'call-tile call-tile--remote';
      Object.assign(parts.video, { autoplay: true, playsInline: true, muted: true });
      parts.placeholder.className = 'call-tile__placeholder';
      parts.muted.removeAttribute('id');
      parts.expand.removeAttribute('id');
      parts.expand.addEventListener('click', () => { stagePeer = identity; setStageOpen(true); });
      const label = document.createElement('span');
      label.className = 'call-tile__label';
      label.append(parts.name, parts.muted);
      parts.tile.append(parts.video, parts.placeholder, parts.expand, label);
      if (role === 'teacher') {
        parts.menu.type = 'button';
        parts.menu.className = 'call-tile__menu';
        parts.menu.textContent = '⋯';
        parts.menu.setAttribute('aria-haspopup', 'menu');
        parts.menu.addEventListener('click', () => {
          popover = popover === 'peer' && menuPeer === identity ? null : 'peer';
          menuPeer = identity;
          render();
        });
        parts.tile.append(parts.menu);
      }
      return parts;
    }

    // The others' tiles in the order of peers(), before the own one.
    function renderPeers() {
      const peers = call?.room.peers() || [];
      peers.forEach(peer => {
        if (!peerTiles.has(peer.identity)) peerTiles.set(peer.identity, peerTile(peer.identity));
        const parts = peerTiles.get(peer.identity);
        if (parts.track !== peer.video) {
          parts.track?.detach(parts.video);
          peer.video?.attach(parts.video);
          parts.track = peer.video;
        }
        parts.video.dataset.screen = String(Boolean(peer.screen));
        parts.tile.dataset.speaking = String(peer.speaking);
        parts.name.textContent = peer.name;
        parts.muted.hidden = peer.audio;
        parts.placeholder.hidden = Boolean(peer.video);
        parts.placeholder.textContent = 'Камера выключена';
        parts.expand.hidden = !peer.screen;
        parts.expand.setAttribute('aria-label', `Развернуть экран: ${peer.name}`);
        parts.menu.hidden = peer.teacher;
        parts.menu.setAttribute('aria-label', `Управление: ${peer.name}`);
        elements.tiles.insertBefore(parts.tile, elements.localTile);
      });
      peerTiles.forEach((parts, identity) => {
        if (peers.some(peer => peer.identity === identity)) return;
        parts.track?.detach(parts.video);
        parts.tile.remove();
        peerTiles.delete(identity);
      });
      elements.tiles.dataset.count = String(peers.length + 1);
      const peer = popover === 'peer' && peers.find(item => item.identity === menuPeer);
      if (popover === 'peer' && !peer) popover = null;
      if (peer) {
        elements.peerMenuName.textContent = peer.name;
        elements.peerMuteMicrophone.disabled = !peer.audio;
        elements.peerMuteCamera.disabled = !peer.camera;
      }
      elements.audio.hidden = !call?.room.audioBlocked();
    }

    // The teacher's command about one student: mute their microphone or camera, or remove them from the call.
    async function commandPeer(action, body) {
      popover = null;
      render();
      try {
        const response = await fetch(`/api/sessions/${sessionId}/call/${action}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identity: menuPeer, ...body }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) notify(payload.error || 'Не получилось. Попробуйте ещё раз.');
      } catch (_error) {
        notify('Нет связи с сервером. Попробуйте ещё раз.');
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
      onState({ joined, peerIn: others().length > 0, peerName: listNames(others()) });

      const [statusText, statusState = ''] = statusLine();
      elements.status.textContent = statusText;
      elements.status.dataset.state = statusState;
      elements.lobby.hidden = joined;
      elements.room.hidden = !joined;
      elements.join.disabled = !available;
      elements.leave.disabled = ending;

      const notes = [note];
      if (group) renderPeers();
      else if (joined) renderRemote();
      if (joined) notes.push(...renderMedia());
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
      elements.peerMenu.hidden = popover !== 'peer';
      peerTiles.forEach((parts, identity) => parts.menu.setAttribute('aria-expanded', String(popover === 'peer' && menuPeer === identity)));
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
    // A group shows a tile per participant instead of the one peer's tile.
    elements.tiles.classList.toggle('call-tiles--group', group);
    elements.remoteTile.hidden = group;
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
    elements.peerMuteMicrophone.addEventListener('click', () => commandPeer('mute', { source: 'microphone' }));
    elements.peerMuteCamera.addEventListener('click', () => commandPeer('mute', { source: 'camera' }));
    elements.peerRemove.addEventListener('click', () => commandPeer('remove', {}));
    elements.audio.addEventListener('click', () => { void call?.room.startAudio(); });
    const popoverParts = () => [elements.moreMenu, elements.backgrounds, elements.more, elements.background, elements.peerMenu,
      ...[...peerTiles.values()].map(parts => parts.menu)];
    document.addEventListener('click', event => {
      if (popover && !popoverParts().some(part => part.contains(event.target))) {
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
      call.connection?.diagnostic('page-lifecycle', { state: 'pagehide', persisted: event.persisted });
      call.connection?.leave('pagehide');
      call.room?.close();
      void recorder?.stop();
      call.media.stop();
    });

    elements.backgroundOptions.replaceChildren(...backgroundButtons);
    render();
    // A group call needs no names beforehand: everyone's name comes with them into the room.
    if (!group) fetch(callEndpoint, { cache: 'no-store' }).then(async response => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Звонок этого занятия недоступен.');
      names = payload.names;
    }).catch(error => {
      available = false;
      note = error.message;
    }).finally(render);

    return { presence: receivePresence, setVisible };
  }

  window.SessionCall = { create };
})();
