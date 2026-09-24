'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderVideoPlayer } = require('../assets/components/video-player.js');
const { validateMediaAction } = require('../lib/class-media.js');
function documentFixture() {
  const elements = [];
  return { elements, createElement(tag) {
    const events = {};
    const node = { tag, dataset: {}, style: {}, children: [], paused: true, currentTime: 0, duration: 100, readyState: 4,
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; }, querySelector() { return null; }, setAttribute(key, value) { this[key] = value; }, removeAttribute(key) { delete this[key]; },
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

const question = { id: 'q-1', atMs: 10000, mode: 'multiple', text: 'Choose two', options: [
  { id: 'a', text: 'First' }, { id: 'b', text: 'Second' }, { id: 'c', text: 'Third' },
], correctOptionIds: ['a', 'c'] };
function descendants(node) { return [node, ...node.children.flatMap(descendants)]; }
function byText(node, text) { return descendants(node).find(e => e.textContent === text); }

test('questions stop each player independently, share answers and continue locally after a wrong answer', async t => {
  const docs = [documentFixture(), documentFixture()], sent = [], submissions = [];
  const nodes = docs.map((doc, index) => renderVideoPlayer({ ...component, questions: [question] }, {
    viewerRole: index ? 'student' : 'teacher', connected: true, peerPresent: true,
    sendMedia: m => sent.push(m), onQuestionAnswer: a => submissions.push(a),
  }, doc));
  t.after(() => nodes.forEach(n => n.dispose()));
  const [teacherVideo, studentVideo] = docs.map(d => d.elements.find(e => e.tag === 'video'));
  nodes.forEach(n => n.receiveMedia({ type: 'media-command', action: 'play', revision: 1 }));
  studentVideo.currentTime = 7;
  teacherVideo.currentTime = 10.3; teacherVideo.emit('timeupdate');
  assert.equal(teacherVideo.paused, true); assert.equal(teacherVideo.currentTime, 10);
  assert.equal(studentVideo.paused, false); assert.equal(studentVideo.currentTime, 7);
  assert.equal(sent.some(m => m.type === 'media-command'), false);
  const choices = descendants(nodes[0]).filter(n => n.dataset.optionId);
  assert.equal(choices[0].dataset.teacherHint, 'true');
  choices[1].emit('click'); byText(nodes[0], 'Ответить').emit('click');
  assert.deepEqual(submissions[0].selectedOptionIds, ['b']);
  const result = { 'q-1': { selectedOptionIds: ['b'], correct: false, answeredBy: 'teacher' } };
  nodes.forEach(n => n.updateQuestionState(result));
  assert.equal(descendants(nodes[1]).find(n => n.className === 'video-player__question').hidden, true);
  studentVideo.currentTime = 10.2; studentVideo.emit('timeupdate');
  assert.equal(studentVideo.paused, true);
  assert.ok(byText(nodes[1], 'Продолжить →'));
  assert.ok(descendants(nodes[1]).filter(n => n.dataset.optionId).every(n => n.dataset.teacherHint === 'false'));
  nodes[0].receiveMedia({ type: 'media-command', action: 'play', revision: 2 });
  assert.equal(teacherVideo.paused, true);
  nodes[0].receiveMedia({ type: 'media-align', position: 80, revision: 3 });
  assert.equal(teacherVideo.currentTime, 10);
  byText(nodes[0], 'Продолжить →').emit('click'); await Promise.resolve();
  assert.equal(teacherVideo.paused, false); assert.equal(studentVideo.paused, true);
  assert.equal(sent.some(m => m.type === 'media-command'), false);
  teacherVideo.currentTime = 5; teacherVideo.emit('seeked'); teacherVideo.currentTime = 11; teacherVideo.emit('timeupdate');
  assert.equal(teacherVideo.paused, false);
});

test('seeking past questions stops at the first one, including a second question at the same time', t => {
  const doc = documentFixture();
  const node = renderVideoPlayer({ ...component, questions: [{ ...question, id: 'q-2' }, question] }, {}, doc);
  t.after(() => node.dispose());
  const video = doc.elements.find(e => e.tag === 'video');
  video.currentTime = 90; video.emit('seeked');
  assert.equal(video.currentTime, 10);
  node.updateQuestionState({ 'q-1': { selectedOptionIds: ['a', 'c'], correct: true }, 'q-2': { selectedOptionIds: ['a'], correct: false } });
  byText(node, 'Продолжить →').emit('click');
  assert.equal(video.paused, true);
  assert.match(byText(node, 'Не совсем верно · обсудите ответ вместе').textContent, /Не совсем верно/);
  byText(node, 'Продолжить →').emit('click');
  assert.equal(video.paused, false);
});

test('question normalizer rejects malformed keys, duplicates, modes and out-of-range times', () => {
  const { normalizeVideoQuestions } = require('../assets/components/video-player.js');
  assert.deepEqual(normalizeVideoQuestions(), []);
  for (const patch of [
    { atMs: -1 }, { atMs: 0.5 }, { atMs: 100000 }, { text: ' ' }, { mode: 'other' },
    { mode: 'single' }, { correctOptionIds: [] }, { correctOptionIds: ['missing'] },
    { correctOptionIds: ['a', 'a'] }, { options: [question.options[0], question.options[0]] },
  ]) assert.throws(() => normalizeVideoQuestions([{ ...question, ...patch }], 100000));
  assert.throws(() => normalizeVideoQuestions([question, question]));
  assert.equal(normalizeVideoQuestions([{ ...question, mode: 'single', correctOptionIds: ['a'] }])[0].mode, 'single');
});

test('active question is restored on reload and reset uses a new local progress epoch', t => {
  const originalStorage = globalThis.sessionStorage;
  const storage = new Map();
  globalThis.sessionStorage = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
  t.after(() => { if (originalStorage === undefined) delete globalThis.sessionStorage; else globalThis.sessionStorage = originalStorage; });
  const opts = { viewerRole: 'student', connected: true, peerPresent: true, sendMedia() {} };
  const firstDoc = documentFixture(), first = renderVideoPlayer({ ...component, questions: [question] }, opts, firstDoc);
  firstDoc.elements.find(n => n.tag === 'video').currentTime = 11;
  firstDoc.elements.find(n => n.tag === 'video').emit('timeupdate'); first.dispose();
  const doc = documentFixture(), restored = renderVideoPlayer({ ...component, questions: [question] }, opts, doc);
  t.after(() => restored.dispose());
  const video = doc.elements.find(n => n.tag === 'video'); video.emit('loadedmetadata');
  assert.equal(video.currentTime, 10); assert.ok(byText(restored, 'Choose two'));
  const reset = renderVideoPlayer({ ...component, questions: [question] }, { ...opts, questionEpoch: 1 }, documentFixture());
  t.after(() => reset.dispose());
  assert.equal(descendants(reset).find(n => n.className === 'video-player__question').hidden, true);
});

test('server enforces single selection, accepts teacher answers and keeps the first accepted answer', () => {
  const { applyComponentAction } = require('../lib/class-component-handlers.js');
  const single = { ...component, questions: [{ ...question, mode: 'single', correctOptionIds: ['a'] }] };
  const state = {};
  const action = { type: 'video-question-answer', questionId: 'q-1', selectedOptionIds: ['a', 'b'] };
  assert.throws(() => applyComponentAction({ role: 'teacher', component: single, action, state }));
  action.selectedOptionIds = ['a'];
  applyComponentAction({ role: 'teacher', component: single, action, state });
  assert.deepEqual(state.videoQuestions['watch-video']['q-1'], { selectedOptionIds: ['a'], correct: true, answeredBy: 'teacher' });
  applyComponentAction({ role: 'student', component: single, action: { ...action, selectedOptionIds: ['b'] }, state });
  assert.equal(state.videoQuestions['watch-video']['q-1'].answeredBy, 'teacher');
  assert.equal(state.videoQuestions['watch-video']['q-1'].correct, true);
});

test('editor previews questions automatically, retries locally and opens the form separately', async t => {
  const doc = documentFixture(), savedAnswers = {}, saves = [];
  const node = renderVideoPlayer({ ...component, questions: [question] }, {
    viewerRole: 'teacher', questionAnswers: savedAnswers,
    onSaveQuestions: async questions => { saves.push(questions); return { ...component, questions }; },
  }, doc);
  t.after(() => node.dispose());
  const video = doc.elements.find(n => n.tag === 'video');
  const overlay = doc.elements.find(n => n.className === 'video-player__question');
  const editor = doc.elements.find(n => n.tag === 'form');
  video.currentTime = 11; video.emit('timeupdate');
  assert.equal(video.currentTime, 10); assert.equal(video.paused, true);
  assert.equal(overlay.hidden, false); assert.equal(editor.hidden, true);
  descendants(node).find(n => n.dataset.optionId === 'b').emit('click');
  byText(node, 'Ответить').emit('click');
  assert.ok(byText(node, 'Продолжить →'));
  assert.deepEqual(savedAnswers, {}); assert.deepEqual(saves, []);
  byText(node, 'Закрыть').emit('click');
  assert.equal(overlay.hidden, true);
  const marker = descendants(node).find(n => n.className === 'video-player__marker');
  marker.emit('click');
  assert.equal(overlay.hidden, false); assert.ok(byText(node, 'Ответить'));
  assert.equal(byText(node, 'Продолжить →'), undefined);
  byText(node, 'Редактировать').emit('click');
  assert.equal(overlay.hidden, true); assert.equal(editor.hidden, false);
  video.emit('timeupdate'); assert.equal(overlay.hidden, true);
  assert.equal(marker.disabled, true);
  byText(node, 'Отмена').emit('click');
  assert.equal(editor.hidden, true); assert.equal(marker.disabled, false);
});

test('shared timeline groups simultaneous questions and previews the selected question in editor', t => {
  const doc = documentFixture();
  const node = renderVideoPlayer({ ...component, questions: [question, { ...question, id: 'q-2', text: 'Second question' }] }, {
    onSaveQuestions() {},
  }, doc);
  t.after(() => node.dispose());
  const timeline = descendants(node).find(n => n.className === 'video-player__timeline');
  assert.ok(timeline.children.some(n => n['aria-label'] === 'Позиция видео'));
  const markers = timeline.children.find(n => n.className === 'video-player__markers');
  assert.equal(markers.children.length, 1);
  const marker = markers.children[0];
  assert.equal(marker.textContent, '2'); assert.equal(marker.style.left, '10%');
  marker.emit('click');
  byText(node, '0:10 · Second question').emit('click');
  const overlay = descendants(node).find(n => n.className === 'video-player__question');
  assert.equal(overlay.hidden, false); assert.ok(byText(overlay, 'Second question'));
  assert.equal(descendants(node).find(n => n.className === 'video-player__marker-choices').hidden, true);
});
