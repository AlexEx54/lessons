'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { openDatabase, applyMigrations } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createLessonDraft, completeLessonDraft, findLessonDraft, deleteLessonDraft } = require('../lib/lesson-draft-store.js');
const { createLessonImageGeneration, setLessonImageGenerationStatus } = require('../lib/lesson-image-generation-store.js');
const { listLibraryLessons, findLibraryLesson, publishLesson, unpublishLesson, unpublishLibraryLesson, findLibraryAsset } = require('../lib/library-store.js');

function fixture(t, dbPath = ':memory:') {
  const db = openDatabase(dbPath);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-assets-'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const user = role => createUser({ email: `${crypto.randomUUID()}@test.local`, displayName: role, role, passwordHash: 'unused' }, db);
  const admin = user('admin'), other = user('admin'), teacher = user('teacher');
  const created = createLessonDraft({ ownerAdminId: admin.id, topic: 'Travel', template: 'template-1' }, db);
  const name = `${crypto.randomUUID()}.mp3`;
  fs.mkdirSync(path.join(dir, created.id));
  fs.writeFileSync(path.join(dir, created.id, name), 'audio-test-data');
  const content = { meta: { title: 'Travel' }, stages: [{ id: 'listening', content: [{ id: 'audio', type: 'audioPlayer', audioSrc: `/api/lesson-draft-assets/${created.id}/${name}` }] }] };
  const draft = completeLessonDraft(created.id, admin.id, content, db);
  const input = { expectedUpdatedAt: draft.updatedAt, expectedRevision: 0, title: 'Travel lesson', description: 'Travel and transport', category: 'Speaking', duration: '45 мин', coverUpload: { type: 'image/png', data: fs.readFileSync(path.join(__dirname, '../assets/images/lesson-travel.png')).toString('base64') }, skills: ['Speaking'] };
  return { db, dir, admin, other, teacher, draft, input, name };
}

test('migration preserves ten unavailable cards and does not reseed on subsequent runs', t => {
  const { db } = fixture(t);
  const cards = listLibraryLessons(db);
  assert.equal(cards.length, 10);
  assert.equal(cards[0].id, 'superhero');
  assert.ok(cards.every(card => !card.is_available && card.is_published));
  assert.equal(findLibraryLesson('superhero', db), null);
  assert.ok(cards.every(card => !('content_json' in card)));
  db.prepare("UPDATE library_lessons SET title = 'Changed' WHERE id = 'superhero'").run();
  applyMigrations(db);
  assert.equal(listLibraryLessons(db)[0].title, 'Changed');
});

test('publication copies content and files, updates one record, hides and republishes, survives draft deletion', t => {
  const { db, dir, admin, draft, input, name } = fixture(t);
  const published = publishLesson(draft.id, admin.id, input, db, dir);
  assert.equal(published.is_available, true);
  assert.equal(findLessonDraft(draft.id, admin.id, db).status, 'review');
  const first = findLibraryLesson(published.id, db);
  const asset = first.content.stages[0].content[0].audioSrc.split('/').at(-1);
  assert.equal(Buffer.from(findLibraryAsset(published.id, asset, db)).toString(), 'audio-test-data');
  assert.ok(first.content.stages[0].content[0].audioSrc.startsWith('/api/library/'));
  const edited = structuredClone(draft.content);
  edited.meta.title = 'Working changes';
  db.prepare('UPDATE lesson_drafts SET content_json = ? WHERE id = ?').run(JSON.stringify(edited), draft.id);
  fs.writeFileSync(path.join(dir, draft.id, name), 'new-audio');
  assert.equal(findLibraryLesson(published.id, db).content.meta.title, 'Travel lesson');
  assert.equal(Buffer.from(findLibraryAsset(published.id, asset, db)).toString(), 'audio-test-data');
  assert.throws(() => publishLesson(draft.id, admin.id, input, db, dir), { statusCode: 409 });
  const updated = publishLesson(draft.id, admin.id, { ...input, expectedRevision: 1, title: 'Updated lesson' }, db, dir);
  assert.equal(updated.id, published.id);
  assert.equal(updated.revision, 2);
  assert.equal(listLibraryLessons(db).length, 11);
  assert.equal(findLibraryLesson(published.id, db).content.meta.title, 'Updated lesson');
  unpublishLesson(draft.id, admin.id, 2, db);
  assert.equal(findLibraryLesson(published.id, db), null);
  assert.equal(findLibraryAsset(published.id, asset, db), undefined);
  assert.ok(findLibraryAsset(published.id, asset, db, admin.id));
  assert.equal(listLibraryLessons(db).length, 10);
  publishLesson(draft.id, admin.id, { ...input, expectedRevision: 3 }, db, dir);
  deleteLessonDraft(draft.id, admin.id, db);
  fs.rmSync(path.join(dir, draft.id), { recursive: true });
  assert.ok(findLibraryLesson(published.id, db));
  assert.equal(Buffer.from(findLibraryAsset(published.id, asset, db)).toString(), 'audio-test-data');
  assert.equal(listLibraryLessons(db, admin.id).find(item => item.id === published.id).can_unpublish, true);
  unpublishLibraryLesson(published.id, admin.id, 4, db);
  assert.equal(findLibraryLesson(published.id, db), null);
});

test('publication rejects unauthorized users, stale content, missing files and invalid metadata atomically', t => {
  const { db, dir, admin, other, teacher, draft, input, name } = fixture(t);
  assert.throws(() => publishLesson(draft.id, teacher.id, input, db, dir), { statusCode: 403 });
  assert.throws(() => publishLesson(draft.id, other.id, input, db, dir), { statusCode: 404 });
  assert.throws(() => publishLesson(draft.id, admin.id, { ...input, expectedUpdatedAt: 'old' }, db, dir), { statusCode: 409 });
  assert.throws(() => publishLesson(draft.id, admin.id, { ...input, coverUpload: undefined, cover: '/../../.env' }, db, dir), { statusCode: 400 });
  assert.throws(() => publishLesson(draft.id, admin.id, { ...input, skills: [] }, db, dir), { statusCode: 400 });
  fs.unlinkSync(path.join(dir, draft.id, name));
  assert.throws(() => publishLesson(draft.id, admin.id, input, db, dir), { statusCode: 409 });
  assert.equal(listLibraryLessons(db).length, 10);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM library_assets').get().n, 0);
});

test('running image generation blocks publication; stopped generation requires explicit acknowledgement', t => {
  const { db, dir, admin, draft, input } = fixture(t);
  createLessonImageGeneration({ draftId: draft.id, total: 2 }, db);
  assert.throws(() => publishLesson(draft.id, admin.id, input, db, dir), { statusCode: 409 });
  setLessonImageGenerationStatus(draft.id, 'stopped', '', db);
  const content = structuredClone(draft.content);
  content.stages[0].content[0].picture = { imagePrompt: 'A beach' };
  db.prepare('UPDATE lesson_drafts SET content_json = ? WHERE id = ?').run(JSON.stringify(content), draft.id);
  assert.throws(() => publishLesson(draft.id, admin.id, input, db, dir), { statusCode: 409 });
  assert.ok(publishLesson(draft.id, admin.id, { ...input, allowIncompleteImages: true }, db, dir).is_available);
});

test('library HTTP routes protect publication, placeholders, hidden lessons and media including range requests', async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'library-http-'));
  const { db, dir, admin, other, teacher, draft, input } = fixture(t, path.join(temp, 'app.sqlite'));
  const cookie = user => `teach_session=${createSession(user.id, db).token}`;
  const adminCookie = cookie(admin), teacherCookie = cookie(teacher), otherCookie = cookie(other);
  const port = 32000 + Math.floor(Math.random() * 5000);
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, APP_DB_PATH: path.join(temp, 'app.sqlite'), DRAFT_ASSETS_DIR: dir, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test' }, stdio: 'ignore' });
  t.after(async () => { child.kill(); await new Promise(resolve => child.exitCode !== null ? resolve() : child.once('exit', resolve)); fs.rmSync(temp, { recursive: true, force: true }); });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(`${url}/health`)).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready);
  const request = (route, cookie, method = 'GET', body) => fetch(url + route, { method, redirect: 'manual', headers: { ...(cookie ? { Cookie: cookie } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await (await request('/api/library')).json()).lessons.length, 10);
  assert.equal((await request('/api/library/superhero', teacherCookie)).status, 404);
  assert.equal((await request('/library/superhero', teacherCookie)).status, 404);
  const route = `/api/lesson-drafts/${draft.id}/publication`;
  assert.equal((await request(route, null, 'POST', input)).status, 401);
  assert.equal((await request(route, teacherCookie, 'POST', input)).status, 403);
  assert.equal((await request(route, otherCookie, 'POST', input)).status, 404);
  const response = await request(route, adminCookie, 'POST', input);
  assert.equal(response.status, 200);
  const { publication } = await response.json();
  assert.equal((await request(`/api/library/${publication.id}`)).status, 401);
  assert.equal((await request(`/library/${publication.id}`)).status, 302);
  const lesson = (await (await request(`/api/library/${publication.id}`, teacherCookie)).json()).lesson;
  assert.equal((await request(`/library/${publication.id}`, teacherCookie)).status, 200);
  const assetUrl = lesson.content.stages[0].content[0].audioSrc;
  assert.equal((await request(assetUrl)).status, 401);
  const range = await fetch(url + assetUrl, { headers: { Cookie: teacherCookie, Range: 'bytes=0-4' } });
  assert.equal(range.status, 206); assert.equal(await range.text(), 'audio');
  assert.equal((await request(assetUrl, teacherCookie, 'HEAD')).status, 200);
  assert.equal((await request(route, otherCookie, 'DELETE', { expectedRevision: 1 })).status, 404);
  assert.equal((await request(route, adminCookie, 'DELETE', { expectedRevision: 1 })).status, 200);
  assert.equal((await request(`/api/library/${publication.id}`, teacherCookie)).status, 404);
  assert.equal((await request(assetUrl, teacherCookie)).status, 404);
  assert.equal((await request(route, adminCookie, 'POST', { ...input, expectedRevision: 2 })).status, 200);
  deleteLessonDraft(draft.id, admin.id, db);
  const independentRoute = `/api/library/${publication.id}/publication`;
  assert.equal((await request(independentRoute, teacherCookie, 'DELETE', { expectedRevision: 3 })).status, 403);
  assert.equal((await request(independentRoute, otherCookie, 'DELETE', { expectedRevision: 3 })).status, 404);
  assert.equal((await request(independentRoute, adminCookie, 'DELETE', { expectedRevision: 3 })).status, 200);
  assert.equal((await request(`/api/library/${publication.id}`, teacherCookie)).status, 404);
});

test('uploaded cover is required, retained on updates, replaceable and independent of draft', t => {
  const { db, dir, admin, draft, input } = fixture(t);
  for (const coverUpload of [undefined, { type: 'image/svg+xml', data: 'PHN2Zz4=' }, { type: 'image/png', data: 'bm90LWFuLWltYWdl' }, { type: 'image/png', data: 'a'.repeat(6990512) }]) {
    assert.throws(() => publishLesson(draft.id, admin.id, { ...input, coverUpload }, db, dir), { statusCode: 400 });
  }
  const first = publishLesson(draft.id, admin.id, input, db, dir);
  const coverName = first.cover.split('/').at(-1);
  assert.deepEqual(Buffer.from(findLibraryAsset(first.id, coverName, db)), Buffer.from(input.coverUpload.data, 'base64'));
  const retained = publishLesson(draft.id, admin.id, { ...input, expectedRevision: 1, coverUpload: undefined, cover: first.cover }, db, dir);
  assert.equal(retained.cover, first.cover);
  const replacement = { type: 'image/png', data: fs.readFileSync(path.join(__dirname, '../assets/images/lesson-music.png')).toString('base64') };
  const replaced = publishLesson(draft.id, admin.id, { ...input, expectedRevision: 2, coverUpload: replacement }, db, dir);
  assert.notEqual(replaced.cover, first.cover);
  deleteLessonDraft(draft.id, admin.id, db);
  assert.deepEqual(Buffer.from(findLibraryAsset(first.id, replaced.cover.split('/').at(-1), db)), Buffer.from(replacement.data, 'base64'));
});
