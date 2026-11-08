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
const { MAX_SESSION } = require('../lib/session-chat.js');

// The engine itself is covered by video-call-chat.test.js; this checks what the session adds.
test('session chat: class access, server-side names, delivery over the lesson socket, files and cleanup', { timeout: 20000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'session-chat-'));
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
  const teacher = createUser({ email: 'chat@test.local', displayName: 'Анна Сергеевна', role: 'teacher', passwordHash: 'unused' }, db);
  const teacherCookie = `teach_session=${createSession(teacher.id, db).token}`;
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'")
    .run(JSON.stringify(syntheticLesson()));
  const makeSession = className => createClassSession({ className, lessonId: 'superhero', expectedRevision: 1,
    requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00.000Z' }, teacher.id, db);
  const lesson = makeSession('Маша'), otherLesson = makeSession('Петя');

  const probe = require('node:net').createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', env: { ...process.env,
    APP_DB_PATH: databasePath, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test' } });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(base + '/health')).ok) break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 20));
  }

  const request = (route, cookie, options = {}) => fetch(base + route, { redirect: 'manual', ...options,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
  const send = (role, cookie, body, id = lesson.id) => request(`/api/sessions/${id}/chat?role=${role}`, cookie, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: crypto.randomUUID(), ...body }) });
  const upload = (role, cookie, body) => request(`/api/sessions/${lesson.id}/chat/attachments?role=${role}&name=plan.txt`, cookie, { method: 'POST', body });
  const student = (await request(lesson.sessionInvitePath)).headers.get('set-cookie').split(';')[0];
  function connect(route, cookie) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}${route}`, { headers: { Cookie: cookie, Origin: base } });
    sockets.push(socket);
    const messages = [];
    socket.on('message', raw => messages.push(JSON.parse(raw)));
    socket.next = async type => {
      for (const deadline = Date.now() + 2000; Date.now() < deadline;) {
        const index = messages.findIndex(message => message.type === type);
        if (index >= 0) return messages.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error(`Timed out waiting for ${type}`);
    };
    return socket;
  }

  // Each side enters only with its own access, and only this class's session.
  assert.equal((await request(`/api/sessions/${lesson.id}/chat?role=student`)).status, 403);
  assert.equal((await request(`/api/sessions/${lesson.id}/chat?role=teacher`, student)).status, 403);
  assert.equal((await request(`/api/sessions/${lesson.id}/chat`, teacherCookie)).status, 403);
  assert.equal((await request(`/api/sessions/${otherLesson.id}/chat?role=student`, student)).status, 403);

  // The server names both sides, and the open lesson pages receive new messages.
  const teacherPage = connect(`/ws/sessions/${lesson.id}?role=teacher`, teacherCookie);
  await teacherPage.next('snapshot');
  const sent = await send('student', student, { text: 'Здравствуйте!', name: 'Подмена' });
  assert.equal(sent.status, 201);
  const { message } = await sent.json();
  assert.deepEqual([message.role, message.name], ['student', 'Маша']);
  assert.deepEqual((await teacherPage.next('chat-message')).message, message);
  const answer = await (await send('teacher', teacherCookie, { text: 'Добрый день' })).json();
  assert.deepEqual([answer.message.role, answer.message.name], ['teacher', 'Анна Сергеевна']);
  const history = await (await request(`/api/sessions/${lesson.id}/chat?role=student`, student)).json();
  assert.deepEqual(history.messages.map(item => item.text), ['Здравствуйте!', 'Добрый день']);
  assert.deepEqual((await (await request(`/api/sessions/${otherLesson.id}/chat?role=teacher`, teacherCookie)).json()).messages, []);

  // Files sent by one side open for the other; the session has its own quota.
  const file = await (await upload('teacher', teacherCookie, 'план')).json();
  assert.equal((await send('teacher', teacherCookie, { attachments: [file.id] })).status, 201);
  assert.equal(await (await request(`/api/sessions/${lesson.id}/chat/attachments/${file.id}?role=student`, student)).text(), 'план');
  db.prepare('UPDATE class_session_attachments SET size = ? WHERE id = ?').run(MAX_SESSION, file.id);
  const overQuota = await upload('student', student, 'a');
  assert.equal(overQuota.status, 413);
  assert.match((await overQuota.json()).error, /100 МБ/);

  // The chat goes with its session: a cancelled one closes, a cleared schedule removes messages and files.
  const cancel = await request(`/api/sessions/${otherLesson.id}`, teacherCookie, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
  assert.equal(cancel.status, 200);
  assert.equal((await request(`/api/sessions/${otherLesson.id}/chat?role=teacher`, teacherCookie)).status, 403);
  const files = path.join(directory, 'session-chat-files', lesson.id);
  assert.equal(fs.existsSync(path.join(files, file.id)), true);
  assert.equal((await request('/api/sessions', teacherCookie, { method: 'DELETE' })).status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM class_session_messages').get().n, 0);
  assert.equal(fs.existsSync(files), false);
});
