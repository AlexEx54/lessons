'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { hashPassword } = require('../lib/password.js');
const { createUser } = require('../lib/user-store.js');

const ROOT = path.join(__dirname, '..');

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch (_error) {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Server did not become ready.');
}

async function startServer(t, databasePath, env = {}) {
  const port = 21000 + Math.floor(Math.random() * 10000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      APP_DB_PATH: databasePath,
      HOST: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'test',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(path.dirname(databasePath), { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);
  return baseUrl;
}

test('login protects teacher pages and exposes the current profile', async t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-auth-'));
  const databasePath = path.join(temporaryDirectory, 'app.sqlite');
  const database = openDatabase(databasePath);
  createUser({
    email: 'teacher@example.com',
    displayName: 'Тестовый преподаватель',
    passwordHash: await hashPassword('correct-password'),
  }, database);
  database.close();
  const baseUrl = await startServer(t, databasePath);

  const health = await fetch(`${baseUrl}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });

  const publicLanding = await fetch(`${baseUrl}/`);
  assert.equal(publicLanding.status, 200);
  const landingHtml = await publicLanding.text();
  assert.match(landingHtml, /data-auth-form="register"/);
  assert.match(landingHtml, /data-auth-form="login"/);
  const guestLibrary = await fetch(`${baseUrl}/library.html`, { redirect: 'manual' });
  assert.equal(guestLibrary.status, 302);
  assert.equal(guestLibrary.headers.get('location'), '/?auth=register&next=%2Flibrary.html');
  const hiddenEnvironment = await fetch(`${baseUrl}/.env`);
  assert.equal(hiddenEnvironment.status, 404);

  const appWithoutSession = await fetch(`${baseUrl}/app`, { redirect: 'manual' });
  assert.equal(appWithoutSession.status, 302);
  assert.equal(appWithoutSession.headers.get('location'), '/login?next=%2Fapp');

  const invalidRegistrations = [
    { displayName: '', email: 'new@example.com', password: 'valid-password', termsAccepted: true },
    { displayName: 'x'.repeat(81), email: 'new@example.com', password: 'valid-password', termsAccepted: true },
    { displayName: 'Новый преподаватель', email: 'invalid-email', password: 'valid-password', termsAccepted: true },
    { displayName: 'Новый преподаватель', email: 'new@example.com', password: 'short', termsAccepted: true },
    { displayName: 'Новый преподаватель', email: 'new@example.com', password: 'valid-password', termsAccepted: false },
  ];
  for (const registrationBody of invalidRegistrations) {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registrationBody),
    });
    assert.equal(response.status, 400);
  }

  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: '  Новый преподаватель  ',
      email: '  New@Example.COM ',
      password: 'valid-password',
      termsAccepted: true,
    }),
  });
  assert.equal(registration.status, 201);
  const registeredUser = (await registration.json()).user;
  assert.equal(registeredUser.displayName, 'Новый преподаватель');
  assert.equal(registeredUser.email, 'new@example.com');
  assert.equal(registeredUser.role, 'teacher');
  const registrationCookie = registration.headers.get('set-cookie').split(';')[0];
  assert.match(registrationCookie, /^teach_session=/);

  const registeredProfile = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Cookie: registrationCookie },
  });
  assert.equal(registeredProfile.status, 200);
  assert.equal((await registeredProfile.json()).user.id, registeredUser.id);

  const registeredApp = await fetch(`${baseUrl}/app`, { headers: { Cookie: registrationCookie } });
  assert.equal(registeredApp.status, 200);
  assert.match(await registeredApp.text(), /Новый преподаватель/);

  const duplicateRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      displayName: 'Дубликат',
      email: 'NEW@example.com',
      password: 'another-password',
      termsAccepted: true,
    }),
  });
  assert.equal(duplicateRegistration.status, 409);
  assert.equal(duplicateRegistration.headers.get('set-cookie'), null);

  const registrationDatabase = openDatabase(databasePath);
  assert.equal(
    registrationDatabase.prepare('SELECT COUNT(*) AS count FROM users WHERE email = ?').get('new@example.com').count,
    1,
  );
  assert.equal(
    registrationDatabase.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(registeredUser.id).count,
    1,
  );
  registrationDatabase.close();

  const invalidLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teacher@example.com', password: 'incorrect-password' }),
  });
  assert.equal(invalidLogin.status, 401);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'TEACHER@example.com', password: 'correct-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(cookie, /^teach_session=/);

  const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } });
  assert.equal(me.status, 200);
  const currentUser = (await me.json()).user;
  assert.equal(currentUser.displayName, 'Тестовый преподаватель');
  assert.equal(currentUser.role, 'teacher');

  const app = await fetch(`${baseUrl}/app`, { headers: { Cookie: cookie } });
  assert.equal(app.status, 200);
  assert.match(await app.text(), /Тестовый преподаватель/);

  const authenticatedLibrary = await fetch(`${baseUrl}/library.html`, { headers: { Cookie: cookie } });
  assert.match(await authenticatedLibrary.text(), /Тестовый преподаватель/);

  const homeContent = await fetch(`${baseUrl}/api/home-content`, { headers: { Cookie: cookie } });
  assert.equal(homeContent.status, 200);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
});

test('yandex login redirects with a state cookie and rejects forged callbacks', async t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-yandex-'));
  const baseUrl = await startServer(t, path.join(temporaryDirectory, 'app.sqlite'), {
    YANDEX_CLIENT_ID: 'client-id',
    YANDEX_CLIENT_SECRET: 'client-secret',
    YANDEX_REDIRECT_URI: 'https://easyclass.test/api/auth/yandex/callback',
  });

  const start = await fetch(`${baseUrl}/api/auth/yandex?next=%2Fschedule`, { redirect: 'manual' });
  assert.equal(start.status, 302);
  const authorizeUrl = new URL(start.headers.get('location'));
  assert.equal(authorizeUrl.origin, 'https://oauth.yandex.ru');
  const state = authorizeUrl.searchParams.get('state');
  assert.match(state, /^[\w-]{32}$/);
  const stateCookie = start.headers.get('set-cookie');
  assert.match(stateCookie, /HttpOnly/);
  assert.match(stateCookie, /Path=\/api\/auth\/yandex/);
  assert.equal(decodeURIComponent(stateCookie.split(';')[0]), `yandex_oauth_state=${state} /schedule`);
  const cookie = stateCookie.split(';')[0];

  const unsafeNext = await fetch(`${baseUrl}/api/auth/yandex?next=%2F%2Fevil.example`, { redirect: 'manual' });
  assert.match(decodeURIComponent(unsafeNext.headers.get('set-cookie')), /^yandex_oauth_state=[\w-]+ \/app;/);

  const forged = await fetch(`${baseUrl}/api/auth/yandex/callback?code=x&state=forged`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });
  assert.equal(forged.headers.get('location'), '/login?error=yandex_failed');
  assert.match(forged.headers.get('set-cookie'), /Max-Age=0/);

  const withoutCookie = await fetch(`${baseUrl}/api/auth/yandex/callback?code=x&state=${state}`, { redirect: 'manual' });
  assert.equal(withoutCookie.headers.get('location'), '/login?error=yandex_failed');

  const denied = await fetch(`${baseUrl}/api/auth/yandex/callback?error=access_denied&state=${state}`, {
    headers: { Cookie: cookie },
    redirect: 'manual',
  });
  assert.equal(denied.headers.get('location'), '/login?error=yandex_denied');

  const loginPage = await fetch(`${baseUrl}/login`);
  assert.match(await loginPage.text(), /href="\/api\/auth\/yandex"/);
});
