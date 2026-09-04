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
  const EFFECT_STATS_INTERVAL_MS = 30_000;
  const MASK_PROFILES = Object.freeze({
    blur: { low: 0.25, high: 0.65, feather: 1.2, erode: false },
    replacement: { low: 0.35, high: 0.72, feather: 0.8, erode: true },
  });

  let room = null;
  let iceServers = [];
  let localStream = new MediaStream();
  let remoteStream = new MediaStream();
  let screenTrack = null;
  let socket = null;
  let peerConnection = null;
  let audioTransceiver = null;
  let videoTransceiver = null;
  let selectedBackground = readStoredBackground();
  let backgroundEffectGeneration = 0;
  let segmenterPromise = null;
  let segmenter = null;
  let segmenterDelegate = 'GPU';
  let effectSourceVideo = null;
  let effectOutputCanvas = null;
  let effectForegroundCanvas = null;
  let effectMaskCanvas = null;
  let effectStream = null;
  let effectTrack = null;
  let effectFrameRequest = 0;
  let effectLastFrameAt = 0;
  let effectFailureCount = 0;
  let effectTemporalMask = null;
  let effectSpatialMask = null;
  let effectMaskPixels = null;
  let effectMaskImageData = null;
  let effectProcessedFrames = 0;
  let effectInferenceTotalMs = 0;
  let effectStatsStartedAt = 0;
  const backgroundImages = new Map();
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
    elements.remotePlaceholder.hidden = true;
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
    const canvas = document.createElement('canvas');
    return Boolean(window.WebAssembly && canvas.captureStream);
  }

  function drawCover(context, source, width, height, overscan = 0) {
    const sourceWidth = source.videoWidth || source.naturalWidth || source.width;
    const sourceHeight = source.videoHeight || source.naturalHeight || source.height;
    if (!sourceWidth || !sourceHeight) return;
    const destinationWidth = width + overscan * 2;
    const destinationHeight = height + overscan * 2;
    const scale = Math.max(destinationWidth / sourceWidth, destinationHeight / sourceHeight);
    const cropWidth = destinationWidth / scale;
    const cropHeight = destinationHeight / scale;
    const sourceX = (sourceWidth - cropWidth) / 2;
    const sourceY = (sourceHeight - cropHeight) / 2;
    context.drawImage(
      source,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      -overscan,
      -overscan,
      destinationWidth,
      destinationHeight,
    );
  }

  function loadBackgroundImage(option) {
    if (!option?.src) return Promise.resolve(null);
    if (backgroundImages.has(option.id)) return Promise.resolve(backgroundImages.get(option.id));
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = 'async';
      image.addEventListener('load', () => {
        backgroundImages.set(option.id, image);
        resolve(image);
      }, { once: true });
      image.addEventListener('error', () => reject(new Error('Не удалось загрузить изображение фона.')), { once: true });
      image.src = option.src;
    });
  }

  async function ensureSegmenter() {
    if (segmenter) return segmenter;
    if (segmenterPromise) return segmenterPromise;
    segmenterPromise = (async () => {
      const { FilesetResolver, ImageSegmenter } = await import(`${MEDIAPIPE_BASE}/vision_bundle.mjs`);
      const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_BASE}/wasm`);
      const options = {
        baseOptions: {
          modelAssetPath: `${MEDIAPIPE_BASE}/models/${SEGMENTER_MODEL.filename}`,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputConfidenceMasks: true,
        outputCategoryMask: false,
      };
      try {
        segmenter = await ImageSegmenter.createFromOptions(vision, options);
        segmenterDelegate = 'GPU';
      } catch (_gpuError) {
        options.baseOptions.delegate = 'CPU';
        segmenter = await ImageSegmenter.createFromOptions(vision, options);
        segmenterDelegate = 'CPU';
      }
      return segmenter;
    })().catch(error => {
      segmenterPromise = null;
      throw error;
    });
    return segmenterPromise;
  }

  function stopBackgroundEffect({ closeSegmenter = false } = {}) {
    window.cancelAnimationFrame(effectFrameRequest);
    effectFrameRequest = 0;
    effectTrack?.stop();
    effectStream?.getTracks().forEach(item => item.stop());
    effectSourceVideo?.pause();
    if (effectSourceVideo) effectSourceVideo.srcObject = null;
    effectSourceVideo = null;
    effectOutputCanvas = null;
    effectForegroundCanvas = null;
    effectMaskCanvas = null;
    effectStream = null;
    effectTrack = null;
    effectLastFrameAt = 0;
    effectFailureCount = 0;
    effectTemporalMask = null;
    effectSpatialMask = null;
    effectMaskPixels = null;
    effectMaskImageData = null;
    effectProcessedFrames = 0;
    effectInferenceTotalMs = 0;
    effectStatsStartedAt = 0;
    if (closeSegmenter && segmenter) {
      segmenter.close();
      segmenter = null;
      segmenterPromise = null;
    }
  }

  function cameraTrack() {
    return localStream.getVideoTracks()[0];
  }

  function outboundVideoTrack() {
    if (screenTrack) return screenTrack;
    if (!mediaState.video || !cameraTrack()?.enabled) return null;
    return selectedBackground === 'none' ? cameraTrack() : (effectTrack || cameraTrack());
  }

  async function applyOutboundVideoTrack() {
    if (videoTransceiver) await videoTransceiver.sender.replaceTrack(outboundVideoTrack());
  }

  function effectMode() {
    return selectedBackground === 'blur' ? 'blur' : 'replacement';
  }

  function effectDiagnosticDetails(extra = {}) {
    return {
      model: SEGMENTER_MODEL.id,
      delegate: segmenterDelegate.toLowerCase(),
      mode: effectMode(),
      outputWidth: effectOutputCanvas?.width || 0,
      outputHeight: effectOutputCanvas?.height || 0,
      maskWidth: effectMaskCanvas?.width || 0,
      maskHeight: effectMaskCanvas?.height || 0,
      ...extra,
    };
  }

  function smoothstep(low, high, value) {
    const normalized = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return normalized * normalized * (3 - 2 * normalized);
  }

  function ensureMaskBuffers(width, height) {
    const length = width * height;
    if (effectTemporalMask?.length === length && effectMaskImageData) return;
    effectTemporalMask = null;
    effectSpatialMask = new Float32Array(length);
    effectMaskPixels = new Uint8ClampedArray(length * 4);
    for (let index = 0; index < length; index += 1) {
      const offset = index * 4;
      effectMaskPixels[offset] = 255;
      effectMaskPixels[offset + 1] = 255;
      effectMaskPixels[offset + 2] = 255;
    }
    effectMaskImageData = new ImageData(effectMaskPixels, width, height);
  }

  function stabilizeMask(values) {
    if (!effectTemporalMask) {
      effectTemporalMask = new Float32Array(values);
      return effectTemporalMask;
    }
    for (let index = 0; index < values.length; index += 1) {
      const previous = effectTemporalMask[index];
      const current = values[index];
      const response = Math.abs(current - previous) > 0.18 ? 0.7 : 0.3;
      effectTemporalMask[index] = previous + (current - previous) * response;
    }
    return effectTemporalMask;
  }

  function erodeUncertainEdges(values, width, height) {
    effectSpatialMask.set(values);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const center = values[index];
        if (center >= 0.88) continue;
        const neighborMinimum = Math.min(
          values[index - 1],
          values[index + 1],
          values[index - width],
          values[index + width],
        );
        effectSpatialMask[index] = center * 0.65 + neighborMinimum * 0.35;
      }
    }
    return effectSpatialMask;
  }

  function updateEffectMask(confidenceMask) {
    const { width, height } = confidenceMask;
    if (effectMaskCanvas.width !== width || effectMaskCanvas.height !== height) {
      effectMaskCanvas.width = width;
      effectMaskCanvas.height = height;
    }
    ensureMaskBuffers(width, height);
    const profile = MASK_PROFILES[effectMode()];
    let values = stabilizeMask(confidenceMask.getAsFloat32Array());
    if (profile.erode) values = erodeUncertainEdges(values, width, height);
    for (let index = 0; index < values.length; index += 1) {
      effectMaskPixels[index * 4 + 3] = Math.round(smoothstep(profile.low, profile.high, values[index]) * 255);
    }
    effectMaskCanvas.getContext('2d').putImageData(effectMaskImageData, 0, 0);
  }

  function reportEffectStats(now) {
    if (!effectStatsStartedAt) effectStatsStartedAt = now;
    const elapsed = now - effectStatsStartedAt;
    if (elapsed < EFFECT_STATS_INTERVAL_MS || effectProcessedFrames === 0) return;
    sendDiagnostic('background-effect-stats', effectDiagnosticDetails({
      state: 'running',
      fps: Math.round(effectProcessedFrames * 1000 / elapsed),
      averageFrameMs: Math.round(effectInferenceTotalMs / effectProcessedFrames),
    }));
    effectProcessedFrames = 0;
    effectInferenceTotalMs = 0;
    effectStatsStartedAt = now;
  }

  function renderEffectComposite(mask) {
    const output = effectOutputCanvas;
    const foreground = effectForegroundCanvas;
    const source = effectSourceVideo;
    if (!output || !foreground || !source) return;
    const outputContext = output.getContext('2d');
    const foregroundContext = foreground.getContext('2d');
    const width = output.width;
    const height = output.height;

    outputContext.clearRect(0, 0, width, height);
    if (selectedBackground === 'blur') {
      outputContext.save();
      outputContext.filter = 'blur(18px)';
      drawCover(outputContext, source, width, height, 24);
      outputContext.restore();
    } else {
      const image = backgroundImages.get(selectedBackground);
      if (image) drawCover(outputContext, image, width, height);
      else {
        outputContext.fillStyle = '#242136';
        outputContext.fillRect(0, 0, width, height);
      }
    }

    foregroundContext.clearRect(0, 0, width, height);
    foregroundContext.globalCompositeOperation = 'source-over';
    foregroundContext.filter = 'none';
    foregroundContext.imageSmoothingEnabled = true;
    foregroundContext.imageSmoothingQuality = 'high';
    drawCover(foregroundContext, source, width, height);
    foregroundContext.globalCompositeOperation = 'destination-in';
    foregroundContext.filter = `blur(${MASK_PROFILES[effectMode()].feather}px)`;
    drawCover(foregroundContext, mask, width, height);
    foregroundContext.globalCompositeOperation = 'source-over';
    foregroundContext.filter = 'none';
    outputContext.drawImage(foreground, 0, 0);
  }

  function handleEffectFailure(error) {
    console.error('Video background processing failed:', error);
    sendDiagnostic('background-effect-failure', effectDiagnosticDetails({
      state: 'failed',
      errorText: `${error?.name || 'Error'}: ${error?.message || 'Background processing failed'}`,
    }));
    backgroundEffectGeneration += 1;
    stopBackgroundEffect();
    setBackgroundStatus('Эффект недоступен — показываем обычную камеру', 'error');
    applyOutboundVideoTrack();
    updateLocalPreview();
  }

  function renderEffectFrame(timestamp) {
    if (!effectTrack || !effectSourceVideo || selectedBackground === 'none') return;
    const frameInterval = segmenterDelegate === 'CPU' ? Math.max(EFFECT_FRAME_INTERVAL_MS, 1000 / 15) : EFFECT_FRAME_INTERVAL_MS;
    if (timestamp - effectLastFrameAt < frameInterval) {
      effectFrameRequest = window.requestAnimationFrame(renderEffectFrame);
      return;
    }
    effectLastFrameAt = timestamp;
    try {
      const inferenceStartedAt = performance.now();
      segmenter.segmentForVideo(effectSourceVideo, timestamp, result => {
        const confidenceMask = result.confidenceMasks?.[0];
        if (!confidenceMask) throw new Error('Модель не вернула маску человека.');
        updateEffectMask(confidenceMask);
        renderEffectComposite(effectMaskCanvas);
        const now = performance.now();
        effectProcessedFrames += 1;
        effectInferenceTotalMs += now - inferenceStartedAt;
        reportEffectStats(now);
      });
      effectFailureCount = 0;
    } catch (error) {
      effectFailureCount += 1;
      if (effectFailureCount >= 3) {
        handleEffectFailure(error);
        return;
      }
    }
    effectFrameRequest = window.requestAnimationFrame(renderEffectFrame);
  }

  async function startBackgroundEffect() {
    const generation = ++backgroundEffectGeneration;
    stopBackgroundEffect();
    await applyOutboundVideoTrack();
    updateLocalPreview();
    if (selectedBackground === 'none' || !mediaState.video || !cameraTrack()?.enabled || screenTrack) return;
    if (!backgroundEffectsSupported()) throw new Error('Браузер не поддерживает обработку видеофона.');

    setBackgroundStatus('Готовим эффект…');
    const option = backgroundOption();
    const sourceVideo = document.createElement('video');
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    sourceVideo.srcObject = new MediaStream([cameraTrack()]);
    const videoReady = new Promise(resolve => {
      if (sourceVideo.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
        return;
      }
      sourceVideo.addEventListener('loadedmetadata', resolve, { once: true });
      window.setTimeout(resolve, 2500);
    });
    const playPromise = sourceVideo.play().catch(() => {});
    await Promise.all([ensureSegmenter(), loadBackgroundImage(option), videoReady, playPromise]);
    if (generation !== backgroundEffectGeneration || selectedBackground === 'none') {
      sourceVideo.pause();
      sourceVideo.srcObject = null;
      return;
    }

    const sourceWidth = sourceVideo.videoWidth || 1280;
    const sourceHeight = sourceVideo.videoHeight || 720;
    const maxWidth = window.innerWidth <= 820 ? 640 : 960;
    const width = Math.max(2, Math.round(Math.min(sourceWidth, maxWidth) / 2) * 2);
    const height = Math.max(2, Math.round((width * sourceHeight / sourceWidth) / 2) * 2);
    effectSourceVideo = sourceVideo;
    effectOutputCanvas = document.createElement('canvas');
    effectForegroundCanvas = document.createElement('canvas');
    effectMaskCanvas = document.createElement('canvas');
    effectOutputCanvas.width = effectForegroundCanvas.width = width;
    effectOutputCanvas.height = effectForegroundCanvas.height = height;
    const outputContext = effectOutputCanvas.getContext('2d');
    drawCover(outputContext, sourceVideo, width, height);
    effectStream = effectOutputCanvas.captureStream(segmenterDelegate === 'CPU' ? 15 : 24);
    effectTrack = effectStream.getVideoTracks()[0];
    if (!effectTrack) throw new Error('Браузер не создал обработанный видеотрек.');
    effectTrack.enabled = mediaState.video;
    effectFrameRequest = window.requestAnimationFrame(renderEffectFrame);
    await applyOutboundVideoTrack();
    updateLocalPreview();
    sendDiagnostic('background-effect-ready', effectDiagnosticDetails({ state: 'ready' }));
    setBackgroundStatus(segmenterDelegate === 'CPU' ? 'Энергосберегающий режим' : 'Эффект включён', 'ready');
  }

  async function selectVideoBackground(value, { persist = true } = {}) {
    if (!BACKGROUND_IDS.has(value)) value = 'none';
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
    elements.previewPlaceholder.hidden = Boolean(mediaState.video && cameraTrack()?.enabled);
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
      if (event.track.kind === 'video') {
        event.track.addEventListener('unmute', () => {
          elements.remotePlaceholder.hidden = true;
        });
        event.track.addEventListener('mute', () => {
          if (remoteStream.getVideoTracks().every(item => item.muted)) elements.remotePlaceholder.hidden = false;
        });
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
    await videoTransceiver.sender.replaceTrack(outboundVideoTrack());
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
      if (videoTransceiver) await videoTransceiver.sender.replaceTrack(screenTrack);
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
    stopBackgroundEffect({ closeSegmenter: true });
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
  window.addEventListener('pagehide', () => {
    if (!leaving) {
      send({ type: 'leave' });
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
