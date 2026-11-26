'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createLessonDraft, completeLessonDraft } = require('../lib/lesson-draft-store.js');
const { publishLesson } = require('../lib/library-store.js');
const { createClassSession } = require('../lib/class-store.js');
const { mediaPath, saveMedia, storeMedia, sweepUnusedMedia } = require('../lib/media-store.js');

function temporaryDirectory(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

const filesIn = directory => fs.readdirSync(directory, { recursive: true }).filter(name => fs.statSync(path.join(directory, name)).isFile());

test('equal bytes are stored once under their hash; an existing name is never rewritten', async t => {
  const media = temporaryDirectory(t, 'media-');
  const name = await saveMedia(media, Buffer.from('picture'), 'webp');
  assert.equal(name, `${crypto.createHash('sha256').update('picture').digest('hex')}.webp`);
  assert.equal(await saveMedia(media, Buffer.from('picture'), 'webp'), name);
  assert.equal(fs.readFileSync(mediaPath(media, name), 'utf8'), 'picture');
  assert.equal(path.basename(path.dirname(mediaPath(media, name))), name.slice(0, 2));
  const video = path.join(media, 'source.mp4');
  fs.writeFileSync(video, 'video');
  const videoName = `${'a'.repeat(64)}.mp4`;
  await storeMedia(media, videoName, video);
  fs.writeFileSync(video, 'changed');
  await storeMedia(media, videoName, video);
  assert.equal(fs.readFileSync(mediaPath(media, videoName), 'utf8'), 'video');
  assert.throws(() => mediaPath(media, '../app.sqlite'));
});

test('migration keeps the old asset bytes aside and starts empty reference tables', () => {
  const db = openDatabase(':memory:');
  assert.deepEqual(db.prepare('PRAGMA table_info(library_assets)').all().map(column => column.name), ['lesson_id', 'file_name']);
  assert.deepEqual(db.prepare('PRAGMA table_info(class_assets)').all().map(column => column.name), ['session_id', 'file_name']);
  assert.deepEqual(db.prepare('PRAGMA table_info(legacy_library_assets)').all().map(column => column.name), ['lesson_id', 'file_name', 'data']);
  assert.deepEqual(db.prepare('PRAGMA table_info(legacy_class_assets)').all().map(column => column.name), ['session_id', 'file_name', 'data']);
  db.close();
});

test('published lessons and their sessions share one file; the sweep removes only unused files', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const draftAssets = temporaryDirectory(t, 'draft-assets-'), media = temporaryDirectory(t, 'media-');
  const admin = createUser({ email: 'media@test.local', displayName: 'Admin', role: 'admin', passwordHash: 'unused' }, db);
  const created = createLessonDraft({ ownerAdminId: admin.id, topic: 'Media', template: 'template-1' }, db);
  // Older drafts keep PNG pictures; publication turns them into WebP.
  const picture = `${crypto.randomUUID()}.png`;
  fs.mkdirSync(path.join(draftAssets, created.id));
  fs.writeFileSync(path.join(draftAssets, created.id, picture),
    await sharp({ create: { width: 8, height: 8, channels: 3, background: '#3366cc' } }).png().toBuffer());
  const draft = completeLessonDraft(created.id, admin.id, { meta: { title: 'Media' }, stages: [{ id: 'intro', content: [
    { id: 'panel', type: 'illustratedTextPanel', leadingPicture: { imageSrc: `/api/lesson-draft-assets/${created.id}/${picture}` } },
  ] }] }, db);
  const cover = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#cc6633' } }).png().toBuffer();
  const publication = await publishLesson(draft.id, admin.id, {
    expectedUpdatedAt: draft.updatedAt, expectedRevision: 0, title: 'Media', description: 'Media', category: 'Speaking', grammarPoint: null, topic: 'Медиа', season: null,
    duration: '45 мин', skills: ['Speaking'], coverUpload: { type: 'image/png', data: cover.toString('base64') },
  }, db, draftAssets, media);
  const lessonFiles = db.prepare('SELECT file_name FROM library_assets WHERE lesson_id = ?').all(publication.id).map(row => row.file_name);
  assert.equal(lessonFiles.length, 2);
  assert.ok(lessonFiles.every(name => name.endsWith('.webp')));
  const session = () => createClassSession({ className: 'Media', lessonId: publication.id, expectedRevision: 1,
    requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00.000Z' }, admin.id, db);
  const first = session();
  session();
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM class_assets').get().n, 4);
  assert.equal(filesIn(media).length, 2);

  fs.mkdirSync(path.join(media, 'ff'));
  fs.writeFileSync(path.join(media, 'ff', `${'f'.repeat(64)}.webp`), 'unused');
  fs.writeFileSync(path.join(media, 'ff', `${'f'.repeat(64)}.webp.123.tmp`), 'partial');
  assert.equal(sweepUnusedMedia(media, db), 2);
  assert.equal(filesIn(media).length, 2);
  // Files of a lesson that only a session still uses stay on disk.
  db.prepare('DELETE FROM library_lessons WHERE id = ?').run(publication.id);
  assert.equal(sweepUnusedMedia(media, db), 0);
  db.prepare('DELETE FROM class_sessions WHERE id <> ?').run(first.id);
  assert.equal(sweepUnusedMedia(media, db), 0);
  db.prepare('DELETE FROM class_sessions').run();
  assert.equal(sweepUnusedMedia(media, db), 2);
  assert.equal(sweepUnusedMedia(path.join(media, 'missing'), db), 0);
});
