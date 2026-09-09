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
    prejoinBackgroundOptions: document.getElementById('prejoin-background-options'),
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
    toggleBackground: document.getElementById('toggle-background'),
    toggleScreen: document.getElementById('toggle-screen'),
    callBackgroundPanel: document.getElementById('call-background-panel'),
    callBackgroundOptions: document.getElementById('call-background-options'),
    closeBackgroundPanel: document.getElementById('close-background-panel'),
    leave: document.getElementById('leave-call'),
    leaveLabel: document.getElementById('leave-label'),
    ended: document.getElementById('room-ended'),
    endedMessage: document.getElementById('room-ended-message'),
    exitLink: document.getElementById('room-exit-link'),
  };

  const BACKGROUND_STORAGE_KEY = 'easyclass.videoBackground';
  const BACKGROUND_OPTIONS = [
    { id: 'none', label: 'Без фона', previewClass: 'background-option__preview--none' },
    { id: 'blur', label: 'Размытие', previewClass: 'background-option__preview--blur' },
    { id: 'study-light', label: 'Кабинет', src: '/assets/images/video-backgrounds/study-light.jpg' },
    { id: 'library-plum', label: 'Библиотека', src: '/assets/images/video-backgrounds/library-plum.jpg' },
    { id: 'classroom-soft', label: 'Класс', src: '/assets/images/video-backgrounds/classroom-soft.jpg' },
  ];
  const BACKGROUND_IDS = new Set(BACKGROUND_OPTIONS.map(option => option.id));
  const MEDIAPIPE_BASE = '/assets/vendor/mediapipe-1.0.1';
  const MOBILE_DEVICE = navigator.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const SEGMENTER_MODEL = MOBILE_DEVICE
    ? { id: 'landscape', filename: 'selfie_segmenter_landscape.tflite' }
    : { id: 'square', filename: 'selfie_segmenter.tflite' };
  const EFFECT_FRAME_INTERVAL_MS = MOBILE_DEVICE ? 1000 / 18 : 1000 / 24;


  let room = null;
  let iceServers = [];
  let localStream = new MediaStream();
  let remoteStream = new MediaStream();
  let remoteMediaState = {};
  let mediaStatsTimer = null;
  let peerGeneration = 0;
  let replacementSequence = 0;
  const diagnosticTrackIds = new WeakMap();
  let diagnosticTrackSequence = 0;
  let screenTrack = null;
  let socket = null;
  const pageSession = crypto.randomUUID();
  let socketAttempt = 0;
  let lastSocketClose = null;
  let peerConnection = null;
  let audioTransceiver = null;
  let videoTransceiver = null;
  let selectedBackground = readStoredBackground();
  let backgroundEffectGeneration = 0;
  let effectSession = null;
  let effectTrack = null;
  let effectStartController = null;
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
  elements.remoteVideo.addEventListener('playing', () => {
    updateRemoteVideoVisibility('playing');
  });
  document.addEventListener('visibilitychange', () => {
    effectSession?.visibility(document.hidden);
    reportMediaStats(peerConnection, 'visibility');
  });

  function setConnection(text, state = '') {
    elements.connection.dataset.state = state;
    elements.connection.lastChild.textContent = ` ${text}`;
  }

  function showPrejoinError(message) {
    elements.prejoinError.textContent = message;
    elements.prejoinError.hidden = !message;
  }

  function readStoredBackground() {
    try {
      const stored = window.localStorage.getItem(BACKGROUND_STORAGE_KEY);
      return BACKGROUND_IDS.has(stored) ? stored : 'none';
    } catch (_error) {
      return 'none';
    }
  }

  function writeStoredBackground(value) {
    try {
      window.localStorage.setItem(BACKGROUND_STORAGE_KEY, value);
    } catch (_error) {
      // The choice still works for this call when storage is unavailable.
    }
  }

  function renderBackgroundOptions(container) {
    const fragment = document.createDocumentFragment();
    BACKGROUND_OPTIONS.forEach(option => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'background-option';
      button.dataset.backgroundOption = option.id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(option.id === selectedBackground));
      button.setAttribute('aria-label', option.label);

      const preview = document.createElement('span');
      preview.className = `background-option__preview ${option.previewClass || ''}`.trim();
      if (option.src) preview.style.backgroundImage = `url("${option.src}")`;
      const label = document.createElement('span');
      label.textContent = option.label;
      button.append(preview, label);
      button.addEventListener('click', () => selectVideoBackground(option.id));
      fragment.append(button);
    });
    container.replaceChildren(fragment);
  }

  function updateBackgroundControls() {
    document.querySelectorAll('[data-background-option]').forEach(button => {
      button.setAttribute('aria-checked', String(button.dataset.backgroundOption === selectedBackground));
    });
    elements.toggleBackground.setAttribute('aria-pressed', String(selectedBackground !== 'none'));
  }

  function setBackgroundStatus(message, state = '') {
    document.querySelectorAll('.background-picker__status').forEach(status => {
      status.textContent = message;
      status.dataset.state = state;
    });
  }

  function backgroundOption(value = selectedBackground) {
    return BACKGROUND_OPTIONS.find(option => option.id === value) || BACKGROUND_OPTIONS[0];
  }

  function backgroundEffectsSupported() {
    return Boolean(window.WebAssembly && window.Worker);
  }

  function stopBackgroundEffect() {
    effectStartController?.abort();
    effectStartController = null;
    effectSession?.stop();
    effectSession = null;
    effectTrack = null;
  }

  function cameraTrack() {
    return localStream.getVideoTracks()[0];
  }

  function outboundVideoTrack() {
    if (screenTrack) return screenTrack;
    if (!mediaState.video || !cameraTrack()?.enabled) return null;
    return selectedBackground === 'none' ? cameraTrack() : effectTrack;
  }

  async function applyOutboundVideoTrack() {
    if (!videoTransceiver) return;
    const sender = videoTransceiver.sender;
    const next = outboundVideoTrack();
    const operation = ++replacementSequence;
    const details = { peerGeneration, operation, previousTrack: diagnosticTrackId(sender.track),
      nextTrack: diagnosticTrackId(next), source: !next ? 'none' : next === screenTrack ? 'screen' : next === effectTrack ? 'effect' : 'camera' };
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

  function effectMode() {
    return selectedBackground === 'blur' ? 'blur' : 'replacement';
  }

  function effectDiagnosticDetails(extra = {}) {
    return { pipelineVersion: 3, effectGeneration: backgroundEffectGeneration, mode: effectMode(), model: SEGMENTER_MODEL.id,
      ...effectSession?.details, ...extra };
  }

  function handleEffectFailure(error) {
    if (error?.name === 'AbortError') return;
    console.error('Video background processing failed:', error);
    sendDiagnostic('background-effect-failure', effectDiagnosticDetails({ state: 'failed',
      errorText: `${error?.name || 'Error'}: ${error?.message || 'Background processing failed'}` }));
    backgroundEffectGeneration += 1;
    stopBackgroundEffect();
    setBackgroundStatus('Эффект недоступен — видео приостановлено. Выберите фон повторно или «Без фона».', 'error');
    void applyOutboundVideoTrack().catch(error => console.error('Video replacement failed:', error));
    updateLocalPreview();
  }

  async function startBackgroundEffect() {
    const generation = ++backgroundEffectGeneration;
    stopBackgroundEffect();
    const controller = new AbortController();
    effectStartController = controller;
    try {
      await applyOutboundVideoTrack();
      updateLocalPreview();
      if (controller.signal.aborted || generation !== backgroundEffectGeneration) return;
      if (selectedBackground === 'none' || !mediaState.video || !cameraTrack()?.enabled || screenTrack) return;
      if (!backgroundEffectsSupported()) throw new Error('Браузер не поддерживает обработку видеофона.');
      setBackgroundStatus('Готовим эффект…');
      const { createBackgroundPipeline } = await import('/assets/video-background-pipeline.mjs');
      if (controller.signal.aborted || generation !== backgroundEffectGeneration) return;
      const session = createBackgroundPipeline({
        camera: cameraTrack(),
        config: { model: SEGMENTER_MODEL, mode: selectedBackground,
          backgroundUrl: backgroundOption().src, targetFps: 1000 / EFFECT_FRAME_INTERVAL_MS,
          maxWidth: MOBILE_DEVICE ? 640 : 960, hidden: document.hidden },
        onDiagnostic: (event, details) => {
          if (generation === backgroundEffectGeneration && !controller.signal.aborted) sendDiagnostic(event, { ...details, effectGeneration: generation });
        },
        onFailure: error => {
          if (generation === backgroundEffectGeneration && !controller.signal.aborted) handleEffectFailure(error);
        },
      });
      effectSession = session;
      try { await session.ready; }
      catch (error) {
        session.stop();
        if (generation === backgroundEffectGeneration && !controller.signal.aborted) throw error;
        return;
      }
      if (generation !== backgroundEffectGeneration || controller.signal.aborted) { session.stop(); return; }
      effectTrack = session.track;
      effectTrack.enabled = mediaState.video;
      await applyOutboundVideoTrack();
      if (generation !== backgroundEffectGeneration || controller.signal.aborted) return;
      updateLocalPreview();
      sendDiagnostic('background-effect-ready', effectDiagnosticDetails({ state: 'ready' }));
      setBackgroundStatus(session.details.transport === 'canvas-worker'
        ? 'Эффект включён — совместимый режим' : 'Эффект включён', 'ready');
    } catch (error) {
      if (generation === backgroundEffectGeneration && !controller.signal.aborted) throw error;
    }
  }

  async function selectVideoBackground(value, { persist = true } = {}) {
    if (!BACKGROUND_IDS.has(value)) value = 'none';
    sendDiagnostic('video-background-selection', { state: value === 'none' ? 'none' : value === 'blur' ? 'blur' : 'replacement' });
    selectedBackground = value;
    if (persist) writeStoredBackground(value);
    updateBackgroundControls();
    if (value === 'none') {
      backgroundEffectGeneration += 1;
      stopBackgroundEffect();
      setBackgroundStatus('');
      await applyOutboundVideoTrack();
      updateLocalPreview();
      return;
    }
    if (!mediaState.video || !cameraTrack()?.enabled) {
      setBackgroundStatus('Включите камеру, чтобы применить эффект');
      return;
    }
    if (screenTrack) {
      setBackgroundStatus('Фон включится после демонстрации экрана');
      return;
    }
    try {
      await startBackgroundEffect();
    } catch (error) {
      handleEffectFailure(error);
    }
  }

  function track(kind) {
    return kind === 'audio' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
  }

  function updateLocalPreview() {
    const previewTrack = screenTrack || (mediaState.video && cameraTrack()?.enabled ? outboundVideoTrack() : null);
    const previewStream = previewTrack ? new MediaStream([previewTrack]) : new MediaStream();
    elements.previewVideo.srcObject = previewStream;
    elements.localVideo.srcObject = previewStream;
    const cameraVisible = Boolean(previewTrack);
    elements.previewPlaceholder.hidden = cameraVisible;
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
    updateBackgroundControls();
    updateLocalPreview();
  }

  async function acquireTrack(kind) {
    const constraints = kind === 'audio'
      ? { audio: { echoCancellation: true, noiseSuppression: true }, video: false }
      : { audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
    if (!newTrack) throw new Error(`Браузер не предоставил ${kind === 'audio' ? 'микрофон' : 'камеру'}.`);
    if (kind === 'video') {
      backgroundEffectGeneration += 1;
      stopBackgroundEffect();
    }
    localStream.getTracks().filter(item => item.kind === kind).forEach(item => {
      localStream.removeTrack(item);
      item.stop();
    });
    localStream.addTrack(newTrack);
    if (kind === 'audio' && audioTransceiver) await audioTransceiver.sender.replaceTrack(newTrack);
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
    if (mediaState.video && cameraTrack()?.enabled && selectedBackground !== 'none') {
      try {
        await startBackgroundEffect();
      } catch (error) {
        handleEffectFailure(error);
      }
    }
  }

  function send(message) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function sendDiagnostic(event, details = {}) {
    send({ type: 'diagnostic', event, pageSession, peerGeneration, pageHidden: document.hidden, ...details });
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
    sendDiagnostic('local-media-state', { video: Boolean(track('video')?.enabled) && mediaState.video, screen: Boolean(screenTrack) });
    send({
      type: 'media-state',
      audio: Boolean(track('audio')?.enabled) && mediaState.audio,
      video: Boolean(track('video')?.enabled) && mediaState.video,
      screen: Boolean(screenTrack),
      name: role === 'guest' ? (elements.participantName.value.trim() || 'Ученик') : 'Преподаватель',
    });
  }

  function closePeerConnection() {
    window.clearInterval(mediaStatsTimer);
    mediaStatsTimer = null;
    remoteMediaState = {};
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
    peerGeneration += 1;
    mediaStatsTimer = window.setInterval(() => reportMediaStats(connection), 30_000);
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
        setConnection('Соединение установлено', 'connected');
        updateRemoteVideoVisibility('connected');
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
        if (connection === peerConnection) sendDiagnostic('peer-connection-error', {
          state: 'negotiation', errorText: `${error.name}: ${error.message}`,
        });
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
    await applyOutboundVideoTrack();
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
        online: navigator.onLine, ...lastSocketClose });
      lastSocketClose = null;
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
      if (effectTrack) {
        sendDiagnostic('background-effect-ready', effectDiagnosticDetails({ state: 'ready' }));
      }
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
          remoteMediaState = { video: message.video, screen: message.screen };
          updateRemoteVideoVisibility('media-state');
          reportMediaStats(peerConnection, 'media-state');
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
      if (socket !== currentSocket || leaving) return;
      // The socket is already closed; retain one bounded record for the next open.
      lastSocketClose = { closeCode: event.code, wasClean: event.wasClean,
        reconnectDelayMs: Math.min(5000, (reconnectAttempts + 1) * 1000) };
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
      if (kind === 'video') {
        backgroundEffectGeneration += 1;
        stopBackgroundEffect();
        await applyOutboundVideoTrack();
        if (selectedBackground !== 'none') setBackgroundStatus('Включите камеру, чтобы применить эффект');
      }
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
      if (kind === 'video' && mediaState.video) {
        try {
          if (selectedBackground !== 'none' && !screenTrack) await startBackgroundEffect();
          else await applyOutboundVideoTrack();
        } catch (error) {
          handleEffectFailure(error);
        }
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
    mediaState.screen = false;
    if (selectedBackground !== 'none' && mediaState.video && cameraTrack()?.enabled) {
      try {
        await startBackgroundEffect();
      } catch (error) {
        handleEffectFailure(error);
      }
    } else {
      await applyOutboundVideoTrack();
    }
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
      backgroundEffectGeneration += 1;
      stopBackgroundEffect();
      await applyOutboundVideoTrack();
      mediaState.screen = true;
      if (selectedBackground !== 'none') setBackgroundStatus('Фон включится после демонстрации экрана');
      updateButtons();
      sendMediaState();
    } catch (error) {
      if (error.name !== 'NotAllowedError') setConnection('Не удалось начать демонстрацию экрана', 'error');
    }
  }

  function stopMedia() {
    window.clearTimeout(reconnectTimer);
    backgroundEffectGeneration += 1;
    stopBackgroundEffect();
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
    updateButtons();
    connectSocket();
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
  elements.toggleBackground.addEventListener('click', event => {
    event.stopPropagation();
    setBackgroundPanelOpen(elements.toggleBackground.getAttribute('aria-expanded') !== 'true');
  });
  elements.closeBackgroundPanel.addEventListener('click', () => setBackgroundPanelOpen(false));
  elements.toggleScreen.addEventListener('click', toggleScreenShare);
  elements.leave.addEventListener('click', leaveCall);
  elements.join.addEventListener('click', joinCall);
  window.addEventListener('pagehide', event => {
    if (!leaving) {
      sendDiagnostic('page-lifecycle', { state: 'pagehide', persisted: event.persisted });
      send({ type: 'leave', source: 'pagehide' });
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
  updateBackgroundControls();

  loadRoom();
})();
