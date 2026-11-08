'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClassSession } = require('../lib/class-store.js');
const { syntheticLesson } = require('./helpers/synthetic-lessons.js');

test('session call: class access, one student, presence on the lesson socket, end, cancel and clear', { timeout: 20000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-call-'));
  const databasePath = path.join(directory, 'app.sqlite');
  const db = openDatabase(databasePath);
  let server;
  const sockets = [];
  t.after(async () => {
    sockets.forEach(socket => socket.terminate());
    if (server?.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const teacher = createUser({ email: 'call@test.local', displayName: 'Анна Сергеевна', role: 'teacher', passwordHash: 'unused' }, db);
  const teacherCookie = `teach_session=${createSession(teacher.id, db).token}`;
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'")
    .run(JSON.stringify(syntheticLesson()));
  const makeSession = () => createClassSession({ className: 'Маша', lessonId: 'superhero', expectedRevision: 1,
    requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00.000Z' }, teacher.id, db);
  const lesson = makeSession(), otherLesson = makeSession();

  const probe = require('node:net').createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', env: { ...process.env,
    APP_DB_PATH: databasePath, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test', WEBRTC_STUN_URLS: 'stun:stun.example.test:3478' } });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/health')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  const request = (route, cookie, method = 'GET') => fetch(base + route, { method, redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  const studentCookie = async () => (await request(lesson.sessionInvitePath)).headers.get('set-cookie').split(';')[0];
  function connect(route, cookie) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${route}`, { headers: { Cookie: cookie || '', Origin: base } });
    sockets.push(socket);
    const messages = [];
    socket.on('message', raw => messages.push(JSON.parse(raw)));
    socket.next = async (type, accept = () => true) => {
      for (const deadline = Date.now() + 2000; Date.now() < deadline;) {
        const index = messages.findIndex(message => message.type === type && accept(message));
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out waiting for ${type}`);
    };
    socket.closed = new Promise(resolve => socket.once('close', resolve));
    return socket;
  }
  const callRoute = (role, id = lesson.id) => `/ws/session-calls/${id}?role=${role}`;
  const rejected = async socket => assert.match((await once(socket, 'error'))[0].message, /403/);
  const presence = (teacherIn, studentIn) => message => message.teacher === teacherIn && message.student === studentIn;

  const student = await studentCookie(), otherStudent = await studentCookie();
  const callInfo = await request(`/api/sessions/${lesson.id}/call?role=teacher`, teacherCookie);
  assert.equal(callInfo.status, 200);
  assert.deepEqual(await callInfo.json(), { iceServers: [{ urls: ['stun:stun.example.test:3478'] }],
    names: { teacher: 'Анна Сергеевна', student: 'Маша' } });
  assert.equal((await request(`/api/sessions/${lesson.id}/call?role=student`, student)).status, 200);
  assert.equal((await request(`/api/sessions/${lesson.id}/call?role=student`)).status, 403);
  assert.equal((await request(`/api/sessions/${lesson.id}/call?role=teacher`, student)).status, 403);
  await rejected(connect(callRoute('student')));
  await rejected(connect(callRoute('teacher'), student));

  // The lesson pages learn who is in the call without joining it.
  const teacherPage = connect(`/ws/sessions/${lesson.id}?role=teacher`, teacherCookie);
  assert.deepEqual((await teacherPage.next('snapshot')).callPresence, { teacher: false, student: false });
  const teacherCall = connect(callRoute('teacher'), teacherCookie);
  assert.equal((await teacherCall.next('connected')).peerPresent, false);
  await teacherPage.next('call-presence', presence(true, false));
  const studentPage = connect(`/ws/sessions/${lesson.id}?role=student`, student);
  assert.deepEqual((await studentPage.next('snapshot')).callPresence, { teacher: true, student: false });

  const studentCall = connect(callRoute('student'), student);
  assert.deepEqual(await studentCall.next('connected'), { type: 'connected', role: 'guest', peerPresent: true });
  await teacherCall.next('peer-joined');
  await studentPage.next('call-presence', presence(true, true));
  teacherCall.send(JSON.stringify({ type: 'media-state', audio: true, video: false, name: 'Анна Сергеевна' }));
  assert.equal((await studentCall.next('media-state')).from, 'teacher');

  // Another student of the class waits; the same browser moves the call to its new tab.
  const intruder = connect(callRoute('student'), otherStudent);
  assert.equal(await intruder.closed, 4003);
  const studentTab = connect(callRoute('student'), student);
  await studentTab.next('connected');
  assert.equal(await studentCall.closed, 4001);
  studentTab.send(JSON.stringify({ type: 'media-state', audio: false, video: true }));
  assert.equal((await teacherCall.next('media-state')).from, 'guest');

  // Only the teacher ends the call, for both participants.
  assert.equal((await request(`/api/sessions/${lesson.id}/call/end`, student, 'POST')).status, 401);
  assert.equal((await request(`/api/sessions/${otherLesson.id}/call/end`, teacherCookie, 'POST')).status, 200);
  assert.equal((await request(`/api/sessions/${lesson.id}/call/end`, teacherCookie, 'POST')).status, 200);
  await studentTab.next('call-ended');
  assert.deepEqual(await Promise.all([teacherCall.closed, studentTab.closed]), [4000, 4000]);
  await teacherPage.next('call-presence', presence(false, false));

  // Cancelling the session ends its call and closes the way back in.
  const rejoined = connect(callRoute('teacher'), teacherCookie);
  await rejoined.next('connected');
  const cancel = await fetch(`${base}/api/sessions/${lesson.id}`, { method: 'PATCH',
    headers: { Cookie: teacherCookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
  assert.equal(cancel.status, 200);
  assert.equal(await rejoined.closed, 4000);
  await rejected(connect(callRoute('teacher'), teacherCookie));
  assert.equal((await request(`/api/sessions/${lesson.id}/call?role=teacher`, teacherCookie)).status, 403);

  // Clearing the schedule ends the calls of the remaining sessions.
  const otherCall = connect(callRoute('teacher', otherLesson.id), teacherCookie);
  await otherCall.next('connected');
  assert.equal((await request('/api/sessions', teacherCookie, 'DELETE')).status, 200);
  assert.equal(await otherCall.closed, 4000);
});
