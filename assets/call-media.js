/* The participant's own media: camera, microphone, virtual background and screen share.
   It knows nothing about the page or the peer: the page renders snapshot() on onChange,
   and the connection sends outboundAudioTrack()/outboundVideoTrack() from applyAudio/applyVideo. */
(() => {
  'use strict';

  const BACKGROUND_STORAGE_KEY = 'easyclass.videoBackground';
  const BACKGROUND_OPTIONS = [
    { id: 'none', label: 'Без фона', previewClass: 'background-option__preview--none' },
    { id: 'blur', label: 'Размытие', previewClass: 'background-option__preview--blur' },
    { id: 'study-light', label: 'Кабинет', src: '/assets/images/video-backgrounds/study-light.jpg' },
    { id: 'library-plum', label: 'Библиотека', src: '/assets/images/video-backgrounds/library-plum.jpg' },
    { id: 'classroom-soft', label: 'Класс', src: '/assets/images/video-backgrounds/classroom-soft.jpg' },
  ];
  const BACKGROUND_IDS = new Set(BACKGROUND_OPTIONS.map(option => option.id));
  const MOBILE_DEVICE = navigator.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  const SEGMENTER_MODEL = MOBILE_DEVICE
    ? { id: 'landscape', filename: 'selfie_segmenter_landscape.tflite' }
    : { id: 'square', filename: 'selfie_segmenter.tflite' };
  const EFFECT_FRAME_INTERVAL_MS = MOBILE_DEVICE ? 1000 / 18 : 1000 / 24;

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

  function backgroundOption(value) {
    return BACKGROUND_OPTIONS.find(option => option.id === value) || BACKGROUND_OPTIONS[0];
  }

  function backgroundEffectsSupported() {
    return Boolean(window.WebAssembly && window.Worker);
  }

  // diagnostic(event, details) logs to the server; applyAudio/applyVideo put the current outbound
  // track on the peer connection (a no-op without one); publish tells the peer what is on.
  function create({ diagnostic, applyAudio, applyVideo, publish, onChange,
    loadBackgroundPipeline = () => import('/assets/video-background-pipeline.mjs') }) {
    let localStream = new MediaStream();
    let screenTrack = null;
    let displayStream = null;
    let screenAudioMixer = null;
    let screenShareBusy = false;
    let stopped = false;
    let selectedBackground = readStoredBackground();
    let backgroundEffectGeneration = 0;
    // { background, generation, session }: the active effect's track goes to the peer, while a pending
    // one is still preparing and the previous output (camera or older effect) keeps going.
    let activeEffect = null;
    let pendingEffect = null;
    // progress: null hides the notice, { stage } shows preparation, { failed: background } offers a retry.
    let effectProgress = null;
    let backgroundStatus = { text: '', state: '' };
    let error = '';
    // 'idle' → 'pending' while the browser asks for camera and microphone → 'granted', 'failed' or 'unsupported'.
    const preparation = { state: 'idle', waitMs: undefined, errorName: undefined };
    // The participant's choice; a track may still be missing or disabled.
    const mediaState = { audio: true, video: true };

    const changed = () => onChange();

    function setError(message) {
      error = message;
      changed();
    }

    function setBackgroundStatus(text, state = '') {
      backgroundStatus = { text, state };
      changed();
    }

    function setEffectProgress(progress) {
      effectProgress = progress;
      changed();
    }

    function track(kind) {
      return kind === 'audio' ? localStream.getAudioTracks()[0] : localStream.getVideoTracks()[0];
    }

    function cameraTrack() {
      return localStream.getVideoTracks()[0];
    }

    function outboundVideoTrack() {
      if (screenTrack) return screenTrack;
      if (!mediaState.video || !cameraTrack()?.enabled) return null;
      return activeEffect?.session.track || cameraTrack();
    }

    function outboundAudioTrack() {
      return screenAudioMixer?.destination.stream.getAudioTracks()[0] || track('audio') || null;
    }

    function videoSource(value) {
      if (!value) return 'none';
      if (value === screenTrack) return 'screen';
      return value === activeEffect?.session.track ? 'effect' : 'camera';
    }

    function previewTrack() {
      return screenTrack || (mediaState.video && cameraTrack()?.enabled ? outboundVideoTrack() : null);
    }

    function shownBackground() {
      return activeEffect?.background || 'none';
    }

    function cancelPendingEffect() {
      pendingEffect?.session?.stop();
      pendingEffect = null;
      setEffectProgress(null);
    }

    function stopBackgroundEffect() {
      cancelPendingEffect();
      activeEffect?.session.stop();
      activeEffect = null;
    }

    function effectDiagnosticDetails(effect, extra = {}) {
      const background = effect?.background || selectedBackground;
      return { pipelineVersion: 3, effectGeneration: effect?.generation ?? backgroundEffectGeneration,
        mode: background === 'blur' ? 'blur' : 'replacement', model: SEGMENTER_MODEL.id,
        ...effect?.session?.details, ...extra };
    }

    function showEffectStatus() {
      if (!activeEffect) setBackgroundStatus('');
      else setBackgroundStatus(activeEffect.session.details.transport === 'canvas-worker'
        ? 'Эффект включён — совместимый режим' : 'Эффект включён', 'ready');
    }

    // A failed start keeps the previous output; a failed running effect falls back to the camera.
    function handleEffectFailure(failure, broken = pendingEffect || activeEffect) {
      if (failure?.name === 'AbortError') return;
      console.error('Video background processing failed:', failure);
      diagnostic('background-effect-failure', effectDiagnosticDetails(broken, { state: 'failed',
        errorText: `${failure?.name || 'Error'}: ${failure?.message || 'Background processing failed'}` }));
      const failed = broken?.background || selectedBackground;
      if (broken === activeEffect) activeEffect = null;
      else pendingEffect = null;
      broken?.session?.stop();
      // A newer choice that is still preparing stays selected; otherwise the picker shows what is sent.
      if (!pendingEffect) {
        selectedBackground = shownBackground();
        backgroundStatus = { text: '', state: '' };
        setEffectProgress({ failed });
      }
      void applyVideo().catch(replaceError => console.error('Video replacement failed:', replaceError));
      changed();
    }

    async function startBackgroundEffect() {
      const background = selectedBackground;
      // Repeated clicks on the background that is preparing or shown do not restart it.
      if (pendingEffect?.background === background) return;
      cancelPendingEffect();
      if (shownBackground() === background) { showEffectStatus(); return; }
      if (background === 'none' || !mediaState.video || !cameraTrack()?.enabled || screenTrack) return;
      if (!backgroundEffectsSupported()) throw new Error('Браузер не поддерживает обработку видеофона.');
      const pending = { background, generation: ++backgroundEffectGeneration, session: null };
      pendingEffect = pending;
      const current = () => pendingEffect === pending;
      setBackgroundStatus('');
      setEffectProgress({ stage: 'worker' });
      const { createBackgroundPipeline } = await loadBackgroundPipeline();
      if (!current()) return;
      pending.session = createBackgroundPipeline({
        camera: cameraTrack(),
        config: { model: SEGMENTER_MODEL, mode: background,
          backgroundUrl: backgroundOption(background).src, targetFps: 1000 / EFFECT_FRAME_INTERVAL_MS,
          maxWidth: MOBILE_DEVICE ? 640 : 960, hidden: document.hidden },
        onStage: stage => {
          if (current()) setEffectProgress({ stage });
        },
        onDiagnostic: (event, details) => {
          if (current() || activeEffect === pending) diagnostic(event, { ...details, effectGeneration: pending.generation });
        },
        onFailure: failure => {
          if (activeEffect === pending) handleEffectFailure(failure, pending);
        },
      });
      try { await pending.session.ready; }
      catch (failure) {
        if (current()) throw failure;
        return;
      }
      if (!current()) return;
      pendingEffect = null;
      const previous = activeEffect;
      activeEffect = pending;
      pending.session.track.enabled = mediaState.video;
      // Preparation ends here, before the await: a choice made during the swap owns the notice and status.
      setEffectProgress(null);
      showEffectStatus();
      try {
        await applyVideo();
      } catch (failure) {
        // This effect broke, not a newer choice that may be preparing meanwhile.
        if (activeEffect === pending) handleEffectFailure(failure, pending);
        return;
      } finally {
        // The older effect stops only once the sender no longer uses its track.
        previous?.session.stop();
      }
      if (activeEffect !== pending) return;
      changed();
      diagnostic('background-effect-ready', effectDiagnosticDetails(pending, { state: 'ready' }));
    }

    // The current output keeps going while an effect prepares, so callers need not wait for it.
    function applyBackgroundEffect() {
      return startBackgroundEffect().catch(failure => handleEffectFailure(failure));
    }

    async function selectBackground(value, { persist = true } = {}) {
      if (!BACKGROUND_IDS.has(value)) value = 'none';
      diagnostic('video-background-selection', { state: value === 'none' ? 'none' : value === 'blur' ? 'blur' : 'replacement' });
      selectedBackground = value;
      if (persist) writeStoredBackground(value);
      changed();
      if (value === 'none') {
        stopBackgroundEffect();
        setBackgroundStatus('');
        await applyVideo();
        changed();
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
      await applyBackgroundEffect();
    }

    async function acquireTrack(kind) {
      const constraints = kind === 'audio'
        ? { audio: { echoCancellation: true, noiseSuppression: true }, video: false }
        : { audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = kind === 'audio' ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0];
      if (!newTrack) throw new Error(`Браузер не предоставил ${kind === 'audio' ? 'микрофон' : 'камеру'}.`);
      if (kind === 'video') stopBackgroundEffect();
      localStream.getTracks().filter(item => item.kind === kind).forEach(item => {
        localStream.removeTrack(item);
        item.stop();
      });
      localStream.addTrack(newTrack);
      if (kind === 'audio') {
        connectMixerMicrophone();
        await applyAudio();
      }
      return newTrack;
    }

    // Without a peer connection the hooks do nothing, and the connection picks the tracks up when created.
    async function prepare() {
      if (!navigator.mediaDevices?.getUserMedia) {
        preparation.state = 'unsupported';
        mediaState.audio = false;
        mediaState.video = false;
        setError('Этот браузер не поддерживает доступ к камере и микрофону.');
        return;
      }
      preparation.state = 'pending';
      const startedAt = performance.now();
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        });
        // The participant left while the browser was asking, so the camera must not stay on.
        if (stopped) {
          stream.getTracks().forEach(item => item.stop());
          return;
        }
        // Clicks made while the browser was asking only changed mediaState.
        stream.getAudioTracks().forEach(item => { item.enabled = mediaState.audio; });
        stream.getVideoTracks().forEach(item => { item.enabled = mediaState.video; });
        localStream = stream;
        preparation.state = 'granted';
        error = '';
      } catch (failure) {
        preparation.errorName = failure?.name;
        preparation.state = 'failed';
        mediaState.audio = false;
        mediaState.video = false;
        error = 'Камера или микрофон недоступны. Можно войти без них и включить позже.';
      }
      preparation.waitMs = Math.round(performance.now() - startedAt);
      // Reaches the server only when the call was joined before the browser answered.
      diagnostic('media-prepared', { state: preparation.state, mediaWaitMs: preparation.waitMs,
        errorName: preparation.errorName });
      changed();
      // A peer connection may already exist with empty senders and the peer was told the camera is off.
      connectMixerMicrophone();
      try {
        await applyAudio();
        await applyVideo();
      } catch (failure) {
        console.error('Track replacement failed:', failure);
      }
      publish();
      if (mediaState.video && cameraTrack()?.enabled && selectedBackground !== 'none') void applyBackgroundEffect();
    }

    async function toggle(kind) {
      const key = kind === 'audio' ? 'audio' : 'video';
      if (preparation.state === 'pending') {
        // Requesting another track now would open a second camera that prepare() then discards.
        mediaState[key] = !mediaState[key];
        changed();
        return;
      }
      let current = track(kind);
      if (mediaState[key] && current?.enabled) {
        current.enabled = false;
        mediaState[key] = false;
        if (kind === 'video') {
          stopBackgroundEffect();
          await applyVideo();
          if (selectedBackground !== 'none') setBackgroundStatus('Включите камеру, чтобы применить эффект');
        }
      } else {
        try {
          if (!current || current.readyState === 'ended') current = await acquireTrack(kind);
          current.enabled = true;
          mediaState[key] = true;
          error = '';
        } catch (_error) {
          mediaState[key] = false;
          error = `Не удалось включить ${kind === 'audio' ? 'микрофон' : 'камеру'}. Проверьте разрешения браузера.`;
        }
        if (kind === 'video' && mediaState.video) {
          await applyVideo().catch(failure => console.error('Video replacement failed:', failure));
          if (selectedBackground !== 'none' && !screenTrack) void applyBackgroundEffect();
        }
      }
      changed();
      publish();
    }

    function connectMixerMicrophone() {
      if (!screenAudioMixer) return;
      screenAudioMixer.microphone?.disconnect();
      screenAudioMixer.microphone = null;
      const microphone = track('audio');
      if (microphone?.readyState === 'live') {
        screenAudioMixer.microphone = screenAudioMixer.context.createMediaStreamSource(new MediaStream([microphone]));
        screenAudioMixer.microphone.connect(screenAudioMixer.destination);
      }
    }

    function disposeScreenAudio(mixer = screenAudioMixer) {
      if (screenAudioMixer === mixer) screenAudioMixer = null;
      if (mixer) {
        mixer.microphone?.disconnect();
        mixer.source?.disconnect();
        mixer.destination.stream.getTracks().forEach(item => item.stop());
        void mixer.context.close().catch(() => {});
      }
    }

    function screenAudioStatus() {
      if (!screenTrack) return '';
      const audio = displayStream?.getAudioTracks().find(item => item.readyState === 'live');
      if (!audio || !screenAudioMixer) {
        return 'Демонстрация без звука. Для передачи звука выберите его в окне демонстрации браузера.';
      }
      const isolated = screenTrack.getSettings().displaySurface === 'browser' || audio.getSettings().restrictOwnAudio === true;
      const status = audio.muted ? 'Звук демонстрации временно недоступен.' : 'Звук демонстрации включён.';
      return isolated ? status : `${status} Возможно эхо: для ролика лучше выбрать отдельную вкладку со звуком.`;
    }

    async function startScreenAudio() {
      const audio = displayStream.getAudioTracks().find(item => item.readyState === 'live');
      if (!audio) return;
      try {
        const context = new AudioContext();
        screenAudioMixer = { context, destination: context.createMediaStreamDestination() };
        screenAudioMixer.source = context.createMediaStreamSource(new MediaStream([audio]));
        screenAudioMixer.source.connect(screenAudioMixer.destination);
        connectMixerMicrophone();
        await context.resume();
        if (stopped || !screenTrack || !screenAudioMixer) return;
        await applyAudio();
        audio.onmute = audio.onunmute = changed;
        audio.onended = () => {
          disposeScreenAudio();
          void applyAudio().catch(failure => console.error('Audio restore failed:', failure));
          changed();
        };
      } catch (failure) {
        disposeScreenAudio();
        audio.stop();
        await applyAudio();
        console.error('Screen audio unavailable:', failure);
      }
    }

    async function stopScreenShare() {
      const previous = screenTrack;
      screenTrack = null;
      if (previous) {
        previous.onended = null;
        previous.stop();
      }
      displayStream?.getTracks().forEach(item => {
        item.onended = item.onmute = item.onunmute = null;
        item.stop();
      });
      displayStream = null;
      const mixer = screenAudioMixer;
      screenAudioMixer = null;
      try {
        await applyAudio();
      } finally {
        disposeScreenAudio(mixer);
      }
      changed();
      await applyVideo();
      if (selectedBackground !== 'none' && mediaState.video && cameraTrack()?.enabled) void applyBackgroundEffect();
      changed();
      publish();
    }

    function setScreenShareBusy(busy) {
      screenShareBusy = busy;
      changed();
    }

    // Rejects with a message for the participant; a cancelled browser picker is not an error.
    async function toggleScreenShare() {
      if (screenShareBusy || stopped) return;
      if (screenTrack) {
        setScreenShareBusy(true);
        try {
          await stopScreenShare();
        } finally {
          setScreenShareBusy(false);
        }
        return;
      }
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Демонстрация экрана не поддерживается браузером');
      setScreenShareBusy(true);
      try {
        const display = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: { restrictOwnAudio: true, suppressLocalAudioPlayback: false },
          systemAudio: 'include',
          selfBrowserSurface: 'exclude',
        });
        if (stopped) {
          display.getTracks().forEach(item => item.stop());
          return;
        }
        displayStream = display;
        screenTrack = display.getVideoTracks()[0];
        if (!screenTrack) throw new Error('No display video track');
        screenTrack.onended = () => { void stopScreenShare().catch(console.error); };
        await startScreenAudio();
        if (stopped || !screenTrack) return;
        stopBackgroundEffect();
        await applyVideo();
        if (selectedBackground !== 'none') setBackgroundStatus('Фон включится после демонстрации экрана');
        changed();
        publish();
      } catch (failure) {
        await stopScreenShare().catch(console.error);
        if (failure.name !== 'NotAllowedError') throw new Error('Не удалось начать демонстрацию экрана');
      } finally {
        setScreenShareBusy(false);
      }
    }

    function stop() {
      stopped = true;
      stopBackgroundEffect();
      displayStream?.getTracks().forEach(item => {
        item.onended = item.onmute = item.onunmute = null;
        item.stop();
      });
      displayStream = null;
      screenTrack = null;
      disposeScreenAudio();
      localStream.getTracks().forEach(item => item.stop());
    }

    return {
      prepare,
      toggle,
      selectBackground,
      // Cancelling re-selects what is already shown, so the stored choice matches the picture.
      cancelBackground: () => selectBackground(shownBackground()),
      retryBackground: () => selectBackground(effectProgress?.failed),
      dismissEffectNotice: () => setEffectProgress(null),
      toggleScreenShare,
      stop,
      setPageHidden(hidden) {
        activeEffect?.session.visibility(hidden);
        pendingEffect?.session?.visibility(hidden);
      },
      track,
      outboundAudioTrack,
      outboundVideoTrack,
      videoSource,
      previewTrack,
      get preparation() { return { ...preparation }; },
      // What the peer is told is on.
      sentState() {
        return {
          audio: Boolean(track('audio')?.enabled) && mediaState.audio,
          video: Boolean(track('video')?.enabled) && mediaState.video,
          screen: Boolean(screenTrack),
        };
      },
      // Re-announces a running effect in the server log of a new connection.
      activeEffectDiagnostic() {
        return activeEffect ? effectDiagnosticDetails(activeEffect, { state: 'ready' }) : null;
      },
      snapshot() {
        // While the browser asks there are no tracks yet, so the buttons show the chosen state.
        const pending = preparation.state === 'pending';
        return {
          microphone: mediaState.audio && (pending || Boolean(track('audio')?.enabled)),
          camera: mediaState.video && (pending || Boolean(track('video')?.enabled)),
          screen: Boolean(screenTrack),
          screenShareBusy,
          screenAudioStatus: screenAudioStatus(),
          background: selectedBackground,
          backgroundStatus,
          effectProgress,
          error,
        };
      },
    };
  }

  window.CallMedia = { create, BACKGROUND_OPTIONS };
})();
