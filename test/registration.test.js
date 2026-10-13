'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { hashPassword, verifyPassword } = require('../lib/password.js');
const { clientIp, createRateLimiter } = require('../lib/rate-limiter.js');
const {
  MAX_CODE_ATTEMPTS,
  confirmRegistration,
  createRegistrationCode,
  findPendingRegistration,
  findPendingRegistrationByToken,
  renewRegistrationCode,
  savePendingRegistration,
  secondsUntilResend,
} = require('../lib/registration-store.js');
const { createUser, findUserByEmail } = require('../lib/user-store.js');

async function pendingRegistration(database, overrides = {}) {
  const code = overrides.code || '123456';
  const token = savePendingRegistration({
    email: 'New.Teacher@Example.com',
    displayName: ' Анна ',
    passwordHash: await hashPassword('long-password-123'),
    code,
    ...overrides,
  }, database);
  return { token, code };
}

function userCount(database) {
  return database.prepare('SELECT COUNT(*) AS count FROM users').get().count;
}

test('registration codes are six digits', () => {
  for (let i = 0; i < 50; i += 1) assert.match(createRegistrationCode(), /^\d{6}$/);
});

test('a pending registration creates the user only after the right code', async () => {
  const database = openDatabase(':memory:');
  const { token, code } = await pendingRegistration(database);

  assert.equal(userCount(database), 0);
  const stored = findPendingRegistration('new.teacher@example.com', database);
  assert.equal(stored.display_name, 'Анна');
  assert.notEqual(stored.code_hash, code);
  assert.notEqual(stored.token_hash, token);

  assert.deepEqual(confirmRegistration(token, '000000', database), { error: 'invalid' });
  assert.equal(userCount(database), 0);

  const { user } = confirmRegistration(token, code, database);
  assert.equal(user.email, 'new.teacher@example.com');
  assert.equal(user.displayName, 'Анна');
  assert.equal(user.role, 'teacher');
  assert.equal(await verifyPassword('long-password-123', findUserByEmail(user.email, database).password_hash), true);
  assert.equal(findPendingRegistration(user.email, database), null);
  assert.deepEqual(confirmRegistration(token, code, database), { error: 'missing' });
  database.close();
});

test('the code is confirmed only with the token of the latest submission', async () => {
  const database = openDatabase(':memory:');
  const owner = await pendingRegistration(database, { code: '111111' });
  const intruder = await pendingRegistration(database, { code: '222222' });

  assert.deepEqual(confirmRegistration(owner.token, '222222', database), { error: 'missing' });
  assert.deepEqual(confirmRegistration('', '222222', database), { error: 'missing' });
  assert.ok(confirmRegistration(intruder.token, '222222', database).user);
  database.close();
});

test('too many wrong codes lock the code until a new one is sent', async () => {
  const database = openDatabase(':memory:');
  const { token, code } = await pendingRegistration(database);

  for (let attempt = 1; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    assert.deepEqual(confirmRegistration(token, '000000', database), { error: 'invalid' });
  }
  assert.deepEqual(confirmRegistration(token, '000000', database), { error: 'attempts' });
  assert.deepEqual(confirmRegistration(token, code, database), { error: 'attempts' });

  renewRegistrationCode(token, '654321', database);
  assert.deepEqual(confirmRegistration(token, code, database), { error: 'invalid' });
  assert.ok(confirmRegistration(token, '654321', database).user);
  database.close();
});

test('expired registrations are ignored and cleaned up on the next save', async () => {
  const database = openDatabase(':memory:');
  const { token, code } = await pendingRegistration(database);
  database.prepare('UPDATE pending_registrations SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());

  assert.equal(findPendingRegistration('new.teacher@example.com', database), null);
  assert.equal(findPendingRegistrationByToken(token, database), null);
  assert.deepEqual(confirmRegistration(token, code, database), { error: 'missing' });

  await pendingRegistration(database, { email: 'other@example.com' });
  assert.deepEqual(
    database.prepare('SELECT email FROM pending_registrations').all().map(row => row.email),
    ['other@example.com'],
  );
  database.close();
});

test('a code can be resent only after the cooldown', async () => {
  const database = openDatabase(':memory:');
  await pendingRegistration(database);
  const pending = findPendingRegistration('new.teacher@example.com', database);

  assert.equal(secondsUntilResend(null), 0);
  assert.ok(secondsUntilResend(pending) > 55 && secondsUntilResend(pending) <= 60);
  assert.equal(secondsUntilResend({ ...pending, sent_at: new Date(Date.now() - 61_000).toISOString() }), 0);
  database.close();
});

test('confirming fails cleanly when the email was registered meanwhile', async () => {
  const database = openDatabase(':memory:');
  const { token, code } = await pendingRegistration(database);
  createUser({ email: 'new.teacher@example.com', displayName: 'Яндекс', passwordHash: '' }, database);

  assert.deepEqual(confirmRegistration(token, code, database), { error: 'exists' });
  assert.equal(userCount(database), 1);
  database.close();
});

test('the rate limiter blocks a key after its limit until the window ends', () => {
  const limiter = createRateLimiter({ limit: 2, windowMs: 60_000 });
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), true);
  assert.equal(limiter.take('a'), false);
  assert.equal(limiter.take('b'), true);
});

test('client IP comes from X-Forwarded-For only on connections from the local proxy', () => {
  const request = (remoteAddress, forwarded) => ({
    socket: { remoteAddress },
    headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
  });
  assert.equal(clientIp(request('127.0.0.1', '203.0.113.7')), '203.0.113.7');
  assert.equal(clientIp(request('::1', 'spoofed, 203.0.113.7')), '203.0.113.7');
  assert.equal(clientIp(request('198.51.100.2', '203.0.113.7')), '198.51.100.2');
  assert.equal(clientIp(request('127.0.0.1')), '127.0.0.1');
});
