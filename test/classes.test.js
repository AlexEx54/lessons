'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClass, listClasses, findClass, findClassByInvite, findClassAsset } = require('../lib/class-store.js');
function fixture(t, dbPath = ':memory:') {
  const db = openDatabase(dbPath);
  t.after(() => db.close());
  const user = () => createUser({ email: `${crypto.randomUUID()}@test.local`, displayName: 'Teacher', role: 'teacher', passwordHash: 'unused' }, db);
  const teacher = user(), other = user();
  const assetName = `${'a'.repeat(64)}.mp3`;
  const content = { meta: { title: 'Published title' }, stages: [{ id: 'intro', title: 'Introduction', content: [{ id: 'audio', type: 'audioPlayer', audioSrc: `/api/library/superhero/assets/${assetName}` }] }] };
  db.prepare('UPDATE library_lessons SET is_available = 1, revision = 1, content_json = ? WHERE id = ?').run(JSON.stringify(content), 'superhero');
  db.prepare('INSERT INTO library_assets VALUES (?, ?, ?)').run('superhero', assetName, Buffer.from('audio-data'));
  const coverName = `${'b'.repeat(64)}.png`;
  db.prepare('INSERT INTO library_assets VALUES (?, ?, ?)').run('superhero', coverName, Buffer.from('cover-data'));
  db.prepare('UPDATE library_lessons SET cover = ? WHERE id = ?').run(`/api/library/superhero/assets/${coverName}`, 'superhero');
  const input = { name: 'Анна', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID(), timeZone: 'Asia/Almaty' };
  return { db, teacher, other, input, assetName };
}
test('class snapshot and media survive changes and removal of the source; access is owner-only', t => {
  const { db, teacher, other, input, assetName } = fixture(t);
  const lesson = createClass(input, teacher.id, db);
  assert.equal(lesson.name, 'Анна');
  assert.match(lesson.invitePath, /^\/join\/anna-[a-f0-9]{48}$/);
  assert.ok(lesson.cover.startsWith(`/api/classes/${lesson.id}/assets/`));
  assert.equal(lesson.scheduled_at, null);
  assert.equal(findClass(lesson.id, other.id, db), null);
  assert.deepEqual(listClasses(other.id, db), []);
  assert.equal(findClassByInvite(lesson.invitePath.split('/').at(-1), other.id, db), null);
  assert.equal(findClassByInvite(lesson.invitePath.split('/').at(-1), teacher.id, db).id, lesson.id);
  db.prepare("UPDATE library_lessons SET content_json = '{}', revision = 2, is_published = 0 WHERE id = 'superhero'").run();
  assert.equal(findClass(lesson.id, teacher.id, db).content.meta.title, 'Published title');
  assert.equal(findClassAsset(lesson.id, assetName, other.id, db), undefined);
  db.prepare("DELETE FROM library_lessons WHERE id = 'superhero'").run();
  assert.equal(Buffer.from(findClassAsset(lesson.id, assetName, teacher.id, db)).toString(), 'audio-data');
  assert.equal(Buffer.from(findClassAsset(lesson.id, lesson.cover.split('/').at(-1), teacher.id, db)).toString(), 'cover-data');
  assert.ok(lesson.content.stages[0].content[0].audioSrc.startsWith(`/api/classes/${lesson.id}/assets/`));
  assert.equal(createClass(input, teacher.id, db).id, lesson.id);
  assert.equal(listClasses(teacher.id, db).length, 1);
  assert.throws(() => createClass({ ...input, name: 'Changed' }, teacher.id, db), { statusCode: 409 });
});
test('unavailable or changed lessons, missing assets and invalid input cannot create a class', t => {
  const { db, teacher, input, assetName } = fixture(t);
  for (const patch of [{ name: '' }, { name: 'a'.repeat(81) }, { timeZone: 'Invalid' }, { scheduledAt: 'yesterday' }, { scheduledAt: '2000-01-01T00:00:00Z' }]) {
    assert.throws(() => createClass({ ...input, ...patch }, teacher.id, db), { statusCode: 400 });
  }
  for (const patch of [{ lessonId: 'animals' }, { expectedRevision: 0 }, { lessonId: 'missing' }]) {
    assert.throws(() => createClass({ ...input, ...patch }, teacher.id, db), { statusCode: 409 });
  }
  db.prepare('DELETE FROM library_assets WHERE file_name = ?').run(assetName);
  assert.throws(() => createClass(input, teacher.id, db), { statusCode: 409 });
  assert.equal(db.prepare('SELECT count(*) n FROM classes').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) n FROM class_assets').get().n, 0);
});
test('schedule sorts dated lessons before undated lessons and excludes finished classes', t => {
  const { db, teacher, input } = fixture(t);
  const undated = createClass(input, teacher.id, db);
  const later = createClass({ ...input, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-02T10:00:00Z' }, teacher.id, db);
  const first = createClass({ ...input, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00Z' }, teacher.id, db);
  assert.deepEqual(listClasses(teacher.id, db).map(item => item.id), [first.id, later.id, undated.id]);
  assert.equal(new Set([first.invitePath, later.invitePath, undated.invitePath]).size, 3);
  db.prepare("UPDATE classes SET status = 'completed' WHERE id = ?").run(first.id);
  assert.deepEqual(listClasses(teacher.id, db).map(item => item.id), [later.id, undated.id]);
});
test('class API creates once, renders schedule and teacher lesson, protects all routes and supports snapshot audio ranges', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classes-http-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { db, teacher, other, input } = fixture(t, path.join(dir, 'app.sqlite'));
  const cookie = `teach_session=${createSession(teacher.id, db).token}`;
  const otherCookie = `teach_session=${createSession(other.id, db).token}`;
  const net = require('node:net');
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, APP_DB_PATH: path.join(dir, 'app.sqlite'), DRAFT_ASSETS_DIR: dir, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test' }, stdio: 'ignore' });
  t.after(async () => { server.kill(); await new Promise(resolve => server.exitCode !== null ? resolve() : server.once('exit', resolve)); });
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try { ready = (await fetch(base + '/health')).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.ok(ready);
  const request = (route, auth = cookie, method = 'GET', body) => fetch(base + route, { method, redirect: 'manual', headers: { ...(auth ? { Cookie: auth } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await request('/schedule', null)).status, 302);
  assert.equal((await request('/api/classes', null)).status, 401);
  assert.equal((await request('/api/classes', null, 'POST', input)).status, 401);
  const content = await (await request('/api/home-content')).json();
  assert.deepEqual(content.onboardingRecommendations.map(item => item.id), ['superhero']);
  const response = await request('/api/classes', cookie, 'POST', input);
  assert.equal(response.status, 201);
  const { lesson } = await response.json();
  const repeated = await (await request('/api/classes', cookie, 'POST', input)).json();
  assert.equal(repeated.lesson.id, lesson.id);
  assert.equal((await (await request('/api/classes')).json()).classes.length, 1);
  assert.equal((await (await request('/api/home-content')).json()).hasClasses, true);
  assert.equal((await (await request('/api/classes', otherCookie)).json()).classes.length, 0);
  assert.match(await (await request('/schedule')).text(), /Предстоящие уроки/);
  assert.equal((await request(lesson.lessonPath)).status, 200);
  assert.equal((await request(lesson.lessonPath, null)).status, 302);
  assert.equal((await request(lesson.lessonPath, otherCookie)).status, 404);
  assert.equal((await request(`/api/classes/${lesson.id}`, otherCookie)).status, 404);
  const invite = await request(lesson.invitePath);
  assert.equal(invite.status, 302);
  assert.equal(invite.headers.get('location'), `${lesson.lessonPath}/student`);
  assert.equal((await request(lesson.invitePath, otherCookie)).status, 302);
  assert.equal((await request(lesson.invitePath, null)).status, 302);
  const legacyToken = 'c'.repeat(48);
  db.prepare('UPDATE classes SET invite_token = ? WHERE id = ?').run(legacyToken, lesson.id);
  const legacyInvite = await request(`/join/${legacyToken}`);
  assert.equal(legacyInvite.status, 302);
  assert.equal(legacyInvite.headers.get('location'), `${lesson.lessonPath}/student`);
  assert.equal((await request(`/join/${legacyToken}`, otherCookie)).status, 302);
  const media = lesson.content.stages[0].content[0].audioSrc;
  db.prepare("UPDATE library_lessons SET is_published = 0 WHERE id = 'superhero'").run();
  assert.equal((await request(media, null)).status, 401);
  assert.equal((await request(media, otherCookie)).status, 404);
  assert.equal((await request(media, cookie, 'HEAD')).status, 200);
  const range = await fetch(base + media, { headers: { Cookie: cookie, Range: 'bytes=0-4' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), 'audio');
  assert.equal((await (await request(`/api/classes/${lesson.id}`)).json()).lesson.title, lesson.title);
});

test('invite names transliterate Russian, normalize punctuation and have a bounded fallback', () => {
  const { slug } = require('../assets/class-invite.js');
  assert.equal(slug(' Анна English! '), 'anna-english');
  assert.equal(slug('Группа B1 — Пётр'), 'gruppa-b1-petr');
  assert.equal(slug('Café / English'), 'cafe-english');
  assert.equal(slug('🎓'), 'new-class');
  assert.equal(slug('а'.repeat(80)).length, 48);
  assert.ok(!slug('a'.repeat(47) + ' — test').endsWith('-'));
});
