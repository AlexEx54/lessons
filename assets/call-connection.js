(() => {
  'use strict';

  // TURN credentials live at least five minutes, and a participant may wait much longer.
  const ICE_REFRESH_MS = 4 * 60 * 1000;
  const STALLED_CONNECTION_MS = 15_000;
  const MAX_CONNECTION_RESTARTS = 2;
  const MAX_RECONNECTS = 5;

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

  // One participant's side of a call: the signaling socket, the peer connection and their diagnostics.
  // Only the teacher offers; the guest is the polite peer.
  //   socketUrl()            the room's signaling address, read on every connect
  //   iceEndpoint            GET returns { iceServers } with fresh TURN credentials
  //   media                  CallMedia whose tracks are sent
  //   localDetails()         fields added to this side's media-state, such as name and recording
  //   remoteVideo            <video> that plays the peer
  //   onStatus(status, details)  see setStatus()
  //   onRemote()             the peer's presence, name or media changed, see remote()
  //   onMessage(message)     every room message, before the connection handles it (the chat uses it)
  //   onEnded(reason)        'ended' by the teacher, or 'elsewhere' when another tab took the call over
  function create({ role, socketUrl, iceEndpoint, media, localDetails, remoteVideo,
    onStatus, onRemote, onMessage, onEnded }) {
    const polite = role === 'guest';
    const pageSession = crypto.randomUUID();
    const diagnosticTrackIds = new WeakMap();
    const gatheredCandidateTypes = new Set();
    let diagnosticTrackSequence = 0;
    let iceServers = [];
    let iceRefreshTimer = null;
    let status = 'idle';
    let joined = false;
    let leaving = false;
    let socket = null;
    let socketAttempt = 0;
    let lastSocketClose = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let peerConnection = null;
    let peerGeneration = 0;
    let replacementSequence = 0;
    let audioTransceiver = null;
    let videoTransceiver = null;
    let makingOffer = false;
    let ignoreOffer = false;
    let isSettingRemoteAnswerPending = false;
    let mediaStatsTimer = null;
    let peerPresent = false;
    let remoteName = '';
    let remoteMediaState = {};
    let remoteVideoVisible = false;
    let remoteStream = new MediaStream();

    remoteVideo.addEventListener('playing', () => updateRemoteVideoVisibility('playing'));
    document.addEventListener('visibilitychange', () => reportMediaStats(peerConnection, 'visibility'));

    // idle, connecting, waiting (for the peer), peer-joining, connected, interrupted (media), peer-left,
    // reconnecting ({ attempt, attempts }), offline, socket-error, unsupported, negotiation-failed.
    function setStatus(next, details) {
      status = next;
      onStatus(next, details);
    }

    function setPeerPresent(present) {
      peerPresent = present;
      onRemote();
    }

    function remote() {
      return { present: peerPresent, name: remoteName, audio: remoteMediaState.audio,
        video: remoteMediaState.video, screen: Boolean(remoteMediaState.screen), videoVisible: remoteVideoVisible };
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
      diagnostic('video-track-replace', { ...details, state: 'start' });
      try {
        await sender.replaceTrack(next);
        diagnostic('video-track-replace', { ...details, state: 'success', ...videoTrackDetails(sender.track) });
      } catch (error) {
        diagnostic('video-track-replace', { ...details, state: 'failure',
          ...videoTrackDetails(sender.track), errorText: `${error.name}: ${error.message}` });
        throw error;
      }
    }

    function send(message) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
    }

    function diagnostic(event, details = {}) {
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
      remoteVideoVisible = !explicitlyOff && Boolean(active);
      onRemote();
      diagnostic('remote-video-state', { state: reason, video: remoteMediaState.video,
        screen: remoteMediaState.screen, placeholderVisible: !remoteVideoVisible,
        ...videoTrackDetails(active || tracks[0]), videoReadyState: remoteVideo.readyState });
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
            placeholderVisible: !remoteVideoVisible };
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
          diagnostic('video-rtp-stats', details);
        });
        connection.diagnosticSamples = nextSamples;
      } catch (error) {
        if (connection === peerConnection) diagnostic('stats-error', { state: 'video', errorText: error.message });
      } finally { connection.diagnosticStatsPending = false; }
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
          diagnostic('selected-candidate-unavailable', { state: connection.iceConnectionState });
          return;
        }
        const local = reports.get(pair.localCandidateId);
        const remote = reports.get(pair.remoteCandidateId);
        diagnostic('selected-candidate', {
          state: connection.iceConnectionState,
          localCandidateType: candidateType(local),
          remoteCandidateType: candidateType(remote),
          protocol: local?.protocol || '',
          relayProtocol: local?.relayProtocol || '',
        });
      } catch (error) {
        diagnostic('stats-error', { errorText: error?.message || 'getStats failed' });
      }
    }

    function publishMediaState() {
      const sent = media.sentState();
      diagnostic('local-media-state', { video: sent.video, screen: sent.screen });
      send({ type: 'media-state', ...sent, ...localDetails() });
    }

    function closePeerConnection() {
      window.clearInterval(mediaStatsTimer);
      mediaStatsTimer = null;
      remoteMediaState = {};
      if (peerConnection) {
        window.clearTimeout(peerConnection.diagnosticSnapshotTimer);
        if (!peerConnection.diagnosticConnected) {
          diagnostic('peer-connection-snapshot', { state: 'closed-unconnected', ...connectionSnapshot(peerConnection) });
        }
      }
      peerConnection?.close();
      peerConnection = null;
      audioTransceiver = null;
      videoTransceiver = null;
      remoteStream = new MediaStream();
      remoteVideo.srcObject = remoteStream;
      remoteVideoVisible = false;
      onRemote();
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
      if (connection === peerConnection) diagnostic('peer-connection-snapshot', details);
    }

    // Teacher-side watchdog: ICE checks that have not started by now never start,
    // so both sides begin a new connection the way a page reload would.
    async function restartStalledConnection(connection) {
      await reportConnectionSnapshot(connection, 'stalled');
      if (polite || connection !== peerConnection || connection.iceConnectionState !== 'new'
        || connection.restartAttempt >= MAX_CONNECTION_RESTARTS) return;
      const attempt = connection.restartAttempt + 1;
      diagnostic('connection-restart', { state: `attempt-${attempt}` });
      send({ type: 'restart-connection' });
      closePeerConnection();
      await createPeerConnection(attempt);
      // closePeerConnection() forgot the peer's media state, so both sides exchange it again.
      publishMediaState();
    }

    async function createPeerConnection(restartAttempt = 0) {
      if (peerConnection) return peerConnection;
      gatheredCandidateTypes.clear();
      const createdAt = performance.now();
      let connection;
      try {
        connection = new RTCPeerConnection({ iceServers });
      } catch (error) {
        diagnostic('peer-connection-error', {
          state: 'constructor',
          errorText: `${error?.name || 'Error'}: ${error?.message || 'RTCPeerConnection failed'}`,
        });
        setStatus('unsupported');
        throw error;
      }
      peerConnection = connection;
      peerGeneration += 1;
      Object.assign(connection, { restartAttempt, diagnosticCreatedAt: createdAt, diagnosticSetupPending: true,
        diagnosticCandidates: { local: 0, remote: 0, remoteErrors: 0 } });
      diagnostic('peer-connection-setup', { state: 'created' });
      connection.diagnosticSnapshotTimer = window.setTimeout(() => restartStalledConnection(connection), STALLED_CONNECTION_MS);
      mediaStatsTimer = window.setInterval(() => reportMediaStats(connection), 30_000);
      makingOffer = false;
      ignoreOffer = false;
      isSettingRemoteAnswerPending = false;
      remoteStream = new MediaStream();
      remoteVideo.srcObject = remoteStream;

      connection.onicecandidate = event => {
        if (event.candidate) {
          connection.diagnosticCandidates.local += 1;
          const type = candidateType(event.candidate);
          if (type) gatheredCandidateTypes.add(type);
          send({ type: 'signal', candidate: event.candidate });
        } else {
          diagnostic('ice-candidates-complete', {
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
        diagnostic('ice-candidate-error', {
          errorCode: event.errorCode,
          errorText: event.errorText || 'ICE candidate error',
        });
      };
      connection.onicegatheringstatechange = () => {
        if (connection !== peerConnection) return;
        diagnostic('ice-gathering-state', {
          state: connection.iceGatheringState,
          suppressedErrors: suppressedIceErrors,
          candidateTypes: [...gatheredCandidateTypes],
        });
      };
      connection.oniceconnectionstatechange = () => {
        diagnostic('ice-connection-state', { state: connection.iceConnectionState });
        if (['connected', 'completed', 'failed'].includes(connection.iceConnectionState)) {
          reportSelectedCandidate(connection);
        }
      };
      connection.ontrack = event => {
        if (peerConnection !== connection) return;
        if (!remoteStream.getTracks().some(item => item.id === event.track.id)) remoteStream.addTrack(event.track);
        if (remoteVideo.srcObject !== remoteStream) remoteVideo.srcObject = remoteStream;
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
        diagnostic('peer-connection-state', { state: connection.connectionState });
        if (connection.connectionState === 'connected') {
          connection.diagnosticConnected = true;
          window.clearTimeout(connection.diagnosticSnapshotTimer);
          setStatus('connected');
          updateRemoteVideoVisibility('connected');
          window.setTimeout(() => reportSelectedCandidate(connection), 500);
        } else if (['failed', 'disconnected'].includes(connection.connectionState)) {
          setStatus('interrupted');
        }
      };
      connection.onsignalingstatechange = () => {
        if (peerConnection !== connection) return;
        diagnostic('signaling-state', { state: connection.signalingState,
          transceivers: connection.getTransceivers().length });
      };
      connection.onnegotiationneeded = async () => {
        try {
          makingOffer = true;
          await connection.setLocalDescription();
          // An answer here means a remote offer was applied before this negotiation started.
          if (connection === peerConnection) diagnostic('negotiation', {
            state: `local-${connection.localDescription.type}`, trigger: 'negotiationneeded',
          });
          send({ type: 'signal', description: connection.localDescription });
        } catch (error) {
          if (connection === peerConnection) diagnostic('peer-connection-error', {
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
      if (connection === peerConnection) diagnostic('peer-connection-setup', { state: 'complete' });
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
          diagnostic('negotiation', {
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
            if (connection === peerConnection) diagnostic('negotiation', {
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
        if (connection === peerConnection) diagnostic('peer-connection-error', {
          state: message.description ? 'remote-description' : 'remote-candidate',
          errorText: `${error.name}: ${error.message}`,
        });
        console.error('Cannot apply WebRTC signal:', error);
        setStatus('negotiation-failed');
      }
    }

    async function handleMessage(message) {
      if (message.type === 'connected') {
        diagnostic('signaling-event', {
          state: message.peerPresent ? 'connected-with-peer' : 'connected-waiting',
        });
        setPeerPresent(Boolean(message.peerPresent));
        if (message.peerPresent) {
          setStatus('peer-joining');
          await createPeerConnection();
        } else {
          setStatus('waiting');
        }
      } else if (message.type === 'peer-joined') {
        diagnostic('signaling-event', { state: 'peer-joined' });
        // The peer has a new RTCPeerConnection, even if its old socket has
        // not timed out yet and no peer-left event was delivered.
        closePeerConnection();
        setPeerPresent(true);
        setStatus('peer-joining');
        await createPeerConnection();
        publishMediaState();
      } else if (message.type === 'peer-left') {
        closePeerConnection();
        setPeerPresent(false);
        setStatus('peer-left');
      } else if (message.type === 'restart-connection' && polite) {
        diagnostic('signaling-event', { state: 'restart-connection' });
        // The teacher's new offer follows on the same socket and creates the new connection.
        closePeerConnection();
        publishMediaState();
      } else if (message.type === 'signal') {
        await handleSignal(message);
      } else if (message.type === 'media-state') {
        if (message.name) remoteName = String(message.name).slice(0, 60);
        remoteMediaState = { audio: message.audio, video: message.video, screen: message.screen };
        updateRemoteVideoVisibility('media-state');
        reportMediaStats(peerConnection, 'media-state');
      } else if (message.type === 'call-ended') {
        onEnded('ended');
      }
    }

    function scheduleReconnect() {
      if (leaving || !joined || reconnectAttempts >= MAX_RECONNECTS) {
        if (!leaving) setStatus('offline');
        return;
      }
      reconnectAttempts += 1;
      setStatus('reconnecting', { attempt: reconnectAttempts, attempts: MAX_RECONNECTS });
      reconnectTimer = window.setTimeout(connectSocket, Math.min(5000, reconnectAttempts * 1000));
    }

    function connectSocket() {
      window.clearTimeout(reconnectTimer);
      closePeerConnection();
      socket = new WebSocket(socketUrl());
      const currentSocket = socket;
      socketAttempt++;
      setStatus('connecting');
      socket.addEventListener('open', () => {
        if (socket !== currentSocket) return;
        diagnostic('socket-open', { state: lastSocketClose ? 'reconnected' : 'initial',
          socketAttempt, navigationType: performance.getEntriesByType('navigation')[0]?.type || 'unknown',
          online: navigator.onLine, mediaPreparation: media.preparation.state, mediaWaitMs: media.preparation.waitMs,
          errorName: media.preparation.errorName, ...lastSocketClose });
        lastSocketClose = null;
        reconnectAttempts = 0;
        const configuredUrls = iceServers.map(server => server.urls).filter(Boolean);
        const turnServers = iceServers.filter(server => String(server.urls).startsWith('turn'));
        const turnHasCredentials = turnServers.length > 0
          && turnServers.every(server => Boolean(server.username && server.credential));
        diagnostic('ice-config', {
          state: configuredUrls.some(url => String(url).startsWith('turns:'))
            ? (turnHasCredentials ? 'turn-tls-auth' : 'turn-tls-no-auth')
            : (turnServers.length > 0
              ? (turnHasCredentials ? 'turn-auth' : 'turn-no-auth')
              : 'stun-only'),
        });
        const effect = media.activeEffectDiagnostic();
        if (effect) diagnostic('background-effect-ready', effect);
        publishMediaState();
      });
      socket.addEventListener('message', async event => {
        if (socket !== currentSocket || leaving) return;
        let message;
        try { message = JSON.parse(event.data); } catch (_error) { return; }
        try {
          onMessage(message);
          await handleMessage(message);
        } catch (error) {
          diagnostic('peer-connection-error', {
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
          onEnded('ended');
          return;
        }
        // Another tab took the room over; reconnecting would take it back and loop forever.
        if (event.code === 4001) {
          onEnded('elsewhere');
          return;
        }
        scheduleReconnect();
      });
      socket.addEventListener('error', () => setStatus('socket-error'));
    }

    // A new peer connection always uses the latest credentials; current ones keep theirs.
    async function refreshIceServers() {
      try {
        const response = await fetch(iceEndpoint);
        if (response.ok) iceServers = normalizeIceServers((await response.json()).iceServers);
      } catch (_error) {
        // The next refresh retries; until then the previous credentials stay in use.
      }
    }

    async function join() {
      if (joined) return;
      joined = true;
      leaving = false;
      reconnectAttempts = 0;
      lastSocketClose = null;
      await refreshIceServers();
      if (!joined) return;
      iceRefreshTimer = window.setInterval(refreshIceServers, ICE_REFRESH_MS);
      connectSocket();
    }

    function close() {
      if (leaving) return;
      leaving = true;
      joined = false;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(iceRefreshTimer);
      socket?.close(1000, 'Звонок завершён.');
      peerPresent = false;
      closePeerConnection();
      status = 'idle';
    }

    // The peer learns at once that this side has gone instead of waiting for the socket to time out.
    function leave(source) {
      send({ type: 'leave', source });
      close();
    }

    return {
      join, leave, close, publishMediaState, diagnostic, remote,
      applyAudio: applyOutboundAudioTrack,
      applyVideo: applyOutboundVideoTrack,
      get status() { return status; },
      get remoteStream() { return remoteStream; },
    };
  }

  window.CallConnection = { create };
})();
