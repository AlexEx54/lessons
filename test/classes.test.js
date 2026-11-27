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
const { listClasses, updateClass, deleteClass, listClassHistory, createClassSession, updateClassSession, clearClassSessions, findClassSession, listClassSessions, hasClassSessionAsset } = require('../lib/class-store.js');
const { putMedia } = require('./helpers/media.js');
const { joinClass, classOverview, pickStudent, authorizeSession } = require('../lib/class-live-store.js');
const { addLibraryLesson } = require('./helpers/library.js');
function fixture(t, dbPath = ':memory:') {
  const db = openDatabase(dbPath);
  t.after(() => db.close());
  const user = () => createUser({ email: `${crypto.randomUUID()}@test.local`, displayName: 'Teacher', role: 'teacher', passwordHash: 'unused' }, db);
  const teacher = user(), other = user();
  const assetName = `${'a'.repeat(64)}.mp3`;
  const content = { meta: { title: 'Published title' }, stages: [{ id: 'intro', title: 'Introduction', content: [{ id: 'audio', type: 'audioPlayer', audioSrc: `/api/library/superhero/assets/${assetName}` }] }] };
  addLibraryLesson(db, content);
  const coverName = `${'b'.repeat(64)}.png`;
  for (const [name, data] of [[assetName, 'audio-data'], [coverName, 'cover-data']]) {
    db.prepare('INSERT INTO library_assets VALUES (?, ?)').run('superhero', name);
    if (dbPath !== ':memory:') putMedia(dbPath, name, data);
  }
  db.prepare('UPDATE library_lessons SET cover = ? WHERE id = ?').run(`/api/library/superhero/assets/${coverName}`, 'superhero');
  const input = { className: 'Анна', level: 'A2', age: '12-14', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00.000Z', timeZone: 'Asia/Almaty' };
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
  assert.equal(hasClassSessionAsset(session.id, assetName, other.id, db), false);
  db.prepare("DELETE FROM library_lessons WHERE id = 'superhero'").run();
  assert.equal(hasClassSessionAsset(session.id, assetName, teacher.id, db), true);
  assert.equal(hasClassSessionAsset(session.id, session.cover.split('/').at(-1), teacher.id, db), true);
  // The session refers to the library files by name instead of copying their bytes.
  assert.deepEqual(db.prepare('SELECT file_name FROM class_assets WHERE session_id = ? ORDER BY file_name').all(session.id).map(row => row.file_name),
    [assetName, `${'b'.repeat(64)}.png`]);
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
test('a class keeps its level and age, edited only by its owner together with the name', t => {
  const { db, teacher, other, plan } = fixture(t);
  const { class_id: id } = plan();
  assert.deepEqual(['level', 'age', 'age_label'].map(key => listClasses(teacher.id, db)[0][key]), ['A2', '12-14', '12–14 лет']);
  const edited = updateClass(id, { name: '  Анна К.  ', level: 'B1', age: '15-18' }, teacher.id, db);
  assert.deepEqual([edited.name, edited.level, edited.age, edited.age_label, edited.isGroup], ['Анна К.', 'B1', '15-18', '15–18 лет', false]);
  assert.equal(updateClass(id, { name: 'Анна', level: 'C2', age: 'adults' }, teacher.id, db).age_label, 'Взрослые');
  for (const body of [null, [], { level: 'A2', age: '12-14' }, { name: ' ', level: 'A2', age: '12-14' }, { name: 'x'.repeat(81), level: 'A2', age: '12-14' },
    { name: 'Анна', age: '12-14' }, { name: 'Анна', level: 'a2', age: '12-14' }, { name: 'Анна', level: 'A2' }, { name: 'Анна', level: 'A2', age: '19-25' }]) {
    assert.throws(() => updateClass(id, body, teacher.id, db), { statusCode: 400 });
  }
  assert.throws(() => updateClass(id, { name: 'Чужой', level: 'A1', age: '9-11' }, other.id, db), { statusCode: 404 });
  assert.deepEqual({ ...db.prepare('SELECT name, level, age FROM classes WHERE id = ?').get(id) }, { name: 'Анна', level: 'C2', age: 'adults' });
});
test('class history lists held and upcoming sessions with their grammar, counts held ones and finds the next one', t => {
  const { db, teacher, other, plan } = fixture(t);
  db.prepare("UPDATE library_lessons SET grammar_point = 'to-be' WHERE id = 'superhero'").run();
  const first = plan();
  const at = (session, scheduledAt) => db.prepare('UPDATE class_sessions SET scheduled_at = ? WHERE id = ?').run(scheduledAt, session.id);
  const sameClass = scheduledAt => plan({ className: undefined, classId: first.class_id, scheduledAt });
  at(first, '2026-09-01T10:00:00.000Z');
  const second = sameClass('2099-01-02T10:00:00.000Z');
  at(second, '2026-09-08T10:00:00.000Z');
  const later = sameClass('2099-02-01T10:00:00.000Z');
  const next = sameClass('2099-01-15T10:00:00.000Z');
  updateClassSession(sameClass('2099-01-10T10:00:00.000Z').id, { status: 'cancelled' }, teacher.id, db);
  // A session made from a lesson that later left the library keeps its place without a grammar point.
  db.prepare('UPDATE class_sessions SET library_lesson_id = NULL WHERE id = ?').run(second.id);
  const history = listClassHistory(first.class_id, teacher.id, db);
  assert.deepEqual(history.map(item => [item.id, item.held, item.grammar_title]), [
    [later.id, false, 'to be: am / is / are'], [next.id, false, 'to be: am / is / are'], [second.id, true, null], [first.id, true, 'to be: am / is / are']]);
  assert.deepEqual(Object.keys(history[0]).sort(), ['grammar_point', 'grammar_title', 'held', 'id', 'level', 'library_lesson_id', 'path', 'scheduled_at', 'title']);
  assert.equal(history[0].path, `/sessions/${later.id}`);
  const [anna] = listClasses(teacher.id, db);
  assert.deepEqual([anna.held_count, anna.next_session_at], [2, '2099-01-15T10:00:00.000Z']);
  const fresh = plan({ className: 'Новый' });
  at(fresh, '2026-09-02T10:00:00.000Z');
  updateClassSession(plan({ className: undefined, classId: fresh.class_id }).id, { status: 'cancelled' }, teacher.id, db);
  const newcomer = listClasses(teacher.id, db).find(item => item.id === fresh.class_id);
  assert.deepEqual([newcomer.held_count, newcomer.next_session_at], [1, null]);
  assert.equal(listClassHistory(first.class_id, other.id, db), null);
  assert.equal(listClassHistory(crypto.randomUUID(), teacher.id, db), null);
});
test('each class with a level and age gets its next grammar point, by the rules of the library', t => {
  const { db, teacher, plan } = fixture(t);
  addLibraryLesson(db, { stages: [] }, 'have-got');
  db.prepare("UPDATE library_lessons SET grammar_point = 'to-be', age = '9-11', level = 'A1' WHERE id = 'superhero'").run();
  db.prepare("UPDATE library_lessons SET grammar_point = 'have-got', age = '9-11', level = 'A1' WHERE id = 'have-got'").run();
  const nextPoint = name => listClasses(teacher.id, db).find(item => item.name === name).next_point;
  // The planned session covers «to be», so the class moves on to the next point that has a lesson.
  plan({ className: 'Анна', level: 'A1', age: '9-11' });
  assert.deepEqual(nextPoint('Анна'), { key: 'have-got', title: 'have got / has got', hint: nextPoint('Анна').hint });
  assert.equal(typeof nextPoint('Анна').hint, 'string');
  plan({ className: 'Борис', level: 'A2', age: '12-14' });
  assert.equal(nextPoint('Борис'), null, 'no A2 lessons in the library');
  const old = plan({ className: 'Старый', level: 'A1', age: '9-11' });
  db.prepare('UPDATE classes SET level = NULL, age = NULL WHERE id = ?').run(old.class_id);
  assert.equal(nextPoint('Старый'), null, 'a class without a profile has no program');
  const edited = updateClass(old.class_id, { name: 'Старый', level: 'A1', age: '9-11' }, teacher.id, db);
  assert.equal(edited.next_point.key, 'have-got');
});
test('deleting a class removes its sessions and media references, and only the owner can do it', t => {
  const { db, teacher, other, plan } = fixture(t);
  const first = plan();
  const cancelled = plan({ className: undefined, classId: first.class_id });
  updateClassSession(cancelled.id, { status: 'cancelled' }, teacher.id, db);
  const kept = plan({ className: 'Борис' });
  assert.equal(deleteClass(first.class_id, other.id, db), null);
  assert.equal(deleteClass(crypto.randomUUID(), teacher.id, db), null);
  assert.deepEqual(listClasses(teacher.id, db).map(item => [item.name, item.planned_count]), [['Борис', 1], ['Анна', 1]]);
  assert.deepEqual(deleteClass(first.class_id, teacher.id, db).sort(), [first.id, cancelled.id].sort());
  assert.deepEqual(listClasses(teacher.id, db).map(item => item.name), ['Борис']);
  assert.deepEqual(db.prepare('SELECT DISTINCT session_id FROM class_assets').all().map(row => row.session_id), [kept.id]);
  assert.equal(deleteClass(first.class_id, teacher.id, db), null);
});
test('unavailable or changed lessons, missing assets and invalid input cannot create a session', t => {
  const { db, teacher, input, assetName } = fixture(t);
  for (const patch of [{ className: '' }, { className: 'a'.repeat(81) }, { level: undefined }, { level: 'D1' }, { age: undefined }, { age: 'kids' }, { timeZone: 'Invalid' }, { scheduledAt: undefined }, { scheduledAt: '' }, { scheduledAt: 'yesterday' }, { scheduledAt: '2000-01-01T00:00:00Z' }]) {
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
test('the class home offers the running session, otherwise the nearest upcoming one', t => {
  const { db, teacher, plan } = fixture(t);
  const first = plan();
  const token = tokenOf(first);
  const at = minutes => new Date(Date.now() + minutes * 60000).toISOString();
  const schedule = (session, minutes) => db.prepare('UPDATE class_sessions SET scheduled_at = ? WHERE id = ?').run(at(minutes), session.id);
  const current = () => classOverview({ headers: {} }, token, db).current?.id ?? null;
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
  assert.equal(joinClass({ headers: {} }, token, db).sessionId, null);
  assert.equal(joinClass({ headers: {} }, token, db, nextWeek.id).sessionId, nextWeek.id);
  assert.throws(() => joinClass({ headers: {} }, token, db, backToBack.id), { statusCode: 404 });
  assert.throws(() => joinClass({ headers: {} }, token, db, plan().id), { statusCode: 404 });
  assert.throws(() => joinClass({ headers: {} }, 'missing', db), { statusCode: 404 });
});
test('the class home lists upcoming sessions nearest first and past ones newest first', t => {
  const { db, teacher, plan } = fixture(t);
  const first = plan();
  const token = tokenOf(first);
  const add = minutes => {
    const session = plan({ className: undefined, classId: first.class_id });
    db.prepare('UPDATE class_sessions SET scheduled_at = ? WHERE id = ?').run(new Date(Date.now() + minutes * 60000).toISOString(), session.id);
    return session;
  };
  db.prepare('DELETE FROM class_sessions WHERE id = ?').run(first.id);
  assert.deepEqual(classOverview({ headers: {} }, token, db), { className: 'Анна', isGroup: false, current: null, upcoming: [], past: [] });
  const lastWeek = add(-7 * 24 * 60), running = add(-10), nextWeek = add(7 * 24 * 60), tomorrow = add(24 * 60), cancelled = add(60);
  updateClassSession(cancelled.id, { status: 'cancelled' }, teacher.id, db);
  const overview = classOverview({ headers: {} }, token, db);
  assert.deepEqual(overview.upcoming.map(item => item.id), [tomorrow.id, nextWeek.id]);
  assert.deepEqual(overview.past.map(item => item.id), [running.id, lastWeek.id]);
  assert.deepEqual(overview.current, overview.past[0]);
  assert.deepEqual(Object.keys(overview.current).sort(), ['cover', 'duration', 'id', 'level', 'path', 'scheduledAt', 'title']);
  assert.equal(overview.current.path, `/sessions/${running.id}/student`);
  assert.equal(overview.current.cover, running.cover);
  assert.throws(() => classOverview({ headers: {} }, 'missing', db), { statusCode: 404 });
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
  assert.equal((await request('/classes', null)).headers.get('location'), '/login?next=%2Fclasses');
  assert.equal((await request('/api/sessions', null)).status, 401);
  assert.equal((await request('/api/sessions', null, 'POST', input)).status, 401);
  assert.equal((await request('/api/classes', null)).status, 401);
  assert.equal((await (await request('/api/home-content')).json()).hasClasses, false);
  const response = await request('/api/sessions', cookie, 'POST', input);
  assert.equal(response.status, 201);
  const { session } = await response.json();
  const repeated = await (await request('/api/sessions', cookie, 'POST', input)).json();
  assert.equal(repeated.session.id, session.id);
  const next = await request('/api/sessions', cookie, 'POST', { ...input, className: undefined, classId: session.class_id, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-08T10:00:00.000Z' });
  const nextSession = (await next.json()).session;
  assert.equal(nextSession.classInvitePath, session.classInvitePath);
  assert.equal((await (await request('/api/sessions')).json()).sessions.length, 2);
  assert.deepEqual((await (await request('/api/classes')).json()).classes.map(item => item.invitePath), [session.classInvitePath]);
  assert.equal((await (await request('/api/home-content')).json()).hasClasses, true);
  assert.equal((await (await request('/api/sessions', otherCookie)).json()).sessions.length, 0);
  assert.equal((await (await request('/api/classes', otherCookie)).json()).classes.length, 0);
  const classPath = `/api/classes/${session.class_id}`;
  const profile = { name: 'Анна', level: 'B1', age: '15-18' };
  assert.equal((await request(classPath, null, 'PATCH', profile)).status, 401);
  assert.equal((await request(classPath, otherCookie, 'PATCH', profile)).status, 404);
  assert.equal((await request(classPath, cookie, 'PATCH', { ...profile, age: 'teens' })).status, 400);
  const edited = await request(classPath, cookie, 'PATCH', profile);
  assert.equal(edited.status, 200);
  assert.deepEqual((({ level, age, age_label }) => ({ level, age, age_label }))((await edited.json()).class), { level: 'B1', age: '15-18', age_label: '15–18 лет' });
  assert.equal((await request(`${classPath}/sessions`, null)).status, 401);
  assert.equal((await request(`${classPath}/sessions`, otherCookie)).status, 404);
  assert.deepEqual((await (await request(`${classPath}/sessions`)).json()).sessions.map(item => item.id), [nextSession.id, session.id]);
  assert.match(await (await request('/schedule')).text(), /id="schedule-grid"/);
  assert.match(await (await request('/classes')).text(), /id="classes-list"/);
  assert.equal((await request(session.path)).status, 200);
  assert.equal((await request(session.path, null)).status, 302);
  assert.equal((await request(session.path, otherCookie)).status, 404);
  assert.equal((await request(`/api/sessions/${session.id}`, otherCookie)).status, 404);
  const home = await request(session.classInvitePath, null);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /src="\/assets\/class-home\.js"/);
  const guest = home.headers.get('set-cookie').split(';')[0];
  const list = await request(`${session.classInvitePath}/sessions`, guest);
  assert.equal(list.status, 200);
  assert.equal(list.headers.get('set-cookie'), null);
  assert.match(await list.text(), /id="class-sessions"/);
  const invite = await request(session.sessionInvitePath, guest);
  assert.equal(invite.status, 302);
  assert.equal(invite.headers.get('location'), `${session.path}/student`);
  const overview = await request(`/api${session.classInvitePath}`, null);
  assert.equal(overview.status, 200);
  assert.deepEqual((await overview.json()).upcoming.map(item => item.id), [session.id, nextSession.id]);
  assert.equal((await request(`/api/join/missing-${'0'.repeat(48)}`, null)).status, 404);
  assert.equal((await request(session.cover, guest)).status, 200);
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
  const emptyHome = await request(session.classInvitePath, null);
  assert.equal(emptyHome.status, 200);
  assert.match(emptyHome.headers.get('set-cookie'), /^class_guest_/);
  assert.equal((await (await request(`/api${session.classInvitePath}`, null)).json()).current, null);
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
test('a group student picks a name once per device and enters sessions as that student', t => {
  const { db, teacher, plan } = fixture(t);
  const session = plan({ className: 'Группа B1', isGroup: true });
  const token = tokenOf(session);
  assert.deepEqual(listClasses(teacher.id, db).map(item => [item.name, item.isGroup]), [['Группа B1', true]]);
  assert.throws(() => plan({ className: 'Группа C1', isGroup: 'yes' }), { statusCode: 400 });
  // A new device gets the class cookie but stays on the class home until the student picks a name.
  const joined = joinClass({ headers: {} }, token, db, session.id);
  assert.equal(joined.sessionId, null);
  const laptop = { headers: { cookie: joined.cookie.split(';')[0] } };
  assert.equal(joinClass(laptop, token, db, session.id).sessionId, null);
  assert.equal(authorizeSession(laptop, session.id, db, 'student'), null);
  const overview = classOverview(laptop, token, db);
  assert.deepEqual([overview.isGroup, overview.students, overview.me], [true, [], null]);
  assert.throws(() => pickStudent({ headers: {} }, token, { name: 'Маша' }, db), { statusCode: 403 });
  assert.throws(() => pickStudent(laptop, token, { name: '  ' }, db), { statusCode: 400 });
  assert.throws(() => pickStudent(laptop, token, { name: 'x'.repeat(41) }, db), { statusCode: 400 });
  const masha = pickStudent(laptop, token, { name: '  Маша   Петрова ' }, db).me;
  assert.equal(masha.name, 'Маша Петрова');
  const access = authorizeSession(laptop, session.id, db, 'student');
  assert.deepEqual([access.identity, access.studentId, access.name], [masha.id, masha.id, 'Маша Петрова']);
  assert.equal(joinClass(laptop, token, db, session.id).sessionId, session.id);
  // A second device finds the same student in the roster; names differ regardless of case.
  const phone = { headers: { cookie: joinClass({ headers: {} }, token, db).cookie.split(';')[0] } };
  assert.throws(() => pickStudent(phone, token, { name: 'маша петрова' }, db), { statusCode: 409 });
  assert.throws(() => pickStudent(phone, token, { studentId: crypto.randomUUID() }, db), { statusCode: 404 });
  pickStudent(phone, token, { studentId: masha.id }, db);
  assert.equal(authorizeSession(phone, session.id, db, 'student').identity, masha.id);
  // A brother at the same laptop switches to his own name.
  const petya = pickStudent(laptop, token, { name: 'Петя' }, db).me;
  assert.equal(authorizeSession(laptop, session.id, db, 'student').identity, petya.id);
  assert.deepEqual(classOverview(laptop, token, db).students.map(student => student.name), ['Маша Петрова', 'Петя']);
  assert.deepEqual(classOverview(phone, token, db).me, masha);
  // The roster is bounded until the teacher can edit it.
  for (let index = 3; index <= 30; index += 1) pickStudent(laptop, token, { name: `Ученик ${index}` }, db);
  assert.throws(() => pickStudent(laptop, token, { name: 'Ещё один' }, db), { statusCode: 409 });
  assert.equal(pickStudent(laptop, token, { studentId: masha.id }, db).me.id, masha.id);
  // An individual class has no roster: the device itself is the student.
  const single = plan();
  assert.throws(() => pickStudent(laptop, tokenOf(single), { name: 'Маша' }, db), { statusCode: 400 });
  const singleDevice = { headers: { cookie: joinClass({ headers: {} }, tokenOf(single), db).cookie.split(';')[0] } };
  assert.equal(authorizeSession(singleDevice, single.id, db, 'student').studentId, undefined);
  assert.equal(classOverview(singleDevice, tokenOf(single), db).students, undefined);
});
