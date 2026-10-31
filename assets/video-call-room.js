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
  // TURN credentials live at least five minutes, and a participant may wait much longer.
  const ICE_REFRESH_MS = 4 * 60 * 1000;
  const STALLED_CONNECTION_MS = 15_000;
  const MAX_CONNECTION_RESTARTS = 2;
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
  let recording = null;
  let recordingBusy = false;
  let recordingActive = false;
  let recordingDone = null;

  function recordingMessage(message) {
    if (role !== 'teacher') return;
    recordingStatus.hidden = !message;
    recordingStatus.textContent = message;
  }

  function recordingSources() {
    return {
      localVideo: media.outboundVideoTrack(),
      remoteVideo: (remoteMediaState.screen || remoteMediaState.video !== false)
        ? remoteStream.getVideoTracks()[0] : null,
      localScreen: media.sentState().screen,
      remoteScreen: Boolean(remoteMediaState.screen),
      remoteName: elements.remoteName.textContent,
      audio: [media.outboundAudioTrack(), ...remoteStream.getAudioTracks()],
    };
  }

  async function stopRecording() {
    if (!recording) return;
    recordingActive = false;
    recordingButton.setAttribute('aria-pressed', 'false');
    recordingButton.disabled = true;
    recordingMessage('Сохраняем запись… Не закрывайте вкладку.');
    sendMediaState();
    void recording.stop().catch(() => {});
    await recordingDone;
  }

  async function toggleRecording() {
    if (role !== 'teacher' || leaving || recordingBusy) return;
    if (recording) { await stopRecording(); return; }
    recordingBusy = true;
    recordingButton.disabled = true;
    try {
      const session = await window.CallRecorder.start({
        getSources: recordingSources, canStart: () => !leaving,
      });
      recording = session;
      recordingActive = true;
      recordingButton.querySelector('span').textContent = 'Остановить запись';
      recordingButton.setAttribute('aria-pressed', 'true');
      recordingMessage('');
      sendMediaState();
      recordingDone = session.finished.then(() => {
        recordingMessage('Запись сохранена на компьютере.');
      }, error => {
        recordingMessage(`Запись не сохранена: ${error.message || 'ошибка записи на диск'}`);
      }).finally(() => {
        recording = null;
        recordingActive = false;
        recordingButton.disabled = leaving;
        recordingButton.setAttribute('aria-pressed', 'false');
        recordingButton.querySelector('span').textContent = 'Записать';
        sendMediaState();
      });
    } catch (error) {
      if (error.name !== 'AbortError') recordingMessage(error.message || 'Не удалось начать запись.');
    } finally {
      recordingBusy = false;
      recordingButton.disabled = leaving;
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
  recordingButton.addEventListener('click', toggleRecording);
  window.addEventListener('beforeunload', event => {
    if (recording || recordingBusy) { event.preventDefault(); event.returnValue = ''; }
  });

  let room = null;
  let iceServers = [];
  let remoteStream = new MediaStream();
  let remoteMediaState = {};
  let mediaStatsTimer = null;
  let peerGeneration = 0;
  let replacementSequence = 0;
  const diagnosticTrackIds = new WeakMap();
  let diagnosticTrackSequence = 0;
  let socket = null;
  const pageSession = crypto.randomUUID();
  let socketAttempt = 0;
  let lastSocketClose = null;
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
  const media = window.CallMedia.create({
    diagnostic: sendDiagnostic,
    applyAudio: applyOutboundAudioTrack,
    applyVideo: applyOutboundVideoTrack,
    publish: sendMediaState,
    onChange: renderMedia,
  });

  elements.brand.href = exitPath;
  elements.exitLink.href = exitPath;
  elements.exitLink.textContent = role === 'teacher' ? 'К списку звонков' : 'На главную';
  elements.leaveLabel.textContent = role === 'teacher' ? 'Завершить' : 'Выйти';
  elements.guestNameField.hidden = role !== 'guest';
  elements.remoteName.textContent = peerTitle;
  elements.remoteVideo.addEventListener('playing', () => {
    updateRemoteVideoVisibility('playing');
  });
  document.addEventListener('visibilitychange', () => {
    media.setPageHidden(document.hidden);
    reportMediaStats(peerConnection, 'visibility');
  });

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

  async function applyOutboundAudioTrack() {
    if (audioTransceiver) await audioTransceiver.sender.replaceTrack(media.outboundAudioTrack());
  }

  async function applyOutboundVideoTrack() {
    if (!videoTransceiver) return;
    const sender = videoTransceiver.sender;
    const next = media.outboundVideoTrack();
    const operation = ++replacementSequence;
    const details = { peerGeneration, operation, previousTrack: diagnosticTrackId(sender.track),
      nextTrack: diagnosticTrackId(next), source: media.videoSource(next) };
    sendDiagnostic('video-track-replace', { ...details, state: 'start' });
    try {
      await sender.replaceTrack(next);
      sendDiagnostic('video-track-replace', { ...details, state: 'success', ...videoTrackDetails(sender.track) });
    } catch (error) {
      sendDiagnostic('video-track-replace', { ...details, state: 'failure',
        ...videoTrackDetails(sender.track), errorText: `${error.name}: ${error.message}` });
      throw error;
    }
  }

  function send(message) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function sendDiagnostic(event, details = {}) {
    // Server logs have second precision; elapsedMs orders events within one connection attempt.
    const elapsedMs = peerConnection ? Math.round(performance.now() - peerConnection.diagnosticCreatedAt) : undefined;
    send({ type: 'diagnostic', event, pageSession, peerGeneration, pageHidden: document.hidden, elapsedMs, ...details });
  }

  function diagnosticTrackId(track) {
    if (!track) return 0;
    if (!diagnosticTrackIds.has(track)) diagnosticTrackIds.set(track, ++diagnosticTrackSequence);
    return diagnosticTrackIds.get(track);
  }

  function videoTrackDetails(track) {
    return { trackNumber: diagnosticTrackId(track), trackState: track?.readyState || 'absent',
      trackMuted: Boolean(track?.muted), trackEnabled: Boolean(track?.enabled) };
  }

  function updateRemoteVideoVisibility(reason) {
    const tracks = remoteStream.getVideoTracks();
    const active = tracks.find(track => track.readyState === 'live' && !track.muted);
    const explicitlyOff = remoteMediaState.video === false && !remoteMediaState.screen;
    elements.remotePlaceholder.hidden = !explicitlyOff && Boolean(active);
    if (!elements.remotePlaceholder.hidden) {
      elements.remotePlaceholderText.textContent = explicitlyOff
        ? 'Камера участника выключена' : 'Ожидаем видео участника…';
    }
    sendDiagnostic('remote-video-state', { state: reason, video: remoteMediaState.video,
      screen: remoteMediaState.screen, placeholderVisible: !elements.remotePlaceholder.hidden,
      ...videoTrackDetails(active || tracks[0]), videoReadyState: elements.remoteVideo.readyState });
  }

  async function reportMediaStats(connection, reason = 'periodic') {
    if (!connection || connection !== peerConnection) return;
    if (connection.diagnosticStatsPending) return;
    connection.diagnosticStatsPending = true;
    try {
      const reports = await connection.getStats();
      if (connection !== peerConnection) return;
      const nextSamples = new Map();
      reports.forEach(report => {
        if ((report.kind || report.mediaType) !== 'video' || !['inbound-rtp', 'outbound-rtp'].includes(report.type)) return;
        const details = { state: reason, direction: report.type, ssrc: report.ssrc,
          placeholderVisible: !elements.remotePlaceholder.hidden };
        for (const field of ['framesEncoded', 'framesSent', 'framesReceived', 'framesDecoded', 'bytesSent', 'bytesReceived', 'packetsLost']) {
          if (Number.isFinite(report[field]) && report[field] >= 0) details[field] = Math.round(report[field]);
        }
        const frames = report.type === 'inbound-rtp' ? report.framesDecoded : report.framesSent;
        const key = `${report.type}:${report.ssrc}`;
        const previous = connection.diagnosticSamples?.get(key);
        if (Number.isFinite(frames) && Number.isFinite(report.timestamp)) {
          nextSamples.set(key, { frames, timestamp: report.timestamp });
          const elapsed = report.timestamp - (previous?.timestamp ?? report.timestamp);
          if (previous && elapsed >= 1000 && elapsed <= 86_400_000 && frames >= previous.frames) {
            details.averageFps = Math.round((frames - previous.frames) * 10_000 / elapsed) / 10;
            details.sampleDurationMs = Math.round(elapsed);
          } else if (previous && elapsed >= 0 && elapsed < 1000 && frames >= previous.frames) {
            nextSamples.set(key, previous);
          }
        }
        sendDiagnostic('video-rtp-stats', details);
      });
      connection.diagnosticSamples = nextSamples;
    } catch (error) {
      if (connection === peerConnection) sendDiagnostic('stats-error', { state: 'video', errorText: error.message });
    } finally { connection.diagnosticStatsPending = false; }
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
    const sent = media.sentState();
    sendDiagnostic('local-media-state', { video: sent.video, screen: sent.screen });
    send({
      type: 'media-state',
      recording: role === 'teacher' && recordingActive,
      ...sent,
      // Without a typed name the teacher keeps the room name as the student's label.
      name: role === 'guest' ? elements.participantName.value.trim() : 'Преподаватель',
    });
  }

  function closePeerConnection() {
    window.clearInterval(mediaStatsTimer);
    mediaStatsTimer = null;
    remoteMediaState = {};
    if (peerConnection) {
      window.clearTimeout(peerConnection.diagnosticSnapshotTimer);
      if (!peerConnection.diagnosticConnected) {
        sendDiagnostic('peer-connection-snapshot', { state: 'closed-unconnected', ...connectionSnapshot(peerConnection) });
      }
    }
    peerConnection?.close();
    peerConnection = null;
    audioTransceiver = null;
    videoTransceiver = null;
    remoteStream = new MediaStream();
    elements.remoteVideo.srcObject = remoteStream;
    elements.remotePlaceholder.hidden = false;
  }

  // Synchronous part of the snapshot, so it can still be collected right before close().
  function connectionSnapshot(connection) {
    const transceivers = connection.getTransceivers();
    const iceTransports = new Set(transceivers.map(item => item.sender.transport?.iceTransport).filter(Boolean));
    return {
      signalingState: connection.signalingState,
      iceGatheringState: connection.iceGatheringState,
      iceConnectionState: connection.iceConnectionState,
      connectionState: connection.connectionState,
      transceivers: transceivers.length,
      iceTransports: [...iceTransports].map(transport => `${transport.state}/${transport.gatheringState}`),
      localCandidates: connection.diagnosticCandidates.local,
      remoteCandidates: connection.diagnosticCandidates.remote,
      remoteCandidateErrors: connection.diagnosticCandidates.remoteErrors,
      candidateTypes: [...gatheredCandidateTypes],
    };
  }

  async function reportConnectionSnapshot(connection, reason) {
    if (connection !== peerConnection || connection.diagnosticConnected) return;
    const details = { state: reason, ...connectionSnapshot(connection) };
    try {
      const pairStates = new Set();
      const remoteTypes = new Set();
      let pairs = 0;
      (await connection.getStats()).forEach(report => {
        if (report.type === 'candidate-pair') {
          pairs += 1;
          pairStates.add(report.state);
        } else if (report.type === 'remote-candidate') {
          remoteTypes.add(candidateType(report));
        }
      });
      Object.assign(details, { candidatePairs: pairs, candidatePairStates: [...pairStates],
        remoteCandidateTypes: [...remoteTypes] });
    } catch (error) {
      details.errorText = `${error?.name || 'Error'}: ${error?.message || 'getStats failed'}`;
    }
    if (connection === peerConnection) sendDiagnostic('peer-connection-snapshot', details);
  }

  // Teacher-side watchdog: ICE checks that have not started by now never start,
  // so both sides begin a new connection the way a page reload would.
  async function restartStalledConnection(connection) {
    await reportConnectionSnapshot(connection, 'stalled');
    if (polite || connection !== peerConnection || connection.iceConnectionState !== 'new'
      || connection.restartAttempt >= MAX_CONNECTION_RESTARTS) return;
    const attempt = connection.restartAttempt + 1;
    sendDiagnostic('connection-restart', { state: `attempt-${attempt}` });
    send({ type: 'restart-connection' });
    closePeerConnection();
    await createPeerConnection(attempt);
    // closePeerConnection() forgot the peer's media state, so both sides exchange it again.
    sendMediaState();
  }

  async function createPeerConnection(restartAttempt = 0) {
    if (peerConnection) return peerConnection;
    gatheredCandidateTypes.clear();
    const createdAt = performance.now();
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
    peerGeneration += 1;
    Object.assign(connection, { restartAttempt, diagnosticCreatedAt: createdAt, diagnosticSetupPending: true,
      diagnosticCandidates: { local: 0, remote: 0, remoteErrors: 0 } });
    sendDiagnostic('peer-connection-setup', { state: 'created' });
    connection.diagnosticSnapshotTimer = window.setTimeout(() => restartStalledConnection(connection), STALLED_CONNECTION_MS);
    mediaStatsTimer = window.setInterval(() => reportMediaStats(connection), 30_000);
    makingOffer = false;
    ignoreOffer = false;
    isSettingRemoteAnswerPending = false;
    remoteStream = new MediaStream();
    elements.remoteVideo.srcObject = remoteStream;

    connection.onicecandidate = event => {
      if (event.candidate) {
        connection.diagnosticCandidates.local += 1;
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
    const iceErrors = new Set();
    let suppressedIceErrors = 0;
    connection.onicecandidateerror = event => {
      if (connection !== peerConnection) return;
      const key = `${event.errorCode}:${event.errorText}`;
      if (iceErrors.has(key) || iceErrors.size >= 10) { suppressedIceErrors++; return; }
      iceErrors.add(key);
      sendDiagnostic('ice-candidate-error', {
        errorCode: event.errorCode,
        errorText: event.errorText || 'ICE candidate error',
      });
    };
    connection.onicegatheringstatechange = () => {
      if (connection !== peerConnection) return;
      sendDiagnostic('ice-gathering-state', {
        state: connection.iceGatheringState,
        suppressedErrors: suppressedIceErrors,
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
      if (peerConnection !== connection) return;
      if (!remoteStream.getTracks().some(item => item.id === event.track.id)) remoteStream.addTrack(event.track);
      if (elements.remoteVideo.srcObject !== remoteStream) elements.remoteVideo.srcObject = remoteStream;
      if (event.track.kind === 'video') {
        for (const type of ['unmute', 'mute', 'ended']) {
          event.track.addEventListener(type, () => {
            if (peerConnection !== connection) return;
            updateRemoteVideoVisibility(type);
            reportMediaStats(connection, type);
          });
        }
      }
      updateRemoteVideoVisibility(event.track.kind === 'video' ? 'video-track' : 'audio-track');
    };
    connection.onconnectionstatechange = () => {
      if (peerConnection !== connection) return;
      sendDiagnostic('peer-connection-state', { state: connection.connectionState });
      if (connection.connectionState === 'connected') {
        connection.diagnosticConnected = true;
        window.clearTimeout(connection.diagnosticSnapshotTimer);
        setConnection('Соединение установлено', 'connected');
        updateRemoteVideoVisibility('connected');
        window.setTimeout(() => reportSelectedCandidate(connection), 500);
      } else if (['failed', 'disconnected'].includes(connection.connectionState)) {
        setConnection('Соединение прервано, восстанавливаем…', 'error');
      }
    };
    connection.onsignalingstatechange = () => {
      if (peerConnection !== connection) return;
      sendDiagnostic('signaling-state', { state: connection.signalingState,
        transceivers: connection.getTransceivers().length });
    };
    connection.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        await connection.setLocalDescription();
        // An answer here means a remote offer was applied before this negotiation started.
        if (connection === peerConnection) sendDiagnostic('negotiation', {
          state: `local-${connection.localDescription.type}`, trigger: 'negotiationneeded',
        });
        send({ type: 'signal', description: connection.localDescription });
      } catch (error) {
        if (connection === peerConnection) sendDiagnostic('peer-connection-error', {
          state: 'negotiation', errorText: `${error.name}: ${error.message}`,
        });
        console.error('WebRTC negotiation failed:', error);
      } finally {
        makingOffer = false;
      }
    };
    // Only the teacher offers. When the guest's own offer collided with the teacher's,
    // Chromium sometimes left the guest's ICE transport without candidates after the
    // rollback. The guest sends on the offered transceivers (adoptOfferedTransceivers).
    if (!polite) {
      // Chromium may dispatch negotiationneeded while replaceTrack() yields. Register
      // every handler before adding transceivers so the initial offer cannot be lost.
      audioTransceiver = connection.addTransceiver('audio', { direction: 'sendrecv' });
      videoTransceiver = connection.addTransceiver('video', { direction: 'sendrecv' });
    }
    try {
      await applyOutboundAudioTrack();
      await applyOutboundVideoTrack();
    } finally {
      connection.diagnosticSetupPending = false;
    }
    if (connection === peerConnection) sendDiagnostic('peer-connection-setup', { state: 'complete' });
    return connection;
  }

  // The guest has no transceivers of its own. Sending must be enabled before the
  // answer, otherwise the answer would declare the guest receive-only.
  function adoptOfferedTransceivers(connection) {
    if (audioTransceiver || videoTransceiver) return false;
    for (const transceiver of connection.getTransceivers()) {
      const kind = transceiver.receiver.track.kind;
      if (kind === 'audio' && !audioTransceiver) audioTransceiver = transceiver;
      else if (kind === 'video' && !videoTransceiver) videoTransceiver = transceiver;
      else continue;
      transceiver.direction = 'sendrecv';
    }
    return true;
  }

  async function handleSignal(message) {
    const connection = await createPeerConnection();
    try {
      if (message.description) {
        const readyForOffer = !makingOffer
          && (connection.signalingState === 'stable' || isSettingRemoteAnswerPending);
        const offerCollision = message.description.type === 'offer' && !readyForOffer;
        ignoreOffer = !polite && offerCollision;
        sendDiagnostic('negotiation', {
          state: ignoreOffer ? 'offer-ignored' : `remote-${message.description.type}`,
          setupPending: connection.diagnosticSetupPending, collision: offerCollision,
        });
        if (ignoreOffer) return;
        isSettingRemoteAnswerPending = message.description.type === 'answer';
        await connection.setRemoteDescription(message.description);
        isSettingRemoteAnswerPending = false;
        if (message.description.type === 'offer') {
          const adopted = polite && connection === peerConnection && adoptOfferedTransceivers(connection);
          await connection.setLocalDescription();
          if (connection === peerConnection) sendDiagnostic('negotiation', {
            state: `local-${connection.localDescription.type}`, trigger: 'remote-offer',
          });
          send({ type: 'signal', description: connection.localDescription });
          // Tracks go out after the answer so replaceTrack() does not overlap the negotiation.
          if (adopted && connection === peerConnection) {
            await applyOutboundAudioTrack();
            await applyOutboundVideoTrack();
          }
        }
      } else if (message.candidate) {
        try {
          await connection.addIceCandidate(message.candidate);
          connection.diagnosticCandidates.remote += 1;
        } catch (error) {
          connection.diagnosticCandidates.remoteErrors += 1;
          if (!ignoreOffer) throw error;
        }
      }
    } catch (error) {
      if (connection === peerConnection) sendDiagnostic('peer-connection-error', {
        state: message.description ? 'remote-description' : 'remote-candidate',
        errorText: `${error.name}: ${error.message}`,
      });
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
    const currentSocket = socket;
    socketAttempt++;
    setConnection('Подключаемся к комнате…');
    socket.addEventListener('open', () => {
      if (socket !== currentSocket) return;
      sendDiagnostic('socket-open', { state: lastSocketClose ? 'reconnected' : 'initial',
        socketAttempt, navigationType: performance.getEntriesByType('navigation')[0]?.type || 'unknown',
        online: navigator.onLine, mediaPreparation: media.preparation.state, mediaWaitMs: media.preparation.waitMs,
        errorName: media.preparation.errorName, ...lastSocketClose });
      lastSocketClose = null;
      reconnectAttempts = 0;
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
      const effect = media.activeEffectDiagnostic();
      if (effect) sendDiagnostic('background-effect-ready', effect);
      sendMediaState();
    });
    socket.addEventListener('message', async event => {
      if (socket !== currentSocket || leaving) return;
      let message;
      try { message = JSON.parse(event.data); } catch (_error) { return; }
      try {
        if (message.type === 'chat-message') {
          window.CallChat?.receive(message.message);
        } else if (message.type === 'connected') {
          window.CallChat?.sync();
          sendDiagnostic('signaling-event', {
            state: message.peerPresent ? 'connected-with-peer' : 'connected-waiting',
          });
          showRemoteInvite(!message.peerPresent);
          if (message.peerPresent) {
            setConnection(`${peerTitle} подключается…`);
            await createPeerConnection();
          } else {
            setConnection(waitingStatus);
            elements.remotePlaceholderText.textContent = `${peerTitle} ещё не подключился. Звонок начнётся автоматически.`;
          }
        } else if (message.type === 'peer-joined') {
          sendDiagnostic('signaling-event', { state: 'peer-joined' });
          // The peer has a new RTCPeerConnection, even if its old socket has
          // not timed out yet and no peer-left event was delivered.
          closePeerConnection();
          showRemoteInvite(false);
          setConnection(`${peerTitle} подключается…`);
          await createPeerConnection();
          sendMediaState();
        } else if (message.type === 'peer-left') {
          closePeerConnection();
          setConnection(`${peerTitle} вышел`);
          elements.remotePlaceholderText.textContent = `${waitingStatus} — звонок возобновится автоматически.`;
          showRemoteInvite(true);
        } else if (message.type === 'restart-connection' && polite) {
          sendDiagnostic('signaling-event', { state: 'restart-connection' });
          // The teacher's new offer follows on the same socket and creates the new connection.
          closePeerConnection();
          sendMediaState();
        } else if (message.type === 'signal') {
          await handleSignal(message);
        } else if (message.type === 'media-state') {
          if (message.name) elements.remoteName.textContent = String(message.name).slice(0, 60);
          elements.remoteMuted.hidden = message.audio !== false;
          remoteMediaState = { video: message.video, screen: message.screen };
          updateRemoteVideoVisibility('media-state');
          reportMediaStats(peerConnection, 'media-state');
        } else if (message.type === 'call-ended') {
          finishCall(callEndedText);
        }
      } catch (error) {
        sendDiagnostic('peer-connection-error', {
          state: 'message-handler',
          errorText: `${error?.name || 'Error'}: ${error?.message || 'WebRTC message failed'}`,
        });
      }
    });
    socket.addEventListener('close', event => {
      if (socket !== currentSocket || leaving) return;
      // The socket is already closed; retain one bounded record for the next open.
      lastSocketClose = { closeCode: event.code, wasClean: event.wasClean,
        reconnectDelayMs: Math.min(5000, (reconnectAttempts + 1) * 1000) };
      if (event.code === 4000) {
        finishCall(callEndedText);
        return;
      }
      // Another tab took the room over; reconnecting would take it back and loop forever.
      if (event.code === 4001) {
        finishCall('Звонок продолжается в другой вкладке или на другом устройстве. '
          + 'Чтобы вернуть его сюда, нажмите «Подключиться снова».', 'Звонок открыт в другом месте');
        return;
      }
      scheduleReconnect();
    });
    socket.addEventListener('error', () => setConnection('Ошибка соединения', 'error'));
  }

  function stopMedia() {
    window.clearTimeout(reconnectTimer);
    media.stop();
    closePeerConnection();
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
    await stopRecording();
    socket?.close(1000, 'Звонок завершён.');
    stopMedia();
    elements.prejoin.hidden = true;
    elements.stage.hidden = true;
    elements.ended.hidden = false;
    elements.endedTitle.textContent = title;
    elements.endedMessage.textContent = message;
    // The link is permanent, so a fresh page load joins the same room again.
    elements.rejoinLink.hidden = !room;
    elements.rejoinLink.href = window.location.pathname;
    setConnection('Звонок завершён');
    window.CallChat?.open();
    window.CallChat?.sync();
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
      send({ type: 'leave' });
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
    connectSocket();
  }

  // The room address opens only for its teacher, so the student's invite is offered right here.
  function showRemoteInvite(peerAbsent) {
    elements.remoteInvite.hidden = !peerAbsent || !room.guestPath;
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

  // A new peer connection always uses the latest credentials; current ones keep theirs.
  async function refreshIceServers() {
    if (leaving) return;
    try {
      const response = await fetch(roomEndpoint);
      if (response.ok) iceServers = normalizeIceServers((await response.json()).iceServers);
    } catch (_error) {
      // The next refresh retries; until then the previous credentials stay in use.
    }
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
      if (room.name) {
        elements.remoteName.textContent = room.name;
        document.title = `${room.name} — видеозвонок EasyClass`;
      }
      window.CallChat.init({ role, reference: roomReference });
      iceServers = normalizeIceServers(payload.iceServers);
      window.setInterval(refreshIceServers, ICE_REFRESH_MS);
      setConnection('Комната готова');
      if (new URLSearchParams(location.search).has('chat')) {
        window.CallChat.open();
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
      sendDiagnostic('page-lifecycle', { state: 'pagehide', persisted: event.persisted });
      send({ type: 'leave', source: 'pagehide' });
      void stopRecording();
      stopMedia();
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

  loadRoom();
})();
