'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { FakeMediaStream } = require('./call-media.js');

const source = fs.readFileSync(path.join(__dirname, '../../assets/call-connection.js'), 'utf8');

// The sender asks call.replaceTrack() first, so a test can hold or fail a replacement.
function fakeTransceiver(kind, call, direction = 'recvonly') {
  return {
    direction, receiver: { track: { kind } },
    sender: { track: null, async replaceTrack(track) { await call.replaceTrack(kind, track); this.track = track; } },
  };
}

function fakeRemoteTrack(kind, extra = {}) {
  const listeners = {};
  return { id: kind, kind, readyState: 'live', muted: false, listeners,
    addEventListener(type, handler) { listeners[type] = handler; }, ...extra };
}

// Runs the real CallConnection with fake sockets, peer connections and timers. Every message the
// connection sends, diagnostics included, stays on its socket; timers are fired by the test.
function createCallConnection({ role = 'guest' } = {}) {
  const documentListeners = {};
  const call = {
    sockets: [], connections: [], timers: [], statuses: [], ended: [],
    replaceTrack: async () => {},
    onSend() {},
    media: {
      outboundAudioTrack: () => null, outboundVideoTrack: () => null, videoSource: () => 'none',
      sentState: () => ({ audio: true, video: true, screen: false }),
      preparation: { state: 'granted' }, activeEffectDiagnostic: () => null,
    },
    remoteVideo: { readyState: 0, srcObject: null, listeners: {},
      addEventListener(type, handler) { this.listeners[type] = handler; } },
    get socket() { return call.sockets.at(-1); },
    get peer() { return call.connections.at(-1); },
    sent: () => call.sockets.flatMap(socket => socket.sent),
    signals: () => call.sent().filter(message => message.type !== 'diagnostic').map(message => message.type),
    diagnostics: event => call.sent().filter(message => message.type === 'diagnostic' && message.event === event),
    timer: ms => call.timers.filter(timer => timer.ms === ms).at(-1),
    reportStats: () => documentListeners.visibilitychange(),
  };
  class FakeWebSocket {
    static OPEN = 1;
    readyState = 0;
    handlers = {};
    sent = [];
    constructor(url) { this.url = url; call.sockets.push(this); }
    addEventListener(type, handler) { this.handlers[type] = handler; }
    send(data) { const message = JSON.parse(data); this.sent.push(message); call.onSend(message); }
    close(code) { this.readyState = 3; this.closedWith = code; }
    open() { this.readyState = 1; this.handlers.open(); }
    message(message) { return this.handlers.message({ data: JSON.stringify(message) }); }
    drop(code, wasClean = false) { this.readyState = 3; this.handlers.close({ code, wasClean }); }
  }
  class FakePeerConnection {
    signalingState = 'stable';
    iceConnectionState = 'new';
    iceGatheringState = 'new';
    connectionState = 'new';
    transceivers = [];
    constructor(config) { this.config = config; call.connections.push(this); }
    close() { this.closed = true; }
    addTransceiver(kind, { direction }) {
      const transceiver = fakeTransceiver(kind, call, direction);
      this.transceivers.push(transceiver);
      return transceiver;
    }
    getTransceivers() { return this.transceivers; }
    async setRemoteDescription(description) {
      if (this.oldSession) throw new Error('Incompatible m-line order from new peer');
      this.remoteDescription = description;
    }
    async setLocalDescription() { this.localDescription = { type: 'answer' }; }
    async addIceCandidate() {}
    async getStats() { return new Map(); }
  }
  const context = vm.createContext({
    console, performance, crypto, navigator: { onLine: true },
    document: { hidden: false, addEventListener(type, handler) { documentListeners[type] = handler; } },
    window: {
      setTimeout(callback, ms) { call.timers.push({ callback, ms }); return call.timers.length; },
      clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    },
    fetch: async () => ({ ok: true, json: async () => ({ iceServers: [{ urls: 'stun:stun.example.test' }] }) }),
    WebSocket: FakeWebSocket, RTCPeerConnection: FakePeerConnection, MediaStream: FakeMediaStream,
  });
  vm.runInContext(source, context);
  call.connection = context.window.CallConnection.create({
    role, socketUrl: () => 'ws://example.test/room', iceEndpoint: '/api/room', media: call.media,
    localDetails: () => ({ name: 'Участник' }), remoteVideo: call.remoteVideo,
    onStatus: (status, details) => call.statuses.push(details ? `${status} ${details.attempt}/${details.attempts}` : status),
    onRemote() {},
    onMessage() {},
    onEnded: reason => call.ended.push(reason),
  });
  return call;
}

// Joined with an open socket, as the page is right after the join button.
async function joinedCall(options) {
  const call = createCallConnection(options);
  await call.connection.join();
  call.socket.open();
  return call;
}

module.exports = { createCallConnection, joinedCall, fakeTransceiver, fakeRemoteTrack };
