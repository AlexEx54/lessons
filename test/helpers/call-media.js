'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../../assets/call-media.js'), 'utf8');

class FakeMediaStream {
  constructor(tracks = []) { this.tracks = [...tracks]; }
  getTracks() { return [...this.tracks]; }
  getAudioTracks() { return this.tracks.filter(track => track.kind === 'audio'); }
  getVideoTracks() { return this.tracks.filter(track => track.kind === 'video'); }
  addTrack(track) { this.tracks.push(track); }
  removeTrack(track) { this.tracks = this.tracks.filter(item => item !== track); }
}

function fakeTrack(kind, extra = {}) {
  return { kind, enabled: true, readyState: 'live', muted: false, stop() { this.readyState = 'ended'; }, ...extra };
}

// Runs the real CallMedia with fake browser media. The hooks record what the connection would send
// and can be replaced on the returned object while a test runs.
function createCallMedia({ mediaDevices = {}, globals = {} } = {}) {
  const room = {
    calls: [], events: [], stored: [], sentAudio: [], sentVideo: [],
    async applyAudio() { room.calls.push('audio'); room.sentAudio.push(room.media.outboundAudioTrack()); },
    async applyVideo() { room.calls.push('video'); room.sentVideo.push(room.media.outboundVideoTrack()); },
    publish() { room.calls.push('media-state'); },
    loadBackgroundPipeline() { throw new Error('No background pipeline in this test.'); },
    // Copies leave the vm realm so deepEqual can compare them with plain objects.
    progress() { const value = room.media.snapshot().effectProgress; return value && { ...value }; },
    status() { return { ...room.media.snapshot().backgroundStatus }; },
  };
  const context = vm.createContext({
    console, performance, MediaStream: FakeMediaStream,
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 0, mediaDevices },
    document: { hidden: false },
    window: {
      WebAssembly: {}, Worker: class {},
      localStorage: { getItem: () => null, setItem: (_key, value) => room.stored.push(value) },
    },
    ...globals,
  });
  vm.runInContext(source, context);
  room.media = context.window.CallMedia.create({
    diagnostic: (event, details) => room.events.push({ event, ...details }),
    applyAudio: () => room.applyAudio(),
    applyVideo: () => room.applyVideo(),
    publish: () => room.publish(),
    onChange() {},
    loadBackgroundPipeline: () => room.loadBackgroundPipeline(),
  });
  return room;
}

module.exports = { createCallMedia, fakeTrack, FakeMediaStream };
