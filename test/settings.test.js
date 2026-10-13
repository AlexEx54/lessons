'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { createSession } = require('../lib/session-store.js');
const { createUser } = require('../lib/user-store.js');

const ROOT = path.join(__dirname, '..');
const WEBP = Buffer.concat([Buffer.from('RIFF\x00\x00\x00\x00WEBPVP8 ', 'binary'), Buffer.alloc(16)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(16)]);

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

async function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-settings-'));
  const database = openDatabase(path.join(directory, 'app.sqlite'));
  const user = createUser({ email: 'teacher@example.com', displayName: 'Анна', passwordHash: '' }, database);
  const { token } = createSession(user.id, database);
  database.close();
  const baseUrl = await startServer(t, directory);
  const cookie = `teach_session=${token}`;
  const call = (pathname, options = {}) => fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: { Cookie: cookie, ...options.headers },
  });
  return { baseUrl, call, avatarsDirectory: path.join(directory, 'avatars') };
}

function patchProfile(call, body) {
  return call('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('settings page is available to teachers only', async t => {
  const { baseUrl, call } = await setup(t);

  const guest = await fetch(`${baseUrl}/settings`, { redirect: 'manual' });
  assert.equal(guest.status, 302);
  assert.equal(guest.headers.get('location'), '/login?next=%2Fsettings');
  assert.equal((await fetch(`${baseUrl}/api/profile`, { method: 'PATCH' })).status, 401);

  const page = await call('/settings');
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /<a class="nav-item nav-item--active" href="\/settings" aria-current="page">/);
  assert.match(html, /id="settings-form"/);
  assert.match(html, /src="\/assets\/images\/teacher-avatar-transparent\.webp" alt="" width="62" height="62" data-user-avatar/);
});

test('teacher changes name and default avatar', async t => {
  const { call } = await setup(t);

  const initial = (await (await call('/api/auth/me')).json()).user;
  assert.equal(initial.defaultAvatar, 'female');
  assert.equal(initial.customAvatarUrl, null);
  assert.equal(initial.avatarUrl, '/assets/images/teacher-avatar-transparent.webp');

  for (const body of [
    { displayName: '   ', defaultAvatar: 'male' },
    { displayName: 'x'.repeat(81), defaultAvatar: 'male' },
    { displayName: 'Иван', defaultAvatar: 'robot' },
  ]) {
    assert.equal((await patchProfile(call, body)).status, 400);
  }

  const saved = await patchProfile(call, { displayName: '  Иван {{SUPPORT_URL}}  ', defaultAvatar: 'male' });
  assert.equal(saved.status, 200);
  const { user } = await saved.json();
  assert.equal(user.displayName, 'Иван {{SUPPORT_URL}}');
  assert.equal(user.avatarUrl, '/assets/images/teacher-avatar-male.webp');

  const html = await (await call('/app')).text();
  assert.match(html, /<strong data-user-name>Иван \{\{SUPPORT_URL\}\}<\/strong>/);
  assert.match(html, /src="\/assets\/images\/teacher-avatar-male\.webp"/);
});

test('teacher uploads, replaces and removes an avatar photo', async t => {
  const { baseUrl, call, avatarsDirectory } = await setup(t);
  const upload = (body, type) => call('/api/profile/avatar', { method: 'PUT', headers: { 'Content-Type': type }, body });

  assert.equal((await upload(WEBP, 'image/gif')).status, 415);
  assert.equal((await upload(PNG, 'image/webp')).status, 415);

  const first = await upload(WEBP, 'image/webp');
  assert.equal(first.status, 200);
  const firstUrl = (await first.json()).user.avatarUrl;
  assert.match(firstUrl, /^\/api\/avatars\/[a-f0-9-]{36}\.webp$/);

  const served = await fetch(`${baseUrl}${firstUrl}`);
  assert.equal(served.status, 200);
  assert.equal(served.headers.get('content-type'), 'image/webp');
  assert.match(served.headers.get('cache-control'), /immutable/);
  assert.deepEqual(Buffer.from(await served.arrayBuffer()), WEBP);

  const second = await upload(PNG, 'image/png');
  const secondUser = (await second.json()).user;
  assert.match(secondUser.customAvatarUrl, /\.png$/);
  assert.equal((await fetch(`${baseUrl}${firstUrl}`)).status, 404);
  assert.equal(fs.readdirSync(avatarsDirectory).length, 1);

  const removed = await call('/api/profile/avatar', { method: 'DELETE' });
  const removedUser = (await removed.json()).user;
  assert.equal(removedUser.customAvatarUrl, null);
  assert.equal(removedUser.avatarUrl, '/assets/images/teacher-avatar-transparent.webp');
  assert.equal(fs.readdirSync(avatarsDirectory).length, 0);

  assert.equal((await fetch(`${baseUrl}/api/avatars/..%2Fapp.sqlite`)).status, 404);
});
