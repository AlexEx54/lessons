'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { hashPassword, verifyPassword } = require('../lib/password.js');
const { createSession, findUserBySessionToken } = require('../lib/session-store.js');
const { createUser, findUserByEmail } = require('../lib/user-store.js');

test('auth migration is repeatable and creates the expected tables', () => {
  const database = openDatabase(':memory:');
  assert.deepEqual(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name),
    ['schema_migrations', 'sessions', 'users'],
  );
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 1);
  database.close();
});

test('password hashing accepts the correct password and rejects another one', async () => {
  const encoded = await hashPassword('long-password-123');
  assert.equal(await verifyPassword('long-password-123', encoded), true);
  assert.equal(await verifyPassword('wrong-password', encoded), false);
});

test('users are normalized and can be resolved through a session', async () => {
  const database = openDatabase(':memory:');
  const user = createUser({
    email: '  Teacher@Example.COM ',
    displayName: 'Мария',
    passwordHash: await hashPassword('long-password-123'),
  }, database);

  assert.equal(user.email, 'teacher@example.com');
  assert.equal(findUserByEmail('TEACHER@example.com', database).id, user.id);
  assert.throws(() => createUser({
    email: 'teacher@example.com',
    displayName: 'Дубликат',
    passwordHash: 'unused',
  }, database), /UNIQUE/);

  const session = createSession(user.id, database);
  assert.deepEqual(findUserBySessionToken(session.token, database), user);
  database.close();
});
