'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { listNotifications } = require('../lib/notification-store.js');
const { createSession } = require('../lib/session-store.js');
const { listSupportMessages, listSupportThreads, postSupportReply, postTeacherMessage } = require('../lib/support-store.js');
const { createUser, publicUser } = require('../lib/user-store.js');

const ROOT = path.join(__dirname, '..');

function addUser(database, email, displayName, role = 'teacher') {
  return createUser({ email, displayName, passwordHash: '', role }, database);
}

test('a teacher question is stored in their thread and rings the bell of every active admin', () => {
  const database = openDatabase(':memory:');
  const teacher = addUser(database, 'anna@example.com', 'Анна');
  const admin = addUser(database, 'admin@example.com', 'Админ', 'admin');
  const blocked = addUser(database, 'blocked@example.com', 'Бывший админ', 'admin');
  database.prepare("UPDATE users SET status = 'blocked' WHERE id = ?").run(blocked.id);

  const { message, created } = postTeacherMessage(teacher, { clientId: randomUUID(), text: '  Как   добавить\nученика?  ' }, database);
  assert.equal(created, true);
  assert.equal(message.sender, 'teacher');
  assert.equal(message.text, 'Как   добавить\nученика?');
  assert.deepEqual(listSupportMessages(teacher.id, {}, database), [message]);

  const { notifications } = listNotifications(admin.id, database);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].type, 'support_question');
  assert.equal(notifications[0].subjectKey, `support:${teacher.id}`);
  assert.deepEqual(notifications[0].payload, { teacherId: teacher.id, teacherName: 'Анна', preview: 'Как добавить ученика?' });
  assert.equal(listNotifications(blocked.id, database).unreadCount, 0);
  assert.equal(listNotifications(teacher.id, database).unreadCount, 0);
});

test('a repeated send is not stored twice and an admin writing for themself is not notified', () => {
  const database = openDatabase(':memory:');
  const admin = addUser(database, 'admin@example.com', 'Админ', 'admin');
  const clientId = randomUUID();

  const first = postTeacherMessage(admin, { clientId, text: 'Проверка' }, database);
  const again = postTeacherMessage(admin, { clientId, text: 'Проверка' }, database);
  assert.equal(again.created, false);
  assert.deepEqual(again.message, first.message);
  assert.equal(listSupportMessages(admin.id, {}, database).length, 1);
  assert.equal(listNotifications(admin.id, database).unreadCount, 0);
});

test('long previews are shortened and the thread can be read from a position', () => {
  const database = openDatabase(':memory:');
  const teacher = addUser(database, 'anna@example.com', 'Анна');
  const admin = addUser(database, 'admin@example.com', 'Админ', 'admin');
  const first = postTeacherMessage(teacher, { clientId: randomUUID(), text: 'а'.repeat(500) }, database).message;
  const longPreview = listNotifications(admin.id, database).notifications[0].payload.preview;
  assert.equal(longPreview, `${'а'.repeat(139)}…`);

  const second = postTeacherMessage(teacher, { clientId: randomUUID(), text: 'Ещё вопрос' }, database).message;
  assert.deepEqual(listSupportMessages(teacher.id, { after: first.id }, database), [second]);
  assert.equal(listNotifications(admin.id, database).notifications[0].payload.preview, 'Ещё вопрос');
});

test('reading from a position continues in order instead of jumping to the latest messages', () => {
  const database = openDatabase(':memory:');
  const teacher = addUser(database, 'anna@example.com', 'Анна');
  const ids = Array.from({ length: 202 }, (_, index) => (
    postTeacherMessage(teacher, { clientId: randomUUID(), text: `Сообщение ${index}` }, database).message.id
  ));
  const read = after => listSupportMessages(teacher.id, { after }, database).map(message => message.id);

  assert.deepEqual(read(0), ids.slice(2));
  assert.deepEqual(read(ids[0]), ids.slice(1, 201));
  assert.deepEqual(read(ids[200]), ids.slice(201));
});

test('a support reply lands in the teacher thread, rings their bell and settles the question for every admin', () => {
  const database = openDatabase(':memory:');
  const teacher = addUser(database, 'anna@example.com', 'Анна');
  const admin = addUser(database, 'admin@example.com', 'Админ', 'admin');
  const colleague = addUser(database, 'second@example.com', 'Второй админ', 'admin');
  postTeacherMessage(teacher, { clientId: randomUUID(), text: 'Как добавить ученика?' }, database);
  assert.equal(listNotifications(colleague.id, database).unreadCount, 1);

  const clientId = randomUUID();
  const { message, created } = postSupportReply(admin, teacher.id, { clientId, text: 'Откройте «Классы»  и нажмите «Добавить».' }, database);
  assert.equal(created, true);
  assert.equal(message.sender, 'support');
  assert.equal(listSupportMessages(teacher.id, {}, database).at(-1).id, message.id);
  assert.equal(database.prepare('SELECT author_id FROM support_messages WHERE id = ?').get(message.id).author_id, admin.id);
  assert.equal(postSupportReply(admin, teacher.id, { clientId, text: 'Повтор' }, database).created, false);

  const { notifications, unreadCount } = listNotifications(teacher.id, database);
  assert.equal(unreadCount, 1);
  assert.equal(notifications[0].type, 'support_reply');
  assert.equal(notifications[0].subjectKey, `support:${teacher.id}`);
  assert.deepEqual(notifications[0].payload, { preview: 'Откройте «Классы» и нажмите «Добавить».' });
  assert.equal(listNotifications(admin.id, database).unreadCount, 0);
  assert.equal(listNotifications(colleague.id, database).unreadCount, 0);

  assert.throws(() => postSupportReply(admin, randomUUID(), { clientId: randomUUID(), text: 'Кому?' }, database), { statusCode: 404 });
});

test('the inbox lists one row per teacher, those waiting for an answer first', () => {
  const database = openDatabase(':memory:');
  const anna = addUser(database, 'anna@example.com', 'Анна');
  const boris = addUser(database, 'boris@example.com', '');
  const vera = addUser(database, 'vera@example.com', 'Вера');
  const admin = addUser(database, 'admin@example.com', 'Админ', 'admin');
  addUser(database, 'silent@example.com', 'Молчит');
  const write = (teacher, text) => postTeacherMessage(teacher, { clientId: randomUUID(), text }, database);
  write(anna, 'Первый вопрос');
  write(boris, 'Вопрос Бориса');
  write(vera, 'Вопрос Веры');
  write(anna, 'Второй вопрос');
  postSupportReply(admin, vera.id, { clientId: randomUUID(), text: 'Готово' }, database);

  const threads = listSupportThreads(database);
  assert.deepEqual(threads.map(thread => [thread.teacherName, thread.preview, thread.waiting]), [
    ['Анна', 'Второй вопрос', true],
    ['boris@example.com', 'Вопрос Бориса', true],
    ['Вера', 'Готово', false],
  ]);
  assert.equal(threads[0].teacherId, anna.id);
  assert.equal(threads[0].teacherEmail, 'anna@example.com');
});

test('empty, oversized and unidentified messages are rejected', () => {
  const database = openDatabase(':memory:');
  const teacher = addUser(database, 'anna@example.com', 'Анна');
  const send = input => () => postTeacherMessage(teacher, input, database);

  assert.throws(send({ clientId: 'nope', text: 'Привет' }), { statusCode: 400 });
  assert.throws(send({ clientId: randomUUID(), text: '   ' }), { statusCode: 400, message: 'Напишите сообщение.' });
  assert.throws(send({ clientId: randomUUID(), text: 'а'.repeat(2001) }), { statusCode: 400 });
  assert.doesNotThrow(send({ clientId: randomUUID(), text: 'а'.repeat(2000) }));
});

async function startServer(t, directory) {
  const port = 21000 + Math.floor(Math.random() * 10000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, APP_DB_PATH: path.join(directory, 'app.sqlite'), HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(directory, { recursive: true, force: true });
  });
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return baseUrl;
    } catch {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Server did not become ready.');
}

test('the support API keeps each teacher to their own thread', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-support-'));
  const database = openDatabase(path.join(directory, 'app.sqlite'));
  const anna = addUser(database, 'anna@example.com', 'Анна');
  const boris = addUser(database, 'boris@example.com', 'Борис');
  postTeacherMessage(publicUser(boris), { clientId: randomUUID(), text: 'Вопрос Бориса' }, database);
  const { token } = createSession(anna.id, database);
  database.close();
  const baseUrl = await startServer(t, directory);
  const call = (pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { Cookie: `teach_session=${token}`, 'Content-Type': 'application/json', ...options.headers },
  });
  const post = (body, pathname = '/api/support/messages') => call(pathname, { method: 'POST', body: JSON.stringify(body) });

  assert.equal((await fetch(`${baseUrl}/api/support/messages`)).status, 401);
  assert.deepEqual(await (await call('/api/support/messages')).json(), { messages: [] });
  assert.equal((await call('/api/support/messages?after=-1')).status, 400);
  assert.equal((await call('/api/support/messages', { method: 'POST', body: '{' })).status, 400);
  assert.equal((await post({ clientId: randomUUID(), text: '' })).status, 400);

  const clientId = randomUUID();
  const created = await post({ clientId, text: 'Где расписание?' });
  assert.equal(created.status, 201);
  const { message } = await created.json();
  assert.equal(message.text, 'Где расписание?');
  assert.equal((await post({ clientId, text: 'Где расписание?' })).status, 200);

  const { messages } = await (await call('/api/support/messages')).json();
  assert.deepEqual(messages, [message]);
  assert.deepEqual(await (await call(`/api/support/messages?after=${message.id}`)).json(), { messages: [] });

  assert.equal((await call('/api/support/threads')).status, 403);
  assert.equal((await call(`/api/support/threads/${boris.id}/messages`)).status, 403);
  assert.equal((await post({ clientId: randomUUID(), text: 'Ответ' }, `/api/support/threads/${boris.id}/messages`)).status, 403);
});

test('admins see the inbox and answer a teacher in their thread', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-support-'));
  const database = openDatabase(path.join(directory, 'app.sqlite'));
  const anna = addUser(database, 'anna@example.com', 'Анна');
  const admin = addUser(database, 'admin@example.com', 'Админ', 'admin');
  const question = postTeacherMessage(publicUser(anna), { clientId: randomUUID(), text: 'Где расписание?' }, database).message;
  const { token } = createSession(admin.id, database);
  database.close();
  const baseUrl = await startServer(t, directory);
  const call = (pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { Cookie: `teach_session=${token}`, 'Content-Type': 'application/json' },
  });
  const thread = `/api/support/threads/${anna.id}/messages`;

  const { threads } = await (await call('/api/support/threads')).json();
  assert.deepEqual(threads.map(item => [item.teacherId, item.waiting]), [[anna.id, true]]);
  assert.deepEqual((await (await call(thread)).json()).messages, [question]);
  assert.equal((await call(`${thread}?after=x`)).status, 400);

  const replied = await call(thread, { method: 'POST', body: JSON.stringify({ clientId: randomUUID(), text: 'Слева в меню.' }) });
  assert.equal(replied.status, 201);
  const { message } = await replied.json();
  assert.equal(message.sender, 'support');
  assert.deepEqual((await (await call(`${thread}?after=${question.id}`)).json()).messages, [message]);
  assert.equal((await (await call('/api/support/threads')).json()).threads[0].waiting, false);
  assert.equal((await call(`/api/support/threads/${randomUUID()}/messages`, { method: 'POST', body: JSON.stringify({ clientId: randomUUID(), text: 'Кому?' }) })).status, 404);
});
