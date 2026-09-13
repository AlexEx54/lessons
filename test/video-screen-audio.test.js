'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/video-call-room.js'), 'utf8');

function setup() {
  const microphone = { readyState: 'live', enabled: true };
  const audio = { readyState: 'live', stop() { this.readyState = 'ended'; }, getSettings: () => ({ restrictOwnAudio: true }) };
  const mixed = { stopped: false, stop() { this.stopped = true; } };
  const nodes = [];
  const context = vm.createContext({
    console, leaving: false, screenAudioMixer: null,
    screenTrack: { getSettings: () => ({ displaySurface: 'monitor' }) },
    displayStream: { getAudioTracks: () => [audio] },
    elements: { screenAudioStatus: {} },
    microphone, mixed, audio, nodes,
    track: () => microphone,
    audioTransceiver: { sender: { async replaceTrack(track) { this.track = track; } } },
    MediaStream: class { constructor(tracks) { this.tracks = tracks; } },
    AudioContext: class {
      createMediaStreamDestination() { return { stream: { getAudioTracks: () => [mixed], getTracks: () => [mixed] } }; }
      createMediaStreamSource(stream) {
        const node = { stream, connect(destination) { this.destination = destination; }, disconnect() { this.destination = null; } };
        nodes.push(node);
        return node;
      }
      async resume() {}
      async close() { this.closed = true; }
    },
  });
  vm.runInContext(source.slice(source.indexOf('  function connectMixerMicrophone()'), source.indexOf('  async function stopScreenShare()')), context);
  return context;
}

test('screen audio mixes microphone independently and reuses the mix after reconnect', async () => {
  const c = setup();
  await c.startScreenAudio();
  assert.equal(c.audioTransceiver.sender.track, c.mixed);
  assert.equal(c.nodes.length, 2);
  c.microphone.enabled = false;
  assert.equal(c.audio.readyState, 'live');
  assert.equal(c.mixed.stopped, false);
  const oldMicrophoneNode = c.nodes[1];
  c.connectMixerMicrophone();
  assert.equal(oldMicrophoneNode.destination, null);
  c.audioTransceiver = { sender: { async replaceTrack(track) { this.track = track; } } };
  await c.applyOutboundAudioTrack();
  assert.equal(c.audioTransceiver.sender.track, c.mixed);
  c.audio.readyState = 'ended';
  c.audio.onended();
  assert.equal(c.audioTransceiver.sender.track, c.microphone);
  assert.equal(c.mixed.stopped, true);
  assert.match(c.elements.screenAudioStatus.textContent, /без звука/);
});

test('missing display audio preserves microphone and reports silent sharing', async () => {
  const c = setup();
  c.displayStream.getAudioTracks = () => [];
  await c.startScreenAudio();
  await c.applyOutboundAudioTrack();
  c.updateScreenAudioStatus();
  assert.equal(c.audioTransceiver.sender.track, c.microphone);
  assert.equal(c.nodes.length, 0);
  assert.match(c.elements.screenAudioStatus.textContent, /без звука/);
});

test('mixer failure releases resources and restores microphone', async () => {
  const c = setup();
  c.console = { error() {} };
  c.AudioContext.prototype.resume = async () => { throw new Error('resume failed'); };
  await c.startScreenAudio();
  assert.equal(c.audioTransceiver.sender.track, c.microphone);
  assert.equal(c.mixed.stopped, true);
  assert.equal(c.audio.readyState, 'ended');
});
