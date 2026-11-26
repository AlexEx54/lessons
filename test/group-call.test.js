'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClassSession } = require('../lib/class-store.js');
const { joinClass, pickStudent } = require('../lib/class-live-store.js');
const { syntheticLesson } = require('./helpers/synthetic-lessons.js');
const { addLibraryLesson } = require('./helpers/library.js');

const KEY = 'key', SECRET = 'secret-of-at-least-32-characters!';
const claimsOf = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
const waitFor = async (check, what) => {
  for (const deadline = Date.now() + 2000; Date.now() < deadline;) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${what}`);
};

// LiveKit's room API as far as the app uses it, with the participants who entered with the app's passes.
async function fakeLiveKit(t) {
  const rooms = new Map(); // room name → Map(identity → participant)
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const method = req.url.split('/').at(-1), input = JSON.parse(body);
      calls.push({ method, ...input });
      const room = rooms.get(input.room), participant = room?.get(input.identity);
      const reply = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
      const missing = () => reply(404, { code: 'not_found', msg: 'does not exist' });
      if (method === 'ListRooms') reply(200, { rooms: [...rooms.keys()].map(name => ({ name })) });
      else if (method === 'ListParticipants') reply(200, { participants: [...(room?.values() || [])] });
      else if (method === 'GetParticipant') participant ? reply(200, participant) : missing();
      else if (method === 'MutePublishedTrack') { participant.tracks.find(track => track.sid === input.track_sid).muted = true; reply(200, {}); }
      else if (method === 'RemoveParticipant') participant ? (room.delete(input.identity), reply(200, {})) : missing();
      else if (method === 'DeleteRoom') room ? (rooms.delete(input.room), reply(200, {})) : missing();
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  return { rooms, calls, url: `http://127.0.0.1:${server.address().port}`,
    // A participant enters with a pass, publishing their microphone and camera.
    enter(token) {
      const { sub, name, metadata, video: { room } } = claimsOf(token);
      if (!rooms.has(room)) rooms.set(room, new Map());
      rooms.get(room).set(sub, { identity: sub, name, metadata,
        tracks: [{ sid: `TR_${sub}_mic`, source: 'MICROPHONE' }, { sid: `TR_${sub}_cam`, source: 'CAMERA' }] });
    },
  };
}

// A database with one teacher; `serve(env)` starts the app over it.
function setup(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'group-call-'));
  const databasePath = path.join(directory, 'app.sqlite');
  const db = openDatabase(databasePath);
  let server;
  const sockets = [];
  t.after(async () => {
    sockets.forEach(socket => socket.terminate());
    if (server?.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const teacher = createUser({ email: 'group@test.local', displayName: 'Анна Сергеевна', role: 'teacher', passwordHash: 'unused' }, db);
  const teacherCookie = `teach_session=${createSession(teacher.id, db).token}`;
  addLibraryLesson(db, syntheticLesson());
  const makeSession = (className, isGroup = true) => createClassSession({ className, isGroup, lessonId: 'superhero', expectedRevision: 1,
    requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00.000Z' }, teacher.id, db);
  // A student of a group who picked their name on this device.
  const student = (lesson, name) => {
    const token = lesson.classInvitePath.split('/').at(-1);
    const cookie = joinClass({ headers: {} }, token, db).cookie.split(';')[0];
    pickStudent({ headers: { cookie } }, token, { name }, db);
    return { cookie, id: db.prepare('SELECT id FROM class_students WHERE name = ?').get(name).id };
  };

  async function serve(env = {}) {
    const probe = require('node:net').createServer();
    await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    const base = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), stdio: 'ignore', env: { ...process.env,
      APP_DB_PATH: databasePath, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test', LIVEKIT_API_KEY: '', LIVEKIT_API_SECRET: '', ...env } });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    const request = (route, cookie, options = {}) => fetch(base + route, { redirect: 'manual', ...options,
      headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers } });
    const post = (route, cookie, body) => request(route, cookie, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    function connect(route, cookie) {
      const socket = new WebSocket(`ws://127.0.0.1:${port}${route}`, { headers: { Cookie: cookie, Origin: base } });
      sockets.push(socket);
      const messages = [];
      socket.on('message', raw => messages.push(JSON.parse(raw)));
      socket.next = async (type, accept = () => true) => {
        let found;
        await waitFor(() => {
          const index = messages.findIndex(message => message.type === type && accept(message));
          if (index >= 0) found = messages.splice(index, 1)[0];
          return found;
        }, type);
        return found;
      };
      return socket;
    }
    // A webhook as LiveKit signs it: a bare JWT whose sha256 claim is the base64 hash of the body.
    function webhook(event, room, secret = SECRET) {
      const body = JSON.stringify({ event, room: { name: room } });
      const now = Math.floor(Date.now() / 1000);
      const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const data = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: KEY, nbf: now, exp: now + 300,
        sha256: crypto.createHash('sha256').update(body).digest('base64') })}`;
      return request('/api/livekit/webhook', null, { method: 'POST', body,
        headers: { 'Content-Type': 'application/webhook+json', Authorization: `${data}.${crypto.createHmac('sha256', secret).update(data).digest('base64url')}` } });
    }
    return { request, post, connect, webhook };
  }
  return { db, teacherCookie, makeSession, student, serve };
}

test('group call: passes for those in the lesson, presence from LiveKit, the teacher mutes, removes and ends', { timeout: 20000 }, async t => {
  const { teacherCookie, makeSession, student, serve } = setup(t);
  const livekit = await fakeLiveKit(t);
  const lesson = makeSession('Группа B1'), single = makeSession('Маша', false);
  const masha = student(lesson, 'Маша'), petya = student(lesson, 'Петя'), olya = student(lesson, 'Оля');
  const { request, post, connect, webhook } = await serve({ LIVEKIT_API_KEY: KEY, LIVEKIT_API_SECRET: SECRET, LIVEKIT_URL: livekit.url });
  const pass = (role, cookie) => request(`/api/sessions/${lesson.id}/call?role=${role}`, cookie);
  const room = `session:${lesson.id}`;
  const action = (name, body, cookie = teacherCookie, id = lesson.id) => post(`/api/sessions/${id}/call/${name}`, cookie, body);
  const inCall = (teacher, students) => message => message.teacher === teacher && JSON.stringify(message.students) === JSON.stringify(students);

  // A pass is given only to those who have a place in the lesson.
  const notYet = await pass('teacher', teacherCookie);
  assert.deepEqual([notYet.status, (await notYet.json()).error], [403, 'Звонок откроется, когда вы войдёте в занятие.']);
  let teacherPage = connect(`/ws/sessions/${lesson.id}?role=teacher`, teacherCookie);
  assert.deepEqual((await teacherPage.next('snapshot')).callPresence, { teacher: false, students: [] });
  const mashaPage = connect(`/ws/sessions/${lesson.id}?role=student`, masha.cookie);
  await mashaPage.next('snapshot');
  await connect(`/ws/sessions/${lesson.id}?role=student`, petya.cookie).next('snapshot');
  assert.equal((await pass('student', olya.cookie)).status, 403);
  assert.equal((await pass('teacher', masha.cookie)).status, 403);

  // The pass names the participant and their role, in the session's room.
  const passes = {};
  for (const [key, role, cookie] of [['teacher', 'teacher', teacherCookie], ['masha', 'student', masha.cookie], ['petya', 'student', petya.cookie]]) {
    const answer = await (await pass(role, cookie)).json();
    assert.equal(answer.url, livekit.url.replace(/^http/, 'ws'));
    passes[key] = answer.token;
  }
  const claims = claimsOf(passes.masha);
  assert.deepEqual([claims.sub, claims.name, claims.metadata, claims.video.room], [masha.id, 'Маша', '{"role":"student"}', room]);
  assert.deepEqual([claimsOf(passes.teacher).name, claimsOf(passes.teacher).metadata], ['Анна Сергеевна', '{"role":"teacher"}']);

  // LiveKit's webhooks make the app ask who is in the call; the lesson pages hear it.
  livekit.enter(passes.teacher);
  livekit.enter(passes.masha);
  assert.equal((await webhook('participant_joined', room)).status, 200);
  await teacherPage.next('call-presence', inCall(true, ['Маша']));
  livekit.enter(passes.petya);
  assert.equal((await webhook('participant_joined', room, 'another-secret')).status, 401);
  assert.equal((await webhook('participant_joined', room)).status, 200);
  await mashaPage.next('call-presence', inCall(true, ['Маша', 'Петя']));
  teacherPage = connect(`/ws/sessions/${lesson.id}?role=teacher`, teacherCookie);
  assert.deepEqual((await teacherPage.next('snapshot')).callPresence, { teacher: true, students: ['Маша', 'Петя'] });

  // Only the teacher mutes, a microphone or a camera of someone in the call; a muted track is left alone.
  assert.equal((await action('mute', { identity: masha.id, source: 'microphone' }, masha.cookie)).status, 401);
  assert.equal((await action('mute', { identity: masha.id, source: 'screen' })).status, 400);
  const absent = await action('mute', { identity: olya.id, source: 'microphone' });
  assert.deepEqual([absent.status, (await absent.json()).error], [404, 'Ученика нет в звонке.']);
  assert.equal((await action('mute', { identity: masha.id, source: 'microphone' })).status, 200);
  assert.equal((await action('mute', { identity: masha.id, source: 'microphone' })).status, 200);
  assert.deepEqual(livekit.calls.filter(call => call.method === 'MutePublishedTrack'),
    [{ method: 'MutePublishedTrack', room, identity: masha.id, track_sid: `TR_${masha.id}_mic`, muted: true }]);
  assert.equal((await action('mute', { identity: masha.id, source: 'microphone' }, teacherCookie, single.id)).status, 404);

  // A removed student leaves the call.
  assert.equal((await action('remove', { identity: petya.id })).status, 200);
  assert.deepEqual([...livekit.rooms.get(room).keys()], [claimsOf(passes.teacher).sub, masha.id]);
  await webhook('participant_left', room);
  await teacherPage.next('call-presence', inCall(true, ['Маша']));

  // Ending the call closes the room for everyone.
  assert.equal((await action('end', {}, masha.cookie)).status, 401);
  assert.equal((await action('end', {})).status, 200);
  assert.equal(livekit.rooms.has(room), false);
  await mashaPage.next('call-presence', inCall(false, []));

  // A cancelled session ends its call too.
  livekit.enter(passes.masha);
  const cancel = await request(`/api/sessions/${lesson.id}`, teacherCookie, { method: 'PATCH',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'cancelled' }) });
  assert.equal(cancel.status, 200);
  await waitFor(() => !livekit.rooms.has(room), 'the room to close');
});

test('group call: at start the app asks LiveKit who is already in a call', { timeout: 20000 }, async t => {
  const { teacherCookie, makeSession, serve } = setup(t);
  const livekit = await fakeLiveKit(t);
  const lesson = makeSession('Группа B1');
  // The participants stayed in the call while the app restarted.
  livekit.rooms.set(`session:${lesson.id}`, new Map([
    ['teacher', { identity: 'teacher', name: 'Анна Сергеевна', metadata: '{"role":"teacher"}', tracks: [] }],
    ['olya', { identity: 'olya', name: 'Оля', metadata: '{"role":"student"}', tracks: [] }],
  ]));
  const { connect } = await serve({ LIVEKIT_API_KEY: KEY, LIVEKIT_API_SECRET: SECRET, LIVEKIT_URL: livekit.url });
  await waitFor(() => livekit.calls.some(call => call.method === 'ListParticipants'), 'the app to ask LiveKit');
  // The page learns it on entering, or right after if LiveKit's answer is still on its way.
  const page = connect(`/ws/sessions/${lesson.id}?role=teacher`, teacherCookie);
  let { callPresence } = await page.next('snapshot');
  if (!callPresence.teacher) { const { type, ...presence } = await page.next('call-presence'); callPresence = presence; }
  assert.deepEqual(callPresence, { teacher: true, students: ['Оля'] });
});

test('group call: without LiveKit configured a group has no call', { timeout: 20000 }, async t => {
  const { teacherCookie, makeSession, serve } = setup(t);
  const lesson = makeSession('Группа B1');
  const { request, connect, webhook } = await serve();
  await connect(`/ws/sessions/${lesson.id}?role=teacher`, teacherCookie).next('snapshot');
  const refused = await request(`/api/sessions/${lesson.id}/call?role=teacher`, teacherCookie);
  assert.deepEqual([refused.status, (await refused.json()).error], [503, 'Групповые звонки не настроены.']);
  assert.equal((await webhook('participant_joined', `session:${lesson.id}`)).status, 503);
  // Ending a call that cannot exist is fine.
  assert.equal((await request(`/api/sessions/${lesson.id}/call/end`, teacherCookie, { method: 'POST' })).status, 200);
});
