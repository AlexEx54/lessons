(() => {
  'use strict';

  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const role = pathParts[0] === 'call' ? 'guest' : 'teacher';
  const roomReference = decodeURIComponent(pathParts[1] || '');
  const exitPath = role === 'teacher' ? '/video-calls' : '/';
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
    prejoinError: document.getElementById('prejoin-error'),
    join: document.getElementById('join-call'),
    stage: document.getElementById('call-stage'),
    localVideo: document.getElementById('local-video'),
    localPlaceholder: document.getElementById('local-placeholder'),
    remoteVideo: document.getElementById('remote-video'),
    remotePlaceholder: document.getElementById('remote-placeholder'),
    remotePlaceholderText: document.getElementById('remote-placeholder-text'),
    remoteName: document.getElementById('remote-name'),
    remoteMuted: document.getElementById('remote-muted'),
    toggleMic: document.getElementById('toggle-mic'),
    toggleCamera: document.getElementById('toggle-camera'),
    toggleScreen: document.getElementById('toggle-screen'),
    leave: document.getElementById('leave-call'),
    leaveLabel: document.getElementById('leave-label'),
    ended: document.getElementById('room-ended'),
    endedMessage: document.getElementById('room-ended-message'),
    exitLink: document.getElementById('room-exit-link'),
  };

  let room = null;
  let iceServers = [];
  let localStream = new MediaStream();
  let remoteStream = new MediaStream();
  let screenTrack = null;
  let socket = null;
  let peerConnection = null;
  let audioTransceiver = null;
  let videoTransceiver = null;
  let joined = false;
  let leaving = false;
  let reconnectAttempts = 0;
  let reconnectTimer = null;
  let makingOffer = false;
  let ignoreOffer = false;
  let isSettingRemoteAnswerPending = false;
  const gatheredCandidateTypes = new Set();
  const polite = role === 'guest';
  const mediaState = { audio: true, video: true, screen: false };

  elements.brand.href = exitPath;
  elements.exitLink.href = exitPath;
  elements.exitLink.textContent = role === 'teacher' ? 'К списку звонков' : 'На главную';
  elements.leaveLabel.textContent = role === 'teacher' ? 'Завершить' : 'Выйти';
  elements.guestNameField.hidden = role !== 'guest';
  elements.remoteName.textContent = role === 'teacher' ? 'Ученик' : 'Преподаватель';

  function setConnection(text, state = '') {
    elements.connection.dataset.state = state;
    elements.connection.lastChild.textContent = ` ${text}`;
  }

  function showPrejoinError(message) {
    elements.prejoinError.textContent = message;
    elements.prejoinError.hidden = !message;
  }

  function track(kind) {
    return kind === 'audio' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
  }

  function updateLocalPreview() {
    elements.previewVideo.srcObject = localStream;
    elements.localVideo.srcObject = screenTrack ? new MediaStream([screenTrack]) : localStream;
    const cameraVisible = Boolean(screenTrack || (track('video')?.enabled));
    elements.previewPlaceholder.hidden = Boolean(track('video')?.enabled);
    elements.localPlaceholder.hidden = cameraVisible;
  }

  function updateButtons() {
    const micEnabled = Boolean(track('audio')?.enabled) && mediaState.audio;
    const cameraEnabled = Boolean(track('video')?.enabled) && mediaState.video;
    elements.prejoinMic.setAttribute('aria-pressed', String(micEnabled));
    elements.prejoinMic.textContent = micEnabled ? 'Микрофон включён' : 'Микрофон выключен';
    elements.prejoinCamera.setAttribute('aria-pressed', String(cameraEnabled));
    elements.prejoinCamera.textContent = cameraEnabled ? 'Камера включена' : 'Камера выключена';
    elements.toggleMic.setAttribute('aria-pressed', String(micEnabled));
    elements.toggleCamera.setAttribute('aria-pressed', String(cameraEnabled));
    elements.toggleScreen.setAttribute('aria-pressed', String(Boolean(screenTrack)));
    updateLocalPreview();
  }

  async function acquireTrack(kind) {
    const constraints = kind === 'audio'
      ? { audio: { echoCancellation: true, noiseSuppression: true }, video: false }
      : { audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (!newTrack) throw new Error(`Браузер не предоставил ${kind === 'audio' ? 'микрофон' : 'камеру'}.`);
    localStream.getTracks().filter(item => item.kind === kind).forEach(item => {
      localStream.removeTrack(item);
      item.stop();
    });
    localStream.addTrack(newTrack);
    if (kind === 'audio' && audioTransceiver) await audioTransceiver.sender.replaceTrack(newTrack);
    if (kind === 'video' && videoTransceiver && !screenTrack) await videoTransceiver.sender.replaceTrack(newTrack);
    return newTrack;
  }

  async function prepareMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      showPrejoinError('Этот браузер не поддерживает доступ к камере и микрофону.');
      mediaState.audio = false;
      mediaState.video = false;
      updateButtons();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      });
      localStream = stream;
      showPrejoinError('');
    } catch (_error) {
      mediaState.audio = false;
      mediaState.video = false;
      showPrejoinError('Камера или микрофон недоступны. Можно войти без них и включить позже.');
    }
    updateButtons();
  }

  function send(message) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function sendDiagnostic(event, details = {}) {
    send({ type: 'diagnostic', event, ...details });
  }

  function candidateType(candidate) {
    if (candidate?.candidateType) return candidate.candidateType;
    if (candidate?.type) return candidate.type;
    return String(candidate?.candidate || '').match(/\btyp\s+(host|srflx|prflx|relay)\b/)?.[1] || '';
  }

  function normalizeIceServers(servers) {
    if (!Array.isArray(servers)) return [];
    return servers.flatMap(server => {
      const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
      return urls.filter(Boolean).map(url => {
        const normalized = { urls: url };
        if (server.username && server.credential) {
          normalized.username = server.username;
          normalized.credential = server.credential;
          normalized.credentialType = server.credentialType || 'password';
        }
        return normalized;
      });
    });
  }

  async function reportSelectedCandidate(connection) {
    try {
      const stats = await connection.getStats();
      const reports = new Map();
      stats.forEach(report => reports.set(report.id, report));
      const transport = [...reports.values()].find(report => (
        report.type === 'transport' && report.selectedCandidatePairId
      ));
      let pair = transport ? reports.get(transport.selectedCandidatePairId) : null;
      if (!pair) {
        pair = [...reports.values()].find(report => (
          report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated
        ));
      }
      if (!pair) {
        sendDiagnostic('selected-candidate-unavailable', { state: connection.iceConnectionState });
        return;
      }
      const local = reports.get(pair.localCandidateId);
      const remote = reports.get(pair.remoteCandidateId);
      sendDiagnostic('selected-candidate', {
        state: connection.iceConnectionState,
        localCandidateType: candidateType(local),
        remoteCandidateType: candidateType(remote),
        protocol: local?.protocol || '',
        relayProtocol: local?.relayProtocol || '',
      });
    } catch (error) {
      sendDiagnostic('stats-error', { errorText: error?.message || 'getStats failed' });
    }
  }

  function sendMediaState() {
    send({
      type: 'media-state',
      audio: Boolean(track('audio')?.enabled) && mediaState.audio,
      video: Boolean(track('video')?.enabled) && mediaState.video,
      screen: Boolean(screenTrack),
      name: role === 'guest' ? (elements.participantName.value.trim() || 'Ученик') : 'Преподаватель',
    });
  }

  function closePeerConnection() {
    peerConnection?.close();
    peerConnection = null;
    audioTransceiver = null;
    videoTransceiver = null;
    remoteStream = new MediaStream();
    elements.remoteVideo.srcObject = remoteStream;
    elements.remotePlaceholder.hidden = false;
  }

  async function createPeerConnection() {
    if (peerConnection) return peerConnection;
    gatheredCandidateTypes.clear();
    let connection;
    try {
      connection = new RTCPeerConnection({ iceServers });
    } catch (error) {
      sendDiagnostic('peer-connection-error', {
        state: 'constructor',
        errorText: `${error?.name || 'Error'}: ${error?.message || 'RTCPeerConnection failed'}`,
      });
      setConnection('Браузер не смог создать медиасоединение', 'error');
      throw error;
    }
    peerConnection = connection;
    makingOffer = false;
    ignoreOffer = false;
    isSettingRemoteAnswerPending = false;
    remoteStream = new MediaStream();
    elements.remoteVideo.srcObject = remoteStream;

    connection.onicecandidate = event => {
      if (event.candidate) {
        const type = candidateType(event.candidate);
        if (type) gatheredCandidateTypes.add(type);
        send({ type: 'signal', candidate: event.candidate });
      } else {
        sendDiagnostic('ice-candidates-complete', {
          state: connection.iceGatheringState,
          candidateTypes: [...gatheredCandidateTypes],
        });
      }
    };
    connection.onicecandidateerror = event => {
      sendDiagnostic('ice-candidate-error', {
        errorCode: event.errorCode,
        errorText: event.errorText || 'ICE candidate error',
      });
    };
    connection.onicegatheringstatechange = () => {
      sendDiagnostic('ice-gathering-state', {
        state: connection.iceGatheringState,
        candidateTypes: [...gatheredCandidateTypes],
      });
    };
    connection.oniceconnectionstatechange = () => {
      sendDiagnostic('ice-connection-state', { state: connection.iceConnectionState });
      if (['connected', 'completed', 'failed'].includes(connection.iceConnectionState)) {
        reportSelectedCandidate(connection);
      }
    };
    connection.ontrack = event => {
      if (!remoteStream.getTracks().some(item => item.id === event.track.id)) remoteStream.addTrack(event.track);
      elements.remoteVideo.srcObject = remoteStream;
      elements.remotePlaceholder.hidden = false;
      event.track.addEventListener('unmute', () => { elements.remotePlaceholder.hidden = false; });
      event.track.addEventListener('mute', () => {
        if (remoteStream.getVideoTracks().every(item => item.muted)) elements.remotePlaceholder.hidden = false;
      });
      if (event.track.kind === 'video') {
        const revealVideo = () => { elements.remotePlaceholder.hidden = false; };
        elements.remoteVideo.addEventListener('playing', () => { elements.remotePlaceholder.hidden = true; }, { once: true });
        event.track.addEventListener('unmute', revealVideo, { once: true });
      }
    };
    connection.onconnectionstatechange = () => {
      if (peerConnection !== connection) return;
      sendDiagnostic('peer-connection-state', { state: connection.connectionState });
      if (connection.connectionState === 'connected') {
        setConnection('Соединение установлено', 'connected');
        elements.remotePlaceholderText.textContent = 'Камера участника выключена';
        window.setTimeout(() => reportSelectedCandidate(connection), 500);
      } else if (['failed', 'disconnected'].includes(connection.connectionState)) {
        setConnection('Соединение прервано, восстанавливаем…', 'error');
      }
    };
    connection.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        await connection.setLocalDescription();
        send({ type: 'signal', description: connection.localDescription });
      } catch (error) {
        console.error('WebRTC negotiation failed:', error);
      } finally {
        makingOffer = false;
      }
    };
    // Chromium may dispatch negotiationneeded while replaceTrack() yields. Register
    // every handler before adding transceivers so the initial offer cannot be lost.
    audioTransceiver = connection.addTransceiver('audio', { direction: 'sendrecv' });
    videoTransceiver = connection.addTransceiver('video', { direction: 'sendrecv' });
    await audioTransceiver.sender.replaceTrack(track('audio') || null);
    await videoTransceiver.sender.replaceTrack(screenTrack || track('video') || null);
    return connection;
  }

  async function handleSignal(message) {
    const connection = await createPeerConnection();
    try {
      if (message.description) {
        const readyForOffer = !makingOffer
          && (connection.signalingState === 'stable' || isSettingRemoteAnswerPending);
        const offerCollision = message.description.type === 'offer' && !readyForOffer;
        ignoreOffer = !polite && offerCollision;
        if (ignoreOffer) return;
        isSettingRemoteAnswerPending = message.description.type === 'answer';
        await connection.setRemoteDescription(message.description);
        isSettingRemoteAnswerPending = false;
        if (message.description.type === 'offer') {
          await connection.setLocalDescription();
          send({ type: 'signal', description: connection.localDescription });
        }
      } else if (message.candidate) {
        try {
          await connection.addIceCandidate(message.candidate);
        } catch (error) {
          if (!ignoreOffer) throw error;
        }
      }
    } catch (error) {
      console.error('Cannot apply WebRTC signal:', error);
      setConnection('Не удалось настроить медиасоединение', 'error');
    }
  }

  function websocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({ role });
    if (role === 'guest') params.set('token', roomReference);
    return `${protocol}//${window.location.host}/ws/video-calls/${encodeURIComponent(room.id)}?${params}`;
  }

  function scheduleReconnect() {
    if (leaving || !joined || reconnectAttempts >= 5) {
      if (!leaving) setConnection('Нет соединения с сервером', 'error');
      return;
    }
    reconnectAttempts += 1;
    setConnection(`Переподключение ${reconnectAttempts}/5…`, 'error');
    reconnectTimer = window.setTimeout(connectSocket, Math.min(5000, reconnectAttempts * 1000));
  }

  function connectSocket() {
    window.clearTimeout(reconnectTimer);
    closePeerConnection();
    socket = new WebSocket(websocketUrl());
    setConnection('Подключаемся к комнате…');
    socket.addEventListener('open', () => {
      reconnectAttempts = 0;
      setConnection('Ждём второго участника');
      const configuredUrls = iceServers.map(server => server.urls).filter(Boolean);
      const turnServers = iceServers.filter(server => String(server.urls).startsWith('turn'));
      const turnHasCredentials = turnServers.length > 0
        && turnServers.every(server => Boolean(server.username && server.credential));
      sendDiagnostic('ice-config', {
        state: configuredUrls.some(url => String(url).startsWith('turns:'))
          ? (turnHasCredentials ? 'turn-tls-auth' : 'turn-tls-no-auth')
          : (turnServers.length > 0
            ? (turnHasCredentials ? 'turn-auth' : 'turn-no-auth')
            : 'stun-only'),
      });
      sendMediaState();
    });
    socket.addEventListener('message', async event => {
      let message;
      try { message = JSON.parse(event.data); } catch (_error) { return; }
      try {
        if (message.type === 'connected') {
          sendDiagnostic('signaling-event', {
            state: message.peerPresent ? 'connected-with-peer' : 'connected-waiting',
          });
          if (message.peerPresent) await createPeerConnection();
        } else if (message.type === 'peer-joined') {
          sendDiagnostic('signaling-event', { state: 'peer-joined' });
          setConnection('Участник подключается…');
          await createPeerConnection();
          sendMediaState();
        } else if (message.type === 'peer-left') {
          closePeerConnection();
          setConnection('Второй участник вышел');
          elements.remotePlaceholderText.textContent = 'Ждём второго участника';
        } else if (message.type === 'signal') {
          await handleSignal(message);
        } else if (message.type === 'media-state') {
          if (message.name) elements.remoteName.textContent = String(message.name).slice(0, 60);
          elements.remoteMuted.hidden = message.audio !== false;
          if (message.video === false && !message.screen) {
            elements.remotePlaceholder.hidden = false;
            elements.remotePlaceholderText.textContent = 'Камера участника выключена';
          }
        } else if (message.type === 'call-ended') {
          finishCall('Преподаватель завершил видеозвонок.');
        }
      } catch (error) {
        sendDiagnostic('peer-connection-error', {
          state: 'message-handler',
          errorText: `${error?.name || 'Error'}: ${error?.message || 'WebRTC message failed'}`,
        });
      }
    });
    socket.addEventListener('close', event => {
      if (leaving) return;
      if (event.code === 4000) {
        finishCall('Преподаватель завершил видеозвонок.');
        return;
      }
      scheduleReconnect();
    });
    socket.addEventListener('error', () => setConnection('Ошибка соединения', 'error'));
  }

  async function toggleKind(kind) {
    const key = kind === 'audio' ? 'audio' : 'video';
    let current = track(kind);
    if (mediaState[key] && current?.enabled) {
      current.enabled = false;
      mediaState[key] = false;
    } else {
      try {
        if (!current || current.readyState === 'ended') current = await acquireTrack(kind);
        current.enabled = true;
        mediaState[key] = true;
        showPrejoinError('');
      } catch (_error) {
        mediaState[key] = false;
        showPrejoinError(`Не удалось включить ${kind === 'audio' ? 'микрофон' : 'камеру'}. Проверьте разрешения браузера.`);
      }
    }
    updateButtons();
    sendMediaState();
  }

  async function stopScreenShare() {
    const previous = screenTrack;
    screenTrack = null;
    if (previous) {
      previous.onended = null;
      previous.stop();
    }
    if (videoTransceiver) await videoTransceiver.sender.replaceTrack(track('video') || null);
    mediaState.screen = false;
    updateButtons();
    sendMediaState();
  }

  async function toggleScreenShare() {
    if (screenTrack) {
      await stopScreenShare();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      setConnection('Демонстрация экрана не поддерживается браузером', 'error');
      return;
    }
    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
      screenTrack = display.getVideoTracks()[0];
      screenTrack.onended = stopScreenShare;
      if (videoTransceiver) await videoTransceiver.sender.replaceTrack(screenTrack);
      mediaState.screen = true;
      updateButtons();
      sendMediaState();
    } catch (error) {
      if (error.name !== 'NotAllowedError') setConnection('Не удалось начать демонстрацию экрана', 'error');
    }
  }

  function stopMedia() {
    window.clearTimeout(reconnectTimer);
    screenTrack?.stop();
    localStream.getTracks().forEach(item => item.stop());
    closePeerConnection();
  }

  function finishCall(message = 'Спасибо за занятие!') {
    if (leaving) return;
    leaving = true;
    socket?.close(1000, 'Звонок завершён.');
    stopMedia();
    elements.prejoin.hidden = true;
    elements.stage.hidden = true;
    elements.ended.hidden = false;
    elements.endedMessage.textContent = message;
    setConnection('Звонок завершён');
  }

  async function leaveCall() {
    if (leaving) return;
    if (role === 'teacher') {
      elements.leave.disabled = true;
      try {
        await fetch(`/api/video-calls/${encodeURIComponent(room.id)}/end`, { method: 'POST' });
      } catch (_error) {
        // Local cleanup still takes priority if the connection is already gone.
      }
      finishCall('Вы завершили видеозвонок.');
    } else {
      send({ type: 'leave' });
      finishCall('Вы вышли из видеозвонка.');
    }
  }

  async function joinCall() {
    if (!room || joined) return;
    elements.join.disabled = true;
    elements.join.textContent = 'Подключаемся…';
    joined = true;
    elements.prejoin.hidden = true;
    elements.stage.hidden = false;
    elements.localVideo.srcObject = localStream;
    updateButtons();
    connectSocket();
  }

  async function loadRoom() {
    if (!roomReference) {
      finishCall('Некорректная ссылка на видеозвонок.');
      return;
    }
    try {
      const endpoint = role === 'teacher'
        ? `/api/video-calls/${encodeURIComponent(roomReference)}`
        : `/api/public/video-calls/${encodeURIComponent(roomReference)}`;
      const response = await fetch(endpoint);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Комната недоступна.');
      room = payload.call;
      iceServers = normalizeIceServers(payload.iceServers);
      setConnection('Комната готова');
      await prepareMedia();
    } catch (error) {
      elements.prejoin.hidden = true;
      elements.ended.hidden = false;
      elements.endedMessage.textContent = error.message || 'Ссылка недействительна или срок её действия истёк.';
      setConnection('Комната недоступна', 'error');
    }
  }

  elements.prejoinMic.addEventListener('click', () => toggleKind('audio'));
  elements.prejoinCamera.addEventListener('click', () => toggleKind('video'));
  elements.toggleMic.addEventListener('click', () => toggleKind('audio'));
  elements.toggleCamera.addEventListener('click', () => toggleKind('video'));
  elements.toggleScreen.addEventListener('click', toggleScreenShare);
  elements.leave.addEventListener('click', leaveCall);
  elements.join.addEventListener('click', joinCall);
  window.addEventListener('pagehide', () => {
    if (!leaving) {
      send({ type: 'leave' });
      stopMedia();
    }
  });

  loadRoom();
})();
