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

async function login(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('template two creation and editing update the answer key atomically', async t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-drafts-'));
  const databasePath = path.join(temporaryDirectory, 'app.sqlite');
  const database = openDatabase(databasePath);
  const password = 'correct-password';
  const passwordHash = await hashPassword(password);
  const firstAdmin = createUser({
    email: 'admin-one@example.com', displayName: 'Admin One', passwordHash, role: 'admin',
  }, database);
  createUser({
    email: 'admin-two@example.com', displayName: 'Admin Two', passwordHash, role: 'admin',
  }, database);
  createUser({
    email: 'teacher@example.com', displayName: 'Teacher', passwordHash,
  }, database);
  database.close();

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
      DRAFT_ASSETS_DIR: path.join(temporaryDirectory, 'draft-assets'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);


  const cookie = await login(baseUrl, 'admin-one@example.com', password);
  const otherCookie = await login(baseUrl, 'admin-two@example.com', password);
  const params = { topic: 'Superheroes', grammarTopic: 'Adjectives', template: 'template-2',
    ageGroup: '12-14', level: 'A2', model: 'google/gemini-3.7-flash', synthetic: true };
  const create = body => fetch(`${baseUrl}/api/lesson-drafts`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await create({ ...params, synthetic: false })).status, 400);
  const response = await create(params);
  assert.equal(response.status, 201);
  const draft = (await response.json()).draft;
  assert.equal(draft.template, 'template-2');
  assert.equal(draft.imageGeneration.total, 0);
  assert.ok(draft.content.stages.slice(1).every(s => s.content === null));
  const exercise = draft.content.stages[0].content[1];
  const endpoint = `${baseUrl}/api/lesson-drafts/${draft.id}/odd-one-out/${exercise.id}`;
  const patch = (body, auth = cookie) => fetch(endpoint, {
    method: 'PATCH', headers: { Cookie: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const changes = { title: exercise.title, instruction: exercise.instruction, items: exercise.items };
  assert.equal((await patch(changes, otherCookie)).status, 404);
  changes.items[0].options[3] = 'powerful';
  changes.items[0].answer = 'powerful';
  const savedResponse = await patch(changes);
  assert.equal(savedResponse.status, 200);
  const saved = (await savedResponse.json()).draft.content.stages[0].content;
  assert.equal(saved[1].items[0].answer, 'powerful');
  assert.match(saved[2].text, /\*\*powerful\*\*/);
  assert.equal(saved[2].studentVisibility, 'teacherOnly');
  const keyEdit = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/markdown-cards/${saved[2].id}`, {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Wrong key', text: 'Wrong answer' }),
  });
  assert.equal(keyEdit.status, 409);
  const invalid = structuredClone(changes);
  invalid.items[0].answer = 'missing';
  assert.equal((await patch(invalid)).status, 400);
  const read = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}`, { headers: { Cookie: cookie } });
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).draft.content.stages[0].content, saved);
});
