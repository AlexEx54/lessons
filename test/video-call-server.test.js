'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { WebSocket } = require('ws');
const { openDatabase } = require('../lib/db.js');
const { hashPassword } = require('../lib/password.js');
const { createUser } = require('../lib/user-store.js');
const { sanitizeVideoCallDiagnostic } = require('../lib/video-call-signaling.js');

const ROOT = path.join(__dirname, '..');

test('video call diagnostics keep useful ICE fields without accepting addresses or arbitrary data', () => {
  assert.deepEqual(sanitizeVideoCallDiagnostic({
    event: 'selected-candidate',
    state: 'connected',
    candidateTypes: ['host', 'relay', 'invalid', 'relay'],
    localCandidateType: 'relay',
    remoteCandidateType: 'srflx',
    protocol: 'udp',
    relayProtocol: 'tcp',
    errorCode: 701,
    errorText: 'TURN lookup failed\nnext line',
    address: '192.0.2.1',
  }), {
    event: 'selected-candidate',
    state: 'connected',
    candidateTypes: ['host', 'relay'],
    localCandidateType: 'relay',
    remoteCandidateType: 'srflx',
    protocol: 'udp',
    relayProtocol: 'tcp',
    errorCode: 701,
    errorText: 'TURN lookup failed next line',
  });
});

test('video call diagnostics retain bounded background-effect measurements', () => {
  assert.deepEqual(sanitizeVideoCallDiagnostic({
    event: 'background-effect-stats',
    state: 'running',
    model: 'square',
    delegate: 'gpu',
    mode: 'replacement',
    outputWidth: 960,
    outputHeight: 540,
    maskWidth: 256,
    maskHeight: 256,
    fps: 23,
    averageFrameMs: 35,
    arbitrary: 'discard me',
  }), {
    event: 'background-effect-stats',
    state: 'running',
    model: 'square',
    delegate: 'gpu',
    mode: 'replacement',
    outputWidth: 960,
    outputHeight: 540,
    maskWidth: 256,
    maskHeight: 256,
    fps: 23,
    averageFrameMs: 35,
  });

  assert.deepEqual(sanitizeVideoCallDiagnostic({
    event: 'background-effect-stats',
    model: 'unknown',
    delegate: 'webgpu',
    fps: 999,
    outputWidth: -1,
  }), { event: 'background-effect-stats' });
});

test('background timing diagnostics accept known numeric fields and reject invalid values', () => {
  const fields = {
    pipelineVersion: 2, targetFps: 24, blurWidth: 240, blurHeight: 135,
    averageSegmentationMs: 8, averageReadbackMs: 3, averageMaskMs: 5,
    averageCompositeMs: 4, maxFrameMs: 40, hiddenFrames: 0,
    processedFrames: 720, sampleDurationMs: 30_000,
  };
  assert.deepEqual(sanitizeVideoCallDiagnostic({ event: 'background-effect-stats', ...fields }),
    { event: 'background-effect-stats', ...fields });
  for (const field of Object.keys(fields)) {
    for (const invalid of [-1, 0.5, '5', Infinity, NaN, 100_000_000]) {
      assert.deepEqual(sanitizeVideoCallDiagnostic({ event: 'background-effect-stats', [field]: invalid }),
        { event: 'background-effect-stats' });
    }
  }
});

async function waitForServer(baseUrl, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      if ((await fetch(`${baseUrl}/health`)).ok) return;
    } catch (_error) {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Server did not become ready.');
}

function nextMessage(socket, expectedType) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${expectedType}`)), 3000);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (message.type !== expectedType) return;
      clearTimeout(timeout);
      socket.off('message', onMessage);
      resolve(message);
    }
    socket.on('message', onMessage);
  });
}

function opened(socket) {
  return new Promise((resolve, reject) => {
    socket.once('open', resolve);
    socket.once('error', reject);
  });
}

test('a permanent room lets the student wait for the teacher, survives ending a call and is revoked on deletion', async t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-video-call-'));
  const databasePath = path.join(temporaryDirectory, 'app.sqlite');
  const database = openDatabase(databasePath);
  createUser({
    email: 'admin@example.com',
    displayName: 'Администратор',
    passwordHash: await hashPassword('correct-password'),
    role: 'admin',
  }, database);
  database.close();

  const port = 22000 + Math.floor(Math.random() * 10000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsBaseUrl = `ws://127.0.0.1:${port}`;
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      APP_DB_PATH: databasePath,
      HOST: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'test',
      WEBRTC_STUN_URLS: 'stun:stun.example.test:3478',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', chunk => { serverOutput += chunk; });
  async function waitForLog(predicate) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const records = serverOutput.split('\n').filter(line => line.startsWith('[video-call-'))
        .flatMap(line => { try { return [JSON.parse(line.slice(line.indexOf('{')))]; } catch { return []; } });
      const found = records.find(predicate);
      if (found) return found;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.fail('Expected lifecycle log was not emitted');
  }
  const sockets = [];
  t.after(() => {
    sockets.forEach(socket => socket.terminate());
    child.kill('SIGTERM');
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'correct-password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const page = await fetch(`${baseUrl}/video-calls`, { headers: { Cookie: cookie } });
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="create-video-call"/);

  const createRoom = body => fetch(`${baseUrl}/api/video-calls`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await createRoom({ name: '   ' })).status, 400);
  const creation = await createRoom({ name: 'Алина' });
  assert.equal(creation.status, 201);
  const created = (await creation.json()).call;
  assert.equal(created.name, 'Алина');
  assert.deepEqual(created.presence, { teacher: false, guest: false });
  assert.match(created.guestPath, /^\/call\/alina-[a-f0-9]{48}$/);
  const guestToken = created.guestPath.split('/').at(-1);
  const listRoom = async () => (await (await fetch(`${baseUrl}/api/video-calls`, { headers: { Cookie: cookie } })).json())
    .calls.find(call => call.id === created.id);
  const guestUrl = `${wsBaseUrl}/ws/video-calls/${created.id}?role=guest&token=${guestToken}`;
  const connectGuest = () => {
    const socket = new WebSocket(guestUrl, { headers: { Origin: baseUrl } });
    sockets.push(socket);
    return socket;
  };

  const publicRoom = await fetch(`${baseUrl}/api/public/video-calls/${guestToken}`);
  assert.equal(publicRoom.status, 200);
  assert.deepEqual(await publicRoom.json(), { call: { id: created.id }, iceServers: [{ urls: ['stun:stun.example.test:3478'] }] });
  assert.equal((await fetch(`${baseUrl}${created.guestPath}`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/call/not-valid`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/public/video-calls/not-valid`)).status, 404);

  // The link is permanent, so the student may come before the teacher and wait.
  const guestSocket = connectGuest();
  const guestConnected = nextMessage(guestSocket, 'connected');
  await opened(guestSocket);
  assert.equal((await guestConnected).peerPresent, false);
  assert.deepEqual((await listRoom()).presence, { teacher: false, guest: true });
  assert.equal((await listRoom()).lastCallAt, null);

  const teacherSocket = new WebSocket(
    `${wsBaseUrl}/ws/video-calls/${created.id}?role=teacher`,
    { headers: { Cookie: cookie, Origin: baseUrl } },
  );
  sockets.push(teacherSocket);
  const teacherConnected = nextMessage(teacherSocket, 'connected');
  const guestSawTeacher = nextMessage(guestSocket, 'peer-joined');
  await opened(teacherSocket);
  assert.equal((await teacherConnected).peerPresent, true);
  await guestSawTeacher;
  const liveRoom = await listRoom();
  assert.deepEqual(liveRoom.presence, { teacher: true, guest: true });
  assert.ok(liveRoom.lastCallAt);

  const relayedState = nextMessage(guestSocket, 'media-state');
  teacherSocket.send(JSON.stringify({ type: 'media-state', audio: true, video: false, recording: true }));
  assert.deepEqual(await relayedState, {
    type: 'media-state', audio: true, video: false, recording: true, from: 'teacher',
  });

  const liveChat = nextMessage(guestSocket, 'chat-message');
  const chatResponse = await fetch(`${baseUrl}/api/video-calls/${created.id}/chat`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: require('node:crypto').randomUUID(), text: 'Материалы занятия' }),
  });
  assert.equal(chatResponse.status, 201);
  assert.equal((await liveChat).message.text, 'Материалы занятия');

  const oldGuestClosed = new Promise(resolve => guestSocket.once('close', resolve));
  const newGuest = connectGuest();
  const newGuestConnected = nextMessage(newGuest, 'connected');
  await opened(newGuest);
  await newGuestConnected;
  assert.equal(await oldGuestClosed, 4001);
  const replacedLog = await waitForLog(row => row.state === 'close' && row.cause === 'replaced');
  assert.equal(replacedLog.role, 'guest');
  assert.equal(replacedLog.closeCode, 4001);
  assert.ok(replacedLog.durationMs >= 0);
  const originalOpen = await waitForLog(row => row.state === 'open' && row.connectionId === replacedLog.connectionId);
  assert.equal(originalOpen.role, 'guest');
  for (let i = 0; i < 125; i++) {
    newGuest.send(JSON.stringify({ type: 'diagnostic', event: 'ice-candidate-error', errorCode: 701, errorText: 'lookup failed' }));
  }
  const newGuestClosed = new Promise(resolve => newGuest.once('close', resolve));
  newGuest.send(JSON.stringify({ type: 'leave', source: 'pagehide' }));
  assert.equal(await newGuestClosed, 1000);
  const pagehideLog = await waitForLog(row => row.state === 'close' && row.cause === 'pagehide');
  assert.equal(pagehideLog.suppressedDiagnostics, 124);
  assert.notEqual(pagehideLog.connectionId, replacedLog.connectionId);

  // Ending a call disconnects both participants, but the room and its link stay.
  const returningGuest = connectGuest();
  const returningConnected = nextMessage(returningGuest, 'connected');
  await opened(returningGuest);
  await returningConnected;
  const guestSawEnd = nextMessage(returningGuest, 'call-ended');
  const returningClosed = new Promise(resolve => returningGuest.once('close', resolve));
  const ended = await fetch(`${baseUrl}/api/video-calls/${created.id}/end`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(ended.status, 200);
  await guestSawEnd;
  assert.equal(await returningClosed, 4000);
  await waitForLog(row => row.state === 'close' && row.cause === 'call-ended' && row.role === 'teacher');
  assert.deepEqual((await listRoom()).presence, { teacher: false, guest: false });
  assert.equal((await fetch(`${baseUrl}/api/public/video-calls/${guestToken}`)).status, 200);
  const archive = await (await fetch(`${baseUrl}/api/public/video-calls/${guestToken}/chat`)).json();
  assert.equal(archive.messages[0].text, 'Материалы занятия');

  const nextDayGuest = connectGuest();
  const nextDayConnected = nextMessage(nextDayGuest, 'connected');
  await opened(nextDayGuest);
  assert.equal((await nextDayConnected).peerPresent, false);

  // Deleting the room disconnects the student and revokes the link with the chat.
  const nextDayClosed = new Promise(resolve => nextDayGuest.once('close', resolve));
  const deleted = await fetch(`${baseUrl}/api/video-calls/${created.id}`, { method: 'DELETE', headers: { Cookie: cookie } });
  assert.equal(deleted.status, 200);
  assert.equal(await nextDayClosed, 4000);
  assert.equal((await fetch(`${baseUrl}/api/video-calls/${created.id}`, { method: 'DELETE', headers: { Cookie: cookie } })).status, 404);
  assert.equal((await fetch(`${baseUrl}${created.guestPath}`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/public/video-calls/${guestToken}/chat`)).status, 404);
  const revoked = new WebSocket(guestUrl, { headers: { Origin: baseUrl } });
  sockets.push(revoked);
  assert.match((await new Promise(resolve => revoked.once('error', resolve))).message, /403/);
});


test('media diagnostics preserve counters and flags without track labels or arbitrary fields', () => {
  assert.deepEqual(sanitizeVideoCallDiagnostic({
    event: 'video-rtp-stats', direction: 'inbound-rtp', framesDecoded: 120,
    bytesReceived: 5000, pageHidden: false, placeholderVisible: true, peerGeneration: 2,
    trackLabel: 'private device', framesSent: -1, trackNumber: Infinity, source: 'arbitrary',
  }), { event: 'video-rtp-stats', pageHidden: false, placeholderVisible: true,
    peerGeneration: 2, framesDecoded: 120, bytesReceived: 5000, direction: 'inbound-rtp' });
});


test('background health retains bounded transport and frame counters', () => {
  assert.deepEqual(sanitizeVideoCallDiagnostic({ event: 'background-effect-health', pipelineVersion: 3,
    transport: 'worker-track', receivedFrames: 100, emittedFrames: 90, skippedFrames: 10,
    lastFrameAgeMs: 40, pageHidden: true }), {
    event: 'background-effect-health', pipelineVersion: 3, transport: 'worker-track',
    receivedFrames: 100, emittedFrames: 90, skippedFrames: 10, lastFrameAgeMs: 40, pageHidden: true,
  });
  assert.deepEqual(sanitizeVideoCallDiagnostic({ event: 'background-effect-health',
    transport: 'untrusted', receivedFrames: -1, emittedFrames: Infinity, lastFrameAgeMs: 1e10 }),
    { event: 'background-effect-health' });
});

test('diagnostic gate collapses error storms, caps output and resumes after a minute', () => {
  const { createDiagnosticLogGate } = require('../lib/video-call-signaling.js');
  let now = 1000;
  const gate = createDiagnosticLogGate(() => now);
  const error = { event: 'ice-candidate-error', peerGeneration: 1, errorCode: 701, errorText: 'lookup failed' };
  assert.deepEqual(gate.accept(error), error);
  for (let i = 0; i < 1000; i++) assert.equal(gate.accept(error), null);
  const state = gate.accept({ event: 'peer-connection-state', state: 'connected' });
  assert.equal(state.suppressedDiagnostics, 1000);
  assert.equal(gate.accept({ event: '' }), null);
  for (let i = 0; i < 98; i++) assert.ok(gate.accept({ event: 'video-rtp-stats', framesSent: i }));
  assert.equal(gate.accept({ event: 'video-rtp-stats' }), null);
  now += 60_000;
  assert.deepEqual(gate.accept(error), { ...error, suppressedDiagnostics: 1 });
  assert.equal(gate.suppressed, 0);
  assert.ok(gate.accept({ ...error, peerGeneration: 2 }));
});

test('socket and FPS diagnostics accept bounded fields and exclude close reasons and URLs', () => {
  const fields = { pageSession: 'b8bf952f-873b-4117-885a-ed9d2444e46c', socketAttempt: 2,
    navigationType: 'reload', closeCode: 1006, wasClean: false, online: true, reconnectDelayMs: 1000 };
  assert.deepEqual(sanitizeVideoCallDiagnostic({ event: 'socket-open', ...fields,
    reason: 'private text', url: 'https://example.test/?token=secret' }), { event: 'socket-open', ...fields });
  assert.deepEqual(sanitizeVideoCallDiagnostic({ event: 'video-rtp-stats', averageFps: 23.7, sampleDurationMs: 30000 }),
    { event: 'video-rtp-stats', averageFps: 23.7, sampleDurationMs: 30000 });
  assert.deepEqual(sanitizeVideoCallDiagnostic({ event: 'socket-open', pageSession: 'private text',
    navigationType: 'url', closeCode: 99999, socketAttempt: -1, online: 'yes', reconnectDelayMs: Infinity }),
    { event: 'socket-open' });
  for (const value of [-1, 241, Infinity, NaN, '30']) {
    assert.deepEqual(sanitizeVideoCallDiagnostic({ event: 'video-rtp-stats', averageFps: value }), { event: 'video-rtp-stats' });
  }
});
