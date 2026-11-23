'use strict';
const { WebSocketServer, WebSocket } = require('ws');
const { observeClassConnection } = require('./class-connection-diagnostics.js');
const { startHeartbeat } = require('./class-socket-heartbeat.js');
const Y = require('yjs');
const { authorizeSession, studentLimit } = require('./class-live-store.js');
const { readClassNotes, persistUpdate, MAX_STATE_BYTES } = require('./lesson-notes-store.js');
const encode = value => Buffer.from(value).toString('base64');
function createNotesSignaling({ database, heartbeatMs }) {
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: Math.ceil(MAX_STATE_BYTES * 1.4) });
  heartbeatMs = startHeartbeat(webSocketServer, heartbeatMs);
  const rooms = new Map();
  const send = (socket, payload) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)); };
  function handleUpgrade(req, socket, head) {
    let access;
    try {
      const url = new URL(req.url, 'http://localhost');
      const match = url.pathname.match(/^\/ws\/notes\/([a-f0-9-]{36})$/i);
      const role = url.searchParams.get('role');
      if (match && ['teacher', 'student'].includes(role) && new URL(req.headers.origin).host === req.headers.host) access = authorizeSession(req, match[1], database, role);
    } catch {}
    if (!access) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    webSocketServer.handleUpgrade(req, socket, head, client => { client.access = access; client.request = req; webSocketServer.emit('connection', client); });
  }
  // In a group the lesson header already shows who is in, so the notes say nothing about it.
  function presence(room) {
    for (const socket of room.clients.values()) if (!socket.access.isGroup) send(socket, { type: 'presence', peerPresent: [...room.clients.values()].some(peer => peer !== socket && peer.readyState === WebSocket.OPEN) });
  }
  webSocketServer.on('connection', socket => {
    socket.on('error', () => socket.terminate());
    const { access } = socket;
    const diagnostics = observeClassConnection(socket, 'notes');
    let room = rooms.get(access.sessionId);
    if (!room) {
      try { room = { doc: readClassNotes(access.sessionId, database), clients: new Map() }; }
      catch { socket.close(4004, 'Не удалось загрузить заметки.'); return; }
      rooms.set(access.sessionId, room);
    }
    // One socket per participant, with the same student limit as the lesson itself.
    const previous = room.clients.get(access.identity);
    const students = [...room.clients.values()].filter(client => client.access.role === 'student').length;
    if (!previous && access.role === 'student' && students >= studentLimit(access)) { socket.close(4003, 'Место участника уже занято.'); return; }
    if (previous) previous.close(4001, 'Заметки открыты в другой вкладке.');
    room.clients.set(access.identity, socket);
    diagnostics.accept(previous);
    // Eight people typing in one text is chaos, so in a group only the teacher writes and the students read.
    const editable = !access.isGroup || access.role === 'teacher';
    socket.on('close', () => {
      if (room.clients.get(access.identity) !== socket) return;
      room.clients.delete(access.identity);
      if (!room.clients.size) { room.doc.destroy(); rooms.delete(access.sessionId); }
      else presence(room);
    });
    send(socket, { type: 'hello', connectionDiagnostics: true, heartbeatMs, state: encode(Y.encodeStateAsUpdate(room.doc)), vector: encode(Y.encodeStateVector(room.doc)), identity: access.identity, group: access.isGroup, editable });
    presence(room);
    let count = 0, start = Date.now();
    socket.on('message', (raw, binary) => {
      if (room.clients.get(access.identity) !== socket) return;
      if (!authorizeSession(socket.request, access.sessionId, database, access.role)) { socket.close(4004, 'Доступ к заметкам истёк.'); return; }
      if (Date.now() - start > 1000) { start = Date.now(); count = 0; }
      if (++count > 40) { socket.close(4008, 'Слишком много изменений.'); return; }
      try {
        if (binary) throw new Error('Неверный формат.');
        const message = JSON.parse(raw.toString());
        if (diagnostics.client(message)) return;
        if (!editable) throw new Error('Заметки ведёт преподаватель.');
        if (message.type !== 'sync' || !Number.isSafeInteger(message.id) || message.id < 0 || typeof message.update !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(message.update)) throw new Error('Неверное изменение.');
        const update = Buffer.from(message.update, 'base64');
        persistUpdate(access.sessionId, room.doc, update, database);
        send(socket, { type: 'ack', id: message.id, vector: encode(Y.encodeStateVector(room.doc)) });
        for (const peer of room.clients.values()) if (peer !== socket) send(peer, { type: 'update', update: encode(update) });
      } catch {
        send(socket, { type: 'error', error: 'Не удалось сохранить изменения. Скопируйте текст перед перезагрузкой.' });
        socket.close(4009, 'Изменения не сохранены.');
      }
    });
  });
  return { handleUpgrade, webSocketServer, rooms };
}
module.exports = { createNotesSignaling };
