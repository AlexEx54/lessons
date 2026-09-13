'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createVideoCall, endVideoCall, clearVideoCallHistory } = require('../lib/video-call-store.js');
const { createVideoCallChat, MAX_CALL } = require('../lib/video-call-chat.js');

async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'call-chat-'));
  let database = openDatabase(path.join(dir, 'app.sqlite'));
  const admin = createUser({ email: 'chat@test.test', displayName: 'Преподаватель', passwordHash: 'unused', role: 'admin' }, database);
  const other = createUser({ email: 'other@test.test', displayName: 'Другой', passwordHash: 'unused', role: 'admin' }, database);
  const cookie = `teach_session=${createSession(admin.id, database).token}`;
  const otherCookie = `teach_session=${createSession(other.id, database).token}`;
  const call = createVideoCall({ ownerAdminId: admin.id }, database);
  const otherCall = createVideoCall({ ownerAdminId: other.id }, database);
  const events = [];
  const directory = path.join(dir, 'files');
  let chat = createVideoCallChat({ database, directory, broadcast: (...args) => events.push(args) });
  const server = http.createServer(async (req, res) => { if (!await chat.handle(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const teacher = `${base}/api/video-calls/${call.id}/chat`;
  const guest = `${base}/api/public/video-calls/${call.guestToken}/chat`;
  t.after(async () => { chat.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); database.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { directory, database, admin, call, otherCall, events, cookie, otherCookie, base, teacher, guest,
    restart() { chat.close(); database.close(); database = openDatabase(path.join(dir, 'app.sqlite')); chat = createVideoCallChat({ database, directory }); },
    cleanup() { chat.cleanup(); } };
}
async function post(url, data, cookie) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(data) });
}
async function upload(url, name = 'тест.txt', body = 'пример') {
  const res = await fetch(`${url}/attachments?name=${encodeURIComponent(name)}`, { method: 'POST', body });
  assert.equal(res.status, 201);
  return res.json();
}

test('chat persists text and files, deduplicates retries, recovers missed messages and reads archive after expiry', async t => {
  const f = await fixture(t);
  const file = await upload(f.guest);
  const input = { clientId: randomUUID(), text: 'Привет 👋', name: 'Алина', attachments: [file.id] };
  const first = await post(f.guest, input);
  assert.equal(first.status, 201);
  const saved = (await first.json()).message;
  assert.equal(saved.name, 'Алина'); assert.equal(saved.text, input.text);
  assert.equal(f.events.length, 1); assert.equal(f.events[0][1].type, 'chat-message');
  const retry = await post(f.guest, input);
  assert.equal(retry.status, 200); assert.equal((await retry.json()).message.id, saved.id);
  assert.equal(f.events.length, 1);
  const second = await post(f.teacher, { clientId: randomUUID(), text: 'Ответ', name: 'Подмена' }, f.cookie);
  assert.equal(second.status, 201); assert.equal((await second.json()).message.name, 'Преподаватель');
  const missed = await (await fetch(`${f.guest}?after=${saved.id}`)).json();
  assert.deepEqual(missed.messages.map(m => m.text), ['Ответ']);
  endVideoCall(f.call.id, f.admin.id, f.database);
  f.database.prepare("UPDATE video_calls SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(f.call.id);
  assert.equal((await post(f.guest, { clientId: randomUUID(), text: 'Поздно' })).status, 409);
  assert.equal((await post(f.guest, input)).status, 200, 'lost acknowledgement can be retried after ending');
  const download = await fetch(`${f.guest}/attachments/${file.id}`);
  assert.equal(await download.text(), 'пример');
  assert.match(download.headers.get('content-disposition'), /^attachment/);
  f.restart();
  const history = await (await fetch(f.guest)).json();
  assert.equal(history.call.status, 'ended'); assert.equal(history.messages.length, 2);
  assert.equal((await fetch(`${f.guest}/attachments/${file.id}`)).status, 200);
});

test('chat rejects unauthorized access, cross-call attachment reuse, executable previews, and excess attachments', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(f.teacher)).status, 403);
  assert.equal((await fetch(f.teacher, { headers: { Cookie: f.otherCookie } })).status, 404);
  assert.equal((await fetch(f.guest.replace(f.call.guestToken, 'invalid'))).status, 404);
  const cross = await fetch(f.teacher, { method: 'POST', headers: { Cookie: f.cookie, Origin: 'https://evil.test' }, body: '{}' });
  assert.equal(cross.status, 403);
  const svg = await upload(f.guest, 'image.svg', '<svg onload="alert(1)"/>');
  assert.equal((await fetch(`${f.guest}/attachments/${svg.id}`)).status, 404, 'pending files are private');
  const input = { clientId: randomUUID(), attachments: [svg.id] };
  assert.equal((await post(f.teacher, input, f.cookie)).status, 400, 'cannot adopt peer pending upload');
  assert.equal((await post(`${f.base}/api/public/video-calls/${f.otherCall.guestToken}/chat`, input)).status, 400);
  assert.equal((await post(f.guest, { clientId: randomUUID(), attachments: Array.from({ length: 6 }, () => randomUUID()) })).status, 400);
  assert.equal((await post(f.guest, input)).status, 201);
  const download = await fetch(`${f.guest}/attachments/${svg.id}`);
  assert.equal(download.headers.get('content-type'), 'application/octet-stream');
  assert.match(download.headers.get('content-disposition'), /^attachment/);
  assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await fetch(`${f.base}/api/public/video-calls/${f.otherCall.guestToken}/chat/attachments/${svg.id}`)).status, 404);
  assert.equal((await post(f.guest, { clientId: randomUUID(), attachments: [svg.id] })).status, 400, 'attached file cannot be reused');
});

test('file size and call quota are enforced; cleanup removes stale uploads and deleted call files', async t => {
  const f = await fixture(t);
  const big = await fetch(`${f.guest}/attachments?name=big`, { method: 'POST', body: Buffer.alloc(25 * 1024 * 1024 + 1) });
  assert.equal(big.status, 413);
  const file = await upload(f.guest);
  f.database.prepare('UPDATE video_call_attachments SET size = ? WHERE id = ?').run(MAX_CALL, file.id);
  assert.equal((await fetch(`${f.guest}/attachments?name=more`, { method: 'POST', body: 'a' })).status, 413);
  f.database.prepare("UPDATE video_call_attachments SET created_at = '2000-01-01' WHERE id = ?").run(file.id);
  f.cleanup();
  assert.equal(fs.existsSync(path.join(f.directory, f.call.id, file.id)), false);
  const retained = await upload(f.guest);
  assert.equal((await post(f.guest, { clientId: randomUUID(), attachments: [retained.id] })).status, 201);
  endVideoCall(f.call.id, f.admin.id, f.database);
  clearVideoCallHistory(f.admin.id, f.database); f.cleanup();
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM video_call_messages').get().n, 0);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM video_call_attachments').get().n, 0);
  assert.equal(fs.existsSync(path.join(f.directory, f.call.id)), false);
  assert.equal((await fetch(f.guest)).status, 404);
});

test('history pagination has no gaps, raster preview and forced download have correct headers', async t => {
  const f = await fixture(t);
  for (let i = 0; i < 105; i++) f.database.prepare('INSERT INTO video_call_messages (call_id, sender_role, sender_key, sender_name, client_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(f.call.id, 'guest', 'seed', 'Ученик', randomUUID(), String(i), new Date().toISOString());
  const page = await (await fetch(f.guest)).json();
  assert.equal(page.messages.length, 100); assert.equal(page.hasMore, true);
  const tail = await (await fetch(`${f.guest}?after=${page.messages.at(-1).id}`)).json();
  assert.equal(tail.messages.length, 5); assert.equal(tail.hasMore, false);
  const image = await upload(f.guest, 'картинка.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'));
  await post(f.guest, { clientId: randomUUID(), attachments: [image.id] });
  const inline = await fetch(`${f.guest}/attachments/${image.id}`);
  assert.equal(inline.headers.get('content-type'), 'image/png'); assert.match(inline.headers.get('content-disposition'), /^inline/);
  const download = await fetch(`${f.guest}/attachments/${image.id}?download=1`);
  assert.match(download.headers.get('content-disposition'), /^attachment/);
});

test('ending a call during upload rejects the file and releases reserved quota', async t => {
  const f = await fixture(t);
  let sendRest;
  const response = new Promise((resolve, reject) => {
    const req = http.request(`${f.guest}/attachments?name=interrupted.txt`, {
      method: 'POST', headers: { 'Content-Length': 6 },
    }, res => { let text = ''; res.on('data', chunk => { text += chunk; }); res.on('end', () => resolve({ status: res.statusCode, text })); });
    req.on('error', reject); req.write('abc'); sendRest = () => req.end('def');
  });
  for (let i = 0; i < 100; i++) {
    if (f.database.prepare('SELECT COUNT(*) AS n FROM video_call_attachments').get().n) break;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM video_call_attachments').get().n, 1);
  endVideoCall(f.call.id, f.admin.id, f.database); sendRest();
  assert.equal((await response).status, 409);
  assert.equal(f.database.prepare('SELECT COUNT(*) AS n FROM video_call_attachments').get().n, 0);
  assert.deepEqual(fs.readdirSync(path.join(f.directory, f.call.id)), []);
});
