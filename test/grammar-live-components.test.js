'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/lesson-dom.js');
const { renderDragWordsInText } = require('../assets/components/drag-words-in-text.js');
const { renderDropdownChoice } = require('../assets/components/dropdown-choice.js');
const model = require('../assets/components/exercise-state.js');
const { applyComponentAction } = require('../lib/class-component-handlers.js');
const source = { type: 'dragWordsInText', id: 'rule', title: 'Rule', instruction: 'Complete.',
  words: ['past', 'verb', 'future'], text: 'Use a [[verb]] in the [[past]].' };
const fire = (node, name, event = {}) => {
  for (const listener of node.listeners[name] || []) listener({ preventDefault() {}, ...event });
};
const nodes = (node, name) => node.querySelectorAll('.drag-words-in-text__' + name);

test('grammar uses identical local/server rules and rejects unavailable words, gaps and teacher actions', () => {
  const action = { type: 'place-word', itemId: 'gap-1', value: 'verb', attemptId: 'one' };
  const state = {};
  applyComponentAction({ component: source, state, role: 'student', action });
  assert.deepEqual(state.exercises.rule, model.apply(model.presentation(source), {}, action));
  assert.throws(() => model.apply(source, state.exercises.rule, action));
  assert.throws(() => model.apply(source, state.exercises.rule, { ...action, itemId: 'gap-2' }));
  assert.throws(() => model.apply(source, {}, { ...action, itemId: 'gap-9' }));
  assert.throws(() => model.apply(source, {}, { ...action, value: 'invented' }));
  assert.throws(() => applyComponentAction({ component: source, state, role: 'teacher', action }), { statusCode: 403 });
});

test('grammar responds before sending, preserves DOM, suppresses replay, restores and rolls back', t => {
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', callback => { timers.push(callback); return timers.length; });
  const doc = createDocument(), actions = [];
  let node;
  node = renderDragWordsInText(source, { onAction(action) {
    actions.push(action);
    if (action.type === 'place-word' && action.value === 'verb') {
      assert.equal(nodes(node, 'gap')[0].textContent, 'verb');
    }
  } }, doc);
  const [past, verb, future] = nodes(node, 'chip');
  const [first, second] = nodes(node, 'gap');
  assert.equal(first.dataset.answer, undefined);
  fire(future, 'keydown', { key: 'Enter' });
  fire(first, 'click');
  assert.equal(first.classList.contains('drag-words-in-text__gap--wrong'), true);
  const wrong = model.apply(source, {}, actions.at(-1));
  const timerCount = timers.length;
  node.updateState(wrong);
  assert.equal(timers.length, timerCount);
  fire(verb, 'keydown', { key: 'Enter' });
  fire(first, 'click');
  assert.equal(verb.hidden, true);
  assert.equal(nodes(node, 'gap')[0], first);
  assert.equal(nodes(node, 'chip')[0], past);
  const right = model.apply(source, wrong, actions.at(-1));
  const teacher = renderDragWordsInText(source, { exerciseState: right, interactive: false,
    onAction: () => assert.fail('observer emitted an action') }, doc);
  assert.equal(nodes(teacher, 'gap')[0].textContent, 'verb');
  fire(nodes(teacher, 'chip')[0], 'keydown', { key: 'Enter' });
  fire(nodes(teacher, 'gap')[1], 'click');
  const before = actions.length;
  node.updateState({});
  assert.equal(verb.hidden, false);
  assert.equal(first.textContent, '');
  assert.equal(actions.length, before);
  node.setInteractive(false);
  fire(past, 'keydown', { key: 'Enter' });
  fire(second, 'click');
  assert.equal(actions.length, before);
  const count = timers.length;
  renderDragWordsInText(source, { exerciseState: wrong }, doc);
  assert.equal(timers.length, count);
  node.dispose();
});

test('queued grammar actions survive earlier acknowledgements with shared prediction', () => {
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync('assets/class-component-adapters.js', 'utf8'), { window });
  const data = { ...source, presentation: model.presentation(source) };
  let confirmed = {}, pending = [
    { type: 'select-word', componentId: source.id, itemId: 'verb' },
    { type: 'place-word', componentId: source.id, itemId: 'gap-1', value: 'verb', attemptId: 'first' },
    { type: 'select-word', componentId: source.id, itemId: 'past' },
    { type: 'place-word', componentId: source.id, itemId: 'gap-2', value: 'past', attemptId: 'second' },
  ];
  while (pending.length) {
    const state = { exercises: { rule: confirmed } };
    for (const action of pending) window.ClassComponentAdapters.preview(data, state, action);
    assert.deepEqual(state.exercises.rule.placed, { 'gap-1': 'verb', 'gap-2': 'past' });
    confirmed = model.apply(source, confirmed, pending.shift());
  }
});

test('dropdown checks immediately before network callback and can roll back', () => {
  const source = { type: 'dropdownChoice', id: 'choice', title: 'Choose', instruction: 'Choose.',
    text: '[[one]]', choices: [{ id: 'one', options: ['a', 'b'], answer: 'b' }] };
  let status;
  const node = renderDropdownChoice(source, { presentation: model.presentation(source),
    onAction() { status = node.querySelector('select').dataset.state; } }, createDocument());
  const select = node.querySelector('select');
  select.value = 'a'; fire(select, 'change');
  assert.equal(status, 'wrong');
  select.value = 'b'; fire(select, 'change');
  assert.equal(status, 'correct');
  assert.equal(select.disabled, true);
  node.updateState({});
  assert.equal(select.value, '');
  assert.equal(select.disabled, false);
});

test('pointer drop keeps its chip during selection acknowledgement and cleans up on disconnect', () => {
  const doc = createDocument(), actions = [];
  const node = renderDragWordsInText(source, { onAction: action => actions.push(action) }, doc);
  const chip = nodes(node, 'chip')[1], gap = nodes(node, 'gap')[0];
  doc.elementFromPoint = () => gap;
  fire(chip, 'pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  node.updateState(model.apply(source, {}, actions[0]));
  assert.equal(nodes(node, 'chip')[1], chip);
  fire(chip, 'pointermove', { pointerId: 1, clientX: 20, clientY: 20 });
  assert.equal(doc.body.children.length, 1);
  fire(chip, 'pointerup', { pointerId: 1, clientX: 20, clientY: 20 });
  assert.equal(gap.textContent, 'verb');
  assert.equal(doc.body.children.length, 0);
  const past = nodes(node, 'chip')[0];
  fire(past, 'pointerdown', { pointerId: 2, clientX: 0, clientY: 0 });
  fire(past, 'pointermove', { pointerId: 2, clientX: 20, clientY: 20 });
  assert.equal(doc.body.children.length, 1);
  node.setInteractive(false);
  assert.equal(doc.body.children.length, 0);
  const count = actions.length;
  fire(past, 'pointerup', { pointerId: 2, clientX: 20, clientY: 20 });
  assert.equal(actions.length, count);
});

test('drop outside the chip still finishes when pointer capture is unavailable', () => {
  const doc = createDocument(), actions = [];
  const node = renderDragWordsInText(source, { onAction: action => actions.push(action) }, doc);
  const chip = nodes(node, 'chip')[1], gap = nodes(node, 'gap')[0];
  chip.setPointerCapture = () => { throw new Error('capture unavailable'); };
  doc.elementFromPoint = () => gap;
  fire(chip, 'pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  fire(chip, 'pointermove', { pointerId: 1, clientX: 20, clientY: 20 });
  assert.equal(doc.body.children.length, 1);
  fire(doc, 'pointerup', { pointerId: 1, clientX: 20, clientY: 20 });
  assert.equal(doc.body.children.length, 0);
  assert.equal(gap.textContent, 'verb');
  assert.equal(actions.filter(action => action.type === 'place-word').length, 1);
});

test('losing pointer capture cancels the ghost and permits a new drag', () => {
  const doc = createDocument(), actions = [];
  const node = renderDragWordsInText(source, { onAction: action => actions.push(action) }, doc);
  const chip = nodes(node, 'chip')[1];
  doc.elementFromPoint = () => null;
  fire(chip, 'pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
  fire(chip, 'pointermove', { pointerId: 1, clientX: 20, clientY: 20 });
  fire(chip, 'lostpointercapture', { pointerId: 1 });
  assert.equal(doc.body.children.length, 0);
  assert.equal(chip.classList.contains('drag-words-in-text__chip--dragging'), false);
  assert.equal(actions.at(-1).itemId, null);
  assert.equal(actions.some(action => action.type === 'place-word'), false);
  fire(chip, 'pointerdown', { pointerId: 2, clientX: 0, clientY: 0 });
  fire(chip, 'pointermove', { pointerId: 2, clientX: 20, clientY: 20 });
  assert.equal(doc.body.children.length, 1);
  node.dispose();
  assert.equal(doc.body.children.length, 0);
});

test('interrupted drag cleans listeners on blur, missed release and disposal; other pointers cannot finish it', () => {
  for (const interruption of ['blur', 'missed-release', 'dispose', 'cancel', 'replacement']) {
    const doc = createDocument(), view = createDocument(), actions = [];
    doc.defaultView = view;
    const node = renderDragWordsInText(source, { onAction: action => actions.push(action) }, doc);
    const chip = nodes(node, 'chip')[1];
    doc.elementFromPoint = () => null;
    chip.hasPointerCapture = () => true;
    chip.releasePointerCapture = pointerId => fire(chip, 'lostpointercapture', { pointerId });
    fire(chip, 'pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
    fire(doc, 'pointermove', { pointerId: 1, buttons: 1, clientX: 20, clientY: 20 });
    assert.equal(doc.body.children.length, 1);
    fire(doc, 'pointerup', { pointerId: 2 });
    fire(doc, 'pointercancel', { pointerId: 2 });
    assert.equal(doc.body.children.length, 1);
    if (interruption === 'blur') fire(view, 'blur');
    if (interruption === 'missed-release') fire(doc, 'pointermove', { pointerId: 1, buttons: 0 });
    if (interruption === 'cancel') fire(doc, 'pointercancel', { pointerId: 1 });
    if (interruption === 'dispose') node.dispose();
    if (interruption === 'replacement') {
      fire(chip, 'pointerdown', { pointerId: 3, clientX: 0, clientY: 0 });
      assert.equal(doc.body.children.length, 0);
      fire(doc, 'pointermove', { pointerId: 3, buttons: 1, clientX: 20, clientY: 20 });
      assert.equal(doc.body.children.length, 1);
      node.dispose();
    }
    assert.equal(doc.body.children.length, 0, interruption);
    assert.equal(chip.classList.contains('drag-words-in-text__chip--dragging'), false);
    for (const event of ['pointerup', 'pointercancel', 'pointermove']) {
      assert.equal(doc.listeners[event].length, 0);
    }
    assert.equal(view.listeners.blur.length, 0);
    assert.equal(actions.some(action => action.type === 'place-word'), false);
  }
});
