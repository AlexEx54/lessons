'use strict';
const { WebSocketServer, WebSocket } = require('ws');
const componentTree = require('../assets/components/component-tree.js');
const { authorizeClass, sessionPayload, applyAction } = require('./class-session-store.js');
function createClassSessionSignaling({ database }) {
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  const rooms = new Map();
  const send = (socket, payload) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };
  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, 'http://localhost');
    const match = url.pathname.match(/^\/ws\/classes\/([a-f0-9-]{36})$/i);
    const role = url.searchParams.get('role');
    const access = match && ['teacher', 'student'].includes(role) && authorizeClass(req, match[1], database, role);
    let originAllowed = false;
    try { originAllowed = new URL(req.headers.origin).host === req.headers.host; } catch {}
    if (!access || !originAllowed) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    webSocketServer.handleUpgrade(req, socket, head, client => {
      client.access = access;
      client.request = req;
      webSocketServer.emit('connection', client);
    });
  }
  function presence(room) {
    const peerPresent = role => room.get(role)?.readyState === WebSocket.OPEN;
    for (const [role, socket] of room) send(socket, { type: 'presence', peerPresent: peerPresent(role === 'teacher' ? 'student' : 'teacher') });
  }
  webSocketServer.on('connection', socket => {
    socket.on('error', () => socket.terminate());
    const { access } = socket;
    let room = rooms.get(access.classId);
    if (!room) { room = new Map(); rooms.set(access.classId, room); }
    const previous = room.get(access.role);
    if (previous && previous.readyState === WebSocket.OPEN && previous.access.identity !== access.identity) {
      socket.close(4003, 'Ученик уже подключён.');
      return;
    }
    if (previous) previous.close(4001, 'Класс открыт в другой вкладке.');
    room.set(access.role, socket);
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
    socket.on('close', () => {
      if (room.get(access.role) !== socket) return;
      room.delete(access.role);
      presence(room);
      if (!room.size) rooms.delete(access.classId);
    });
    try { send(socket, { type: 'snapshot', ...sessionPayload(access, database) }); }
    catch { socket.close(4004, 'Класс недоступен.'); return; }
    send(socket, room.pointer || { type: 'pointer', target: null, revision: 0 });
    presence(room);
    let windowStart = Date.now(), count = 0;
    socket.on('message', (raw, binary) => {
      if (room.get(access.role) !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (!authorizeClass(socket.request, access.classId, database, access.role)) {
        socket.close(4004, 'Сессия истекла. Откройте ссылку заново.'); return;
      }
      if (Date.now() - windowStart > 1000) { windowStart = Date.now(); count = 0; }
      if (++count > 100) { socket.close(4008, 'Слишком много действий.'); return; }
      try {
        if (binary) throw new Error('Ожидалось текстовое действие.');
        const action = JSON.parse(raw.toString());
        if (['pointer-set', 'pointer-clear'].includes(action.type)) {
          try {
            if (access.role !== 'teacher') throw new Error('Указкой управляет преподаватель.');
            const payload = sessionPayload(access, database);
            const target = action.target;
            if (action.type === 'pointer-set' && (
              action.stageId !== payload.state.activeStageId ||
              !payload.pointerComponentIds.includes(target?.componentId) ||
              !componentTree.collectComponents(
                payload.lesson.content.stages.filter(stage => stage.id === action.stageId)
              ).some(component => component.id === target.componentId) ||
              !(target.part === null || (typeof target.part === 'string' && /^[a-zA-Z0-9:_-]{1,160}$/.test(target.part)))
            )) throw new Error('Этот элемент недоступен ученику.');
            room.pointer = { type: 'pointer', stageId: payload.state.activeStageId,
              target: action.type === 'pointer-clear' ? null : { componentId: target.componentId, part: target.part },
              revision: (room.pointer?.revision || 0) + 1 };
            for (const client of room.values()) send(client, room.pointer);
          } catch (error) { send(socket, { type: 'pointer-error', error: error.message }); }
          return;
        }
        applyAction(access, action, database);
        const latest = sessionPayload(access, database);
        const pointerInvalid = room.pointer?.target && (
          ['select-stage', 'reset-stage'].includes(action.type) ||
          !latest.pointerComponentIds.includes(room.pointer.target.componentId));
        if (pointerInvalid) room.pointer = { type: 'pointer', stageId: latest.state.activeStageId,
          target: null, revision: room.pointer.revision + 1 };
        for (const client of room.values()) {
          send(client, { type: 'action', actorRole: access.role, ...(action.type === 'reset-stage' ? { resetStageId: action.stageId } : {}), ...sessionPayload(client.access, database) });
          if (pointerInvalid) send(client, room.pointer);
        }
      } catch (error) {
        try { send(socket, { type: 'action-error', error: error.statusCode ? error.message : 'Некорректное действие.', ...sessionPayload(access, database) }); }
        catch { socket.close(4004, 'Класс недоступен.'); }
      }
    });
  });
  const heartbeat = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      if (!socket.isAlive) { socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
    }
  }, 15000);
  heartbeat.unref();
  webSocketServer.on('close', () => clearInterval(heartbeat));
  return { handleUpgrade, webSocketServer, rooms };
}
module.exports = { createClassSessionSignaling };
