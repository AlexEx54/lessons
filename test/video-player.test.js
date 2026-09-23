'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderVideoPlayer } = require('../assets/components/video-player.js');
const { validateMediaAction } = require('../lib/class-media.js');
function documentFixture() {
  const elements = [];
  return { elements, createElement(tag) {
    const events = {};
    const node = { tag, dataset: {}, children: [], paused: true, currentTime: 0, duration: 100, readyState: 4,
      append(...children) { this.children.push(...children); }, setAttribute(key, value) { this[key] = value; }, removeAttribute(key) { delete this[key]; },
      addEventListener(type, callback) { (events[type] ||= []).push(callback); },
      emit(type) { for (const callback of events[type] || []) callback(); },
      async play() { this.paused = false; this.emit('play'); }, pause() { this.paused = true; this.emit('pause'); }, load() {},
    };
    elements.push(node); return node;
  } };
}
const component = { type: 'videoPlayer', id: 'watch-video', title: 'Watch', videoSrc: '/api/classes/example/assets/video.mp4' };
test('play/pause preserve independent positions; align changes only position, with no echo', async t => {
  const doc = documentFixture(), sent = [];
  const node = renderVideoPlayer(component, { viewerRole: 'student', connected: true, peerPresent: true, sendMedia: m => sent.push(m) }, doc);
  t.after(() => node.dispose());
  const video = doc.elements.find(e => e.tag === 'video'); video.currentTime = 25;
  node.receiveMedia({ type: 'media-command', action: 'play', revision: 1 });
  await Promise.resolve();
  assert.equal(video.paused, false); assert.equal(video.currentTime, 25);
  node.receiveMedia({ type: 'media-command', action: 'pause', revision: 2 });
  assert.equal(video.paused, true); assert.equal(video.currentTime, 25);
  node.receiveMedia({ type: 'media-align', position: 70, revision: 3 });
  assert.equal(video.currentTime, 70); assert.equal(video.paused, true);
  node.receiveMedia({ type: 'media-command', action: 'play', revision: 4 });
  node.receiveMedia({ type: 'media-align', position: 80, revision: 5 });
  assert.equal(video.currentTime, 80); assert.equal(video.paused, false);
  const slider = doc.elements.find(e => e['aria-label'] === 'Позиция видео'); slider.value = '12'; slider.emit('input');
  assert.equal(video.currentTime, 12); assert.ok(sent.every(m => m.type === 'media-status'));
  node.receiveMedia({ type: 'media-command', action: 'pause', revision: 2 }); assert.equal(video.paused, false);
  node.setMediaConnection(false, false); assert.equal(video.paused, true);
});
test('server limits align to teacher and strips position from play/pause', () => {
  const payload = { state: { activeStageId: 'watch' }, lesson: { content: { stages: [{ id: 'watch', content: [component] }] } } };
  const base = { stageId: 'watch', componentId: component.id };
  assert.deepEqual(validateMediaAction('student', { ...base, type: 'media-command', action: 'pause', position: 90 }, payload), { ...base, type: 'media-command', action: 'pause' });
  assert.throws(() => validateMediaAction('student', { ...base, type: 'media-align', position: 20 }, payload));
  assert.equal(validateMediaAction('teacher', { ...base, type: 'media-align', position: 20 }, payload).position, 20);
  for (const changes of [{ position: NaN }, { position: -1 }, { stageId: 'other' }, { componentId: 'other' }]) assert.throws(() => validateMediaAction('teacher', { ...base, type: 'media-align', position: 20, ...changes }, payload));
});
test('server rejects video above 300 MiB before reading the request', async () => {
  const { MAX_VIDEO_BYTES, receiveVideo } = require('../lib/video-assets.js');
  assert.equal(MAX_VIDEO_BYTES, 300 * 1024 * 1024);
  await assert.rejects(receiveVideo({ headers: { 'content-length': String(MAX_VIDEO_BYTES + 1) } }, '/unused'), { statusCode: 413 });
});
test('alignment waits for metadata and a blocked play exposes a local activation button', async t => {
  const doc = documentFixture();
  const node = renderVideoPlayer(component, { viewerRole: 'student', connected: true, peerPresent: true, sendMedia() {} }, doc);
  t.after(() => node.dispose());
  const video = doc.elements.find(e => e.tag === 'video');
  video.readyState = 0;
  node.receiveMedia({ type: 'media-align', position: 42, revision: 1 });
  assert.equal(video.currentTime, 0);
  video.readyState = 4; video.emit('loadedmetadata'); assert.equal(video.currentTime, 42);
  video.play = async () => { throw new Error('NotAllowedError'); };
  node.receiveMedia({ type: 'media-command', action: 'play', revision: 2 });
  await Promise.resolve();
  assert.equal(doc.elements.find(e => e.textContent === 'Включить просмотр').hidden, false);
  node.receiveMedia({ type: 'media-command', action: 'pause', revision: 3 });
  assert.equal(doc.elements.find(e => e.textContent === 'Включить просмотр').hidden, true);
});
