'use strict';
const { validateMediaAction } = require('./class-media.js');
const { WebSocketServer, WebSocket } = require('ws');
const { observeClassConnection } = require('./class-connection-diagnostics.js');
const { startHeartbeat } = require('./class-socket-heartbeat.js');
const componentTree = require('../assets/components/component-tree.js');
const { kinds: reactionKinds } = require('../assets/class-reactions.js');
// Taps above this rate are animated only for the sender instead of closing the socket.
const REACTION_INTERVAL_MS = 60;
const { authorizeSession, sessionPayload, applyAction, studentLimit, MAX_SESSION_STUDENTS } = require('./class-live-store.js');
// `callPresence` tells a page that just connected who is already in the session's video call.
function createClassLiveSignaling({ database, heartbeatMs, callPresence = () => ({ teacher: false, student: false }) }) {
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 8192 });
  heartbeatMs = startHeartbeat(webSocketServer, heartbeatMs);
  const rooms = new Map();
  const sendText = (socket, text) => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(text);
  };
  const send = (socket, payload) => sendText(socket, JSON.stringify(payload));
  // A room holds one socket per participant: the teacher and up to the class's limit of students.
  const open = (room, role) => [...room.values()].filter(client => client.readyState === WebSocket.OPEN && (!role || client.access.role === role));
  function handleUpgrade(req, socket, head) {
    const url = new URL(req.url, 'http://localhost');
    const match = url.pathname.match(/^\/ws\/sessions\/([a-f0-9-]{36})$/i);
    const role = url.searchParams.get('role');
    const access = match && ['teacher', 'student'].includes(role) && authorizeSession(req, match[1], database, role);
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
  // Names are known only in a group; an individual class has one unnamed student.
  function presence(room) {
    const text = JSON.stringify({ type: 'presence', teacher: open(room, 'teacher').length > 0,
      students: open(room, 'student').map(client => client.access.name ?? null).sort((a, b) => (a ?? '').localeCompare(b ?? '', 'ru')) });
    for (const socket of room.values()) sendText(socket, text);
  }
  webSocketServer.on('connection', socket => {
    socket.on('error', () => socket.terminate());
    const { access } = socket;
    const diagnostics = observeClassConnection(socket, 'sessions');
    let room = rooms.get(access.sessionId);
    if (!room) { room = new Map(); rooms.set(access.sessionId, room); }
    // The participant's own new tab replaces the old one; a new student waits for a free place.
    const previous = room.get(access.identity);
    if (!previous && access.role === 'student' && open(room, 'student').length >= studentLimit(access)) {
      socket.close(4003, access.isGroup ? `В занятии уже ${MAX_SESSION_STUDENTS} учеников.` : 'Ученик уже подключён.');
      return;
    }
    if (previous) previous.close(4001, 'Класс открыт в другой вкладке.');
    room.set(access.identity, socket);
    diagnostics.accept(previous);
    socket.on('close', () => {
      if (room.get(access.identity) !== socket) return;
      room.delete(access.identity);
      presence(room);
      if (!room.size) rooms.delete(access.sessionId);
    });
    try { send(socket, { type: 'snapshot', connectionDiagnostics: true, heartbeatMs, callPresence: callPresence(access.sessionId), ...sessionPayload(access, database) }); }
    catch { socket.close(4004, 'Класс недоступен.'); return; }
    // A replayed pointer only restores the highlight; it must not pull the student to the teacher's stage.
    send(socket, { ...(room.pointer || { type: 'pointer', target: null, revision: 0 }), replay: true });
    presence(room);
    let windowStart = Date.now(), count = 0, reactionAt = 0;
    socket.on('message', (raw, binary) => {
      if (room.get(access.identity) !== socket || socket.readyState !== WebSocket.OPEN) return;
      if (!authorizeSession(socket.request, access.sessionId, database, access.role)) {
        socket.close(4004, 'Сессия истекла. Откройте ссылку заново.'); return;
      }
      if (Date.now() - windowStart > 1000) { windowStart = Date.now(); count = 0; }
      if (++count > 100) { socket.close(4008, 'Слишком много действий.'); return; }
      try {
        if (binary) throw new Error('Ожидалось текстовое действие.');
        const action = JSON.parse(raw.toString());
        if (diagnostics.client(action)) return;
        if (action.type === 'reaction') {
          if (!reactionKinds.includes(action.kind) || Date.now() - reactionAt < REACTION_INTERVAL_MS) return;
          reactionAt = Date.now();
          for (const client of room.values()) if (client !== socket) send(client, { type: 'reaction', kind: action.kind, fromRole: access.role });
          return;
        }
        if (['media-command', 'media-align', 'media-status'].includes(action.type)) {
          try {
            const message = validateMediaAction(access.role, action, sessionPayload(access, database));
            if (action.type !== 'media-status') message.revision = room.mediaRevision = (room.mediaRevision || 0) + 1;
            // In a group the teacher tells the students' playback apart by name.
            if (action.type === 'media-status' && access.isGroup) message.name = access.name;
            const to = { 'media-command': null, 'media-align': 'student', 'media-status': 'teacher' }[action.type];
            for (const client of open(room, to)) send(client, message);
          } catch (error) { send(socket, { type: 'media-error', error: error.message }); }
          return;
        }
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
        // Every student sees the same lesson, so the payload is built and serialised once per role; the author's copy is marked `own`.
        const payloads = new Map();
        for (const client of room.values()) {
          const { role } = client.access;
          if (!payloads.has(role)) payloads.set(role, { payload: { type: 'action', ...(action.type === 'reset-stage' ? { resetStageId: action.stageId } : {}), ...sessionPayload(client.access, database) } });
          const shared = payloads.get(role);
          if (client === socket) send(client, { ...shared.payload, own: true });
          else sendText(client, shared.text ??= JSON.stringify(shared.payload));
          if (pointerInvalid) send(client, room.pointer);
        }
      } catch (error) {
        // A conflict means another participant answered first: the page quietly shows the fresh state.
        try { send(socket, { type: 'action-error', error: error.statusCode ? error.message : 'Некорректное действие.', ...(error.statusCode === 409 ? { conflict: true } : {}), ...sessionPayload(access, database) }); }
        catch { socket.close(4004, 'Класс недоступен.'); }
      }
    });
  });
  return { handleUpgrade, webSocketServer, rooms,
    broadcast(sessionId, payload) { rooms.get(sessionId)?.forEach(socket => send(socket, payload)); },
  };
}
module.exports = { createClassLiveSignaling };
