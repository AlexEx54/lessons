'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { listNotifications, markNotificationRead, notify } = require('../lib/notification-store.js');
const { createSession } = require('../lib/session-store.js');
const { createUser } = require('../lib/user-store.js');

const ROOT = path.join(__dirname, '..');

function setupDatabase() {
  const database = openDatabase(':memory:');
  const admin = createUser({ email: 'admin@example.com', displayName: 'Админ', passwordHash: '', role: 'admin' }, database);
  const other = createUser({ email: 'other@example.com', displayName: 'Другой', passwordHash: '', role: 'admin' }, database);
  return { database, admin, other };
}

const question = preview => ({ type: 'support_question', subjectKey: 'support:teacher-1', payload: { preview } });

test('a new event on the same subject refreshes the one notification and makes it unread again', () => {
  const { database, admin } = setupDatabase();
  notify(admin.id, question('Первый вопрос'), database);
  markNotificationRead(admin.id, 'support:teacher-1', database);
  assert.equal(listNotifications(admin.id, database).unreadCount, 0);

  notify(admin.id, question('Второй вопрос'), database);
  const { notifications, unreadCount } = listNotifications(admin.id, database);
  assert.equal(unreadCount, 1);
  assert.equal(notifications.length, 1);
  assert.deepEqual(notifications[0].payload, { preview: 'Второй вопрос' });
  assert.equal(notifications[0].read, false);
});

test('notifications are listed newest first and belong to their recipient only', async () => {
  const { database, admin, other } = setupDatabase();
  notify(admin.id, { type: 'support_question', subjectKey: 'support:a', payload: {} }, database);
  await new Promise(resolve => setTimeout(resolve, 2));
  notify(admin.id, { type: 'support_question', subjectKey: 'support:b', payload: {} }, database);
  notify(other.id, { type: 'support_question', subjectKey: 'support:a', payload: {} }, database);

  markNotificationRead(other.id, 'support:a', database);
  const { notifications, unreadCount } = listNotifications(admin.id, database);
  assert.deepEqual(notifications.map(item => item.subjectKey), ['support:b', 'support:a']);
  assert.equal(unreadCount, 2);
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

test('the notifications API lists and marks read only the signed-in user notifications', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-notifications-'));
  const database = openDatabase(path.join(directory, 'app.sqlite'));
  const teacher = createUser({ email: 'teacher@example.com', displayName: 'Анна', passwordHash: '' }, database);
  notify(teacher.id, { type: 'support_reply', subjectKey: 'support:reply', payload: { preview: 'Ответ' } }, database);
  const { token } = createSession(teacher.id, database);
  database.close();
  const baseUrl = await startServer(t, directory);
  const call = (pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { Cookie: `teach_session=${token}`, 'Content-Type': 'application/json', ...options.headers },
  });

  assert.equal((await fetch(`${baseUrl}/api/notifications`)).status, 401);

  const listed = await (await call('/api/notifications')).json();
  assert.equal(listed.unreadCount, 1);
  assert.equal(listed.notifications[0].type, 'support_reply');

  assert.equal((await call('/api/notifications/read', { method: 'POST', body: '{}' })).status, 400);
  const read = await (await call('/api/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ subjectKey: 'support:reply' }),
  })).json();
  assert.equal(read.unreadCount, 0);
  assert.equal(read.notifications[0].read, true);
});
