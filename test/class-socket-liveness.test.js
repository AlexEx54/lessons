'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const vm = require('node:vm');
const { WebSocket } = require('ws');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClassSession } = require('../lib/class-store.js');
const { joinClass } = require('../lib/class-live-store.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { createClassLiveSignaling } = require('../lib/class-live-signaling.js');
const { createNotesSignaling } = require('../lib/lesson-notes-signaling.js');
const source = fs.readFileSync(path.join(__dirname, '../assets/class-socket-liveness.js'), 'utf8');

function browser() {
  let clock = 0, timerId = 0;
  const timers = new Map(), abandoned = [];
  const window = new EventTarget(), document = new EventTarget();
  document.hidden = false;
  Object.assign(window, {
    setTimeout(fn, delay) { timers.set(++timerId, { fn, at: clock + delay }); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    ClassConnectionDiagnostics: { abandon: socket => abandoned.push(socket) },
  });
  vm.runInNewContext(source, { window, document, Date: { now: () => clock } });
  // Advances the clock; `frozen` delivers due timers only at the end, like a suspended tab.
  function advance(ms, { frozen = false } = {}) {
    const end = clock + ms;
    for (;;) {
      const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      clock = frozen ? end : due[1].at;
      due[1].fn();
    }
    clock = end;
  }
  class Socket extends EventTarget {
    closed = [];
    close(code, reason) { this.closed.push({ code, reason }); }
    receive(message) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(message) })); }
  }
  return { window, document, advance, Socket, abandoned, liveness: window.ClassSocketLiveness };
}

test('a socket that misses two heartbeats is abandoned once and reported stale', () => {
  const b = browser(), socket = new b.Socket();
  let stale = 0;
  b.liveness.watch(socket, () => stale++);
  socket.receive({ type: 'snapshot', heartbeatMs: 15000 });
  for (let n = 0; n < 4; n++) { b.advance(15000); socket.receive({ type: 'heartbeat' }); }
  b.advance(34000);
  assert.equal(stale, 0);
  b.advance(1000);
  assert.equal(stale, 1);
  assert.deepEqual(socket.closed.map(close => close.code), [4000]);
  assert.deepEqual(b.abandoned, [socket]);
  b.advance(120000);
  assert.equal(stale, 1);
});

test('servers that do not announce the heartbeat are never watched', () => {
  const b = browser(), socket = new b.Socket();
  let stale = 0;
  b.liveness.watch(socket, () => stale++);
  socket.receive({ type: 'snapshot' });
  socket.receive({ type: 'action', heartbeatMs: 15000 });
  b.advance(600000);
  assert.equal(stale, 0);
});

test('a closed socket stops being watched', () => {
  const b = browser(), socket = new b.Socket();
  let stale = 0;
  b.liveness.watch(socket, () => stale++);
  socket.receive({ type: 'hello', heartbeatMs: 15000 });
  socket.dispatchEvent(new Event('close'));
  b.advance(600000);
  assert.equal(stale, 0);
});

test('after a frozen tab resumes, queued messages get a chance before the socket is judged', () => {
  const b = browser(), socket = new b.Socket();
  let stale = 0;
  b.liveness.watch(socket, () => stale++);
  socket.receive({ type: 'snapshot', heartbeatMs: 15000 });
  b.advance(300000, { frozen: true });
  assert.equal(stale, 0, 'the late timer must not condemn the socket');
  socket.receive({ type: 'heartbeat' });
  b.advance(30000);
  assert.equal(stale, 0);
  b.advance(300000, { frozen: true });
  b.advance(2000);
  assert.equal(stale, 1, 'nothing arrived after resuming: the socket is dead');
});

test('network and visibility return re-check sockets soon and wake pending reconnects', () => {
  const b = browser(), socket = new b.Socket();
  let stale = 0, wakes = 0;
  b.liveness.onWake(() => wakes++);
  b.liveness.watch(socket, () => stale++);
  socket.receive({ type: 'snapshot', heartbeatMs: 15000 });
  b.advance(30000);
  b.window.dispatchEvent(new Event('online'));
  b.advance(2000);
  assert.equal(stale, 0, 'still within the deadline');
  b.advance(3000);
  assert.equal(stale, 1);
  b.document.hidden = true;
  b.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(wakes, 1);
  b.document.hidden = false;
  b.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(wakes, 2);
});

for (const channel of ['sessions', 'notes']) test(`${channel}: server announces and sends the application heartbeat`, { timeout: 10000 }, async t => {
  const db = openDatabase(':memory:');
  const teacher = createUser({ email: `heartbeat-${channel}@test.example`, displayName: 'Teacher', role: 'admin', passwordHash: 'unused' }, db);
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(createSyntheticLesson('Heartbeat')));
  const lesson = createClassSession({ className: 'Heartbeat', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00Z' }, teacher.id, db);
  const cookies = {
    teacher: `teach_session=${createSession(teacher.id, db).token}`,
    student: joinClass({ headers: {} }, lesson.classInvitePath.split('/').at(-1), db, lesson.id).cookie.split(';')[0],
  };
  const create = channel === 'sessions' ? createClassLiveSignaling : createNotesSignaling;
  const signaling = create({ database: db, heartbeatMs: 40 });
  const server = http.createServer();
  server.on('upgrade', signaling.handleUpgrade);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    for (const socket of signaling.webSocketServer.clients) socket.terminate();
    await new Promise(resolve => signaling.webSocketServer.close(resolve));
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  for (const role of ['teacher', 'student']) {
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws/${channel}/${lesson.id}?role=${role}`, { headers: { Cookie: cookies[role], Origin: origin } });
    const types = [];
    const heartbeats = new Promise(resolve => socket.on('message', raw => {
      const message = JSON.parse(raw);
      types.push(message.type);
      if (types.length === 1) assert.equal(message.heartbeatMs, 40);
      if (types.filter(type => type === 'heartbeat').length === 2) resolve();
    }));
    await heartbeats;
    assert.equal(types[0], channel === 'sessions' ? 'snapshot' : 'hello');
    socket.terminate();
  }
});
