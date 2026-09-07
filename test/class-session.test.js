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
const { createClass } = require('../lib/class-store.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { applyAction, authorizeClass, joinClass, sessionPayload } = require('../lib/class-session-store.js');

test('live class: guest authorization, actions, isolation, tab replacement and restart recovery', { timeout: 20000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'class-session-'));
  const databasePath = path.join(directory, 'app.sqlite');
  const db = openDatabase(databasePath);
  let server;
  const sockets = [];
  const stop = async () => {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  };
  t.after(async () => { sockets.forEach(socket => socket.terminate()); await stop(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const teacher = createUser({ email: 'live@test.local', displayName: 'Teacher', role: 'teacher', passwordHash: 'unused' }, db);
  const teacherCookie = `teach_session=${createSession(teacher.id, db).token}`;
  const content = createSyntheticLesson('Live lesson');
  const publicAsset = `${'c'.repeat(64)}.png`, privateAsset = `${'d'.repeat(64)}.png`, leadAsset = `${'e'.repeat(64)}.png`;
  const choice = content.stages[0].content.find(component => component.type === 'thisOrThat');
  choice.items[0].options[0].imageSrc = `/api/library/superhero/assets/${publicAsset}`;
  content.stages[1].content.find(c => c.type === 'illustratedTextPanel').leadingPicture.imageSrc = `/api/library/superhero/assets/${leadAsset}`;
  content.stages[1].content.push({ type: 'teacherNote', id: 'private-note', text: `/api/library/superhero/assets/${privateAsset}` });
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(content));
  for (const name of [publicAsset, privateAsset, leadAsset]) db.prepare('INSERT INTO library_assets VALUES (?, ?, ?)').run('superhero', name, Buffer.from('image'));
  const makeClass = () => createClass({ name: 'Live test', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID() }, teacher.id, db);
  const lesson = makeClass(), otherLesson = makeClass();
  const probe = require('node:net').createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  async function start() {
    server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, APP_DB_PATH: databasePath, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test' }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Server did not start');
  }
  const get = (route, cookie) => fetch(base + route, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  async function guest() {
    const response = await get(lesson.invitePath);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `${lesson.lessonPath}/student`);
    const header = response.headers.get('set-cookie');
    assert.match(header, /HttpOnly; SameSite=Lax/);
    return header.split(';')[0];
  }
  function connect(role, cookie, id = lesson.id, origin = base) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/classes/${id}?role=${role}`, { headers: { Cookie: cookie || '', Origin: origin } });
    sockets.push(socket);
    const messages = [], waiters = [];
    socket.on('message', raw => {
      const message = JSON.parse(raw);
      const index = waiters.findIndex(waiter => waiter.type === message.type);
      if (index < 0) messages.push(message);
      else { const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    });
    socket.next = type => {
      const index = messages.findIndex(message => message.type === type);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve, timer: setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2000) };
        waiters.push(waiter);
      });
    };
    return socket;
  }
  await start();
  const cookie = await guest(), secondCookie = await guest();
  const repeat = await get(lesson.invitePath, cookie);
  assert.equal(repeat.headers.get('set-cookie'), null);
  assert.equal((await get(`${lesson.lessonPath}/student`, cookie)).status, 200);
  assert.equal((await get(`${lesson.lessonPath}/student`)).status, 403);
  assert.equal((await get(`/api/classes/${lesson.id}/live?role=student`)).status, 403);
  assert.equal((await get(`/api/classes/${otherLesson.id}/live?role=student`, cookie)).status, 403);
  assert.equal((await get(`/api/classes/${lesson.id}/live?role=teacher`, cookie)).status, 403);
  assert.equal((await get(`/api/classes/${lesson.id}`, cookie)).status, 401);
  const studentPayload = await (await get(`/api/classes/${lesson.id}/live?role=student`, cookie)).json();
  assert.deepEqual(studentPayload.lesson.content.stages[0].content.map(component => component.type), ['markdownCard', 'thisOrThat', 'taskPrompt']);
  assert.ok(studentPayload.lesson.content.stages.slice(2).every(stage => stage.content === null));
  assert.ok(!JSON.stringify(studentPayload).includes('teacherNote'));
  assert.equal((await get(`/api/classes/${lesson.id}/assets/${publicAsset}`, cookie)).status, 200);
  assert.equal((await get(`/api/classes/${lesson.id}/assets/${privateAsset}`, cookie)).status, 404);
  assert.equal((await get(`/api/classes/${lesson.id}/assets/${leadAsset}`, cookie)).status, 200);
  assert.equal((await get(`/api/classes/${otherLesson.id}/assets/${publicAsset}`, cookie)).status, 401);
  for (const [role, auth, origin] of [['teacher', cookie, base], ['student', '', base], ['student', cookie, 'https://evil.test']]) {
    const denied = connect(role, auth, lesson.id, origin);
    const error = await new Promise(resolve => denied.once('error', resolve));
    assert.match(error.message, /403/);
  }
  const teacherSocket = connect('teacher', teacherCookie);
  assert.equal((await teacherSocket.next('snapshot')).state.version, 0);
  const studentSocket = connect('student', cookie);
  await studentSocket.next('snapshot');
  const action = { type: 'select-option', stageId: 'warm-up', componentId: choice.id, itemId: choice.items[0].id, optionId: choice.items[0].options[0].id, expectedVersion: 0 };
  studentSocket.send(JSON.stringify(action));
  const first = (await teacherSocket.next('action')).state;
  assert.equal(first.version, 1);
  assert.equal(first.selections[choice.id][choice.items[0].id], action.optionId);
  assert.deepEqual((await studentSocket.next('action')).state, first);
  studentSocket.send(JSON.stringify(action));
  assert.equal((await studentSocket.next('action-error')).state.version, 1);
  studentSocket.send(JSON.stringify({ ...action, expectedVersion: 1, optionId: 'missing' }));
  assert.equal((await studentSocket.next('action-error')).state.version, 1);
  studentSocket.send(JSON.stringify({ type: 'select-stage', stageId: 'warm-up' }));
  assert.match((await studentSocket.next('action-error')).error, /преподаватель/);
  teacherSocket.send(JSON.stringify({ ...action, expectedVersion: 1 }));
  assert.match((await teacherSocket.next('action-error')).error, /ученик/);
  teacherSocket.send(JSON.stringify({ type: 'select-stage', stageId: 'reading', expectedVersion: 1 }));
  assert.match((await teacherSocket.next('action-error')).error, /недоступна/);
  const duplicate = connect('student', secondCookie);
  assert.equal((await once(duplicate, 'close'))[0], 4003);
  const replaced = once(studentSocket, 'close');
  const replacement = connect('student', cookie);
  assert.deepEqual((await replacement.next('snapshot')).state, first);
  assert.equal((await replaced)[0], 4001);
  replacement.send(JSON.stringify({ ...action, expectedVersion: 1, optionId: choice.items[0].options[1].id }));
  const second = (await replacement.next('action')).state;
  assert.equal(second.version, 2);
  assert.equal(second.selections[choice.id][choice.items[0].id], choice.items[0].options[1].id);
  assert.deepEqual((await teacherSocket.next('action')).state, second);
  // Persisted data contains current state, not an attempt log.
  assert.deepEqual(JSON.parse(db.prepare('SELECT state_json FROM class_live_state WHERE class_id = ?').get(lesson.id).state_json), second);
  const answersId = 'lead-in-suggested-answers-card';
  const sendTeacher = async action => {
    teacherSocket.send(JSON.stringify(action));
    const teacherMessage = await teacherSocket.next('action');
    const studentMessage = await replacement.next('action');
    assert.equal(studentMessage.actorRole, 'teacher');
    assert.deepEqual(studentMessage.state, teacherMessage.state);
    assert.ok(!JSON.stringify(studentMessage.lesson).includes('teacherNote'));
    return studentMessage;
  };
  const lead = await sendTeacher({ type: 'select-stage', stageId: 'lead-in', expectedVersion: 2 });
  assert.equal(lead.state.activeStageId, 'lead-in');
  assert.deepEqual(lead.lesson.content.stages[1].content.map(c => c.type), ['markdownCard', 'illustratedTextPanel', 'textPanel']);
  const visibility = { type: 'set-visibility', stageId: 'lead-in', componentId: answersId, visible: true, expectedVersion: 3 };
  replacement.send(JSON.stringify(visibility));
  assert.match((await replacement.next('action-error')).error, /преподаватель/);
  const shown = await sendTeacher(visibility);
  assert.ok(shown.lesson.content.stages[1].content.some(c => c.id === answersId));
  const hidden = await sendTeacher({ ...visibility, visible: false, expectedVersion: 4 });
  assert.ok(!JSON.stringify(hidden.lesson).includes(answersId));
  await sendTeacher({ ...visibility, expectedVersion: 5 });
  const back = await sendTeacher({ type: 'select-stage', stageId: 'warm-up', expectedVersion: 6 });
  assert.deepEqual(back.state.selections, second.selections);
  const final = await sendTeacher({ type: 'select-stage', stageId: 'lead-in', expectedVersion: 7 });
  assert.equal(final.state.visibleCards[answersId], true);
  sockets.forEach(socket => socket.terminate());
  await stop();
  await start();
  const restored = connect('student', cookie);
  const snapshot = await restored.next('snapshot');
  assert.deepEqual(snapshot.state, final.state);
  assert.ok(snapshot.lesson.content.stages[1].content.some(c => c.id === answersId));
  const access = authorizeClass({ headers: { cookie } }, lesson.id, db, 'student');
  assert.throws(() => applyAction(access, { ...action, expectedVersion: 2, stageId: 'lead-in' }, db), { statusCode: 409 });
  const reordered = structuredClone(content);
  reordered.stages.reverse();
  db.prepare('UPDATE classes SET content_json = ? WHERE id = ?').run(JSON.stringify(reordered), otherLesson.id);
  const otherAccess = { role: 'teacher', classId: otherLesson.id, ownerId: teacher.id };
  assert.equal(sessionPayload(otherAccess, db).state.activeStageId, 'lead-in');
  applyAction(otherAccess, { type: 'select-stage', stageId: 'warm-up', expectedVersion: 0 }, db);
  const reorderedState = applyAction({ ...otherAccess, role: 'student' }, { ...action, expectedVersion: 1 }, db);
  assert.equal(reorderedState.selections[choice.id][choice.items[0].id], action.optionId);
  db.prepare("UPDATE classes SET status = 'completed' WHERE id = ?").run(lesson.id);
  assert.equal(authorizeClass({ headers: { cookie } }, lesson.id, db, 'student'), null);
  assert.throws(() => joinClass({ headers: {} }, lesson.invitePath.split('/').at(-1), db), { statusCode: 404 });
});
