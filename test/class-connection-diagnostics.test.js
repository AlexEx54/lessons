'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const http = require('node:http');
const { WebSocket } = require('ws');
const Y = require('yjs');
const { observeClassConnection } = require('../lib/class-connection-diagnostics.js');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClassSession } = require('../lib/class-store.js');
const { joinClass } = require('../lib/class-live-store.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { createClassLiveSignaling } = require('../lib/class-live-signaling.js');
const { createNotesSignaling } = require('../lib/lesson-notes-signaling.js');

test('diagnostics whitelist metadata, bound log volume and retain terminal causes', () => {
  let clock = 1000;
  const logs = [], socket = new EventEmitter();
  socket.access = { sessionId: 'lesson', role: 'student', identity: 'SECRET-GUEST-TOKEN' };
  socket.request = { url: '/ws/sessions/lesson?connection=bad&pageSession=bad', headers: { cookie: 'SECRET-COOKIE' } };
  const diagnostic = observeClassConnection(socket, 'sessions', (_prefix, raw) => logs.push(JSON.parse(raw)), () => clock);
  diagnostic.accept();
  assert.equal(diagnostic.client({ type: 'select-option' }), false);
  diagnostic.client({ type: 'diagnostic', event: 'pagehide', hidden: true, persisted: false, answer: 'SECRET-ANSWER', cookie: 'SECRET-COOKIE' });
  for (let n = 0; n < 100; n++) diagnostic.client({ type: 'diagnostic', event: 'visibility', hidden: true });
  assert.equal(logs.filter(log => log.event === 'client').length, 24);
  clock += 60000;
  diagnostic.client({ type: 'diagnostic', event: 'socket-open', previousCloseCode: 1006, navigationType: 'reload' });
  socket.emit('pong');
  clock += 16000;
  socket.diagnosticCloseCause = 'heartbeat-timeout';
  socket.emit('close', 1006);
  assert.equal(logs.at(-1).cause, 'heartbeat-timeout');
  assert.equal(logs.at(-1).lastPongAgeMs, 16000);
  assert.equal(logs.at(-1).lastClientEvent.event, 'socket-open');
  assert.ok(logs.at(-1).suppressed > 0);
  assert.doesNotMatch(JSON.stringify(logs), /SECRET-|pageSession/);
});

test('browser metadata ties both channels to a page and reports lifecycle before teardown', () => {
  const window = new EventTarget(), document = new EventTarget();
  window.crypto = crypto;
  window.location = { href: 'https://example.test/sessions/id/student', protocol: 'https:' };
  document.hidden = false;
  class Socket extends EventTarget {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    send(raw) { this.sent.push(JSON.parse(raw)); }
  }
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-connection-diagnostics.js'), 'utf8'), {
    window, document, navigator: { onLine: true }, performance: { getEntriesByType: () => [{ type: 'reload' }] }, URL, WebSocket: Socket,
  });
  const helper = window.ClassConnectionDiagnostics;
  const a = new URL(helper.url('/ws/sessions/id?role=student'));
  const b = new URL(helper.url('/ws/notes/id?role=student'));
  assert.equal(a.protocol, 'wss:');
  assert.equal(a.searchParams.get('pageSession'), b.searchParams.get('pageSession'));
  assert.notEqual(a.searchParams.get('connection'), b.searchParams.get('connection'));
  const hello = socket => socket.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify({ type: 'snapshot', connectionDiagnostics: true }) }));
  const socket = new Socket(); helper.attach(socket, 'sessions'); socket.dispatchEvent(new Event('open'));
  socket.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify({ type: 'snapshot' }) }));
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(socket.sent.length, 0, 'older servers must never receive unknown diagnostic frames');
  hello(socket);
  assert.equal(socket.sent[0].navigationType, 'reload');
  window.addEventListener('pagehide', () => { socket.readyState = 3; });
  window.dispatchEvent(Object.assign(new Event('pagehide'), { persisted: true }));
  assert.equal(socket.sent.at(-1).event, 'pagehide');
  assert.equal(socket.sent.at(-1).persisted, true);
  socket.dispatchEvent(Object.assign(new Event('close'), { code: 1006 }));
  const restored = new Socket(); helper.attach(restored, 'sessions'); hello(restored);
  assert.equal(restored.sent[0].previousCloseCode, 1006);
  document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(restored.sent.at(-1).event, 'visibility');
});

for (const channel of ['sessions', 'notes']) test(`${channel}: occupied student slot, tab replacement and transport recovery are distinguishable`, { timeout: 10000 }, async t => {
  const logs = [];
  t.mock.method(console, 'info', (prefix, raw) => { if (prefix === '[class-connection]') logs.push(JSON.parse(raw)); });
  const db = openDatabase(':memory:');
  const teacher = createUser({ email: 'diagnostic@test.example', displayName: 'Teacher', role: 'admin', passwordHash: 'unused' }, db);
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(createSyntheticLesson('Diagnostics')));
  const lesson = createClassSession({ className: 'Diagnostics', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00Z' }, teacher.id, db);
  const teacherCookie = `teach_session=${createSession(teacher.id, db).token}`;
  const guest = () => joinClass({ headers: {} }, lesson.classInvitePath.split('/').at(-1), db, lesson.id).cookie.split(';')[0];
  const firstCookie = guest(), secondCookie = guest();
  const signaling = channel === 'sessions' ? createClassLiveSignaling({ database: db }) : createNotesSignaling({ database: db });
  const server = http.createServer();
  server.on('upgrade', signaling.handleUpgrade);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, sockets = [];
  t.after(async () => {
    sockets.forEach(socket => socket.terminate());
    for (const socket of signaling.webSocketServer.clients) socket.terminate();
    await new Promise(resolve => signaling.webSocketServer.close(resolve));
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const connect = (cookie, role = 'student') => {
    const id = crypto.randomUUID();
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws/${channel}/${lesson.id}?role=${role}&connection=${id}`, { headers: { Cookie: cookie, Origin: origin } });
    sockets.push(socket);
    const queue = [], waiters = [];
    socket.on('message', raw => {
      const message = JSON.parse(raw), index = waiters.findIndex(w => w.type === message.type);
      if (index < 0) queue.push(message); else waiters.splice(index, 1)[0].resolve(message);
    });
    socket.next = type => {
      const index = queue.findIndex(m => m.type === type);
      return index < 0 ? new Promise(resolve => waiters.push({ type, resolve })) : Promise.resolve(queue.splice(index, 1)[0]);
    };
    socket.id = id;
    return socket;
  };
  const initialType = channel === 'sessions' ? 'snapshot' : 'hello';
  const teacherSocket = connect(teacherCookie, 'teacher');
  await teacherSocket.next(initialType);
  const first = connect(firstCookie); await first.next(initialType);
  const denied = connect(secondCookie);
  assert.equal((await once(denied, 'close'))[0], 4003);
  await new Promise(resolve => setImmediate(resolve));
  const oldClosed = once(first, 'close');
  const replacement = connect(firstCookie); await replacement.next(initialType);
  assert.equal((await oldClosed)[0], 4001);
  // An actual network drop, unlike closing the page, must allow the same guest back.
  const serverSocket = [...signaling.webSocketServer.clients].find(s => s.diagnosticConnectionId === replacement.id);
  const disconnected = once(replacement, 'close');
  serverSocket.terminate(); await disconnected;
  const recovered = connect(firstCookie); const initial = await recovered.next(initialType);
  recovered.send(JSON.stringify({ type: 'diagnostic', event: 'socket-open', previousCloseCode: 1006, hidden: false, body: 'DO-NOT-LOG' }));
  if (channel === 'sessions') {
    teacherSocket.send(JSON.stringify({ type: 'select-stage', stageId: initial.availableStageIds.find(id => id !== initial.state.activeStageId), expectedVersion: initial.state.version }));
    assert.equal((await recovered.next('action')).state.version, initial.state.version + 1);
  } else {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(initial.state, 'base64'));
    recovered.send(JSON.stringify({ type: 'sync', id: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, Buffer.from(initial.vector, 'base64'))).toString('base64') }));
    assert.equal((await recovered.next('ack')).id, 1);
    doc.destroy();
  }
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(logs.some(l => l.connectionId === denied.id && l.event === 'close' && l.cause === 'slot-taken' && !l.accepted));
  assert.ok(logs.some(l => l.connectionId === first.id && l.cause === 'replaced'));
  assert.ok(logs.some(l => l.connectionId === replacement.id && l.event === 'close' && l.code === 1006 && l.accepted));
  assert.ok(logs.some(l => l.connectionId === recovered.id && l.previousCloseCode === 1006));
  assert.doesNotMatch(JSON.stringify(logs), /DO-NOT-LOG|teach_session|class_guest_/);
});
