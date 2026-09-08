'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const { createDocument } = require('./helpers/lesson-dom.js');
const source = fs.readFileSync(path.join(__dirname, '../assets/class-session.js'), 'utf8');
async function fixture(role = 'student', quiz = null) {
  const document = createDocument(), sockets = [], timers = new Map(), intervals = new Map(), frames = [];
  const id = '11111111-1111-4111-8111-111111111111';
  let settings, interactive;
  const lesson = { content: { stages: [
    { id: 'warm-up', content: [{ type: 'thisOrThat', id: 'choice' }] },
    { id: 'lead-in', content: role === 'teacher' ? [{ type: 'markdownCard', id: 'answers', studentVisibility: 'controlled' }] : [] },
  ] } };
  if (quiz) lesson.content.stages[0] = { id: 'reading', content: [quiz] };
  const availableStageIds = [quiz ? 'reading' : 'warm-up', 'lead-in'];
  const status = document.getElementById('teacher-screen');
  status.append(document.createElement('span'));
  const selectors = {};
  for (const selector of ['.teacher-version', '.end-lesson', '.lesson-brand']) selectors[selector] = document.createElement('div');
  selectors['.end-lesson'].append(document.createElement('span'));
  document.querySelector = selector => selectors[selector];
  class Socket {
    static OPEN = 1;
    constructor() { this.readyState = 1; this.listeners = {}; this.sent = []; sockets.push(this); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    receive(payload) { this.listeners.message({ data: JSON.stringify({ lesson, availableStageIds, actorRole: role, ...payload }) }); }
    close(code = 1006, reason = '') { this.readyState = 3; this.listeners.close({ code, reason }); }
  }
  const mounted = new Map([['choice', { updateState(selections) { frames.push(selections); }, setInteractive(value) { interactive = value; } }]]);
  let timerId = 0;
  const window = {
    location: { pathname: `/classes/${id}${role === 'student' ? '/student' : ''}`, protocol: 'http:', host: 'localhost' },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); }, addEventListener() {},
    setInterval(fn) { intervals.set(++timerId, fn); return timerId; },
    clearInterval(id) { intervals.delete(id); },
    scrollTo() {},
    ComponentTree: require('../assets/components/component-tree.js'),
    GuidedRoleCardsComponent: { renderGuidedRoleCards: (data, options) => require('../assets/components/guided-role-cards.js').renderGuidedRoleCards(data, options, document) },
    GapFillComponent: { renderGapFill() { return mounted.get('choice'); } },
    MiniSituationComponent: { renderMiniSituation() { return mounted.get('choice'); } },
    ExerciseState: require('../assets/components/exercise-state.js'),
    MultipleChoiceComponent: { renderMultipleChoice() { return mounted.get('choice'); } },
    ThisOrThatComponent: { renderThisOrThat() { return mounted.get('choice'); } },
    MarkdownCardComponent: { renderMarkdownCard() { return { updateStudentVisibility() {}, setVisibilityInteractive() {} }; } },
  };
  const initial = { activeStageId: quiz ? 'reading' : 'warm-up', version: 0, selections: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/lesson-view.js'), 'utf8'), { window, document });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/class-component-adapters.js'), 'utf8'), { window });
  const createView = window.LessonView.create;
  window.LessonView.create = value => { settings = value; return createView(value); };
  vm.runInNewContext(source, { window, document, WebSocket: Socket, structuredClone, fetch: async () => ({ ok: true, json: async () => ({ state: initial, lesson, availableStageIds }) }) });
  await new Promise(resolve => setImmediate(resolve));
  return { settings, sockets, timers, intervals, frames, initial, lesson, document, isInteractive: () => interactive, status };
}
test('lesson timer is local to the teacher view and stays hidden from the student', async () => {
  const teacher = await fixture('teacher');
  const teacherTimer = teacher.document.getElementById('lesson-timer');
  assert.equal(teacherTimer.hidden, false);
  teacherTimer.click();
  assert.equal(teacher.intervals.size, 1);
  [...teacher.intervals.values()][0]();
  assert.equal(teacher.document.getElementById('elapsed-time').textContent, '00:01');
  assert.equal(teacher.document.getElementById('timer-icon').textContent, 'Ⅱ');
  teacherTimer.click();
  assert.equal(teacher.intervals.size, 0);
  assert.equal(teacher.document.getElementById('timer-icon').textContent, '▶');

  const student = await fixture('student');
  assert.equal(student.document.getElementById('lesson-timer').hidden, true);
  student.document.getElementById('lesson-timer').click();
  assert.equal(student.intervals.size, 0);
});
test('rapid selections are sent in order with acknowledged versions and remote updates do not echo', async () => {
  const f = await fixture(), socket = f.sockets[0];
  socket.receive({ type: 'snapshot', state: f.initial });
  assert.equal(f.isInteractive(), true);
  const { onAction } = f.settings.componentOptions({ type: 'thisOrThat', id: 'choice' });
  const a = { type: 'select-option', componentId: 'choice', itemId: 'pair', optionId: 'a' };
  onAction(a);
  onAction({ ...a, optionId: 'b' });
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].expectedVersion, 0);
  socket.receive({ type: 'action', state: { ...f.initial, version: 1, selections: { choice: { pair: 'a' } } } });
  assert.equal(socket.sent.length, 2);
  assert.equal(socket.sent[1].expectedVersion, 1);
  assert.equal(socket.sent[1].optionId, 'b');
  assert.equal(f.frames.at(-1).pair, 'b');
  socket.receive({ type: 'action', state: { ...f.initial, version: 2, selections: { choice: { pair: 'b' } } } });
  assert.equal(socket.sent.length, 2);
  assert.equal(f.frames.at(-1).pair, 'b');
});
test('disconnect drops unconfirmed clicks, restores server state and replacement does not reconnect', async () => {
  const f = await fixture(), socket = f.sockets[0];
  socket.receive({ type: 'snapshot', state: f.initial });
  const { onAction } = f.settings.componentOptions({ type: 'thisOrThat', id: 'choice' });
  onAction({ type: 'select-option', componentId: 'choice', itemId: 'pair', optionId: 'a' });
  socket.close();
  assert.equal(f.isInteractive(), false);
  for (const timer of [...f.timers.values()]) timer();
  assert.equal(f.sockets.length, 2);
  const restored = f.sockets[1];
  restored.receive({ type: 'snapshot', state: { ...f.initial, version: 3, selections: { choice: { pair: 'b' } } } });
  assert.equal(restored.sent.length, 0);
  assert.equal(f.frames.at(-1).pair, 'b');
  f.timers.clear();
  restored.close(4001, 'Класс открыт в другой вкладке.');
  for (const timer of [...f.timers.values()]) timer();
  assert.equal(f.sockets.length, 2);
  assert.equal(f.isInteractive(), false);
});
test('teacher applies the same selection state as an observer', async () => {
  const f = await fixture('teacher'), socket = f.sockets[0];
  socket.receive({ type: 'snapshot', state: f.initial });
  socket.receive({ type: 'action', state: { ...f.initial, version: 1, selections: { choice: { pair: 'a' } } } });
  assert.equal(f.isInteractive(), false);
  assert.equal(f.frames.at(-1).pair, 'a');
  assert.equal(socket.sent.length, 0);
});

test('peer action does not acknowledge own request or relabel queued clicks with the new stage', async () => {
  const f = await fixture(), socket = f.sockets[0];
  socket.receive({ type: 'snapshot', state: f.initial });
  const { onAction } = f.settings.componentOptions({ type: 'thisOrThat', id: 'choice' });
  const action = { type: 'select-option', componentId: 'choice', itemId: 'pair', optionId: 'a' };
  onAction(action);
  onAction({ ...action, optionId: 'b' });
  const next = { ...f.initial, activeStageId: 'lead-in', version: 1 };
  socket.receive({ type: 'action', actorRole: 'teacher', state: next });
  assert.equal(socket.sent.length, 1);
  assert.equal(f.settings.state.activeIndex, 1);
  socket.receive({ type: 'action-error', error: 'Стадия уже изменилась.', state: next });
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].stageId, 'warm-up');
});
test('teacher stage navigation waits for confirmation and snapshot restores the active stage', async () => {
  const f = await fixture('teacher'), socket = f.sockets[0];
  assert.equal(f.settings.canSelect(1), false);
  socket.receive({ type: 'snapshot', state: f.initial });
  assert.equal(f.settings.canSelect(1), true);
  f.document.getElementById('next-stage').click();
  assert.equal(f.settings.state.activeIndex, 0);
  assert.equal(socket.sent[0].type, 'select-stage');
  assert.equal(socket.sent[0].stageId, 'lead-in');
  socket.receive({ type: 'action', state: { ...f.initial, version: 1, activeStageId: 'lead-in' } });
  assert.equal(f.settings.state.activeIndex, 1);
  socket.close();
  assert.equal(f.settings.canSelect(0), false);
});

test('student mounts revealed content, removes hidden content and restores it after reconnect', async () => {
  const f = await fixture(), socket = f.sockets[0];
  const state = { ...f.initial, activeStageId: 'lead-in', version: 1 };
  socket.receive({ type: 'snapshot', state });
  const container = f.document.getElementById('stage-components');
  const hidden = container.children[0];
  const shownLesson = structuredClone(f.lesson);
  shownLesson.content.stages[1].content.push({ type: 'markdownCard', id: 'answers', studentVisibility: 'controlled' });
  socket.receive({ type: 'action', actorRole: 'teacher', state: { ...state, version: 2, visibleCards: { answers: true } }, lesson: shownLesson });
  const shown = container.children[0];
  assert.notEqual(shown, hidden);
  socket.receive({ type: 'action', actorRole: 'teacher', state: { ...state, version: 3, visibleCards: { answers: false } } });
  assert.notEqual(container.children[0], shown);
  socket.close();
  for (const timer of [...f.timers.values()]) timer();
  f.sockets[1].receive({ type: 'snapshot', state: { ...state, version: 4, visibleCards: { answers: true } }, lesson: shownLesson });
  assert.equal(f.settings.state.activeIndex, 1);
  assert.equal(f.settings.state.lesson.stages[1].content[0].id, 'answers');
});


test('reading queue preserves local correct feedback while an earlier wrong answer is acknowledged', async () => {
  const quiz = { type: 'multipleChoice', id: 'choice', presentation: {
    type: 'multipleChoice', id: 'choice', items: [{ id: 'question', options: ['wrong', 'right'], answer: 'right' }],
  } };
  const f = await fixture('student', quiz), socket = f.sockets[0];
  socket.receive({ type: 'snapshot', state: f.initial });
  const { onAction } = f.settings.componentOptions(quiz);
  const action = { type: 'choose-option', componentId: 'choice', itemId: 'question', value: 'wrong' };
  onAction(action);
  assert.equal(f.frames.at(-1).answers.question.status, 'wrong');
  onAction({ ...action, value: 'right' });
  assert.equal(f.frames.at(-1).answers.question.status, 'correct');
  assert.equal(socket.sent.length, 1);
  const wrong = { ...f.initial, version: 1, exercises: { choice: { answers: { question: { value: 'wrong', status: 'wrong' } } } } };
  socket.receive({ type: 'action', state: wrong });
  assert.equal(socket.sent.length, 2);
  assert.equal(socket.sent[1].expectedVersion, 1);
  assert.equal(f.frames.at(-1).answers.question.status, 'correct');
  socket.receive({ type: 'action-error', state: wrong, error: 'Conflict' });
  assert.equal(f.frames.at(-1).answers.question.status, 'wrong');
  assert.equal(socket.sent.length, 2);
  socket.close();
  assert.equal(f.isInteractive(), false);
});

for (const type of ['gapFill', 'miniSituation']) test(`${type}: every text change is queued, acknowledgements preserve newer text and disconnect rolls back`, async () => {
  const quiz = { type, id: 'choice', presentation: { type, id: 'choice',
    gaps: [{ id: 'sentence-1', answer: 'abc' }], sentenceCount: 3 } };
  const f = await fixture('student', quiz), socket = f.sockets[0];
  socket.receive({ type: 'snapshot', state: f.initial });
  const { onAction } = f.settings.componentOptions(quiz);
  for (const value of ['a', 'ab', 'abc']) onAction({ type: 'type-answer', componentId: 'choice', itemId: 'sentence-1', value });
  assert.equal(socket.sent.length, 1);
  assert.equal(f.frames.at(-1).answers['sentence-1'].value, 'abc');
  let confirmed = {};
  for (const [index, value] of ['a', 'ab'].entries()) {
    assert.equal(socket.sent[index].value, value);
    confirmed = require('../assets/components/exercise-state.js').apply(quiz.presentation, confirmed, socket.sent[index]);
    socket.receive({ type: 'action', state: { ...f.initial, version: index + 1, exercises: { choice: confirmed } } });
    assert.equal(f.frames.at(-1).answers['sentence-1'].value, 'abc');
  }
  assert.equal(socket.sent.length, 3);
  assert.equal(socket.sent[2].value, 'abc');
  socket.close();
  assert.equal(f.frames.at(-1).answers['sentence-1'].value, 'ab');
  assert.equal(f.isInteractive(), false);
});

test('guided cards flip locally and survive session confirmations and reconnect snapshots', async () => {
  const { guidedRoleCardsPresentation } = require('../assets/components/guided-role-cards.js');
  const lesson = require('../lib/synthetic-lesson.js').createSyntheticLesson('Guided');
  const source = lesson.stages.find(stage => stage.id === 'guided-speaking').content.find(item => item.type === 'guidedRoleCards');
  const fixtures = [];
  for (const role of ['student', 'teacher']) {
    const component = { type: source.type, id: source.id, presentation: guidedRoleCardsPresentation(source, role) };
    const f = await fixture(role, component);
    fixtures.push(f);
    const socket = f.sockets[0];
    socket.receive({ type: 'snapshot', state: f.initial });
    const container = f.document.getElementById('stage-components');
    const node = container.children[0];
    const card = node.children[0].children[0];
    const flipper = card.children[0];
    flipper.click();
    assert.equal(flipper.getAttribute('aria-expanded'), 'true');
    assert.equal(socket.sent.length, 0);
    socket.receive({ type: 'action', state: { ...f.initial, version: 1 } });
    socket.close();
    socket.receive({ type: 'snapshot', state: { ...f.initial, version: 1 } });
    assert.equal(container.children[0], node);
    assert.equal(flipper.getAttribute('aria-expanded'), 'true');
    assert.equal(socket.sent.length, 0);
  }
  const teacherCards = fixtures[1].document.getElementById('stage-components').children[0].children[0].children;
  assert.equal(teacherCards[1].children[0].getAttribute('aria-expanded'), 'false');
});
