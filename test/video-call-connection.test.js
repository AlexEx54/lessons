'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCallConnection, joinedCall, fakeTransceiver, fakeRemoteTrack } = require('./helpers/call-connection.js');

const STALLED_CONNECTION_MS = 15_000;

test('peer reconnect before old socket timeout replaces the media session', async () => {
  const c = await joinedCall();
  await c.socket.message({ type: 'peer-joined' });
  const old = c.peer;
  old.oldSession = true;
  // The server replaces the old guest socket without sending peer-left.
  await c.socket.message({ type: 'peer-joined' });
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'new-session' } });
  assert.equal(old.closed, true);
  assert.notEqual(c.peer, old);
  assert.equal(c.peer.remoteDescription.sdp, 'new-session');
  assert.equal(c.peer.localDescription.type, 'answer');
});

test('signaling that arrives after the call was closed does not create a media session', async () => {
  const c = await joinedCall();
  c.connection.close();
  await c.socket.message({ type: 'peer-joined' });
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'late' } });
  assert.equal(c.connections.length, 0);
  assert.equal(c.socket.closedWith, 1000);
});

test('an offer applied during connection setup and an unconnected close are both diagnosed', async () => {
  // Only the teacher replaces tracks during setup; the guest has no transceivers yet.
  const c = await joinedCall({ role: 'teacher' });
  let finishSetup;
  c.replaceTrack = kind => (kind === 'video' ? new Promise(resolve => { finishSetup = resolve; }) : undefined);
  const joining = c.socket.message({ type: 'peer-joined' });
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'early' } });
  finishSetup();
  await joining;
  const negotiation = c.diagnostics('negotiation')[0];
  assert.deepEqual([negotiation.state, negotiation.setupPending, negotiation.collision], ['remote-offer', true, false]);
  await c.socket.message({ type: 'peer-left' });
  const snapshot = c.diagnostics('peer-connection-snapshot')[0];
  assert.equal(snapshot.state, 'closed-unconnected');
  assert.deepEqual([snapshot.transceivers, snapshot.localCandidates, snapshot.remoteCandidates], [2, 0, 0]);
});

test('only the teacher adds transceivers, so the guest never makes the first offer', async () => {
  for (const [role, kinds] of [['guest', []], ['teacher', ['audio', 'video']]]) {
    const c = await joinedCall({ role });
    await c.socket.message({ type: 'peer-joined' });
    assert.deepEqual(c.peer.transceivers.map(item => item.receiver.track.kind), kinds);
  }
});

test('the guest enables sending on the offered transceivers before answering', async () => {
  const c = await joinedCall();
  await c.socket.message({ type: 'peer-joined' });
  const events = [];
  c.onSend = message => { if (message.type === 'signal') events.push(`send-${message.description.type}`); };
  c.replaceTrack = async kind => { events.push(`${kind}-track`); };
  const offered = ['audio', 'video'].map(kind => fakeTransceiver(kind, c));
  c.peer.transceivers = offered;
  c.peer.setLocalDescription = async function () {
    events.push(`answer-${offered.map(item => item.direction).join(',')}`);
    this.localDescription = { type: 'answer' };
  };
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'teacher' } });
  assert.deepEqual(events, ['answer-sendrecv,sendrecv', 'send-answer', 'audio-track', 'video-track']);
  // A renegotiation keeps the adopted transceivers and does not replace the tracks again.
  events.length = 0;
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'renegotiation' } });
  assert.deepEqual(events, ['answer-sendrecv,sendrecv', 'send-answer']);
});

test('the teacher restarts a connection whose ICE checks never started, at most twice per join', async () => {
  const c = await joinedCall({ role: 'teacher' });
  const fireStallTimer = () => c.timer(STALLED_CONNECTION_MS).callback();
  await c.socket.message({ type: 'peer-joined' });
  const before = c.signals().length;
  c.peer.iceConnectionState = 'checking';
  await fireStallTimer();
  assert.equal(c.connections.length, 1);

  c.peer.iceConnectionState = 'new';
  for (let i = 0; i < 3; i++) await fireStallTimer();
  assert.equal(c.connections.length, 3);
  assert.deepEqual(c.signals().slice(before), ['restart-connection', 'media-state', 'restart-connection', 'media-state']);
  assert.deepEqual(c.connections.slice(0, 2).map(connection => connection.closed), [true, true]);

  // A new join starts with a fresh restart budget.
  await c.socket.message({ type: 'peer-joined' });
  await fireStallTimer();
  assert.equal(c.connections.length, 5);
});

test('the guest never restarts on its own and starts over when the teacher restarts', async () => {
  const c = await joinedCall();
  await c.socket.message({ type: 'peer-joined' });
  const before = c.signals().length;
  const old = c.peer;
  await c.timer(STALLED_CONNECTION_MS).callback();
  assert.deepEqual([c.connections.length, c.signals().slice(before)], [1, []]);

  await c.socket.message({ type: 'restart-connection' });
  assert.equal(old.closed, true);
  assert.deepEqual(c.signals().slice(before), ['media-state']);
  // The teacher's new offer creates the new connection.
  assert.equal(c.connections.length, 1);
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'restarted' } });
  assert.notEqual(c.peer, old);
  assert.equal(c.peer.remoteDescription.sdp, 'restarted');
});

test('remote visibility recovers from camera-off for camera and screen without another playing event', async () => {
  const c = await joinedCall();
  await c.socket.message({ type: 'peer-joined' });
  const track = fakeRemoteTrack('video');
  c.peer.ontrack({ track });
  const visible = () => c.connection.remote().videoVisible;
  for (const screen of [false, true]) {
    await c.socket.message({ type: 'media-state', video: false, screen: false });
    assert.equal(visible(), false);
    await c.socket.message({ type: 'media-state', video: !screen, screen });
    assert.equal(visible(), true);
  }
  track.muted = true;
  track.listeners.mute();
  assert.equal(visible(), false);
  track.muted = false;
  track.listeners.unmute();
  assert.equal(visible(), true);
  await c.socket.message({ type: 'media-state', video: false, screen: false });
  c.remoteVideo.listeners.playing();
  assert.equal(visible(), false);
  track.readyState = 'ended';
  await c.socket.message({ type: 'media-state', video: true });
  track.listeners.ended();
  assert.equal(visible(), false);
});

test('audio ontrack cannot cover active video and old connection events are ignored', async () => {
  const c = await joinedCall();
  await c.socket.message({ type: 'peer-joined' });
  const old = c.peer;
  const video = fakeRemoteTrack('video');
  old.ontrack({ track: video });
  assert.equal(c.connection.remote().videoVisible, true);
  old.ontrack({ track: fakeRemoteTrack('audio') });
  assert.equal(c.connection.remote().videoVisible, true);
  await c.socket.message({ type: 'peer-joined' });
  const reported = c.diagnostics('remote-video-state').length;
  video.muted = true;
  video.listeners.mute();
  assert.equal(c.diagnostics('remote-video-state').length, reported);
});

test('video replacement records success and rejection with the actual sender track', async () => {
  const c = await joinedCall({ role: 'teacher' });
  await c.socket.message({ type: 'peer-joined' });
  const previous = { readyState: 'ended' };
  const next = { readyState: 'live' };
  const sender = c.peer.transceivers[1].sender;
  Object.assign(c.media, { outboundVideoTrack: () => next, videoSource: () => 'effect' });
  const replacements = () => c.diagnostics('video-track-replace').slice(2);
  sender.track = previous;
  await c.connection.applyVideo();
  assert.equal(replacements()[0].source, 'effect');
  assert.deepEqual(replacements().map(event => event.state), ['start', 'success']);
  assert.equal(replacements()[1].trackState, 'live');
  sender.track = previous;
  c.replaceTrack = async () => { throw new Error('replacement failed'); };
  await assert.rejects(c.connection.applyVideo(), /replacement failed/);
  assert.equal(replacements().at(-1).state, 'failure');
  assert.equal(replacements().at(-1).trackState, 'ended');
});

test('video RTP diagnostics omit audio and discard results from a closed connection', async () => {
  const c = await joinedCall();
  await c.socket.message({ type: 'peer-joined' });
  const reports = new Map([
    ['audio', { type: 'inbound-rtp', kind: 'audio', bytesReceived: 50 }],
    ['video', { type: 'inbound-rtp', kind: 'video', ssrc: 12, framesDecoded: 42, bytesReceived: 500 }],
  ]);
  c.peer.getStats = async () => reports;
  await c.reportStats();
  const stats = () => c.diagnostics('video-rtp-stats');
  assert.equal(stats().length, 1);
  assert.equal(stats()[0].framesDecoded, 42);
  assert.equal(stats()[0].placeholderVisible, true);
  c.peer.getStats = async () => { c.socket.message({ type: 'peer-left' }); return reports; };
  await c.reportStats();
  assert.equal(stats().length, 1);
});

test('RTP FPS uses elapsed sample time, reports stalls and resets on counter or SSRC changes', async () => {
  const c = await joinedCall();
  await c.socket.message({ type: 'peer-joined' });
  const report = { type: 'inbound-rtp', kind: 'video', ssrc: 12, framesDecoded: 100, timestamp: 1000 };
  const outgoing = { type: 'outbound-rtp', kind: 'video', ssrc: 13, framesSent: 200, timestamp: 1000 };
  const connection = c.peer;
  connection.getStats = async () => new Map([['v', report], ['out', outgoing]]);
  const events = () => c.diagnostics('video-rtp-stats');
  await c.reportStats();
  assert.equal(events()[0].averageFps, undefined);
  report.timestamp = outgoing.timestamp = 31000;
  report.framesDecoded = 820; outgoing.framesSent = 1100;
  await c.reportStats();
  assert.equal(events().at(-2).averageFps, 24);
  assert.equal(events().at(-1).averageFps, 30);
  assert.equal(events().at(-1).sampleDurationMs, 30000);
  report.timestamp = 61000;
  await c.reportStats();
  assert.equal(events().at(-2).averageFps, 0);
  report.timestamp = 91000; report.framesDecoded = 10;
  await c.reportStats();
  assert.equal(events().at(-2).averageFps, undefined);
  report.timestamp = 121000; report.ssrc = 99; report.framesDecoded = 730;
  await c.reportStats();
  assert.equal(events().at(-2).averageFps, undefined);
  let release;
  connection.getStats = () => new Promise(resolve => { release = resolve; });
  const pending = c.reportStats();
  await c.reportStats();
  release(new Map());
  await pending;
  assert.equal(connection.diagnosticStatsPending, false);
});

test('ICE error storm sends distinct errors only and reports suppression on gathering completion', async () => {
  const c = await joinedCall();
  await c.socket.message({ type: 'peer-joined' });
  const connection = c.peer;
  for (let i = 0; i < 100; i++) connection.onicecandidateerror({ errorCode: 701, errorText: 'lookup failed' });
  connection.iceGatheringState = 'complete';
  connection.onicegatheringstatechange();
  assert.equal(c.diagnostics('ice-candidate-error').length, 1);
  assert.equal(c.diagnostics('ice-gathering-state')[0].suppressedErrors, 99);
  await c.socket.message({ type: 'peer-joined' });
  connection.onicecandidateerror({ errorCode: 486, errorText: 'old connection' });
  assert.equal(c.diagnostics('ice-candidate-error').length, 1);
});

test('socket reconnect reports the previous close after reopening and ignores stale close events', async () => {
  const c = createCallConnection();
  c.media.preparation = { state: 'pending' };
  await c.connection.join();
  c.socket.open();
  const opened = () => c.diagnostics('socket-open');
  assert.equal(opened()[0].state, 'initial');
  assert.equal(opened()[0].mediaPreparation, 'pending');
  const first = c.socket;
  first.drop(1006);
  assert.equal(c.statuses.at(-1), 'reconnecting 1/5');
  c.timer(1000).callback();
  c.socket.open();
  const reopened = opened()[1];
  assert.equal(reopened.state, 'reconnected');
  assert.equal(reopened.socketAttempt, 2);
  assert.equal(reopened.closeCode, 1006);
  assert.equal(reopened.wasClean, false);
  assert.equal(reopened.reconnectDelayMs, 1000);
  first.drop(4001, true);
  assert.deepEqual(c.ended, []);
  assert.equal(c.sockets.length, 2);
});

test('a room taken over by another tab ends here instead of reconnecting', async () => {
  const c = await joinedCall();
  c.socket.drop(4001, true);
  assert.deepEqual(c.ended, ['elsewhere']);
  assert.equal(c.timer(1000), undefined);
});

test('ICE servers are fetched on join, so a late join still gets fresh credentials', async () => {
  const c = await joinedCall();
  await c.socket.message({ type: 'peer-joined' });
  assert.deepEqual(c.peer.config.iceServers.map(server => ({ ...server })), [{ urls: 'stun:stun.example.test' }]);
});
