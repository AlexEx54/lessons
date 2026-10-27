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
  assert.match(roomScript, /void applyBackgroundEffect\(\)/);
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
    peerGeneration: 1, replacementSequence: 0, screenTrack: null, activeEffect: { session: { track: next } },
    diagnosticTrackId: track => track === previous ? 1 : 2,
    videoTrackDetails: track => ({ trackState: track.readyState }),
    sendDiagnostic: (event, details) => events.push({ event, ...details }),
  });
  const start = roomScript.indexOf('  async function applyOutboundVideoTrack(');
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  function effectDiagnosticDetails(', start)), context);
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

const flush = () => new Promise(resolve => setImmediate(resolve));

// Runs the room's effect state machine with fake pipelines whose first frame the test controls.
function effectRoom() {
  const camera = { id: 'camera', enabled: true };
  const sessions = [], sent = [], statuses = [], stored = [], events = [], progress = [];
  const context = vm.createContext({
    selectedBackground: 'none', backgroundEffectGeneration: 0, activeEffect: null, pendingEffect: null,
    screenTrack: null, mediaState: { video: true }, localStream: { getVideoTracks: () => [camera] },
    SEGMENTER_MODEL: { id: 'square' }, EFFECT_FRAME_INTERVAL_MS: 1000 / 24, MOBILE_DEVICE: false,
    BACKGROUND_IDS: new Set(['none', 'blur', 'study-light']), document: { hidden: false }, console: { error() {} },
    backgroundEffectsSupported: () => true, backgroundOption: () => ({}),
    sendDiagnostic: (event, details) => events.push({ event, ...details }),
    writeStoredBackground: value => stored.push(value), updateBackgroundControls() {}, updateLocalPreview() {},
    setBackgroundStatus: (text, state = '') => statuses.push({ text, state }),
    // Copies leave the vm realm so deepEqual can compare them with plain objects.
    renderEffectProgress: value => progress.push(value && { ...value }),
  });
  const start = roomScript.indexOf('  function cancelPendingEffect(');
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  function track(kind)', start)), context);
  context.applyOutboundVideoTrack = async () => { sent.push(context.outboundVideoTrack()); };
  context.loadBackgroundPipeline = async () => ({
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
  return { context, camera, sessions, sent, statuses, stored, events, progress };
}

async function withActiveBlur(room) {
  const selection = room.context.selectVideoBackground('blur');
  await flush();
  room.sessions[0].finish();
  await selection;
}

test('a background prepares while the camera keeps going and replaces it after the first frame', async () => {
  const { context, camera, sessions, sent, progress } = effectRoom();
  const selection = context.selectVideoBackground('blur');
  await flush();
  assert.equal(sessions.length, 1);
  assert.equal(context.outboundVideoTrack(), camera);
  assert.deepEqual(sent, []);
  sessions[0].onStage('segmenter');
  assert.deepEqual(progress.at(-1), { stage: 'segmenter' });
  sessions[0].finish();
  await selection;
  assert.deepEqual(sent, [sessions[0].track]);
  assert.equal(sessions[0].track.enabled, true);
  assert.equal(progress.at(-1), null);
});

test('switching effects keeps the old one until the new one is sent and ignores repeated clicks', async () => {
  const room = effectRoom();
  const { context, sessions, sent } = room;
  await withActiveBlur(room);
  const selection = context.selectVideoBackground('study-light');
  await flush();
  await context.selectVideoBackground('study-light');
  assert.equal(sessions.length, 2);
  assert.equal(context.outboundVideoTrack(), sessions[0].track);
  assert.equal(sessions[0].stopped, false);
  sessions[1].finish();
  await selection;
  assert.equal(sent.at(-1), sessions[1].track);
  assert.equal(sessions[0].stopped, true);
  await context.selectVideoBackground('study-light');
  assert.equal(sessions.length, 2);
});

test('choosing the shown background again cancels the one that is preparing', async () => {
  const room = effectRoom();
  const { context, sessions, statuses } = room;
  await withActiveBlur(room);
  const selection = context.selectVideoBackground('study-light');
  await flush();
  await context.selectVideoBackground('blur');
  await selection;
  sessions[1].onStage('wasm');
  assert.equal(room.progress.at(-1), null);
  assert.equal(sessions[1].stopped, true);
  assert.equal(sessions[0].stopped, false);
  assert.equal(context.outboundVideoTrack(), sessions[0].track);
  assert.deepEqual(statuses.at(-1), { text: 'Эффект включён', state: 'ready' });
});

test('a failed start keeps the current video and reverts the choice without storing it', async () => {
  const { context, camera, sessions, stored, events, progress } = effectRoom();
  const selection = context.selectVideoBackground('blur');
  await flush();
  sessions[0].fail(new Error('GPU unavailable'));
  await selection;
  assert.equal(context.outboundVideoTrack(), camera);
  assert.equal(context.selectedBackground, 'none');
  assert.deepEqual(progress.at(-1), { failed: 'blur' });
  assert.deepEqual(stored, ['blur']);
  assert.equal(events.find(event => event.event === 'background-effect-failure').mode, 'blur');
});

test('a running effect that breaks falls back to the camera', async () => {
  const room = effectRoom();
  const { context, camera, sessions, sent } = room;
  await withActiveBlur(room);
  sessions[0].onFailure(new Error('GPU context lost'));
  await flush();
  assert.equal(sessions[0].stopped, true);
  assert.equal(context.activeEffect, null);
  assert.equal(context.selectedBackground, 'none');
  assert.equal(sent.at(-1), camera);
  assert.deepEqual(room.progress.at(-1), { failed: 'blur' });
});

test('a background chosen while the previous one is being sent keeps its notice', async () => {
  const { context, sessions, progress } = effectRoom();
  let release;
  context.applyOutboundVideoTrack = () => new Promise(resolve => { release = resolve; });
  const first = context.selectVideoBackground('blur');
  await flush();
  sessions[0].finish();
  await flush();
  const second = context.selectVideoBackground('study-light');
  await flush();
  release();
  await first;
  assert.deepEqual(progress.at(-1), { stage: 'worker' });
  sessions[1].finish();
  await flush();
  release();
  await second;
  assert.equal(progress.at(-1), null);
});

test('a failed swap breaks only its own effect and keeps a newer one preparing', async () => {
  const { context, camera, sessions, progress } = effectRoom();
  let reject;
  const apply = context.applyOutboundVideoTrack;
  context.applyOutboundVideoTrack = () => new Promise((_resolve, fail) => { reject = fail; });
  const first = context.selectVideoBackground('blur');
  await flush();
  sessions[0].finish();
  await flush();
  context.applyOutboundVideoTrack = apply;
  void context.selectVideoBackground('study-light');
  await flush();
  reject(new Error('replaceTrack failed'));
  await first;
  assert.equal(sessions[0].stopped, true);
  assert.equal(sessions[1].stopped, false);
  assert.equal(context.selectedBackground, 'study-light');
  assert.equal(context.outboundVideoTrack(), camera);
  assert.deepEqual(progress.at(-1), { stage: 'worker' });
});

test('the preparation notice names the stage and offers a retry after a failure', () => {
  const parts = Object.fromEntries(['.effect-progress__title', '.effect-progress__stage', '[data-effect-action="cancel"]',
    '[data-effect-action="retry"]', '[data-effect-action="close"]'].map(selector => [selector, { hidden: false }]));
  const notice = { hidden: true, dataset: {}, querySelector: selector => parts[selector] };
  const context = vm.createContext({ document: { querySelectorAll: () => [notice] } });
  const start = roomScript.indexOf('  const EFFECT_STAGES = {');
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  function backgroundOption(', start)), context);
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
  const selections = [], progress = [];
  const context = vm.createContext({
    document: { querySelectorAll: () => buttons }, shownBackground: () => 'blur',
    effectProgress: { failed: 'study-light' }, selectVideoBackground: async value => selections.push(value),
    renderEffectProgress: value => progress.push(value),
  });
  const start = roomScript.indexOf("  document.querySelectorAll('[data-effect-action]')");
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  elements.toggleScreen.addEventListener(', start)), context);
  buttons.forEach(button => button.click());
  assert.deepEqual(selections, ['blur', 'study-light']);
  assert.deepEqual(progress, [null]);
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

test('RTP FPS uses elapsed sample time, reports stalls and resets on counter or SSRC changes', async () => {
  const events = [];
  const report = { type: 'inbound-rtp', kind: 'video', ssrc: 12, framesDecoded: 100, timestamp: 1000 };
  const outgoing = { type: 'outbound-rtp', kind: 'video', ssrc: 13, framesSent: 200, timestamp: 1000 };
  const connection = { getStats: async () => new Map([['v', report], ['out', outgoing]]) };
  const context = vm.createContext({ peerConnection: connection,
    elements: { remotePlaceholder: { hidden: true } },
    sendDiagnostic: (event, details) => events.push({ event, ...details }),
  });
  const start = roomScript.indexOf('  async function reportMediaStats(');
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  function candidateType(', start)), context);
  await context.reportMediaStats(connection);
  assert.equal(events[0].averageFps, undefined);
  report.timestamp = outgoing.timestamp = 31000;
  report.framesDecoded = 820; outgoing.framesSent = 1100;
  await context.reportMediaStats(connection);
  assert.equal(events.at(-2).averageFps, 24);
  assert.equal(events.at(-1).averageFps, 30);
  assert.equal(events.at(-1).sampleDurationMs, 30000);
  report.timestamp = 61000;
  await context.reportMediaStats(connection);
  assert.equal(events.at(-2).averageFps, 0);
  report.timestamp = 91000; report.framesDecoded = 10;
  await context.reportMediaStats(connection);
  assert.equal(events.at(-2).averageFps, undefined);
  report.timestamp = 121000; report.ssrc = 99; report.framesDecoded = 730;
  await context.reportMediaStats(connection);
  assert.equal(events.at(-2).averageFps, undefined);
  let release;
  connection.getStats = () => new Promise(resolve => { release = resolve; });
  const pending = context.reportMediaStats(connection);
  await context.reportMediaStats(connection);
  release(new Map());
  await pending;
  assert.equal(connection.diagnosticStatsPending, false);
});

test('ICE error storm sends distinct errors only and reports suppression on gathering completion', () => {
  const connection = {}, events = [];
  const context = vm.createContext({ connection, peerConnection: connection, gatheredCandidateTypes: new Set(['relay']),
    sendDiagnostic: (event, details) => events.push({ event, ...details }) });
  vm.runInContext(roomScript.slice(roomScript.indexOf('    const iceErrors = new Set();'),
    roomScript.indexOf('    connection.oniceconnectionstatechange =')), context);
  for (let i = 0; i < 100; i++) connection.onicecandidateerror({ errorCode: 701, errorText: 'lookup failed' });
  connection.iceGatheringState = 'complete';
  connection.onicegatheringstatechange();
  assert.equal(events.length, 2);
  assert.equal(events[1].suppressedErrors, 99);
  context.peerConnection = {};
  connection.onicecandidateerror({ errorCode: 486, errorText: 'old connection' });
  assert.equal(events.length, 2);
});

test('socket reconnect reports the previous close after reopening and ignores stale close events', () => {
  const sockets = [], events = [];
  const context = vm.createContext({
    socket: null, socketAttempt: 0, lastSocketClose: null, reconnectAttempts: 0, reconnectTimer: null,
    leaving: false, activeEffect: null, iceServers: [], navigator: { onLine: true },
    performance: { getEntriesByType: () => [{ type: 'reload' }] },
    window: { clearTimeout() {} }, closePeerConnection() {}, websocketUrl: () => 'ws://example.test',
    setConnection() {}, sendMediaState() {}, scheduleReconnect() {},
    sendDiagnostic: (event, details) => events.push({ event, ...details }),
    WebSocket: class {
      constructor() { this.handlers = {}; sockets.push(this); }
      addEventListener(type, handler) { this.handlers[type] = handler; }
    },
  });
  const start = roomScript.indexOf('  function connectSocket()');
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  async function toggleKind(', start)), context);
  context.connectSocket();
  sockets[0].handlers.open();
  assert.equal(events[0].state, 'initial');
  assert.equal(events[0].navigationType, 'reload');
  sockets[0].handlers.close({ code: 1006, wasClean: false });
  context.connectSocket();
  sockets[1].handlers.open();
  const reopened = events.filter(event => event.event === 'socket-open')[1];
  assert.equal(reopened.state, 'reconnected');
  assert.equal(reopened.socketAttempt, 2);
  assert.equal(reopened.closeCode, 1006);
  assert.equal(reopened.wasClean, false);
  assert.equal(reopened.reconnectDelayMs, 1000);
  sockets[0].handlers.close({ code: 4001, wasClean: true });
  assert.equal(context.lastSocketClose, null);
});

test('a room taken over by another tab ends here instead of reconnecting', () => {
  const sockets = [], finished = [];
  let reconnects = 0;
  const context = vm.createContext({
    socket: null, socketAttempt: 0, lastSocketClose: null, reconnectAttempts: 0, reconnectTimer: null,
    leaving: false, window: { clearTimeout() {} }, closePeerConnection() {}, websocketUrl: () => 'ws://example.test',
    setConnection() {}, scheduleReconnect: () => { reconnects++; },
    finishCall: (message, title) => finished.push({ message, title }),
    WebSocket: class {
      constructor() { this.handlers = {}; sockets.push(this); }
      addEventListener(type, handler) { this.handlers[type] = handler; }
    },
  });
  const start = roomScript.indexOf('  function connectSocket()');
  vm.runInContext(roomScript.slice(start, roomScript.indexOf('  async function toggleKind(', start)), context);
  context.connectSocket();
  sockets[0].handlers.close({ code: 4001, wasClean: true });
  assert.equal(reconnects, 0);
  assert.equal(finished.length, 1);
  assert.match(finished[0].message, /другой вкладке/);
  assert.equal(finished[0].title, 'Звонок открыт в другом месте');
});
