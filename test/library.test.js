'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { openDatabase, applyMigrations } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClassSession } = require('../lib/class-store.js');
const { addLibraryLesson } = require('./helpers/library.js');
const { createLessonDraft, completeLessonDraft, findLessonDraft, deleteLessonDraft } = require('../lib/lesson-draft-store.js');
const { createLessonImageGeneration, setLessonImageGenerationStatus } = require('../lib/lesson-image-generation-store.js');
const { listLibraryLessons, listNewLibraryLessons, findLibraryLesson, publishLesson, unpublishLesson, unpublishLibraryLesson, setLibraryLessonBadge, hasLibraryAsset } = require('../lib/library-store.js');
const { mediaPath } = require('../lib/media-store.js');
const readMedia = (media, name) => fs.readFileSync(mediaPath(media, name));

function fixture(t, dbPath = ':memory:') {
  const db = openDatabase(dbPath);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'library-assets-'));
  const media = fs.mkdtempSync(path.join(os.tmpdir(), 'library-media-'));
  t.after(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(media, { recursive: true, force: true }); });
  const user = role => createUser({ email: `${crypto.randomUUID()}@test.local`, displayName: role, role, passwordHash: 'unused' }, db);
  const admin = user('admin'), other = user('admin'), teacher = user('teacher');
  const created = createLessonDraft({ ownerAdminId: admin.id, topic: 'Travel', template: 'template-1' }, db);
  const name = `${crypto.randomUUID()}.mp3`;
  fs.mkdirSync(path.join(dir, created.id));
  fs.writeFileSync(path.join(dir, created.id, name), 'audio-test-data');
  const content = { meta: { title: 'Travel' }, stages: [{ id: 'listening', content: [{ id: 'audio', type: 'audioPlayer', audioSrc: `/api/lesson-draft-assets/${created.id}/${name}` }] }] };
  const draft = completeLessonDraft(created.id, admin.id, content, db);
  const input = { expectedUpdatedAt: draft.updatedAt, expectedRevision: 0, title: 'Travel lesson', description: 'Travel and transport', category: 'Speaking', duration: '45 мин', coverUpload: { type: 'image/png', data: fs.readFileSync(path.join(__dirname, '../assets/images/lesson-travel.png')).toString('base64') }, skills: ['Speaking'] };
  return { db, dir, media, admin, other, teacher, draft, input, name };
}

test('migration 031 removes the seeded preview cards and keeps published lessons with their files and sessions', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name) && name < '031').sort()) {
    db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, '2026-11-26');
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM library_lessons WHERE is_available = 0').get().n, 10);
  const teacher = createUser({ email: 'teacher@test.local', displayName: 'Teacher', role: 'teacher', passwordHash: 'unused' }, db);
  db.prepare(`INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge,
    is_available, content_json, revision, published_at, updated_at)
    VALUES ('real', 'Real', '12-14', 'A2', 'General English', 'Published', '["Speaking"]', '45 мин', '/cover.webp', 'new',
      1, '{"meta":{"title":"Real"},"stages":[]}', 1, '2026-11-01', '2026-11-01')`).run();
  db.prepare("INSERT INTO library_assets VALUES ('real', 'file.webp')").run();
  const session = createClassSession({ className: 'Анна', lessonId: 'real', expectedRevision: 1, requestKey: crypto.randomUUID(),
    scheduledAt: '2099-01-01T10:00:00.000Z' }, teacher.id, db);
  applyMigrations(db);
  assert.deepEqual(listLibraryLessons(db).map(card => [card.id, card.badge, card.is_published]), [['real', 'new', true]]);
  assert.equal(findLibraryLesson('real', db).content.meta.title, 'Real');
  assert.ok(db.prepare('PRAGMA table_info(library_lessons)').all().every(column => column.name !== 'is_available'));
  assert.equal(hasLibraryAsset('real', 'file.webp', db), true);
  assert.equal(db.prepare('SELECT library_lesson_id FROM class_sessions WHERE id = ?').get(session.id).library_lesson_id, 'real');
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('migration 032 lets drafts be for adults and levels C1–C2 and keeps their generations and publications', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT');
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name) && name < '032').sort()) {
    db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, '2026-11-26');
  }
  const admin = createUser({ email: 'admin@test.local', displayName: 'Admin', role: 'admin', passwordHash: 'unused' }, db);
  const draft = createLessonDraft({ ownerAdminId: admin.id, topic: 'Travel', template: 'template-1', ageGroup: '15-18', level: 'B2' }, db);
  createLessonImageGeneration({ draftId: draft.id, total: 2 }, db);
  db.prepare(`INSERT INTO library_lessons (id, source_draft_id, title, age, level, category, description, skills_json, duration, cover,
    content_json, published_at, updated_at)
    VALUES ('travel', ?, 'Travel', '15-18', 'B2', 'General English', 'Published', '[]', '45 мин', '/cover.webp', '{}', '2026-11-01', '2026-11-01')`)
    .run(draft.id);
  assert.throws(() => createLessonDraft({ ownerAdminId: admin.id, topic: 'Work', template: 'template-1', ageGroup: 'adults', level: 'C1' }, db));
  applyMigrations(db);
  const kept = findLessonDraft(draft.id, admin.id, db);
  assert.deepEqual([kept.ageGroup, kept.ageLabel, kept.level, kept.imageGeneration.total], ['15-18', '15–18 лет', 'B2', 2]);
  assert.deepEqual([kept.publication.id, kept.publication.age_label], ['travel', '15–18 лет']);
  const adults = createLessonDraft({ ownerAdminId: admin.id, topic: 'Work', template: 'template-1', ageGroup: 'adults', level: 'C1' }, db);
  assert.deepEqual([adults.ageLabel, adults.level], ['Взрослые', 'C1']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM sqlite_master WHERE tbl_name = \'lesson_drafts\' AND type = \'index\' AND sql IS NOT NULL').get().n, 2);
  assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});

test('home library selects up to twelve available new publications, ordered by publication date and id', t => {
  const { db } = fixture(t);
  assert.deepEqual(listNewLibraryLessons(db), []);
  const insert = db.prepare(`INSERT INTO library_lessons
    (id, title, age, level, category, description, skills_json, duration, cover,
      badge, is_published, content_json, published_at, updated_at)
    VALUES (?, 'Lesson', '12-14', 'A2', 'Speaking', 'Description', '["Speaking"]',
      '45 мин', '/assets/images/lesson-travel.png', ?, ?, '{}', ?, ?)`);
  for (let day = 1; day <= 12; day++) {
    const id = `new-${String(day).padStart(2, '0')}`;
    insert.run(id, 'new', 1, `2026-09-${String(day).padStart(2, '0')}T00:00:00.000Z`, '2026-10-01T00:00:00.000Z');
  }
  // Same publication date as new-12: ties are broken by id.
  insert.run('new-12-tie', 'new', 1, '2026-09-12T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  // A metadata edit must not outrank a later publication.
  db.prepare('UPDATE library_lessons SET updated_at = ? WHERE id = ?').run('2099-01-01T00:00:00.000Z', 'new-01');
  for (const [id, badge, published] of [
    ['hidden', 'new', 0], ['popular', 'popular', 1], ['unmarked', null, 1],
  ]) insert.run(id, badge, published, '2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z');
  const lessons = listNewLibraryLessons(db);
  assert.deepEqual(lessons.map(lesson => lesson.id), [
    'new-12', 'new-12-tie', 'new-11', 'new-10', 'new-09', 'new-08',
    'new-07', 'new-06', 'new-05', 'new-04', 'new-03', 'new-02',
  ]);
  assert.ok(lessons.every(lesson => lesson.badge === 'new' && lesson.is_published));
  assert.ok(lessons.every(lesson => !('content_json' in lesson)));
  assert.deepEqual(lessons[0].skills, ['Speaking']);
});

test('publication copies content and files, updates one record, hides and republishes, survives draft deletion', async t => {
  const { db, dir, media, admin, draft, input, name } = fixture(t);
  const published = await publishLesson(draft.id, admin.id, input, db, dir, media);
  assert.equal(published.is_published, true);
  assert.equal(findLessonDraft(draft.id, admin.id, db).status, 'review');
  const first = findLibraryLesson(published.id, db);
  const asset = first.content.stages[0].content[0].audioSrc.split('/').at(-1);
  assert.equal(hasLibraryAsset(published.id, asset, db), true);
  assert.equal(readMedia(media, asset).toString(), 'audio-test-data');
  assert.ok(first.content.stages[0].content[0].audioSrc.startsWith('/api/library/'));
  const edited = structuredClone(draft.content);
  edited.meta.title = 'Working changes';
  db.prepare('UPDATE lesson_drafts SET content_json = ? WHERE id = ?').run(JSON.stringify(edited), draft.id);
  fs.writeFileSync(path.join(dir, draft.id, name), 'new-audio');
  assert.equal(findLibraryLesson(published.id, db).content.meta.title, 'Travel lesson');
  assert.equal(readMedia(media, asset).toString(), 'audio-test-data');
  await assert.rejects(() => publishLesson(draft.id, admin.id, input, db, dir, media), { statusCode: 409 });
  const updated = await publishLesson(draft.id, admin.id, { ...input, expectedRevision: 1, title: 'Updated lesson' }, db, dir, media);
  assert.equal(updated.id, published.id);
  assert.equal(updated.revision, 2);
  assert.equal(listLibraryLessons(db).length, 1);
  const republished = findLibraryLesson(published.id, db);
  assert.equal(republished.content.meta.title, 'Updated lesson');
  // The new version refers to the changed audio only; the old file stays for sessions that use it.
  const updatedAsset = republished.content.stages[0].content[0].audioSrc.split('/').at(-1);
  assert.notEqual(updatedAsset, asset);
  assert.equal(readMedia(media, updatedAsset).toString(), 'new-audio');
  assert.equal(hasLibraryAsset(published.id, asset, db), false);
  assert.equal(readMedia(media, asset).toString(), 'audio-test-data');
  unpublishLesson(draft.id, admin.id, 2, db);
  assert.equal(findLibraryLesson(published.id, db), null);
  assert.equal(hasLibraryAsset(published.id, updatedAsset, db), false);
  assert.ok(hasLibraryAsset(published.id, updatedAsset, db, admin.id));
  assert.equal(listLibraryLessons(db).length, 0);
  await publishLesson(draft.id, admin.id, { ...input, expectedRevision: 3 }, db, dir, media);
  deleteLessonDraft(draft.id, admin.id, db);
  fs.rmSync(path.join(dir, draft.id), { recursive: true });
  assert.ok(findLibraryLesson(published.id, db));
  assert.equal(hasLibraryAsset(published.id, updatedAsset, db), true);
  assert.equal(readMedia(media, updatedAsset).toString(), 'new-audio');
  assert.equal(listLibraryLessons(db, admin.id).find(item => item.id === published.id).can_unpublish, true);
  unpublishLibraryLesson(published.id, admin.id, 4, db);
  assert.equal(findLibraryLesson(published.id, db), null);
});

test('any admin marks any published lesson; the mark survives republication', async t => {
  const { db, dir, media, admin, other, teacher, draft, input } = fixture(t);
  const published = await publishLesson(draft.id, admin.id, input, db, dir, media);
  addLibraryLesson(db, {}, 'animals');
  const badgeOf = id => listLibraryLessons(db).find(item => item.id === id).badge;
  setLibraryLessonBadge(published.id, other.id, 'popular', db);
  assert.equal(badgeOf(published.id), 'popular');
  await publishLesson(draft.id, admin.id, { ...input, expectedRevision: 1, coverUpload: undefined, cover: published.cover }, db, dir, media);
  assert.equal(badgeOf(published.id), 'popular');
  setLibraryLessonBadge('animals', admin.id, 'new', db);
  assert.equal(badgeOf('animals'), 'new');
  setLibraryLessonBadge('animals', admin.id, null, db);
  assert.equal(badgeOf('animals'), null);
  assert.throws(() => setLibraryLessonBadge('animals', teacher.id, 'new', db), { statusCode: 403 });
  assert.throws(() => setLibraryLessonBadge('animals', admin.id, 'NEW', db), { statusCode: 400 });
  assert.throws(() => setLibraryLessonBadge('missing', admin.id, 'new', db), { statusCode: 404 });
  unpublishLesson(draft.id, admin.id, 2, db);
  assert.throws(() => setLibraryLessonBadge(published.id, admin.id, 'new', db), { statusCode: 404 });
});

test('publication rejects unauthorized users, stale content, missing files and invalid metadata atomically', async t => {
  const { db, dir, media, admin, other, teacher, draft, input, name } = fixture(t);
  await assert.rejects(() => publishLesson(draft.id, teacher.id, input, db, dir, media), { statusCode: 403 });
  await assert.rejects(() => publishLesson(draft.id, other.id, input, db, dir, media), { statusCode: 404 });
  await assert.rejects(() => publishLesson(draft.id, admin.id, { ...input, expectedUpdatedAt: 'old' }, db, dir, media), { statusCode: 409 });
  await assert.rejects(() => publishLesson(draft.id, admin.id, { ...input, coverUpload: undefined, cover: '/../../.env' }, db, dir, media), { statusCode: 400 });
  await assert.rejects(() => publishLesson(draft.id, admin.id, { ...input, skills: [] }, db, dir, media), { statusCode: 400 });
  fs.unlinkSync(path.join(dir, draft.id, name));
  await assert.rejects(() => publishLesson(draft.id, admin.id, input, db, dir, media), { statusCode: 409 });
  assert.equal(listLibraryLessons(db).length, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM library_assets').get().n, 0);
});

test('running image generation blocks publication; stopped generation requires explicit acknowledgement', async t => {
  const { db, dir, media, admin, draft, input } = fixture(t);
  createLessonImageGeneration({ draftId: draft.id, total: 2 }, db);
  await assert.rejects(() => publishLesson(draft.id, admin.id, input, db, dir, media), { statusCode: 409 });
  setLessonImageGenerationStatus(draft.id, 'stopped', '', db);
  const content = structuredClone(draft.content);
  content.stages[0].content[0].picture = { imagePrompt: 'A beach' };
  db.prepare('UPDATE lesson_drafts SET content_json = ? WHERE id = ?').run(JSON.stringify(content), draft.id);
  await assert.rejects(() => publishLesson(draft.id, admin.id, input, db, dir, media), { statusCode: 409 });
  assert.ok((await publishLesson(draft.id, admin.id, { ...input, allowIncompleteImages: true }, db, dir, media)).is_published);
});

test('library HTTP routes protect publication, missing and hidden lessons and media including range requests', async t => {
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
  assert.equal((await request('/api/library')).status, 401);
  assert.equal((await (await request('/api/library', teacherCookie)).json()).lessons.length, 0);
  assert.equal((await request('/api/home-content')).status, 401);
  const initialHome = await (await request('/api/home-content', teacherCookie)).json();
  assert.deepEqual(initialHome.libraryLessons, []);
  assert.equal(initialHome.hasClasses, false);
  assert.equal((await request('/api/library/missing', teacherCookie)).status, 404);
  assert.equal((await request('/library/missing', teacherCookie)).status, 404);
  const route = `/api/lesson-drafts/${draft.id}/publication`;
  assert.equal((await request(route, null, 'POST', input)).status, 401);
  assert.equal((await request(route, teacherCookie, 'POST', input)).status, 403);
  assert.equal((await request(route, otherCookie, 'POST', input)).status, 404);
  const response = await request(route, adminCookie, 'POST', input);
  assert.equal(response.status, 200);
  const { publication } = await response.json();
  assert.deepEqual((await (await request('/api/home-content', teacherCookie)).json()).libraryLessons, []);
  assert.equal((await request(`/api/library/${publication.id}`)).status, 401);
  const guestLessonPage = await request(`/library/${publication.id}`);
  assert.equal(guestLessonPage.status, 302);
  assert.equal(guestLessonPage.headers.get('location'), `/?auth=register&next=${encodeURIComponent(`/library/${publication.id}`)}`);
  const lesson = (await (await request(`/api/library/${publication.id}`, teacherCookie)).json()).lesson;
  const lessonPage = await request(`/library/${publication.id}`, teacherCookie);
  assert.equal(lessonPage.status, 200);
  const lessonPageHtml = await lessonPage.text();
  assert.match(lessonPageHtml, /id="schedule-lesson"/);
  assert.match(lessonPageHtml, /id="class-modal"/);
  assert.match(lessonPageHtml, /src="\/assets\/class-modal\.js"/);
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
  const badgeRoute = `/api/library/${publication.id}/badge`;
  assert.equal((await request(badgeRoute, teacherCookie, 'PUT', { badge: 'new' })).status, 403);
  assert.equal((await request(badgeRoute, otherCookie, 'PUT', { badge: 'unknown' })).status, 400);
  assert.equal((await request(badgeRoute, otherCookie, 'PUT', { badge: 'new' })).status, 200);
  assert.equal((await (await request('/api/library', teacherCookie)).json()).lessons.find(item => item.id === publication.id).badge, 'new');
  const newHome = await (await request('/api/home-content', teacherCookie)).json();
  assert.deepEqual(newHome.libraryLessons.map(lesson => lesson.id), [publication.id]);
  assert.equal(newHome.libraryLessons[0].cover, publication.cover);
  assert.equal((await request(badgeRoute, otherCookie, 'PUT', { badge: 'popular' })).status, 200);
  assert.deepEqual((await (await request('/api/home-content', teacherCookie)).json()).libraryLessons, []);
  assert.equal((await request(badgeRoute, otherCookie, 'PUT', { badge: 'new' })).status, 200);
  const independentRoute = `/api/library/${publication.id}/publication`;
  assert.equal((await request(independentRoute, teacherCookie, 'DELETE', { expectedRevision: 3 })).status, 403);
  assert.equal((await request(independentRoute, otherCookie, 'DELETE', { expectedRevision: 3 })).status, 404);
  assert.equal((await request(independentRoute, adminCookie, 'DELETE', { expectedRevision: 3 })).status, 200);
  assert.equal((await request(`/api/library/${publication.id}`, teacherCookie)).status, 404);
  assert.deepEqual((await (await request('/api/home-content', teacherCookie)).json()).libraryLessons, []);
});

test('uploaded cover is required, retained on updates, replaceable and independent of draft', async t => {
  const { db, dir, media, admin, draft, input } = fixture(t);
  for (const coverUpload of [undefined, { type: 'image/svg+xml', data: 'PHN2Zz4=' }, { type: 'image/png', data: 'bm90LWFuLWltYWdl' }, { type: 'image/png', data: 'a'.repeat(6990512) }]) {
    await assert.rejects(() => publishLesson(draft.id, admin.id, { ...input, coverUpload }, db, dir, media), { statusCode: 400 });
  }
  const first = await publishLesson(draft.id, admin.id, input, db, dir, media);
  const coverName = first.cover.split('/').at(-1);
  // The uploaded PNG is kept as WebP.
  assert.match(coverName, /\.webp$/);
  assert.equal(readMedia(media, coverName).toString('ascii', 8, 12), 'WEBP');
  const retained = await publishLesson(draft.id, admin.id, { ...input, expectedRevision: 1, coverUpload: undefined, cover: first.cover }, db, dir, media);
  assert.equal(retained.cover, first.cover);
  const replacement = { type: 'image/png', data: fs.readFileSync(path.join(__dirname, '../assets/images/lesson-music.png')).toString('base64') };
  const replaced = await publishLesson(draft.id, admin.id, { ...input, expectedRevision: 2, coverUpload: replacement }, db, dir, media);
  assert.notEqual(replaced.cover, first.cover);
  // The lesson no longer refers to the old cover; the startup sweep removes its file.
  assert.equal(hasLibraryAsset(first.id, coverName, db), false);
  deleteLessonDraft(draft.id, admin.id, db);
  assert.equal(hasLibraryAsset(first.id, replaced.cover.split('/').at(-1), db), true);
  assert.equal(readMedia(media, replaced.cover.split('/').at(-1)).toString('ascii', 8, 12), 'WEBP');
});
