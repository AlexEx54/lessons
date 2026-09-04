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
