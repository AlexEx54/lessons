'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const roomHtml = fs.readFileSync(path.join(root, 'video-call-room.html'), 'utf8');
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
  assert.match(backgroundImplementation, /canvas\.captureStream/);
  assert.match(backgroundImplementation, /segmenter\.segmentForVideo/);
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
  assert.match(roomScript, /function stabilizeMask/);
  assert.match(roomScript, /function erodeUncertainEdges/);
  assert.match(roomScript, /replacement: \{ low: 0\.35, high: 0\.72/);
  assert.doesNotMatch(roomScript, /values\[index\] - 0\.12/);
});

test('screen sharing and camera effects use the same outbound video selector', () => {
  assert.match(roomScript, /videoTransceiver\.sender\.replaceTrack\(outboundVideoTrack\(\)\)/);
  assert.match(roomScript, /if \(screenTrack\) return screenTrack/);
  assert.match(roomScript, /await startBackgroundEffect\(\)/);
});

test('remote camera becomes visible again when an effect track resumes', () => {
  const onTrackImplementation = roomScript.slice(
    roomScript.indexOf('connection.ontrack = event =>'),
    roomScript.indexOf('connection.onconnectionstatechange ='),
  );
  assert.ok(onTrackImplementation.length > 0);
  const unmuteHandler = onTrackImplementation.match(
    /event\.track\.addEventListener\('unmute',[\s\S]*?\}\);/,
  )?.[0] || '';
  assert.match(unmuteHandler, /remotePlaceholder\.hidden = true/);
  assert.doesNotMatch(unmuteHandler, /remotePlaceholder\.hidden = false/);

  const playingHandler = roomScript.match(
    /remoteVideo\.addEventListener\('playing',[\s\S]*?\}\);/,
  )?.[0] || '';
  assert.match(playingHandler, /remotePlaceholder\.hidden = true/);
  assert.doesNotMatch(playingHandler, /once:\s*true/);
});

// Exercise the actual production functions with a deterministic display clock.
const vm = require('node:vm');
function effectFunction(name) {
  const start = roomScript.indexOf(`  function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const end = roomScript.indexOf('\n  function ', start + 1);
  return roomScript.slice(start, end);
}

function frameHarness(targetFps = 24, delegate = 'GPU') {
  const context = vm.createContext({
    EFFECT_FRAME_INTERVAL_MS: 1000 / targetFps,
    EFFECT_STATS_INTERVAL_MS: 30_000,
    segmenterDelegate: delegate,
    effectTrack: { requestFrame() {} }, effectSourceVideo: {}, selectedBackground: 'blur',
    effectLastFrameAt: 0, effectFrameRequest: 0, effectFailureCount: 0,
    effectStatsStartedAt: 0, effectProcessedFrames: 0, effectFrameTotalMs: 0,
    effectStageTotals: { segmentation: 0, readback: 0, mask: 0, composite: 0 },
    effectMaxFrameMs: 0, effectHiddenFrames: 0, effectMaskCanvas: {},
    document: { hidden: false },
    window: { requestAnimationFrame() { return 1; } },
    now: 0, frames: 0, diagnostics: [],
  });
  vm.runInContext(`
    performance = { now: () => now };
    segmenter = { segmentForVideo(source, timestamp, callback) {
      frames += 1; now += 3;
      callback({ confidenceMasks: [{}] });
      now += 2;
    } };
    updateEffectMask = () => { now += 7; return 4; };
    renderEffectComposite = () => { now += 8; };
    effectDiagnosticDetails = details => details;
    sendDiagnostic = (event, details) => diagnostics.push({ event, ...details });
    handleEffectFailure = error => { throw error; };
    ${effectFunction('effectFrameInterval')}
    ${effectFunction('reportEffectStats')}
    ${effectFunction('renderEffectFrame')}
  `, context);
  return context;
}

test('frame scheduler retains target cadence at 60 and 120 Hz without catch-up bursts', () => {
  for (const displayHz of [60, 120]) {
    for (const [target, delegate, expected] of [[24, 'GPU', 24], [18, 'GPU', 18], [24, 'CPU', 15]]) {
      const ctx = frameHarness(target, delegate);
      for (let tick = 1; tick <= displayHz * 10; tick += 1) {
        ctx.now = tick * 1000 / displayHz;
        ctx.renderEffectFrame(ctx.now);
      }
      assert.ok(Math.abs(ctx.frames - expected * 10) <= 1, `${displayHz} Hz, ${target} ${delegate}: ${ctx.frames}`);
      const before = ctx.frames;
      ctx.now = 120_000;
      ctx.renderEffectFrame(120_000);
      assert.equal(ctx.frames, before + 1);
      ctx.renderEffectFrame(120_000);
      assert.equal(ctx.frames, before + 1);
    }
  }
});

test('diagnostics split readback, mask, composite and segmentation including task cleanup', () => {
  const ctx = frameHarness();
  ctx.now = 100;
  ctx.renderEffectFrame(100);
  ctx.document.hidden = true;
  ctx.now = 30_100;
  ctx.renderEffectFrame(30_100);
  const stats = ctx.diagnostics[0];
  assert.equal(stats.averageFrameMs, 20);
  assert.equal(stats.averageSegmentationMs, 5);
  assert.equal(stats.averageReadbackMs, 4);
  assert.equal(stats.averageMaskMs, 3);
  assert.equal(stats.averageCompositeMs, 8);
  assert.equal(stats.maxFrameMs, 20);
  assert.equal(stats.processedFrames, 2);
  assert.equal(stats.hiddenFrames, 1);
  assert.equal(ctx.effectProcessedFrames, 0);
  assert.equal(ctx.effectStageTotals.readback, 0);
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
    selectedBackground: 'blur', MASK_PROFILES: { blur: { feather: 1.2 } },
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
