'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/video-call-room.js'), 'utf8');

function setup() {
  const connections = [];
  const context = vm.createContext({
    console, connections,
    window: { clearTimeout() {}, clearInterval() {}, setInterval() { return 1; } },
    WebSocket: class {
      handlers = {};
      addEventListener(type, handler) { this.handlers[type] = handler; }
      message(message) { return this.handlers.message({ data: JSON.stringify(message) }); }
    },
    MediaStream: class {},
    RTCPeerConnection: class {
      signalingState = 'stable';
      constructor() { connections.push(this); }
      close() { this.closed = true; }
      addTransceiver() { return {}; }
      async setRemoteDescription(description) {
        if (this.oldSession) throw new Error('Incompatible m-line order from new peer');
        this.remoteDescription = description;
      }
      async setLocalDescription() { this.localDescription = { type: 'answer' }; }
    },
    socket: null, socketAttempt: 0, reconnectTimer: null, leaving: false,
    peerConnection: null, mediaStatsTimer: null, remoteMediaState: {},
    audioTransceiver: null, videoTransceiver: null, remoteStream: null,
    peerGeneration: 0, gatheredCandidateTypes: new Set(), iceServers: [],
    makingOffer: false, ignoreOffer: false, isSettingRemoteAnswerPending: false, polite: true,
    elements: { remoteVideo: {}, remotePlaceholder: {}, remotePlaceholderText: {} },
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
