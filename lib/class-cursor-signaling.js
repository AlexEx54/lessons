'use strict';
const { WebSocketServer, WebSocket } = require('ws');
const { authorizeClass, sessionPayload } = require('./class-session-store.js');

// This prototype only admits public textReading fields, never arbitrary DOM targets.
function normalizeCursor(message, components) {
  if (!message || message.type !== 'cursor') return null;
  if (message.target === null) return { type: 'cursor', target: null };
  const target = message.target;
  const component = components.find(item => item.id === target?.componentId);
  if (!component || message.stageId !== 'reading') return null;
  const clean = { componentId: component.id, field: target.field };
  if (['title', 'subtitle', 'body'].includes(target.field)) {
    const text = component[target.field === 'body' ? 'text' : target.field];
    if (!text || !Number.isInteger(target.offset) || target.offset < 0 || target.offset > text.length) return null;
    clean.offset = target.offset;
  } else if (['headerImage', 'textImage'].includes(target.field)) {
    if (!component[target.field]?.imageSrc || ![target.x, target.y].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return null;
    clean.x = target.x; clean.y = target.y;
  } else return null;
  return { type: 'cursor', stageId: 'reading', target: clean, touch: message.touch === true };
}

function createClassCursorSignaling({ database, sessionRooms }) {
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const rooms = new Map();
  const send = (socket, message) => {
    if (socket?.readyState === WebSocket.OPEN && socket.bufferedAmount < 4096) socket.send(JSON.stringify(message));
  };
  const mainPresent = access => {
    const main = sessionRooms.get(access.classId)?.get(access.role);
    return main?.readyState === WebSocket.OPEN && main.access.identity === access.identity;
  };
  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, 'http://localhost');
    const match = url.pathname.match(/^\/ws\/classes\/([a-f0-9-]{36})\/cursors$/i);
    const role = url.searchParams.get('role');
    const access = match && ['teacher', 'student'].includes(role) && authorizeClass(req, match[1], database, role);
    let originAllowed = false;
    try { originAllowed = new URL(req.headers.origin).host === req.headers.host; } catch {}
    if (!access || !originAllowed || !mainPresent(access)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return;
    }
    webSocketServer.handleUpgrade(req, socket, head, client => {
      client.access = access; client.request = req;
      webSocketServer.emit('connection', client);
    });
  }
  webSocketServer.on('connection', socket => {
    const { access } = socket;
    const peerRole = access.role === 'teacher' ? 'student' : 'teacher';
    let room = rooms.get(access.classId);
    if (!room) rooms.set(access.classId, room = new Map());
    room.get(access.role)?.close(4001, 'Указатель открыт в другой вкладке.');
    room.set(access.role, socket);
    let components;
    try {
      components = sessionPayload({ ...access, role: 'student' }, database).lesson.content.stages
        .find(stage => stage.id === 'reading')?.content?.filter(item => item.type === 'textReading') || [];
    } catch { socket.close(4004); return; }
    let windowStart = Date.now(), count = 0;
    socket.isAlive = true;
    socket.on('error', () => socket.terminate());
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('close', () => {
      if (room.get(access.role) !== socket) return;
      room.delete(access.role);
      send(room.get(peerRole), { type: 'cursor', target: null });
      if (!room.size) rooms.delete(access.classId);
    });
    socket.on('message', (raw, binary) => {
      if (room.get(access.role) !== socket) return;
      if (Date.now() - windowStart >= 1000) { count = 0; windowStart = Date.now(); }
      if (++count > 40) return; // Dropping cursor traffic never closes the lesson socket.
      if (binary || !mainPresent(access) || !authorizeClass(socket.request, access.classId, database, access.role)) {
        socket.close(4004); return;
      }
      try {
        const message = normalizeCursor(JSON.parse(raw.toString()), components);
        if (!message) return;
        const saved = database.prepare('SELECT state_json FROM class_live_state WHERE class_id = ?').get(access.classId);
        if (message.target && JSON.parse(saved?.state_json || '{}').activeStageId !== 'reading') return;
        send(room.get(peerRole), { ...message, actorRole: access.role });
      } catch { /* Malformed, disposable cursor messages have no effect on the lesson. */ }
    });
  });
  const heartbeat = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      if (!socket.isAlive || !mainPresent(socket.access)) { socket.terminate(); continue; }
      socket.isAlive = false; socket.ping();
    }
  }, 15000);
  heartbeat.unref();
  webSocketServer.on('close', () => clearInterval(heartbeat));
  return { handleUpgrade, webSocketServer };
}
module.exports = { createClassCursorSignaling, normalizeCursor };
