'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/video-call-room.js'), 'utf8');

function setup() {
  const connections = [];
  const timers = [];
  const context = vm.createContext({
    console, connections, timers, performance,
    window: {
      setTimeout(callback, ms) { timers.push({ callback, ms }); return timers.length; },
      clearTimeout() {}, clearInterval() {}, setInterval() { return 1; },
    },
    WebSocket: class {
      handlers = {};
      addEventListener(type, handler) { this.handlers[type] = handler; }
      message(message) { return this.handlers.message({ data: JSON.stringify(message) }); }
    },
    MediaStream: class {},
    RTCPeerConnection: class {
      signalingState = 'stable';
      iceConnectionState = 'new';
      addedTransceivers = [];
      constructor() { connections.push(this); }
      close() { this.closed = true; }
      addTransceiver(kind) { this.addedTransceivers.push(kind); return {}; }
      getTransceivers() { return []; }
      async setRemoteDescription(description) {
        if (this.oldSession) throw new Error('Incompatible m-line order from new peer');
        this.remoteDescription = description;
      }
      async setLocalDescription() { this.localDescription = { type: 'answer' }; }
      async getStats() { return new Map(); }
    },
    STALLED_CONNECTION_MS: 15_000, MAX_CONNECTION_RESTARTS: 2,
    socket: null, socketAttempt: 0, reconnectTimer: null, leaving: false,
    peerConnection: null, mediaStatsTimer: null, remoteMediaState: {},
    audioTransceiver: null, videoTransceiver: null, remoteStream: null,
    peerGeneration: 0, gatheredCandidateTypes: new Set(), iceServers: [],
    makingOffer: false, ignoreOffer: false, isSettingRemoteAnswerPending: false, polite: true,
    elements: { remoteVideo: {}, remotePlaceholder: {}, remotePlaceholderText: {} },
    peerTitle: 'Ученик', waitingStatus: 'Ждём ученика', callEndedText: 'Вы завершили видеозвонок.',
    websocketUrl: () => 'ws://test', setConnection() {}, sendDiagnostic() {},
    sendMediaState() {}, send() {}, applyOutboundAudioTrack: async () => {},
    applyOutboundVideoTrack: async () => {},
  });
  vm.runInContext(source.slice(source.indexOf('  function closePeerConnection()'), source.indexOf('  function websocketUrl()')), context);
  vm.runInContext(source.slice(source.indexOf('  function connectSocket()'), source.indexOf('  async function toggleKind(')), context);
  context.connectSocket();
  return context;
}

test('peer reconnect before old socket timeout replaces the teacher media session', async () => {
  const c = setup();
  await c.socket.message({ type: 'peer-joined' });
  const old = c.peerConnection;
  old.oldSession = true;
  // The server replaces the old guest socket without sending peer-left.
  await c.socket.message({ type: 'peer-joined' });
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'new-session' } });
  assert.equal(old.closed, true);
  assert.notEqual(c.peerConnection, old);
  assert.equal(c.peerConnection.remoteDescription.sdp, 'new-session');
  assert.equal(c.peerConnection.localDescription.type, 'answer');
});

test('signaling that arrives while the call is finishing does not create a media session', async () => {
  const c = setup();
  // finishCall() sets leaving before it awaits stopRecording() and closes the socket.
  c.leaving = true;
  await c.socket.message({ type: 'peer-joined' });
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'late' } });
  assert.equal(c.connections.length, 0);
  assert.equal(c.peerConnection, null);
});

test('an offer applied during connection setup and an unconnected close are both diagnosed', async () => {
  const c = setup();
  // Only the teacher replaces tracks during setup; the guest has no transceivers yet.
  c.polite = false;
  const diagnostics = [];
  c.sendDiagnostic = (event, details = {}) => diagnostics.push({ event, ...details });
  let finishSetup;
  c.applyOutboundVideoTrack = () => new Promise(resolve => { finishSetup = resolve; });
  const joining = c.socket.message({ type: 'peer-joined' });
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'early' } });
  finishSetup();
  await joining;
  assert.deepEqual(diagnostics.find(item => item.event === 'negotiation'),
    { event: 'negotiation', state: 'remote-offer', setupPending: true, collision: false });
  await c.socket.message({ type: 'peer-left' });
  const snapshot = diagnostics.find(item => item.event === 'peer-connection-snapshot');
  assert.equal(snapshot.state, 'closed-unconnected');
  assert.deepEqual([snapshot.transceivers, snapshot.localCandidates, snapshot.remoteCandidates], [0, 0, 0]);
});

test('only the teacher adds transceivers, so the guest never makes the first offer', async () => {
  for (const [polite, kinds] of [[true, []], [false, ['audio', 'video']]]) {
    const c = setup();
    c.polite = polite;
    await c.socket.message({ type: 'peer-joined' });
    assert.deepEqual(c.peerConnection.addedTransceivers, kinds);
  }
});

test('the guest enables sending on the offered transceivers before answering', async () => {
  const c = setup();
  await c.socket.message({ type: 'peer-joined' });
  const events = [];
  c.send = message => events.push(`send-${message.description.type}`);
  c.applyOutboundAudioTrack = async () => events.push('audio-track');
  c.applyOutboundVideoTrack = async () => events.push('video-track');
  const offered = ['audio', 'video'].map(kind => ({ receiver: { track: { kind } }, sender: {}, direction: 'recvonly' }));
  c.peerConnection.getTransceivers = () => offered;
  c.peerConnection.setLocalDescription = async function () {
    events.push(`answer-${offered.map(item => item.direction).join(',')}`);
    this.localDescription = { type: 'answer' };
  };
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'teacher' } });
  assert.deepEqual(events, ['answer-sendrecv,sendrecv', 'send-answer', 'audio-track', 'video-track']);
  assert.deepEqual([c.audioTransceiver, c.videoTransceiver], offered);
  // A renegotiation keeps the adopted transceivers and does not replace the tracks again.
  events.length = 0;
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'renegotiation' } });
  assert.deepEqual(events, ['answer-sendrecv,sendrecv', 'send-answer']);
});

test('the teacher restarts a connection whose ICE checks never started, at most twice per join', async () => {
  const c = setup();
  c.polite = false;
  const sent = [];
  c.send = message => sent.push(message.type);
  const fireStallTimer = () => c.timers.filter(timer => timer.ms === c.STALLED_CONNECTION_MS).at(-1).callback();
  await c.socket.message({ type: 'peer-joined' });
  c.sendMediaState = () => sent.push('media-state');
  c.peerConnection.iceConnectionState = 'checking';
  await fireStallTimer();
  assert.equal(c.connections.length, 1);

  c.peerConnection.iceConnectionState = 'new';
  for (let i = 0; i < 3; i++) await fireStallTimer();
  assert.equal(c.connections.length, 3);
  assert.deepEqual(sent, ['restart-connection', 'media-state', 'restart-connection', 'media-state']);
  assert.deepEqual(c.connections.slice(0, 2).map(connection => connection.closed), [true, true]);

  // A new join starts with a fresh restart budget.
  await c.socket.message({ type: 'peer-joined' });
  await fireStallTimer();
  assert.equal(c.connections.length, 5);
});

test('the guest never restarts on its own and starts over when the teacher restarts', async () => {
  const c = setup();
  const sent = [];
  c.send = message => sent.push(message.type);
  await c.socket.message({ type: 'peer-joined' });
  c.sendMediaState = () => sent.push('media-state');
  const old = c.peerConnection;
  await c.timers.find(timer => timer.ms === c.STALLED_CONNECTION_MS).callback();
  assert.deepEqual([c.connections.length, sent], [1, []]);

  await c.socket.message({ type: 'restart-connection' });
  assert.equal(old.closed, true);
  assert.equal(c.peerConnection, null);
  assert.deepEqual(sent, ['media-state']);
  await c.socket.message({ type: 'signal', description: { type: 'offer', sdp: 'restarted' } });
  assert.notEqual(c.peerConnection, old);
  assert.equal(c.peerConnection.remoteDescription.sdp, 'restarted');
});
