'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCallMedia, fakeTrack, FakeMediaStream } = require('./helpers/call-media.js');

// A prepared microphone and camera, then a screen share with or without its audio.
async function setup({ displayAudio = true, resume = async () => {} } = {}) {
  const microphone = fakeTrack('audio');
  const nextMicrophone = fakeTrack('audio');
  const camera = fakeTrack('video');
  const screen = fakeTrack('video', { getSettings: () => ({ displaySurface: 'monitor' }) });
  const audio = fakeTrack('audio', { getSettings: () => ({ restrictOwnAudio: true }) });
  const mixed = fakeTrack('audio');
  const nodes = [];
  class FakeAudioContext {
    createMediaStreamDestination() { return { stream: new FakeMediaStream([mixed]) }; }
    createMediaStreamSource(stream) {
      const node = { stream, connect(destination) { this.destination = destination; }, disconnect() { this.destination = null; } };
      nodes.push(node);
      return node;
    }
    resume() { return resume(); }
    async close() {}
  }
  const room = createCallMedia({
    globals: { AudioContext: FakeAudioContext, console: { error() {} } },
    mediaDevices: {
      getUserMedia: async constraints => new FakeMediaStream(constraints.video === false ? [nextMicrophone] : [microphone, camera]),
      getDisplayMedia: async () => new FakeMediaStream(displayAudio ? [screen, audio] : [screen]),
    },
  });
  await room.media.prepare();
  await room.media.toggleScreenShare();
  return Object.assign(room, { microphone, nextMicrophone, screen, audio, mixed, nodes });
}

test('screen audio mixes the microphone independently and keeps the mix for a new microphone', async () => {
  const c = await setup();
  assert.equal(c.media.outboundAudioTrack(), c.mixed);
  assert.equal(c.sentAudio.at(-1), c.mixed);
  assert.equal(c.sentVideo.at(-1), c.screen);
  assert.equal(c.nodes.length, 2);
  await c.media.toggle('audio');
  assert.equal(c.microphone.enabled, false);
  assert.equal(c.audio.readyState, 'live');
  assert.equal(c.mixed.readyState, 'live');
  c.microphone.readyState = 'ended';
  await c.media.toggle('audio');
  assert.equal(c.nodes[1].destination, null);
  assert.equal(c.nodes[2].stream.tracks[0], c.nextMicrophone);
  assert.equal(c.sentAudio.at(-1), c.mixed);
  c.audio.readyState = 'ended';
  c.audio.onended();
  assert.equal(c.sentAudio.at(-1), c.nextMicrophone);
  assert.equal(c.mixed.readyState, 'ended');
  assert.match(c.media.snapshot().screenAudioStatus, /без звука/);
});

test('missing display audio preserves microphone and reports silent sharing', async () => {
  const c = await setup({ displayAudio: false });
  assert.equal(c.media.outboundAudioTrack(), c.microphone);
  assert.equal(c.nodes.length, 0);
  assert.equal(c.media.snapshot().screen, true);
  assert.match(c.media.snapshot().screenAudioStatus, /без звука/);
});

test('mixer failure releases resources and restores microphone', async () => {
  const c = await setup({ resume: async () => { throw new Error('resume failed'); } });
  assert.equal(c.sentAudio.at(-1), c.microphone);
  assert.equal(c.mixed.readyState, 'ended');
  assert.equal(c.audio.readyState, 'ended');
  assert.equal(c.media.snapshot().screen, true);
});
