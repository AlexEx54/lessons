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

test('lesson draft pages and APIs are admin-only and owner-isolated', async t => {
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);

  const guestPage = await fetch(`${baseUrl}/lesson-drafts`, { redirect: 'manual' });
  assert.equal(guestPage.status, 302);
  assert.equal(guestPage.headers.get('location'), '/login?next=%2Flesson-drafts');
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts`)).status, 401);

  const teacherCookie = await login(baseUrl, 'teacher@example.com', password);
  assert.equal((await fetch(`${baseUrl}/lesson-drafts`, {
    headers: { Cookie: teacherCookie },
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts`, {
    headers: { Cookie: teacherCookie },
  })).status, 403);

  const firstAdminCookie = await login(baseUrl, 'admin-one@example.com', password);
  const adminPage = await fetch(`${baseUrl}/lesson-drafts`, {
    headers: { Cookie: firstAdminCookie },
  });
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Черновики уроков/);

  for (const body of [
    { topic: '   ', template: 'template-1' },
    { topic: 'Topic', template: 'template-unknown' },
    { topic: 'x'.repeat(121), template: 'template-1' },
  ]) {
    const invalid = await fetch(`${baseUrl}/api/lesson-drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
      body: JSON.stringify(body),
    });
    assert.equal(invalid.status, 400);
  }

  const createdResponse = await fetch(`${baseUrl}/api/lesson-drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      topic: '  Travel English  ',
      template: 'template-1',
      ownerAdminId: 'attempted-owner-override',
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).draft;
  assert.equal(created.ownerAdminId, firstAdmin.id);
  assert.equal(created.topic, 'Travel English');
  assert.equal(created.status, 'review');
  assert.equal(created.content.schemaVersion, 'lesson-draft-v1');
  assert.equal(created.content.meta.topic, 'Travel English');
  assert.equal(created.content.stages.length, 7);
  assert.deepEqual(created.content.stages.map(stage => stage.number), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(created.content.stages[0].content.map(component => component.type), [
    'teacherNote', 'taskPrompt', 'taskPrompt',
  ]);
  assert.equal(created.content.stages[0].content[0].id, 'warm-up-teacher-note');
  assert.deepEqual(created.content.stages[0].content.slice(1).map(component => component.variant), [
    'yourTurn', 'followUp',
  ]);
  assert.ok(created.content.stages.slice(1).every(stage => stage.content === null));

  const editorPage = await fetch(`${baseUrl}/lesson-drafts/${created.id}/edit`, {
    headers: { Cookie: firstAdminCookie },
  });
  assert.equal(editorPage.status, 200);
  assert.match(await editorPage.text(), /id="lesson-stages"/);

  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Guest edit' }),
  })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ text: 'Teacher edit' }),
  })).status, 403);

  const noteUpdateResponse = await fetch(
    `${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
      body: JSON.stringify({ text: '**Saved**\n\n- First\n- Second' }),
    },
  );
  assert.equal(noteUpdateResponse.status, 200);
  const noteUpdate = (await noteUpdateResponse.json()).draft;
  assert.equal(noteUpdate.content.stages[0].content[0].text, '**Saved**\n\n- First\n- Second');
  assert.equal(noteUpdate.content.meta.title, 'Travel English');
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: '   ' }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/missing-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: 'Missing' }),
  })).status, 404);

  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/task-prompts/warm-up-your-turn-prompt`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guest', text: 'Edit', support: null }),
  })).status, 401);
  const promptUpdateResponse = await fetch(
    `${baseUrl}/api/lesson-drafts/${created.id}/task-prompts/warm-up-follow-up-prompt`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
      body: JSON.stringify({
        title: 'Next questions:',
        text: '**Why?**',
        support: { title: 'Useful language:', text: 'I think…' },
        variant: 'yourTurn',
        id: 'attempted-id-change',
      }),
    },
  );
  assert.equal(promptUpdateResponse.status, 200);
  const promptUpdate = (await promptUpdateResponse.json()).draft;
  const savedPrompt = promptUpdate.content.stages[0].content[2];
  assert.equal(savedPrompt.id, 'warm-up-follow-up-prompt');
  assert.equal(savedPrompt.variant, 'followUp');
  assert.equal(savedPrompt.title, 'Next questions:');
  assert.deepEqual(savedPrompt.support, { title: 'Useful language:', text: 'I think…' });
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/task-prompts/warm-up-follow-up-prompt`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Next questions:', text: 'Question', support: { title: '', text: '' } }),
  })).status, 400);

  const ownList = await fetch(`${baseUrl}/api/lesson-drafts`, {
    headers: { Cookie: firstAdminCookie },
  });
  assert.deepEqual((await ownList.json()).drafts.map(draft => draft.id), [created.id]);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    headers: { Cookie: firstAdminCookie },
  })).status, 200);

  const secondAdminCookie = await login(baseUrl, 'admin-two@example.com', password);
  const secondList = await fetch(`${baseUrl}/api/lesson-drafts`, {
    headers: { Cookie: secondAdminCookie },
  });
  assert.deepEqual((await secondList.json()).drafts, []);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    headers: { Cookie: secondAdminCookie },
  })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: secondAdminCookie },
    body: JSON.stringify({ text: 'Foreign edit' }),
  })).status, 404);
  assert.equal((await fetch(`${baseUrl}/lesson-drafts/${created.id}/edit`, {
    headers: { Cookie: secondAdminCookie },
  })).status, 404);

  const foreignDelete = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    method: 'DELETE',
    headers: { Cookie: secondAdminCookie },
  });
  assert.equal(foreignDelete.status, 404);

  const statusDatabase = openDatabase(databasePath);
  statusDatabase.prepare("UPDATE lesson_drafts SET status = 'published' WHERE id = ?").run(created.id);
  statusDatabase.close();
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: 'Published edit' }),
  })).status, 409);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/task-prompts/warm-up-your-turn-prompt`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Published', text: 'Edit', support: null }),
  })).status, 409);

  const ownDelete = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    method: 'DELETE',
    headers: { Cookie: firstAdminCookie },
  });
  assert.equal(ownDelete.status, 200);
  assert.deepEqual(await ownDelete.json(), { ok: true });
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    headers: { Cookie: firstAdminCookie },
  })).status, 404);
});
