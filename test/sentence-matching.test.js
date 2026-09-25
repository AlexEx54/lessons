'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/lesson-dom.js');
const { normalizeSentenceMatching, renderSentenceMatching } = require('../assets/components/sentence-matching.js');
const model = require('../assets/components/exercise-state.js');
const { applyComponentAction, teacherComponent, studentComponent, clearComponentState } = require('../lib/class-component-handlers.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const source = createSyntheticLesson('Camp', { template: 'template-2' }).stages[5].content.at(-1);
const layout = { order: [5, 3, 1, 0, 4, 2], wordIds: source.items.map((_, i) => `left-${i}`), pictureIds: source.items.map((_, i) => `right-${i}`) };
const projected = model.presentation(source, layout);
const action = (i, j = i) => ({ type: 'match-word', componentId: source.id, itemId: `left-${i}`, targetId: `right-${j}`, attemptId: `attempt-${i}-${j}` });
const fire = async (node, event = 'click') => { for (const fn of node.listeners[event] || []) await fn({ preventDefault() {} }); };

test('template has six valid pairs without an answer card; validation rejects ambiguous duplicates', () => {
  assert.equal(normalizeSentenceMatching(source).items.length, 6);
  const content = createSyntheticLesson('Camp', { template: 'template-2' }).stages[5].content;
  assert.equal(content.some(item => item.id === `${source.id}-answer-key`), false);
  for (const patch of [{ items: [] }, { id: null }, { extra: true }, { items: [source.items[0], source.items[0]] },
    { items: source.items.map((item, i) => i ? item : { ...item, right: '<b>Bad</b>' }) }]) {
    assert.throws(() => normalizeSentenceMatching({ ...source, ...patch }));
  }
});

test('every completion order keeps solved rows fixed and serializes a restorable permutation', () => {
  function permutations(values) {
    return values.length ? values.flatMap((value, index) => permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest])) : [[]];
  }
  for (const sequence of permutations([0, 1, 2, 3, 4, 5])) {
    let state = {};
    for (const i of sequence) {
      state = model.apply(projected, state, action(i));
      assert.equal(new Set(state.rightOrder).size, 6);
      for (const [left, right] of Object.entries(state.matches)) assert.equal(state.rightOrder[Number(left.slice(5))], right);
      state = JSON.parse(JSON.stringify(state));
    }
    assert.deepEqual(state.rightOrder, layout.pictureIds);
  }
});

test('wrong attempt keeps selection; role projections and authoritative reducer agree and reject unavailable pairs', () => {
  const state = { _layouts: { [source.id]: layout } };
  assert.deepEqual(studentComponent(source, state).presentation, teacherComponent(source, state).presentation);
  let local = model.apply(projected, {}, action(0, 1));
  assert.equal(local.selectedId, 'left-0'); assert.deepEqual(local.rightOrder, projected.targets.map(item => item.id));
  for (const role of ['teacher', 'student']) {
    const attempt = action(role === 'teacher' ? 0 : 1);
    applyComponentAction({ component: source, state, role, action: attempt });
    local = model.apply(projected, local, attempt);
    assert.deepEqual(state.exercises[source.id].matches, local.matches);
    assert.deepEqual(state.exercises[source.id].rightOrder, local.rightOrder);
  }
  for (const attempt of [action(0), action(2, 1), { ...action(2), targetId: 'missing' }, { ...action(2), type: 'bad' }]) {
    assert.throws(() => model.apply(projected, local, attempt), { statusCode: 400 });
  }
  assert.throws(() => applyComponentAction({ component: source, state, role: 'guest', action: action(2) }), { statusCode: 403 });
  clearComponentState({ component: source, state }); assert.equal(state.exercises[source.id], undefined);
});

test('teacher alone sees hint; both clients retain DOM, align green pairs, restore and reset', async () => {
  const teacher = renderSentenceMatching(source, { presentation: projected, viewerRole: 'teacher' }, createDocument());
  const actions = [];
  const student = renderSentenceMatching(source, { presentation: projected, viewerRole: 'student', onAction: a => actions.push(a) }, createDocument());
  const left = student.querySelectorAll('.sentence-matching__card--left')[0];
  const right = student.querySelectorAll('.sentence-matching__card--right').find(card => card.dataset.itemId === 'right-0');
  await fire(left);
  let state = model.apply(projected, {}, actions[0]); teacher.updateState(state);
  assert.equal(teacher.querySelectorAll('.sentence-matching__card--hint').length, 1);
  assert.equal(student.querySelectorAll('.sentence-matching__card--hint').length, 0);
  await fire(right); state = model.apply(projected, state, actions[1]); teacher.updateState(state);
  assert.equal(student.querySelectorAll('.sentence-matching__card--correct').length, 2);
  assert.equal(teacher.querySelectorAll('.sentence-matching__card--correct').length, 2);
  assert.equal(student.querySelector('.sentence-matching__grid').children[1], right);
  assert.equal(student.querySelector('.sentence-matching__grid').children[0], left);
  student.updateState(state); assert.equal(student.querySelector('.sentence-matching__grid').children[1], right);
  const restored = renderSentenceMatching(source, { presentation: projected, exerciseState: JSON.parse(JSON.stringify(state)) }, createDocument());
  assert.equal(restored.querySelector('.sentence-matching__grid').children[1].dataset.itemId, 'right-0');
  student.updateState({}); student.setInteractive(false);
  const before = actions.length; await fire(left); assert.equal(actions.length, before);
  assert.equal(student.querySelectorAll('.sentence-matching__card--correct').length, 0);
  student.dispose(); teacher.dispose(); restored.dispose();
});

test('wrong feedback survives repeated acknowledgements and clears on a new selection', () => {
  const node = renderSentenceMatching(source, { presentation: projected }, createDocument());
  const wrong = model.apply(projected, {}, action(0, 1));
  node.updateState(wrong); node.updateState(wrong); node.setInteractive(true);
  assert.equal(node.querySelectorAll('.sentence-matching__card--wrong').length, 1);
  assert.equal(node.querySelector('.sentence-matching__status').textContent, 'Try another ending.');
  node.updateState(model.apply(projected, wrong, { type: 'select-word', itemId: 'left-2' }));
  assert.equal(node.querySelectorAll('.sentence-matching__card--wrong').length, 0);
  node.dispose();
});

test('editor cancels, retains failed changes, saves correct pairs and resets trial answers', async () => {
  let reject = true, saved;
  const dirty = [];
  const node = renderSentenceMatching(source, { viewerRole: 'teacher', onDirtyChange: value => dirty.push(value),
    onSave: async changes => { if (reject) throw new Error('offline'); saved = changes; return { ...source, ...changes }; },
  }, createDocument());
  const edit = node.querySelector('.sentence-matching__edit'); await fire(edit);
  const field = node.querySelectorAll('input')[3]; field.value = 'play board games every evening.'; await fire(field, 'input');
  assert.equal(dirty.at(-1), true);
  await fire(edit); assert.equal(node.querySelector('.sentence-matching__editor').hidden, false);
  reject = false; await fire(edit);
  assert.equal(saved.items[0].right, field.value);
  assert.equal(node.querySelector('.sentence-matching__editor').hidden, true);
  assert.equal(dirty.at(-1), false);
  await fire(edit); await fire(node.querySelector('.sentence-matching__cancel'));
  assert.equal(node.querySelector('.sentence-matching__editor').hidden, true); node.dispose();
});

test('class adapter replays queued pairs, carries viewer role and disables disconnected interactions', () => {
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const adapters = window.ClassComponentAdapters, component = { ...source, presentation: projected };
  const session = { role: 'teacher', connected: true, state: {}, send() {} };
  assert.equal(adapters.options(component, session).viewerRole, 'teacher');
  assert.equal(adapters.options(component, { ...session, role: 'student' }).viewerRole, 'student');
  assert.equal(adapters.options(component, { ...session, connected: false }).interactive, false);
  for (const i of [2, 0, 5]) adapters.preview(component, session.state, action(i));
  assert.equal(session.state.exercises[source.id].rightOrder[2], 'right-2');
});

test('FLIP uses current visible geometry, interrupts smoothly and skips acknowledgements, snapshots and reduced motion', () => {
  const calls = [];
  const doc = createDocument();
  const node = renderSentenceMatching(source, { presentation: projected }, doc);
  const grid = node.querySelector('.sentence-matching__grid');
  for (const card of grid.children) {
    card.getBoundingClientRect = () => ({ top: Math.floor(grid.children.indexOf(card) / 2) * 54 + (card.offset || 0), left: 0 });
    card.animate = (frames, options) => {
      const call = { card, frames, options, cancelled: false, cancel() { this.cancelled = true; card.offset = 0; } };
      calls.push(call); return call;
    };
  }
  let state = model.apply(projected, {}, action(2)); node.updateState(state);
  assert.ok(calls.length > 0);
  assert.ok(calls.every(call => call.options.duration === 480 && call.options.easing === 'cubic-bezier(0.2, 0, 0, 1)'));
  const count = calls.length; node.updateState(state); assert.equal(calls.length, count);
  const moving = calls.find(call => call.card.dataset.itemId === 'right-0');
  moving.card.offset = -20;
  state = model.apply(projected, state, action(0)); node.updateState(state);
  assert.ok(calls.slice(0, count).every(call => call.cancelled));
  const replacement = calls.slice(count).find(call => call.card === moving.card);
  assert.equal(replacement.frames[0].transform, 'translate(0px, 196px)');
  const after = calls.length;
  node.updateState({}, { feedback: false }); assert.equal(calls.length, after);
  const previous = globalThis.matchMedia;
  try {
    globalThis.matchMedia = () => ({ matches: true });
    node.updateState(state); assert.equal(calls.length, after);
  } finally { if (previous) globalThis.matchMedia = previous; else delete globalThis.matchMedia; node.dispose(); }
});
