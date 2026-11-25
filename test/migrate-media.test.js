'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { openDatabase } = require('../lib/db.js');
const { mediaPath } = require('../lib/media-store.js');
const { toWebp } = require('../lib/webp.js');
const { migrateMedia } = require('../scripts/migrate-media.js');

const hashName = (data, extension) => `${crypto.createHash('sha256').update(data).digest('hex')}.${extension}`;
const png = color => sharp({ create: { width: 8, height: 8, channels: 3, background: color } }).png().toBuffer();

// A database as the old code left it: bytes in the asset tables, a copy per session, videos in _videos.
async function legacyFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-media-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const db = openDatabase(path.join(directory, 'app.sqlite'));
  t.after(() => db.close());
  const cover = await png('#cc6633'), picture = await png('#3366cc'), oldCover = await png('#000000'), audio = Buffer.from('ID3 audio');
  const names = { cover: hashName(cover, 'png'), picture: hashName(picture, 'png'), oldCover: hashName(oldCover, 'png'),
    audio: hashName(audio, 'mp3'), video: `${'b'.repeat(64)}.mp4`, broken: `${'c'.repeat(64)}.png` };
  const videos = path.join(directory, 'draft-assets', '_videos');
  fs.mkdirSync(videos, { recursive: true });
  fs.writeFileSync(path.join(videos, names.video), 'video');
  const pointer = Buffer.from(JSON.stringify({ videoFile: names.video }));
  const content = prefix => JSON.stringify({ stages: [{ content: [
    { type: 'illustratedTextPanel', leadingPicture: { imageSrc: `${prefix}/${names.picture}` } },
    { type: 'audioPlayer', src: `${prefix}/${names.audio}` }, { type: 'video', src: `${prefix}/${names.video}` },
  ] }] });
  db.prepare(`INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, content_json, updated_at)
    VALUES ('lesson', 'Урок', 'adults', 'B1', 'Speaking', 'Описание', '[]', '45 мин', ?, ?, 'x')`)
    .run(`/api/library/lesson/assets/${names.cover}`, content('/api/library/lesson/assets'));
  const insertLibrary = db.prepare('INSERT INTO legacy_library_assets (lesson_id, file_name, data) VALUES (?, ?, ?)');
  for (const [name, data] of [[names.cover, cover], [names.picture, picture], [names.audio, audio], [names.video, pointer], [names.oldCover, oldCover]]) {
    insertLibrary.run('lesson', name, data);
  }
  db.exec(`INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at) VALUES ('u', 'u@test.local', 'x', 'U', 'x', 'x');
    INSERT INTO classes (id, owner_id, name, invite_token, created_at) VALUES ('class', 'u', 'Маша', 't', 'x')`);
  const insertSession = db.prepare(`INSERT INTO class_sessions (id, class_id, request_key, request_json, library_revision, title, level, duration,
    cover, content_json, scheduled_at, time_zone, created_at) VALUES (?, 'class', ?, '{}', 1, 'Урок', 'B1', '45 мин', ?, ?, 'x', 'UTC', 'x')`);
  const insertClass = db.prepare('INSERT INTO legacy_class_assets (session_id, file_name, data) VALUES (?, ?, ?)');
  // The third session's lesson is gone from the library, so its copies are the only ones left.
  for (const id of ['first', 'second', 'orphaned']) {
    const sessionContent = JSON.parse(content(`/api/sessions/${id}/assets`));
    if (id === 'orphaned') sessionContent.stages[0].content.push({ type: 'image', src: `/api/sessions/${id}/assets/${names.broken}` });
    insertSession.run(id, id, `/api/sessions/${id}/assets/${names.cover}`, JSON.stringify(sessionContent));
    for (const [name, data] of [[names.cover, cover], [names.picture, picture], [names.audio, audio], [names.video, pointer]]) insertClass.run(id, name, data);
  }
  return { db, directory, names, cover, picture, media: path.join(directory, 'media'), videos };
}

const run = (fixture, apply) => {
  const lines = [];
  return migrateMedia({ database: fixture.db, mediaDirectory: fixture.media, videosDirectory: fixture.videos, apply, log: line => lines.push(line) })
    .then(result => ({ ...result, lines }));
};
const refs = (db, table, column) => db.prepare(`SELECT ${column} AS id, file_name FROM ${table} ORDER BY 1, 2`).all().map(row => `${row.id} ${row.file_name}`);

test('a dry run reports the move and changes nothing', async t => {
  const fixture = await legacyFixture(t);
  const lessonBefore = fixture.db.prepare("SELECT cover, content_json FROM library_lessons WHERE id = 'lesson'").get();
  const result = await run(fixture, false);
  assert.equal(result.migrated, false);
  assert.equal(result.references, 4 * 4 + 1);
  assert.equal(result.files, 4);
  assert.equal(result.missing, 1);
  assert.ok(result.after < result.before);
  assert.ok(result.lines.some(line => line.includes(fixture.names.broken)));
  assert.equal(fs.existsSync(fixture.media), false);
  assert.deepEqual({ ...fixture.db.prepare("SELECT cover, content_json FROM library_lessons WHERE id = 'lesson'").get() }, { ...lessonBefore });
  assert.equal(fixture.db.prepare('SELECT COUNT(*) AS n FROM legacy_class_assets').get().n, 12);
});

test('apply moves each file once, rewrites lessons and sessions to it and drops the old tables', async t => {
  const fixture = await legacyFixture(t);
  const { db, names, media } = fixture;
  const result = await run(fixture, true);
  assert.equal(result.migrated, true);
  const picture = hashName(await toWebp(fixture.picture), 'webp');
  const lesson = db.prepare("SELECT cover, content_json FROM library_lessons WHERE id = 'lesson'").get();
  const cover = lesson.cover.split('/').at(-1);
  assert.match(cover, /^[a-f0-9]{64}\.webp$/);
  assert.equal(fs.readFileSync(mediaPath(media, cover)).toString('ascii', 8, 12), 'WEBP');
  const files = [cover, picture, names.audio, names.video].sort();
  for (const name of files) assert.ok(fs.existsSync(mediaPath(media, name)), name);
  assert.equal(fs.readdirSync(media, { recursive: true }).filter(name => name.includes('.')).length, 4);
  assert.ok(lesson.content_json.includes(`/api/library/lesson/assets/${picture}`));
  assert.ok(!lesson.content_json.includes('.png'));
  assert.deepEqual(refs(db, 'library_assets', 'lesson_id'), files.map(name => `lesson ${name}`));
  const sessionRefs = ['first', 'orphaned', 'second'].flatMap(id => files.map(name => `${id} ${name}`));
  assert.deepEqual(refs(db, 'class_assets', 'session_id'), sessionRefs);
  const orphaned = db.prepare("SELECT cover, content_json FROM class_sessions WHERE id = 'orphaned'").get();
  assert.equal(orphaned.cover, `/api/sessions/orphaned/assets/${cover}`);
  // A link that was broken before the move stays as it was.
  assert.ok(orphaned.content_json.includes(`/api/sessions/orphaned/assets/${names.broken}`));
  assert.equal(fs.readFileSync(mediaPath(media, names.video), 'utf8'), 'video');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name LIKE 'legacy_%'").get().n, 0);

  const again = await run(fixture, true);
  assert.equal(again.migrated, false);
  assert.match(again.lines[0], /уже выполнен/);
});

test('a link to another lesson or session stops the move before anything is written', async t => {
  const fixture = await legacyFixture(t);
  fixture.db.prepare("UPDATE class_sessions SET cover = ? WHERE id = 'first'").run(`/api/library/lesson/assets/${fixture.names.cover}`);
  await assert.rejects(run(fixture, true), /другого урока или занятия/);
  assert.equal(fs.existsSync(fixture.media), false);
  assert.equal(fixture.db.prepare('SELECT COUNT(*) AS n FROM legacy_class_assets').get().n, 12);
});

test('a file published after the deploy is kept and referenced as is', async t => {
  const fixture = await legacyFixture(t);
  const fresh = `${'d'.repeat(64)}.webp`;
  fs.mkdirSync(path.dirname(mediaPath(fixture.media, fresh)), { recursive: true });
  fs.writeFileSync(mediaPath(fixture.media, fresh), 'fresh');
  fixture.db.prepare("UPDATE class_sessions SET cover = ? WHERE id = 'second'").run(`/api/sessions/second/assets/${fresh}`);
  fixture.db.prepare("INSERT INTO class_assets (session_id, file_name) VALUES ('second', ?)").run(fresh);
  await run(fixture, true);
  assert.ok(refs(fixture.db, 'class_assets', 'session_id').includes(`second ${fresh}`));
  assert.equal(fs.readFileSync(mediaPath(fixture.media, fresh), 'utf8'), 'fresh');
});
