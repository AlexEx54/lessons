'use strict';

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
]);
const DIAGNOSTIC_CANDIDATE_TYPES = new Set(['host', 'srflx', 'prflx', 'relay']);
const DIAGNOSTIC_PROTOCOLS = new Set(['udp', 'tcp', 'tls']);

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
  const errorText = cleanDiagnosticText(message?.errorText, 160);
  if (errorText) diagnostic.errorText = errorText;
  return diagnostic;
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

function createVideoCallSignaling({ server, database }) {
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
      socket.close(code, reason);
    });
    rooms.delete(callId);
  }

  function rejectUpgrade(socket, status, message) {
    socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${message}`);
    socket.destroy();
  }

  server.on('upgrade', (req, socket, head) => {
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
  });

  webSocketServer.on('connection', socket => {
    const { callId, participantRole: role } = socket;
    const peerRole = role === 'teacher' ? 'guest' : 'teacher';
    const room = roomFor(callId);
    const previous = room.get(role);
    if (previous && previous !== socket) previous.close(4001, 'Участник подключился в другой вкладке.');
    room.set(role, socket);
    socket.diagnosticCount = 0;

    console.info('[video-call-socket]', JSON.stringify({
      callId,
      role,
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
        socket.close(1000, 'Участник вышел.');
        return;
      }
      if (message.type === 'diagnostic') {
        if (socket.diagnosticCount >= 100) return;
        socket.diagnosticCount += 1;
        const diagnostic = sanitizeVideoCallDiagnostic(message);
        if (diagnostic.event) {
          const browser = diagnostic.event === 'ice-config'
            ? { userAgent: socket.userAgent }
            : {};
          console.info('[video-call-diagnostic]', JSON.stringify({ callId, role, ...browser, ...diagnostic }));
        }
        return;
      }
      send(room.get(peerRole), { ...message, from: role });
    });
    socket.on('close', () => {
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
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30000);
  heartbeat.unref();

  return { closeRoom, rooms, webSocketServer };
}

module.exports = {
  createVideoCallSignaling,
  sanitizeVideoCallDiagnostic,
  websocketOriginAllowed,
};
