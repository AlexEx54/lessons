'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClass } = require('../lib/class-store.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { joinClass, applyAction, sessionPayload } = require('../lib/class-session-store.js');
const { createClassSessionSignaling } = require('../lib/class-session-signaling.js');
const { createClassCursorSignaling, normalizeCursor } = require('../lib/class-cursor-signaling.js');

const reading = { id: 'reading-text', type: 'textReading', title: 'Title', text: 'Some text', textImage: { imageSrc: '/image.png' } };
test('cursor protocol accepts only bounded Reading targets and strips client role/data', () => {
  const normalize = target => normalizeCursor({ type: 'cursor', stageId: 'reading', target, actorRole: 'teacher', secret: 'discard' }, [reading]);
  assert.deepEqual(normalize({ componentId: reading.id, field: 'body', offset: 2 }), {
    type: 'cursor', stageId: 'reading', target: { componentId: reading.id, field: 'body', offset: 2 }, touch: false,
  });
  for (const target of [
    { componentId: 'private-note', field: 'body', offset: 1 },
    { componentId: reading.id, field: 'answer', offset: 1 },
    { componentId: reading.id, field: 'body', offset: -1 },
    { componentId: reading.id, field: 'body', offset: 100 },
    { componentId: reading.id, field: 'textImage', x: 2, y: 0 },
    { componentId: reading.id, field: 'textImage', x: NaN, y: 0 },
    { componentId: reading.id, field: 'headerImage', x: 0, y: 0 },
  ]) assert.equal(normalize(target), null);
});

test('separate cursor sockets relay bidirectionally without changing lesson state; enforce auth, stages and cleanup', { timeout: 10000 }, async t => {
  const db = openDatabase(':memory:');
  const teacher = createUser({ email: 'cursors@test.local', displayName: 'Teacher', role: 'teacher', passwordHash: 'unused' }, db);
  const teacherCookie = `teach_session=${createSession(teacher.id, db).token}`;
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(createSyntheticLesson('Cursors')));
  const lesson = createClass({ name: 'Cursor test', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID() }, teacher.id, db);
  const token = lesson.invitePath.split('/').pop();
  const guestCookie = joinClass({ headers: {} }, token, db).cookie.split(';')[0];
  const access = { classId: lesson.id, ownerId: teacher.id, role: 'teacher', identity: teacher.id };
  const initial = sessionPayload(access, db);
  applyAction(access, { type: 'select-stage', stageId: 'reading', expectedVersion: initial.state.version }, db);
  const server = http.createServer();
  const main = createClassSessionSignaling({ database: db });
  const cursors = createClassCursorSignaling({ database: db, sessionRooms: main.rooms });
  server.on('upgrade', (req, socket, head) => (req.url.includes('/cursors?') ? cursors : main).handleUpgrade(req, socket, head));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(async () => {
    sockets.forEach(socket => socket.terminate());
    main.webSocketServer.close(); cursors.webSocketServer.close();
    await new Promise(resolve => server.close(resolve)); db.close();
  });
  function connect(role, cookie, cursor = true, origin = base, id = lesson.id) {
    const socket = new WebSocket(`${base.replace('http', 'ws')}/ws/classes/${id}${cursor ? '/cursors' : ''}?role=${role}`, { headers: { Origin: origin, Cookie: cookie } });
    sockets.push(socket);
    return socket;
  }
  async function denied(role, cookie, origin = base, id = lesson.id) {
    const socket = connect(role, cookie, true, origin, id);
    socket.on('error', () => {});
    const [, response] = await once(socket, 'unexpected-response');
    assert.equal(response.statusCode, 403);
    response.destroy(); socket.terminate();
  }
  await denied('student', guestCookie); // Cursor connection requires the active lesson role.
  const tm = connect('teacher', teacherCookie, false); await once(tm, 'open');
  const sm = connect('student', guestCookie, false); await once(sm, 'open');
  for (const args of [['student', ''], ['teacher', guestCookie], ['student', guestCookie, 'https://foreign.test'], ['student', guestCookie, base, crypto.randomUUID()]]) await denied(...args);
  const tc = connect('teacher', teacherCookie); await once(tc, 'open');
  const sc = connect('student', guestCookie); await once(sc, 'open');
  const before = db.prepare('SELECT state_json FROM class_live_state WHERE class_id = ?').get(lesson.id).state_json;
  const message = { type: 'cursor', stageId: 'reading', target: { componentId: 'reading-text', field: 'body', offset: 5 } };
  let received = once(sc, 'message'); tc.send(JSON.stringify(message));
  assert.equal(JSON.parse((await received)[0]).actorRole, 'teacher');
  received = once(tc, 'message'); sc.send(JSON.stringify({ ...message, touch: true }));
  assert.equal(JSON.parse((await received)[0]).touch, true);
  assert.equal(db.prepare('SELECT state_json FROM class_live_state WHERE class_id = ?').get(lesson.id).state_json, before);
  const seen = []; sc.on('message', raw => seen.push(JSON.parse(raw)));
  tc.send(JSON.stringify({ ...message, target: { ...message.target, componentId: 'reading-answer-key' } }));
  const state = sessionPayload(access, db).state;
  for (let index = 0; index < 100; index++) tc.send(JSON.stringify({ ...message, target: { ...message.target, componentId: 'private-note' } }));
  const action = once(tm, 'message');
  tm.send(JSON.stringify({ type: 'select-stage', stageId: 'warm-up', expectedVersion: state.version }));
  assert.equal(JSON.parse((await action)[0]).state.activeStageId, 'warm-up');
  tc.send(JSON.stringify(message));
  await new Promise(resolve => setTimeout(resolve, 60)); assert.equal(seen.length, 0);
  received = once(sc, 'message'); tc.close();
  assert.equal(JSON.parse((await received)[0]).target, null);
  assert.equal(tm.readyState, WebSocket.OPEN); assert.equal(sm.readyState, WebSocket.OPEN);
});
