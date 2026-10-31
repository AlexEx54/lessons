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
const mediaScript = fs.readFileSync(path.join(root, 'assets', 'call-media.js'), 'utf8');
const connectionScript = fs.readFileSync(path.join(root, 'assets', 'call-connection.js'), 'utf8');
const { createCallMedia, fakeTrack, FakeMediaStream } = require('./helpers/call-media.js');

test('teacher and guest share the same virtual-background controls', () => {
  assert.match(roomHtml, /id="prejoin-background-options"/);
  assert.match(roomHtml, /id="call-background-options"/);

  assert.doesNotMatch(mediaScript, /role\s*===/);
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
  assert.match(mediaScript, /MOBILE_DEVICE[\s\S]*?selfie_segmenter_landscape\.tflite/);
  assert.match(mediaScript, /selfie_segmenter\.tflite/);
  assert.match(rendererScript, /function stabilizeMask/);
  assert.match(rendererScript, /function erodeUncertainEdges/);
  assert.match(rendererScript, /replacement: \{ low: 0\.35, high: 0\.72/);
  assert.doesNotMatch(rendererScript, /values\[index\] - 0\.12/);
});

test('screen sharing and camera effects use the same outbound video selector', () => {
  assert.match(connectionScript, /const next = media\.outboundVideoTrack\(\)/);
  assert.match(mediaScript, /if \(screenTrack\) return screenTrack/);
  assert.match(mediaScript, /void applyBackgroundEffect\(\)/);
});

// Exercise the actual production functions with a deterministic display clock.
const vm = require('node:vm');
function effectFunction(name) {
  const start = rendererScript.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = rendererScript.indexOf('\n  function ', start + 1);
  return rendererScript.slice(start, end);
}

const flush = () => new Promise(resolve => setImmediate(resolve));

// Runs the effect state machine of CallMedia with fake pipelines whose first frame the test controls.
async function effectRoom() {
  const camera = fakeTrack('video', { id: 'camera' });
  const sessions = [];
  const room = createCallMedia({ globals: { console: { error() {} } },
    mediaDevices: { getUserMedia: async () => new FakeMediaStream([camera]) } });
  room.loadBackgroundPipeline = async () => ({
    createBackgroundPipeline({ onStage, onFailure }) {
      let finish, fail;
      const session = {
        track: { id: `effect-${sessions.length}`, enabled: false }, details: { transport: 'worker-track' },
        stopped: false, onStage, onFailure, visibility() {},
        ready: new Promise((resolve, reject) => { finish = () => resolve(session); fail = reject; }),
        finish: () => finish(), fail: error => fail(error),
        stop() { this.stopped = true; fail(new DOMException('Effect stopped', 'AbortError')); },
      };
      sessions.push(session);
      return session;
    },
  });
  await room.media.prepare();
  room.sentVideo.length = 0;
  room.events.length = 0;
  return Object.assign(room, { camera, sessions, sent: room.sentVideo });
}

async function withActiveBlur(room) {
  const selection = room.media.selectBackground('blur');
  await flush();
  room.sessions[0].finish();
  await selection;
}

test('a background prepares while the camera keeps going and replaces it after the first frame', async () => {
  const room = await effectRoom();
  const { media, camera, sessions, sent } = room;
  const selection = media.selectBackground('blur');
  await flush();
  assert.equal(sessions.length, 1);
  assert.equal(media.outboundVideoTrack(), camera);
  assert.deepEqual(sent, []);
  sessions[0].onStage('segmenter');
  assert.deepEqual(room.progress(), { stage: 'segmenter' });
  sessions[0].finish();
  await selection;
  assert.deepEqual(sent, [sessions[0].track]);
  assert.equal(sessions[0].track.enabled, true);
  assert.equal(room.progress(), null);
  assert.equal(media.previewTrack(), sessions[0].track);
});

test('switching effects keeps the old one until the new one is sent and ignores repeated clicks', async () => {
  const room = await effectRoom();
  const { media, sessions, sent } = room;
  await withActiveBlur(room);
  const selection = media.selectBackground('study-light');
  await flush();
  await media.selectBackground('study-light');
  assert.equal(sessions.length, 2);
  assert.equal(media.outboundVideoTrack(), sessions[0].track);
  assert.equal(sessions[0].stopped, false);
  sessions[1].finish();
  await selection;
  assert.equal(sent.at(-1), sessions[1].track);
  assert.equal(sessions[0].stopped, true);
  await media.selectBackground('study-light');
  assert.equal(sessions.length, 2);
});

test('choosing the shown background again cancels the one that is preparing', async () => {
  const room = await effectRoom();
  const { media, sessions } = room;
  await withActiveBlur(room);
  const selection = media.selectBackground('study-light');
  await flush();
  await media.selectBackground('blur');
  await selection;
  sessions[1].onStage('wasm');
  assert.equal(room.progress(), null);
  assert.equal(sessions[1].stopped, true);
  assert.equal(sessions[0].stopped, false);
  assert.equal(media.outboundVideoTrack(), sessions[0].track);
  assert.deepEqual(room.status(), { text: 'Эффект включён', state: 'ready' });
});

test('a failed start keeps the current video and reverts the choice without storing it', async () => {
  const room = await effectRoom();
  const { media, camera, sessions, stored, events } = room;
  const selection = media.selectBackground('blur');
  await flush();
  sessions[0].fail(new Error('GPU unavailable'));
  await selection;
  assert.equal(media.outboundVideoTrack(), camera);
  assert.equal(media.snapshot().background, 'none');
  assert.deepEqual(room.progress(), { failed: 'blur' });
  assert.deepEqual(stored, ['blur']);
  assert.equal(events.find(event => event.event === 'background-effect-failure').mode, 'blur');
});

test('a running effect that breaks falls back to the camera', async () => {
  const room = await effectRoom();
  const { media, camera, sessions, sent } = room;
  await withActiveBlur(room);
  sessions[0].onFailure(new Error('GPU context lost'));
  await flush();
  assert.equal(sessions[0].stopped, true);
  assert.equal(media.activeEffectDiagnostic(), null);
  assert.equal(media.snapshot().background, 'none');
  assert.equal(sent.at(-1), camera);
  assert.deepEqual(room.progress(), { failed: 'blur' });
});

test('a background chosen while the previous one is being sent keeps its notice', async () => {
  const room = await effectRoom();
  const { media, sessions } = room;
  let release;
  room.applyVideo = () => new Promise(resolve => { release = resolve; });
  const first = media.selectBackground('blur');
  await flush();
  sessions[0].finish();
  await flush();
  const second = media.selectBackground('study-light');
  await flush();
  release();
  await first;
  assert.deepEqual(room.progress(), { stage: 'worker' });
  sessions[1].finish();
  await flush();
  release();
  await second;
  assert.equal(room.progress(), null);
});

test('a failed swap breaks only its own effect and keeps a newer one preparing', async () => {
  const room = await effectRoom();
  const { media, camera, sessions } = room;
  let reject;
  const apply = room.applyVideo;
  room.applyVideo = () => new Promise((_resolve, fail) => { reject = fail; });
  const first = media.selectBackground('blur');
  await flush();
  sessions[0].finish();
  await flush();
  room.applyVideo = apply;
  void media.selectBackground('study-light');
  await flush();
  reject(new Error('replaceTrack failed'));
  await first;
  assert.equal(sessions[0].stopped, true);
  assert.equal(sessions[1].stopped, false);
  assert.equal(media.snapshot().background, 'study-light');
  assert.equal(media.outboundVideoTrack(), camera);
  assert.deepEqual(room.progress(), { stage: 'worker' });
});

test('the preparation notice names the stage and offers a retry after a failure', () => {
  const parts = Object.fromEntries(['.effect-progress__title', '.effect-progress__stage', '[data-effect-action="cancel"]',
    '[data-effect-action="retry"]', '[data-effect-action="close"]'].map(selector => [selector, { hidden: false }]));
  const notice = { hidden: true, dataset: {}, querySelector: selector => parts[selector] };
  const context = vm.createContext({ document: { querySelectorAll: () => [notice] } });
  const start = roomScript.indexOf('  const EFFECT_STAGES = {');
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  // A new srcObject', start)), context);
  context.renderEffectProgress({ stage: 'segmenter' });
  assert.equal(notice.hidden, false);
  assert.equal(notice.dataset.state, 'loading');
  assert.equal(parts['.effect-progress__title'].textContent, 'Готовим фон');
  assert.equal(parts['.effect-progress__stage'].textContent, 'Настраиваем модель…');
  assert.deepEqual(['cancel', 'retry', 'close'].map(action => parts[`[data-effect-action="${action}"]`].hidden), [false, true, true]);
  context.renderEffectProgress({ failed: 'blur' });
  assert.equal(notice.dataset.state, 'error');
  assert.equal(parts['.effect-progress__title'].textContent, 'Не удалось включить фон');
  assert.equal(parts['.effect-progress__stage'].textContent, '');
  assert.deepEqual(['cancel', 'retry', 'close'].map(action => parts[`[data-effect-action="${action}"]`].hidden), [true, false, false]);
  context.renderEffectProgress(null);
  assert.equal(notice.hidden, true);
});

test('notice buttons cancel to the shown background, retry the failed one or hide the notice', () => {
  const buttons = ['cancel', 'retry', 'close'].map(action => ({ dataset: { effectAction: action },
    addEventListener(_type, handler) { this.click = handler; } }));
  const actions = [];
  const context = vm.createContext({
    document: { querySelectorAll: () => buttons },
    media: Object.fromEntries(['cancelBackground', 'retryBackground', 'dismissEffectNotice']
      .map(name => [name, async () => actions.push(name)])),
  });
  const start = roomScript.indexOf("  document.querySelectorAll('[data-effect-action]')");
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  elements.toggleScreen.addEventListener(', start)), context);
  buttons.forEach(button => button.click());
  assert.deepEqual(actions, ['cancelBackground', 'retryBackground', 'dismissEffectNotice']);
});

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
