'use strict';
const { WebSocketServer, WebSocket } = require('ws');
const Y = require('yjs');
const { authorizeClass } = require('./class-session-store.js');
const { readClassNotes, persistUpdate, MAX_STATE_BYTES } = require('./lesson-notes-store.js');
const encode = value => Buffer.from(value).toString('base64');
function createNotesSignaling({ database }) {
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: Math.ceil(MAX_STATE_BYTES * 1.4) });
  const rooms = new Map();
  const send = (socket, payload) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload)); };
  function handleUpgrade(req, socket, head) {
    let access;
    try {
      const url = new URL(req.url, 'http://localhost');
      const match = url.pathname.match(/^\/ws\/notes\/([a-f0-9-]{36})$/i);
      const role = url.searchParams.get('role');
      if (match && ['teacher', 'student'].includes(role) && new URL(req.headers.origin).host === req.headers.host) access = authorizeClass(req, match[1], database, role);
    } catch {}
    if (!access) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); return; }
    webSocketServer.handleUpgrade(req, socket, head, client => { client.access = access; client.request = req; webSocketServer.emit('connection', client); });
  }
  function presence(room) {
    for (const socket of room.clients.values()) send(socket, { type: 'presence', peerPresent: [...room.clients.values()].some(peer => peer !== socket && peer.readyState === WebSocket.OPEN) });
  }
  webSocketServer.on('connection', socket => {
    socket.on('error', () => socket.terminate());
    const { access } = socket;
    let room = rooms.get(access.classId);
    if (!room) {
      try { room = { doc: readClassNotes(access.classId, database), clients: new Map() }; }
      catch { socket.close(4004, 'Не удалось загрузить заметки.'); return; }
      rooms.set(access.classId, room);
    }
    const previous = room.clients.get(access.role);
    if (previous && previous.access.identity !== access.identity) { socket.close(4003, 'Место участника уже занято.'); return; }
    if (previous) previous.close(4001, 'Заметки открыты в другой вкладке.');
    room.clients.set(access.role, socket);
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('close', () => {
      if (room.clients.get(access.role) !== socket) return;
      room.clients.delete(access.role);
      if (!room.clients.size) { room.doc.destroy(); rooms.delete(access.classId); }
      else presence(room);
    });
    send(socket, { type: 'hello', state: encode(Y.encodeStateAsUpdate(room.doc)), vector: encode(Y.encodeStateVector(room.doc)), identity: access.identity });
    presence(room);
    let count = 0, start = Date.now();
    socket.on('message', (raw, binary) => {
      if (room.clients.get(access.role) !== socket) return;
      if (!authorizeClass(socket.request, access.classId, database, access.role)) { socket.close(4004, 'Доступ к заметкам истёк.'); return; }
      if (Date.now() - start > 1000) { start = Date.now(); count = 0; }
      if (++count > 40) { socket.close(4008, 'Слишком много изменений.'); return; }
      try {
        if (binary) throw new Error('Неверный формат.');
        const message = JSON.parse(raw.toString());
        if (message.type !== 'sync' || !Number.isSafeInteger(message.id) || message.id < 0 || typeof message.update !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(message.update)) throw new Error('Неверное изменение.');
        const update = Buffer.from(message.update, 'base64');
        persistUpdate(access.classId, room.doc, update, database);
        send(socket, { type: 'ack', id: message.id, vector: encode(Y.encodeStateVector(room.doc)) });
        for (const peer of room.clients.values()) if (peer !== socket) send(peer, { type: 'update', update: encode(update) });
      } catch {
        send(socket, { type: 'error', error: 'Не удалось сохранить изменения. Скопируйте текст перед перезагрузкой.' });
        socket.close(4009, 'Изменения не сохранены.');
      }
    });
  });
  const heartbeat = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      if (!socket.isAlive) socket.terminate();
      else { socket.isAlive = false; socket.ping(); }
    }
  }, 15000);
  heartbeat.unref();
  webSocketServer.on('close', () => clearInterval(heartbeat));
  return { handleUpgrade, webSocketServer, rooms };
}
module.exports = { createNotesSignaling };
