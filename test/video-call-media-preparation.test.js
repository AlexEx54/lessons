'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/video-call-room.js'), 'utf8');

function roomFunction(name) {
  const start = source.indexOf(`  async function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  return source.slice(start, source.indexOf('\n  function ', start + 1));
}

// Runs prepareMedia and toggleKind with a getUserMedia whose answer the test controls.
function setup({ joined = false } = {}) {
  const calls = [], events = [];
  let answer;
  const tracks = { audio: { kind: 'audio', enabled: true }, video: { kind: 'video', enabled: true } };
  const stream = { getAudioTracks: () => [tracks.audio], getVideoTracks: () => [tracks.video] };
  const empty = { getAudioTracks: () => [], getVideoTracks: () => [] };
  const context = vm.createContext({
    console, performance, joined, localStream: empty, selectedBackground: 'none',
    mediaState: { audio: true, video: true, screen: false }, mediaPreparation: { state: 'idle' },
    navigator: { mediaDevices: { getUserMedia: () => new Promise((resolve, reject) => { answer = { resolve, reject }; }) } },
    track: kind => (kind === 'audio' ? context.localStream.getAudioTracks() : context.localStream.getVideoTracks())[0],
    cameraTrack: () => context.localStream.getVideoTracks()[0],
    showPrejoinError() {}, updateButtons() {}, applyBackgroundEffect: async () => {},
    sendDiagnostic: (event, details) => events.push({ event, ...details }),
    connectMixerMicrophone: () => calls.push('mixer'),
    applyOutboundAudioTrack: async () => calls.push(`audio:${context.track('audio')?.kind}`),
    applyOutboundVideoTrack: async () => calls.push(`video:${context.track('video')?.kind}`),
    sendMediaState: () => calls.push('media-state'),
    acquireTrack: async kind => calls.push(`acquire:${kind}`),
  });
  vm.runInContext(roomFunction('prepareMedia'), context);
  vm.runInContext(roomFunction('toggleKind'), context);
  const preparing = context.prepareMedia();
  return { context, calls, events, tracks, stream, preparing, answer: () => answer };
}

test('a call joined before the browser answers sends the tracks and media state once they arrive', async () => {
  const room = setup({ joined: true });
  assert.equal(room.context.mediaPreparation.state, 'pending');
  room.answer().resolve(room.stream);
  await room.preparing;
  assert.deepEqual(room.calls, ['mixer', 'audio:audio', 'video:video', 'media-state']);
  assert.equal(room.context.mediaPreparation.state, 'granted');
  assert.equal(room.events[0].event, 'media-prepared');
  assert.equal(room.events[0].state, 'granted');
  assert.ok(Number.isInteger(room.events[0].mediaWaitMs));
});

test('media prepared before the join leaves the peer connection to pick the tracks up', async () => {
  const room = setup();
  room.answer().resolve(room.stream);
  await room.preparing;
  assert.deepEqual(room.calls, []);
});

test('a refused prompt is diagnosed and still updates the peer that already joined', async () => {
  const room = setup({ joined: true });
  room.answer().reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  await room.preparing;
  assert.equal(room.context.mediaPreparation.state, 'failed');
  assert.deepEqual({ ...room.context.mediaState }, { audio: false, video: false, screen: false });
  assert.equal(room.events[0].errorName, 'NotAllowedError');
  assert.equal(room.calls.at(-1), 'media-state');
});

test('toggles during the prompt change the choice without opening a second camera', async () => {
  const room = setup();
  await room.context.toggleKind('video');
  await room.context.toggleKind('audio');
  await room.context.toggleKind('audio');
  assert.deepEqual(room.calls, []);
  room.answer().resolve(room.stream);
  await room.preparing;
  assert.equal(room.tracks.video.enabled, false);
  assert.equal(room.tracks.audio.enabled, true);
  assert.equal(room.context.mediaState.video, false);
});
