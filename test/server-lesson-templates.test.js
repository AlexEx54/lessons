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

test('admins copy, rename and delete templates and create drafts from copies', async t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-templates-'));
  const databasePath = path.join(temporaryDirectory, 'app.sqlite');
  const database = openDatabase(databasePath);
  const password = 'correct-password';
  const passwordHash = await hashPassword(password);
  createUser({ email: 'admin-one@example.com', displayName: 'Admin One', passwordHash, role: 'admin' }, database);
  createUser({ email: 'admin-two@example.com', displayName: 'Admin Two', passwordHash, role: 'admin' }, database);
  createUser({ email: 'teacher@example.com', displayName: 'Teacher', passwordHash }, database);
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
  const teacherCookie = await login(baseUrl, 'teacher@example.com', password);
  const call = (method, pathname, { body, auth = cookie } = {}) => fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { Cookie: auth, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });

  const guestPage = await fetch(`${baseUrl}/lesson-templates`, { redirect: 'manual' });
  assert.equal(guestPage.status, 302);
  assert.equal((await fetch(`${baseUrl}/lesson-templates`, { headers: { Cookie: teacherCookie } })).status, 403);
  const adminPage = await fetch(`${baseUrl}/lesson-templates`, { headers: { Cookie: cookie } });
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /id="templates-copies"/);
  assert.equal((await call('GET', '/api/lesson-templates', { auth: teacherCookie })).status, 403);
  assert.equal((await call('POST', '/api/lesson-templates/template-2/copy', { auth: teacherCookie })).status, 403);
  const initial = await (await call('GET', '/api/lesson-templates')).json();
  assert.deepEqual(initial.templates.map(template => template.id), ['template-1', 'template-2']);

  assert.equal((await call('POST', '/api/lesson-templates/missing/copy')).status, 404);
  assert.equal((await call('POST', '/api/lesson-templates/template-2/copy', { body: '{' })).status, 400);
  const copied = await call('POST', '/api/lesson-templates/template-2/copy', { body: {} });
  assert.equal(copied.status, 201);
  const { template: copy } = await copied.json();
  assert.equal(copy.title, 'Шаблон 2 (копия)');
  assert.equal(Object.hasOwn(copy, 'definition'), false);

  // Copies are shared: another admin renames the copy, so the first admin's revision is stale.
  const renamed = await call('PATCH', `/api/lesson-templates/${copy.id}`, {
    auth: otherCookie, body: { revision: 0, title: 'Путешествия' },
  });
  assert.equal(renamed.status, 200);
  assert.equal((await renamed.json()).template.revision, 1);
  assert.equal((await call('PATCH', `/api/lesson-templates/${copy.id}`, { body: { revision: 0, title: 'Мой' } })).status, 409);
  assert.equal((await call('PATCH', '/api/lesson-templates/template-2', { body: { revision: 0, title: 'Мой' } })).status, 403);

  // The editor page opens for admins on existing templates only.
  const editorPage = `/lesson-templates/${copy.id}`;
  const guestEditor = await fetch(`${baseUrl}${editorPage}`, { redirect: 'manual' });
  assert.equal(guestEditor.status, 302);
  assert.equal(guestEditor.headers.get('location'), `/login?next=${encodeURIComponent(editorPage)}`);
  assert.equal((await fetch(`${baseUrl}${editorPage}`, { headers: { Cookie: teacherCookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/lesson-templates/missing`, { headers: { Cookie: cookie } })).status, 404);
  for (const id of ['template-1', copy.id]) {
    const page = await fetch(`${baseUrl}/lesson-templates/${id}`, { headers: { Cookie: cookie } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /src="\/assets\/lesson-template-editor\.js"/);
  }

  // The editor reads the copy, previews an unsaved change and saves it.
  assert.equal((await call('GET', '/api/template-controls', { auth: teacherCookie })).status, 403);
  const { controls } = await (await call('GET', '/api/template-controls')).json();
  assert.ok(controls.some(control => control.type === 'storyCards'));
  assert.equal((await call('GET', '/api/lesson-templates/missing')).status, 404);
  const { template: opened } = await (await call('GET', `/api/lesson-templates/${copy.id}`)).json();
  assert.equal(opened.systemTemplateId, 'template-2');
  const stories = opened.definition.stages.flatMap(stage => stage.blocks).find(block => block.control === 'storyCards');
  stories.params = { ...stories.params, stories: 3 };
  assert.equal((await call('POST', '/api/lesson-templates/preview', { auth: teacherCookie, body: {} })).status, 403);
  const preview = await (await call('POST', '/api/lesson-templates/preview', {
    body: { definition: opened.definition, systemTemplateId: opened.systemTemplateId },
  })).json();
  assert.deepEqual(preview.errors, []);
  assert.match(preview.blocks[stories.id].rules[0], /exactly three short first-person stories/);

  stories.params.maxWords = 10;
  const broken = await call('PATCH', `/api/lesson-templates/${copy.id}`, { body: { revision: 1, definition: opened.definition } });
  assert.equal(broken.status, 400);
  assert.deepEqual((await broken.json()).errors.map(error => error.param), ['maxWords']);
  stories.params.maxWords = 60;
  const saved = await call('PATCH', `/api/lesson-templates/${copy.id}`, { body: { revision: 1, definition: opened.definition } });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).template.revision, 2);

  const createDraft = template => call('POST', '/api/lesson-drafts', {
    body: { topic: 'Travel', grammarTopic: 'Past Simple', template, ageGroup: '9-11', level: 'A1',
      model: 'google/gemini-3.7-flash', synthetic: true },
  });
  const created = await createDraft(copy.id);
  assert.equal(created.status, 201);
  const { draft } = await created.json();
  assert.equal(draft.template, copy.id);
  assert.equal(draft.templateTitle, 'Путешествия');
  assert.equal(draft.status, 'review');
  assert.equal(draft.content.meta.generatedBy, 'synthetic');
  assert.equal(draft.content.meta.ageGroup, '9-11');
  assert.deepEqual(draft.content.stages.map(stage => stage.id), [
    'warm-up', 'lead-in', 'target-vocabulary', 'watch-and-interact', 'grammar-presentation', 'grammar-focus', 'guided-speaking', 'wrap-up',
  ]);
  assert.ok(draft.content.stages.every(stage => stage.content.length > 0));

  assert.equal((await call('DELETE', '/api/lesson-templates/template-2')).status, 403);
  assert.equal((await call('DELETE', `/api/lesson-templates/${copy.id}`)).status, 200);
  assert.equal((await call('DELETE', `/api/lesson-templates/${copy.id}`)).status, 404);
  const kept = await (await call('GET', `/api/lesson-drafts/${draft.id}`)).json();
  assert.equal(kept.draft.templateTitle, 'Путешествия');
  assert.equal((await createDraft(copy.id)).status, 400);

  const snapshots = openDatabase(databasePath);
  t.after(() => snapshots.close());
  const snapshot = JSON.parse(snapshots.prepare('SELECT template_snapshot_json FROM lesson_drafts WHERE id = ?').get(draft.id).template_snapshot_json);
  assert.equal(snapshot.id, copy.id);
  assert.equal(snapshot.title, 'Путешествия');
});
