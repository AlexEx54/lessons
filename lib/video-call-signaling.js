'use strict';

const { randomUUID } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const { getAuthenticatedUser } = require('./auth.js');
const {
  findOwnedVideoCall,
  findVideoCallByGuestToken,
  setVideoCallActive,
  setVideoCallWaiting,
} = require('./video-call-store.js');

const MAX_SIGNAL_BYTES = 64 * 1024;
const ALLOWED_MESSAGE_TYPES = new Set(['signal', 'media-state', 'diagnostic', 'leave']);
const DIAGNOSTIC_EVENTS = new Set([
  'video-track-replace', 'video-background-selection', 'local-media-state', 'remote-video-state', 'video-rtp-stats',
  'socket-open', 'page-lifecycle',
  'ice-config',
  'ice-candidate-error',
  'ice-candidates-complete',
  'ice-connection-state',
  'ice-gathering-state',
  'peer-connection-error',
  'peer-connection-state',
  'selected-candidate',
  'selected-candidate-unavailable',
  'signaling-event',
  'stats-error',
  'background-effect-ready',
  'background-effect-failure',
  'background-effect-stats',
  'background-effect-health',
]);
const DIAGNOSTIC_CANDIDATE_TYPES = new Set(['host', 'srflx', 'prflx', 'relay']);
const DIAGNOSTIC_PROTOCOLS = new Set(['udp', 'tcp', 'tls']);
const DIAGNOSTIC_BACKGROUND_MODELS = new Set(['square', 'landscape']);
const DIAGNOSTIC_BACKGROUND_DELEGATES = new Set(['gpu', 'cpu']);
const DIAGNOSTIC_BACKGROUND_MODES = new Set(['blur', 'replacement']);

function cleanDiagnosticText(value, maxLength) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').slice(0, maxLength);
}

function sanitizeVideoCallDiagnostic(message) {
  const event = cleanDiagnosticText(message?.event, 48).replace(/[^a-z0-9-]/gi, '');
  const diagnostic = {
    event: DIAGNOSTIC_EVENTS.has(event) ? event : '',
  };
  const state = cleanDiagnosticText(message?.state, 32).replace(/[^a-z0-9-]/gi, '');
  if (state) diagnostic.state = state;
  if (/^[a-f0-9-]{36}$/.test(message?.pageSession || '')) diagnostic.pageSession = message.pageSession;
  for (const [field, maximum] of [['socketAttempt', 1_000_000], ['closeCode', 4999],
    ['reconnectDelayMs', 60_000], ['suppressedErrors', 1_000_000], ['sampleDurationMs', 86_400_000]]) {
    if (Number.isInteger(message?.[field]) && message[field] >= 0 && message[field] <= maximum) diagnostic[field] = message[field];
  }
  for (const field of ['wasClean', 'online', 'persisted']) {
    if (typeof message?.[field] === 'boolean') diagnostic[field] = message[field];
  }
  if (['navigate', 'reload', 'back_forward', 'prerender', 'unknown'].includes(message?.navigationType)) {
    diagnostic.navigationType = message.navigationType;
  }
  if (event === 'video-rtp-stats' && Number.isFinite(message?.averageFps)
    && message.averageFps >= 0 && message.averageFps <= 240) diagnostic.averageFps = message.averageFps;
  const candidateTypes = Array.isArray(message?.candidateTypes)
    ? [...new Set(message.candidateTypes.filter(type => DIAGNOSTIC_CANDIDATE_TYPES.has(type)))]
    : [];
  if (candidateTypes.length > 0) diagnostic.candidateTypes = candidateTypes;
  for (const field of ['localCandidateType', 'remoteCandidateType']) {
    if (DIAGNOSTIC_CANDIDATE_TYPES.has(message?.[field])) diagnostic[field] = message[field];
  }
  for (const field of ['protocol', 'relayProtocol']) {
    if (DIAGNOSTIC_PROTOCOLS.has(message?.[field])) diagnostic[field] = message[field];
  }
  if (Number.isInteger(message?.errorCode)) diagnostic.errorCode = message.errorCode;
  if (event.startsWith('background-effect-')) {
    if (DIAGNOSTIC_BACKGROUND_MODELS.has(message?.model)) diagnostic.model = message.model;
    if (DIAGNOSTIC_BACKGROUND_DELEGATES.has(message?.delegate)) diagnostic.delegate = message.delegate;
    if (DIAGNOSTIC_BACKGROUND_MODES.has(message?.mode)) diagnostic.mode = message.mode;
    if (['pending', 'worker-track', 'transferred-streams', 'canvas-worker'].includes(message?.transport)) diagnostic.transport = message.transport;
    for (const [field, maximum] of [
      ['receivedFrames', 100_000_000],
      ['emittedFrames', 100_000_000],
      ['skippedFrames', 100_000_000],
      ['lastFrameAgeMs', 86_400_000],
      ['outputWidth', 7680],
      ['outputHeight', 4320],
      ['maskWidth', 2048],
      ['maskHeight', 2048],
      ['fps', 120],
      ['averageFrameMs', 60_000],
      ['pipelineVersion', 100],
      ['targetFps', 120],
      ['blurWidth', 7680],
      ['blurHeight', 4320],
      ['averageSegmentationMs', 60_000],
      ['averageReadbackMs', 60_000],
      ['averageMaskMs', 60_000],
      ['averageCompositeMs', 60_000],
      ['maxFrameMs', 60_000],
      ['hiddenFrames', 1_000_000],
      ['processedFrames', 1_000_000],
      ['sampleDurationMs', 86_400_000],
    ]) {
      if (Number.isInteger(message?.[field]) && message[field] >= 0 && message[field] <= maximum) {
        diagnostic[field] = message[field];
      }
    }
  }
  for (const field of ['pageHidden', 'video', 'screen', 'placeholderVisible', 'trackMuted', 'trackEnabled']) {
    if (typeof message?.[field] === 'boolean') diagnostic[field] = message[field];
  }
  for (const field of ['peerGeneration', 'effectGeneration', 'operation', 'previousTrack', 'nextTrack', 'trackNumber', 'videoReadyState',
    'ssrc', 'framesEncoded', 'framesSent', 'framesReceived', 'framesDecoded', 'bytesSent', 'bytesReceived', 'packetsLost']) {
    if (Number.isSafeInteger(message?.[field]) && message[field] >= 0) diagnostic[field] = message[field];
  }
  for (const [field, allowed] of Object.entries({ source: ['none', 'camera', 'screen', 'effect'],
    trackState: ['absent', 'live', 'ended'], direction: ['inbound-rtp', 'outbound-rtp'] })) {
    if (allowed.includes(message?.[field])) diagnostic[field] = message[field];
  }
  const errorText = cleanDiagnosticText(message?.errorText, 160);
  if (errorText) diagnostic.errorText = errorText;
  return diagnostic;
}

// Duplicate errors must not consume the budget reserved for state changes and stats.
function createDiagnosticLogGate(now = Date.now) {
  let startedAt = now(), count = 0, suppressed = 0;
  const errors = new Set();
  return {
    accept(diagnostic) {
      if (!diagnostic.event) return null;
      if (now() - startedAt >= 60_000) {
        startedAt = now(); count = 0; errors.clear();
      }
      const key = /error|failure/.test(diagnostic.event) ? JSON.stringify([
        diagnostic.event, diagnostic.peerGeneration, diagnostic.state, diagnostic.errorCode, diagnostic.errorText,
      ]) : null;
      if (count >= 100 || (key && errors.has(key))) { suppressed++; return null; }
      if (key) errors.add(key);
      count++;
      const result = { ...diagnostic };
      if (suppressed) { result.suppressedDiagnostics = suppressed; suppressed = 0; }
      return result;
    },
    get suppressed() { return suppressed; },
  };
}

function websocketOriginAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (_error) {
    return false;
  }
}

function createVideoCallSignaling({ server, database, attachUpgrade = true }) {
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_SIGNAL_BYTES });
  const rooms = new Map();

  function send(socket, payload) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  }

  function roomFor(callId) {
    let room = rooms.get(callId);
    if (!room) {
      room = new Map();
      rooms.set(callId, room);
    }
    return room;
  }

  function closeRoom(callId, code = 4000, reason = 'Звонок завершён.') {
    const room = rooms.get(callId);
    if (!room) return;
    room.forEach(socket => {
      send(socket, { type: 'call-ended' });
      socket.closeCause = 'call-ended';
      socket.close(code, reason);
    });
    rooms.delete(callId);
  }

  function rejectUpgrade(socket, status, message) {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${message}`);
    socket.destroy();
  }

  function handleUpgrade(req, socket, head) {
    let requestUrl;
    try {
      requestUrl = new URL(req.url, `http://${req.headers.host}`);
    } catch (_error) {
      rejectUpgrade(socket, '400 Bad Request', 'Некорректный WebSocket URL.');
      return;
    }
    const match = requestUrl.pathname.match(/^\/ws\/video-calls\/([^/]+)$/);
    if (!match) {
      rejectUpgrade(socket, '404 Not Found', 'WebSocket endpoint не найден.');
      return;
    }
    if (!websocketOriginAllowed(req)) {
      rejectUpgrade(socket, '403 Forbidden', 'Недопустимый Origin.');
      return;
    }

    let callId;
    try {
      callId = decodeURIComponent(match[1]);
    } catch (_error) {
      rejectUpgrade(socket, '400 Bad Request', 'Некорректный идентификатор звонка.');
      return;
    }
    const role = requestUrl.searchParams.get('role');
    let call = null;
    if (role === 'teacher') {
      const user = getAuthenticatedUser(req, database);
      if (user?.role === 'admin') call = findOwnedVideoCall(callId, user.id, database);
    } else if (role === 'guest') {
      call = findVideoCallByGuestToken(requestUrl.searchParams.get('token'), database);
      if (call?.id !== callId) call = null;
    }
    if (!call || !['waiting', 'active'].includes(call.status)) {
      rejectUpgrade(socket, '403 Forbidden', 'Ссылка недействительна или звонок завершён.');
      return;
    }

    webSocketServer.handleUpgrade(req, socket, head, client => {
      client.callId = callId;
      client.participantRole = role;
      client.userAgent = cleanDiagnosticText(req.headers['user-agent'], 200);
      client.isAlive = true;
      webSocketServer.emit('connection', client);
    });
  }
  if (attachUpgrade) server.on('upgrade', handleUpgrade);

  webSocketServer.on('connection', socket => {
    const { callId, participantRole: role } = socket;
    const peerRole = role === 'teacher' ? 'guest' : 'teacher';
    const room = roomFor(callId);
    const previous = room.get(role);
    if (previous && previous !== socket) {
      previous.closeCause = 'replaced';
      previous.close(4001, 'Участник подключился в другой вкладке.');
    }
    room.set(role, socket);
    socket.connectionId = randomUUID();
    socket.connectedAt = Date.now();
    socket.diagnosticGate = createDiagnosticLogGate();

    console.info('[video-call-socket]', JSON.stringify({
      callId,
      role,
      state: 'open', connectionId: socket.connectionId,
      peerPresent: Boolean(room.get(peerRole)),
      userAgent: socket.userAgent,
    }));

    send(socket, { type: 'connected', role, peerPresent: Boolean(room.get(peerRole)) });
    send(room.get(peerRole), { type: 'peer-joined' });
    if (room.get('teacher') && room.get('guest')) setVideoCallActive(callId, database);

    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('message', (raw, isBinary) => {
      if (isBinary || raw.length > MAX_SIGNAL_BYTES) return;
      let message;
      try {
        message = JSON.parse(raw.toString('utf8'));
      } catch (_error) {
        return;
      }
      if (!message || !ALLOWED_MESSAGE_TYPES.has(message.type)) return;
      if (message.type === 'leave') {
        socket.closeCause = message.source === 'pagehide' ? 'pagehide' : 'leave';
        socket.close(1000, 'Участник вышел.');
        return;
      }
      if (message.type === 'diagnostic') {
        const diagnostic = socket.diagnosticGate.accept(sanitizeVideoCallDiagnostic(message));
        if (diagnostic) {
          console.info('[video-call-diagnostic]', JSON.stringify({ callId, role,
            connectionId: socket.connectionId, ...diagnostic }));
        }
        return;
      }
      send(room.get(peerRole), { ...message, from: role });
    });
    socket.on('close', code => {
      console.info('[video-call-socket]', JSON.stringify({ callId, role, state: 'close',
        connectionId: socket.connectionId, closeCode: code,
        cause: socket.closeCause || 'transport-closed', durationMs: Date.now() - socket.connectedAt,
        suppressedDiagnostics: socket.diagnosticGate.suppressed,
      }));
      if (room.get(role) !== socket) return;
      room.delete(role);
      send(room.get(peerRole), { type: 'peer-left' });
      if (!(room.get('teacher') && room.get('guest'))) setVideoCallWaiting(callId, database);
      if (room.size === 0) rooms.delete(callId);
    });
  });

  const heartbeat = setInterval(() => {
    webSocketServer.clients.forEach(socket => {
      if (!socket.isAlive) {
        socket.closeCause = 'heartbeat-timeout';
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);
  heartbeat.unref();

  return { closeRoom, rooms, webSocketServer, handleUpgrade };
}

module.exports = {
  createVideoCallSignaling,
  createDiagnosticLogGate,
  sanitizeVideoCallDiagnostic,
  websocketOriginAllowed,
};
