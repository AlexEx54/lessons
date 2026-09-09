'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const roomHtml = fs.readFileSync(path.join(root, 'video-call-room.html'), 'utf8');
const rendererScript = fs.readFileSync(path.join(root, 'assets', 'video-background-renderer.mjs'), 'utf8');
const pipelineScript = fs.readFileSync(path.join(root, 'assets', 'video-background-pipeline.mjs'), 'utf8');
const roomScript = fs.readFileSync(path.join(root, 'assets', 'video-call-room.js'), 'utf8');

test('teacher and guest share the same virtual-background controls', () => {
  assert.match(roomHtml, /id="prejoin-background-options"/);
  assert.match(roomHtml, /id="call-background-options"/);

  const backgroundImplementation = roomScript.slice(
    roomScript.indexOf('function readStoredBackground'),
    roomScript.indexOf('function track(kind)'),
  );
  assert.ok(backgroundImplementation.length > 0);
  assert.doesNotMatch(backgroundImplementation, /role\s*===/);
  assert.match(pipelineScript, /canvas\.captureStream/);
  assert.match(rendererScript, /segmenter\.segmentForVideo/);
});

test('virtual-background runtime and the three bundled backgrounds are present', () => {
  const requiredAssets = [
    'assets/images/video-backgrounds/study-light.jpg',
    'assets/images/video-backgrounds/library-plum.jpg',
    'assets/images/video-backgrounds/classroom-soft.jpg',
    'assets/vendor/mediapipe-1.0.1/vision_bundle.mjs',
    'assets/vendor/mediapipe-1.0.1/wasm/vision_wasm_internal.wasm',
    'assets/vendor/mediapipe-1.0.1/models/selfie_segmenter.tflite',
    'assets/vendor/mediapipe-1.0.1/models/selfie_segmenter_landscape.tflite',
  ];
  requiredAssets.forEach(relativePath => {
    assert.ok(fs.statSync(path.join(root, relativePath)).size > 0, `${relativePath} must not be empty`);
  });
});

test('desktop background processing uses the higher-resolution square model and stabilizes its mask', () => {
  assert.match(roomScript, /MOBILE_DEVICE[\s\S]*?selfie_segmenter_landscape\.tflite/);
  assert.match(roomScript, /selfie_segmenter\.tflite/);
  assert.match(rendererScript, /function stabilizeMask/);
  assert.match(rendererScript, /function erodeUncertainEdges/);
  assert.match(rendererScript, /replacement: \{ low: 0\.35, high: 0\.72/);
  assert.doesNotMatch(rendererScript, /values\[index\] - 0\.12/);
});

test('screen sharing and camera effects use the same outbound video selector', () => {
  assert.match(roomScript, /const next = outboundVideoTrack\(\)/);
  assert.match(roomScript, /if \(screenTrack\) return screenTrack/);
  assert.match(roomScript, /await startBackgroundEffect\(\)/);
});

test('remote visibility recovers from camera-off for camera and screen without another playing event', () => {
  const track = { readyState: 'live', muted: false };
  const context = vm.createContext({
    remoteStream: { getVideoTracks: () => [track] }, remoteMediaState: {},
    elements: { remotePlaceholder: { hidden: false }, remotePlaceholderText: {}, remoteVideo: { readyState: 4 } },
    sendDiagnostic() {}, videoTrackDetails: () => ({}),
  });
  vm.runInContext(effectFunction('updateRemoteVideoVisibility'), context);
  for (const screen of [false, true]) {
    context.remoteMediaState = { video: false, screen: false };
    context.updateRemoteVideoVisibility('media-state');
    assert.equal(context.elements.remotePlaceholder.hidden, false);
    context.remoteMediaState = { video: !screen, screen };
    context.updateRemoteVideoVisibility('media-state');
    assert.equal(context.elements.remotePlaceholder.hidden, true);
  }
  track.muted = true;
  context.updateRemoteVideoVisibility('mute');
  assert.equal(context.elements.remotePlaceholder.hidden, false);
  assert.equal(context.elements.remotePlaceholderText.textContent, 'Ожидаем видео участника…');
  track.muted = false;
  context.updateRemoteVideoVisibility('unmute');
  assert.equal(context.elements.remotePlaceholder.hidden, true);
  context.remoteMediaState = { video: false, screen: false };
  context.updateRemoteVideoVisibility('playing');
  assert.equal(context.elements.remotePlaceholder.hidden, false);
  track.readyState = 'ended';
  context.remoteMediaState = { video: true };
  context.updateRemoteVideoVisibility('ended');
  assert.equal(context.elements.remotePlaceholder.hidden, false);
});

test('video replacement records success and rejection with the actual sender track', async () => {
  const previous = { readyState: 'ended' };
  const next = { readyState: 'live' };
  const events = [];
  const sender = { track: previous, async replaceTrack(value) { this.track = value; } };
  const context = vm.createContext({ videoTransceiver: { sender }, outboundVideoTrack: () => next,
    peerGeneration: 1, replacementSequence: 0, screenTrack: null, effectTrack: next,
    diagnosticTrackId: track => track === previous ? 1 : 2,
    videoTrackDetails: track => ({ trackState: track.readyState }),
    sendDiagnostic: (event, details) => events.push({ event, ...details }),
  });
  const start = roomScript.indexOf('  async function applyOutboundVideoTrack(');
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  function effectMode(', start)), context);
  await context.applyOutboundVideoTrack();
  assert.deepEqual(events.map(event => event.state), ['start', 'success']);
  assert.equal(events[1].trackState, 'live');
  sender.track = previous;
  sender.replaceTrack = async () => { throw new Error('replacement failed'); };
  await assert.rejects(context.applyOutboundVideoTrack(), /replacement failed/);
  assert.equal(events.at(-1).state, 'failure');
  assert.equal(events.at(-1).trackState, 'ended');
});

// Exercise the actual production functions with a deterministic display clock.
const vm = require('node:vm');
function effectFunction(name) {
  const script = rendererScript.includes(`  function ${name}(`) ? rendererScript : roomScript;
  const start = script.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = script.indexOf('\n  function ', start + 1);
  return script.slice(start, end);
}

test('frame admission retains cadence and never catches up in a burst', async () => {
  const { createFrameGate } = await import('../assets/video-background-renderer.mjs');
  for (const hz of [30, 60, 120]) {
    for (const fps of [15, 18, 24]) {
      const accept = createFrameGate();
      let count = 0;
      for (let tick = 1; tick <= hz * 10; tick++) if (accept(tick * 1000 / hz, 1000 / fps)) count++;
      assert.ok(Math.abs(count - fps * 10) <= 1);
      assert.equal(accept(120000, 1000 / fps), true);
      assert.equal(accept(120000, 1000 / fps), false);
    }
  }
});

test('software blur mixes adjacent pixels and preserves opaque uniform images', async () => {
  const { boxBlur } = await import('../assets/video-background-renderer.mjs');
  const uniform = new Uint8ClampedArray(4 * 3 * 2).fill(255);
  boxBlur(uniform, 3, 2, 2);
  assert.ok(uniform.every(value => value === 255));
  const impulse = new Uint8ClampedArray([0,0,0,255, 255,255,255,255, 0,0,0,255]);
  boxBlur(impulse, 3, 1, 1);
  assert.ok(impulse[0] > 0 && impulse[4] < 255);
  assert.equal(impulse[3], 255);
});

test('background blur filters a reduced source while foreground stays full resolution', () => {
  const calls = [];
  function canvas(name, width, height) {
    const context = {
      clearRect() {}, save() {}, restore() {},
      drawImage(source, ...args) { calls.push({ name, source: source.name, args, filter: this.filter }); },
    };
    return { name, width, height, getContext() { return context; } };
  }
  const ctx = vm.createContext({
    effectOutputCanvas: canvas('output', 960, 540),
    effectForegroundCanvas: canvas('foreground', 960, 540),
    effectSourceVideo: { name: 'camera', videoWidth: 1280, videoHeight: 720 },
    effectBlurSourceCanvas: canvas('small', 240, 135),
    effectBlurCanvas: canvas('blur', 240, 135),
    supportsCanvasFilter: true, selectedBackground: 'blur', MASK_PROFILES: { blur: { feather: 1.2 } },
    effectMode: () => 'blur',
  });
  vm.runInContext(`${effectFunction('drawCover')}\n${effectFunction('renderEffectComposite')}`, ctx);
  ctx.renderEffectComposite(canvas('mask', 1280, 720));
  const blur = calls.find(call => call.name === 'blur');
  assert.equal(blur.source, 'small');
  assert.equal(blur.filter, 'blur(4.5px)');
  const foreground = calls.find(call => call.name === 'foreground' && call.source === 'camera');
  assert.deepEqual(foreground.args.slice(-2), [960, 540]);
  const output = calls.find(call => call.name === 'output' && call.source === 'blur');
  assert.deepEqual(output.args, [0, 0, 960, 540]);
});


test('video RTP diagnostics omit audio and discard results from a closed connection', async () => {
  const events = [];
  const reports = new Map([
    ['audio', { type: 'inbound-rtp', kind: 'audio', bytesReceived: 50 }],
    ['video', { type: 'inbound-rtp', kind: 'video', ssrc: 12, framesDecoded: 42, bytesReceived: 500 }],
  ]);
  const connection = { getStats: async () => reports };
  const context = vm.createContext({ peerConnection: connection,
    elements: { remotePlaceholder: { hidden: false } },
    sendDiagnostic: (event, details) => events.push({ event, ...details }),
  });
  const start = roomScript.indexOf('  async function reportMediaStats(');
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  function candidateType(', start)), context);
  await context.reportMediaStats(connection);
  assert.equal(events.length, 1);
  assert.equal(events[0].framesDecoded, 42);
  assert.equal(events[0].placeholderVisible, true);
  connection.getStats = async () => { context.peerConnection = null; return reports; };
  await context.reportMediaStats(connection);
  assert.equal(events.length, 1);
});

test('audio ontrack cannot cover active video and old connection events are ignored', () => {
  const listeners = {};
  const video = { id: 'video', kind: 'video', muted: false, readyState: 'live',
    addEventListener: (type, callback) => { listeners[type] = callback; } };
  const tracks = [];
  const connection = {};
  const context = vm.createContext({ connection, peerConnection: connection, remoteMediaState: {},
    remoteStream: { getTracks: () => tracks, getVideoTracks: () => tracks.filter(track => track.kind === 'video'),
      addTrack: track => tracks.push(track) },
    elements: { remotePlaceholder: { hidden: false }, remotePlaceholderText: {}, remoteVideo: {} },
    sendDiagnostic() {}, videoTrackDetails: () => ({}), reportMediaStats() {},
  });
  vm.runInContext(effectFunction('updateRemoteVideoVisibility'), context);
  vm.runInContext(roomScript.slice(roomScript.indexOf('    connection.ontrack = event =>'),
    roomScript.indexOf('    connection.onconnectionstatechange =')), context);
  connection.ontrack({ track: video });
  assert.equal(context.elements.remotePlaceholder.hidden, true);
  connection.ontrack({ track: { id: 'audio', kind: 'audio' } });
  assert.equal(context.elements.remotePlaceholder.hidden, true);
  context.peerConnection = {};
  video.muted = true;
  listeners.mute();
  assert.equal(context.elements.remotePlaceholder.hidden, true);
});
