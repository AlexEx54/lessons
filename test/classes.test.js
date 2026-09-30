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
const { listClasses, createClassSession, updateClassSession, clearClassSessions, findClassSession, listClassSessions, findClassSessionAsset } = require('../lib/class-store.js');
const { joinClass } = require('../lib/class-live-store.js');
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
  const input = { className: 'Анна', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00.000Z', timeZone: 'Asia/Almaty' };
  const plan = (patch, ownerId = teacher.id) => createClassSession({ ...input, requestKey: crypto.randomUUID(), ...patch }, ownerId, db);
  return { db, teacher, other, input, plan, assetName };
}
const tokenOf = session => session.classInvitePath.split('/').at(-1);
test('session snapshot and media survive changes and removal of the source; access is owner-only', t => {
  const { db, teacher, other, input, assetName } = fixture(t);
  const session = createClassSession(input, teacher.id, db);
  assert.equal(session.class_name, 'Анна');
  assert.match(session.classInvitePath, /^\/join\/anna-[a-f0-9]{48}$/);
  assert.equal(session.sessionInvitePath, `${session.classInvitePath}/${session.id}`);
  assert.equal(session.path, `/sessions/${session.id}`);
  assert.ok(session.cover.startsWith(`/api/sessions/${session.id}/assets/`));
  assert.equal(session.scheduled_at, '2099-01-01T10:00:00.000Z');
  assert.equal(findClassSession(session.id, other.id, db), null);
  assert.deepEqual(listClassSessions(other.id, db), []);
  assert.deepEqual(listClasses(other.id, db), []);
  db.prepare("UPDATE library_lessons SET content_json = '{}', revision = 2, is_published = 0 WHERE id = 'superhero'").run();
  assert.equal(findClassSession(session.id, teacher.id, db).content.meta.title, 'Published title');
  assert.equal(findClassSessionAsset(session.id, assetName, other.id, db), undefined);
  db.prepare("DELETE FROM library_lessons WHERE id = 'superhero'").run();
  assert.equal(Buffer.from(findClassSessionAsset(session.id, assetName, teacher.id, db)).toString(), 'audio-data');
  assert.equal(Buffer.from(findClassSessionAsset(session.id, session.cover.split('/').at(-1), teacher.id, db)).toString(), 'cover-data');
  assert.ok(session.content.stages[0].content[0].audioSrc.startsWith(`/api/sessions/${session.id}/assets/`));
  assert.equal(createClassSession(input, teacher.id, db).id, session.id);
  assert.equal(listClassSessions(teacher.id, db).length, 1);
  assert.equal(listClasses(teacher.id, db).length, 1);
  assert.throws(() => createClassSession({ ...input, className: 'Changed' }, teacher.id, db), { statusCode: 409 });
});
test('sessions join an existing class and keep its permanent link', t => {
  const { db, teacher, other, plan } = fixture(t);
  const first = plan();
  const second = plan({ className: undefined, classId: first.class_id, scheduledAt: '2099-01-08T10:00:00.000Z' });
  assert.equal(second.class_id, first.class_id);
  assert.equal(second.classInvitePath, first.classInvitePath);
  assert.notEqual(second.sessionInvitePath, first.sessionInvitePath);
  const group = plan({ className: 'Группа B1' });
  const plannedAt = (session, day) => db.prepare('UPDATE class_sessions SET created_at = ? WHERE id = ?').run(`2026-09-0${day}T10:00:00.000Z`, session.id);
  [first, second, group].forEach((session, index) => plannedAt(session, index + 1));
  assert.deepEqual(listClasses(teacher.id, db).map(item => [item.name, item.invitePath]), [['Группа B1', group.classInvitePath], ['Анна', first.classInvitePath]]);
  plannedAt(plan({ className: undefined, classId: first.class_id }), 4);
  assert.deepEqual(listClasses(teacher.id, db).map(item => item.name), ['Анна', 'Группа B1']);
  assert.throws(() => plan({ className: undefined, classId: first.class_id }, other.id), { statusCode: 404 });
  assert.throws(() => plan({ className: undefined, classId: 'not-a-class' }), { statusCode: 400 });
  assert.equal(db.prepare('SELECT count(*) n FROM classes').get().n, 2);
});
test('unavailable or changed lessons, missing assets and invalid input cannot create a session', t => {
  const { db, teacher, input, assetName } = fixture(t);
  for (const patch of [{ className: '' }, { className: 'a'.repeat(81) }, { timeZone: 'Invalid' }, { scheduledAt: undefined }, { scheduledAt: '' }, { scheduledAt: 'yesterday' }, { scheduledAt: '2000-01-01T00:00:00Z' }]) {
    assert.throws(() => createClassSession({ ...input, ...patch }, teacher.id, db), { statusCode: 400 });
  }
  for (const patch of [{ lessonId: 'animals' }, { expectedRevision: 0 }, { lessonId: 'missing' }]) {
    assert.throws(() => createClassSession({ ...input, ...patch }, teacher.id, db), { statusCode: 409 });
  }
  db.prepare('DELETE FROM library_assets WHERE file_name = ?').run(assetName);
  assert.throws(() => createClassSession(input, teacher.id, db), { statusCode: 409 });
  for (const table of ['classes', 'class_sessions', 'class_assets']) assert.equal(db.prepare(`SELECT count(*) n FROM ${table}`).get().n, 0);
});
test('schedule lists the latest sessions first and excludes cancelled ones', t => {
  const { db, teacher, plan } = fixture(t);
  const early = plan({ scheduledAt: '2099-01-01T10:00:00Z' }), late = plan({ scheduledAt: '2099-01-03T10:00:00Z' }), middle = plan({ scheduledAt: '2099-01-02T10:00:00Z' });
  assert.deepEqual(listClassSessions(teacher.id, db).map(item => item.id), [late.id, middle.id, early.id]);
  updateClassSession(late.id, { status: 'cancelled' }, teacher.id, db);
  assert.deepEqual(listClassSessions(teacher.id, db).map(item => item.id), [middle.id, early.id]);
});
test('teacher reschedules and cancels only their own upcoming sessions', t => {
  const { db, teacher, other, input } = fixture(t);
  const session = createClassSession(input, teacher.id, db);
  const moved = updateClassSession(session.id, { scheduledAt: '2099-02-01T09:30:00Z' }, teacher.id, db);
  assert.equal(moved.scheduled_at, '2099-02-01T09:30:00.000Z');
  assert.equal(moved.content, undefined);
  for (const body of [null, [], {}, { scheduledAt: null }, { scheduledAt: '2000-01-01T00:00:00Z' }, { status: 'completed' }]) {
    assert.throws(() => updateClassSession(session.id, body, teacher.id, db), { statusCode: 400 });
  }
  assert.throws(() => updateClassSession(session.id, { status: 'cancelled' }, other.id, db), { statusCode: 404 });
  assert.equal(updateClassSession(session.id, { status: 'cancelled' }, teacher.id, db).status, 'cancelled');
  assert.deepEqual(listClassSessions(teacher.id, db), []);
  assert.throws(() => updateClassSession(session.id, { scheduledAt: '2099-03-01T09:30:00Z' }, teacher.id, db), { statusCode: 404 });
});
test('clearing sessions removes every owner session with its media but keeps classes and other teachers intact', t => {
  const { db, teacher, other, plan } = fixture(t);
  const cancelled = plan();
  updateClassSession(cancelled.id, { status: 'cancelled' }, teacher.id, db);
  plan();
  const foreign = plan({}, other.id);
  assert.equal(clearClassSessions(teacher.id, db), 2);
  assert.deepEqual(db.prepare('SELECT id FROM class_sessions').all().map(row => row.id), [foreign.id]);
  assert.deepEqual(db.prepare('SELECT session_id FROM class_assets').all().map(row => row.session_id), [foreign.id, foreign.id]);
  assert.equal(listClasses(teacher.id, db).length, 2);
  assert.equal(clearClassSessions(teacher.id, db), 0);
});
test('the class link opens the running session, otherwise the nearest upcoming one', t => {
  const { db, teacher, plan } = fixture(t);
  const first = plan();
  const token = tokenOf(first);
  const at = minutes => new Date(Date.now() + minutes * 60000).toISOString();
  const schedule = (session, minutes) => db.prepare('UPDATE class_sessions SET scheduled_at = ? WHERE id = ?').run(at(minutes), session.id);
  const current = () => joinClass({ headers: {} }, token, db).sessionId;
  const add = minutes => { const session = plan({ className: undefined, classId: first.class_id }); schedule(session, minutes); return session; };
  schedule(first, -200);
  assert.equal(current(), null);
  const nextWeek = add(7 * 24 * 60), tomorrow = add(24 * 60);
  assert.equal(current(), tomorrow.id);
  const running = add(-80);
  assert.equal(current(), running.id);
  const backToBack = add(-10);
  assert.equal(current(), backToBack.id);
  updateClassSession(backToBack.id, { status: 'cancelled' }, teacher.id, db);
  assert.equal(current(), running.id);
  schedule(running, -100);
  assert.equal(current(), tomorrow.id);
  assert.equal(joinClass({ headers: {} }, token, db, nextWeek.id).sessionId, nextWeek.id);
  assert.throws(() => joinClass({ headers: {} }, token, db, backToBack.id), { statusCode: 404 });
  assert.throws(() => joinClass({ headers: {} }, token, db, plan().id), { statusCode: 404 });
  assert.throws(() => joinClass({ headers: {} }, 'missing', db), { statusCode: 404 });
});
test('session API creates once, renders schedule and teacher lesson, protects all routes and supports snapshot audio ranges', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'classes-http-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const { db, teacher, other, input, plan } = fixture(t, path.join(dir, 'app.sqlite'));
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
  assert.equal((await request('/api/sessions', null)).status, 401);
  assert.equal((await request('/api/sessions', null, 'POST', input)).status, 401);
  assert.equal((await request('/api/classes', null)).status, 401);
  const content = await (await request('/api/home-content')).json();
  assert.deepEqual(content.onboardingRecommendations.map(item => item.id), ['superhero']);
  const response = await request('/api/sessions', cookie, 'POST', input);
  assert.equal(response.status, 201);
  const { session } = await response.json();
  const repeated = await (await request('/api/sessions', cookie, 'POST', input)).json();
  assert.equal(repeated.session.id, session.id);
  const next = await request('/api/sessions', cookie, 'POST', { ...input, className: undefined, classId: session.class_id, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-08T10:00:00.000Z' });
  assert.equal((await next.json()).session.classInvitePath, session.classInvitePath);
  assert.equal((await (await request('/api/sessions')).json()).sessions.length, 2);
  assert.deepEqual((await (await request('/api/classes')).json()).classes.map(item => item.invitePath), [session.classInvitePath]);
  assert.equal((await (await request('/api/home-content')).json()).hasClasses, true);
  assert.equal((await (await request('/api/sessions', otherCookie)).json()).sessions.length, 0);
  assert.equal((await (await request('/api/classes', otherCookie)).json()).classes.length, 0);
  assert.match(await (await request('/schedule')).text(), /id="schedule-grid"/);
  assert.equal((await request(session.path)).status, 200);
  assert.equal((await request(session.path, null)).status, 302);
  assert.equal((await request(session.path, otherCookie)).status, 404);
  assert.equal((await request(`/api/sessions/${session.id}`, otherCookie)).status, 404);
  for (const link of [session.classInvitePath, session.sessionInvitePath]) {
    const invite = await request(link, null);
    assert.equal(invite.status, 302);
    assert.equal(invite.headers.get('location'), `${session.path}/student`);
  }
  assert.equal((await request(`${session.classInvitePath}/${plan().id}`, null)).status, 404);
  const media = session.content.stages[0].content[0].audioSrc;
  db.prepare("UPDATE library_lessons SET is_published = 0 WHERE id = 'superhero'").run();
  assert.equal((await request(media, null)).status, 401);
  assert.equal((await request(media, otherCookie)).status, 404);
  assert.equal((await request(media, cookie, 'HEAD')).status, 200);
  const range = await fetch(base + media, { headers: { Cookie: cookie, Range: 'bytes=0-4' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), 'audio');
  assert.equal((await (await request(`/api/sessions/${session.id}`)).json()).session.title, session.title);
  const detail = `/api/sessions/${session.id}`;
  assert.equal((await request(detail, null, 'PATCH', { status: 'cancelled' })).status, 401);
  assert.equal((await request(detail, otherCookie, 'PATCH', { status: 'cancelled' })).status, 404);
  assert.equal((await request(detail, cookie, 'PATCH', { scheduledAt: 'soon' })).status, 400);
  const moved = await request(detail, cookie, 'PATCH', { scheduledAt: '2099-05-01T08:00:00Z' });
  assert.equal((await moved.json()).session.scheduled_at, '2099-05-01T08:00:00.000Z');
  assert.equal((await request(detail, cookie, 'PATCH', { status: 'cancelled' })).status, 200);
  assert.equal((await (await request('/api/sessions')).json()).sessions.length, 2);
  assert.equal((await request(session.sessionInvitePath, null)).status, 404);
  assert.equal((await request('/api/sessions', null, 'DELETE')).status, 401);
  assert.deepEqual(await (await request('/api/sessions', cookie, 'DELETE')).json(), { deleted: 3 });
  assert.equal((await request(detail)).status, 404);
  assert.equal((await request(media)).status, 404);
  const waiting = await request(session.classInvitePath, null);
  assert.equal(waiting.status, 200);
  assert.match(waiting.headers.get('set-cookie'), /^class_guest_/);
  assert.match(await waiting.text(), /Следующее занятие пока не назначено/);
  assert.equal((await (await request('/api/classes')).json()).classes.length, 2);
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
