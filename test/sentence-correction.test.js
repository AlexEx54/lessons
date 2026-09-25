'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/lesson-dom.js');
const { normalizeSentenceCorrection, createSentenceCorrectionAnswerKey, renderSentenceCorrection } = require('../assets/components/sentence-correction.js');
const { normalizeMarkdownCard } = require('../assets/components/markdown-card.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const model = require('../assets/components/exercise-state.js');
const { applyComponentAction, studentComponent, clearComponentState } = require('../lib/class-component-handlers.js');
const source = { type: 'sentenceCorrection', id: 'corrections', title: 'Correct the mistakes.',
  instruction: 'Rewrite each sentence correctly.', items: [
    { id: 'robot', text: "Robot Boy hasn't got gloves?", answers: ["Robot Boy hasn't got gloves.", "Hasn't Robot Boy got gloves?"] },
    { id: 'bat', text: 'Bat Boy have got a cape.', answers: ['Bat Boy has got a cape.'] },
  ] };
const fire = async (node, event) => { for (const fn of node.listeners[event] || []) await fn({ preventDefault() {} }); };

test('sentence correction validates schema and generates the teacher key from all alternatives', () => {
  const normalized = normalizeSentenceCorrection(source);
  const key = createSentenceCorrectionAnswerKey(normalized);
  normalizeMarkdownCard(key);
  assert.equal(key.title, 'Answer key');
  assert.equal(key.studentVisibility, 'teacherOnly');
  assert.equal(studentComponent(key, {}), null);
  assert.match(key.sections[0].text, /Robot Boy hasn't got gloves\. \/ Hasn't Robot Boy got gloves\?/);
  for (const patch of [
    { items: [] }, { id: undefined }, { accentColor: 'red' }, { extra: true },
    { items: [{ ...source.items[0], id: undefined }] },
    { items: [{ ...source.items[0], answers: [] }] },
    { items: [{ ...source.items[0], answers: ['Same.', ' same '] }] },
    { items: [source.items[0], source.items[0]] },
    { items: [{ ...source.items[0], text: '<b>Unsafe</b>' }] },
    { items: [{ ...source.items[0], answers: ['x'.repeat(1001)] }] },
  ]) assert.throws(() => normalizeSentenceCorrection({ ...source, ...patch }));
  normalizeMarkdownCard(createSentenceCorrectionAnswerKey({ ...source, items: source.items.slice(0, 1) }));
});

test('matching permits alternative forms, apostrophes, spaces and optional full stop, but keeps question marks significant', () => {
  for (const value of ["Robot Boy hasn't got gloves", '  ROBOT   BOY HASN’T GOT GLOVES. ', "Hasn't Robot Boy got gloves?"]) {
    assert.equal(model.correctionAnswersMatch(value, source.items[0].answers), true, value);
  }
  for (const value of ['', '   ', '.', "Robot Boy hasn't got gloves?", "Hasn't Robot Boy got gloves", "Robot Boy hasn't got gloves.."]) {
    assert.equal(model.correctionAnswersMatch(value, source.items[0].answers), false, value);
  }
  const action = { type: 'type-answer', componentId: source.id, itemId: 'robot', value: source.items[0].answers[1] };
  const state = {};
  applyComponentAction({ component: source, state, role: 'student', action });
  assert.equal(state.exercises.corrections.answers.robot.status, 'correct');
  assert.deepEqual(state.exercises.corrections, model.apply(source, {}, action));
  assert.equal(model.apply(source, state.exercises.corrections, { ...action, value: 'changed' }).answers.robot.status, 'pending');
  assert.throws(() => applyComponentAction({ component: source, state, role: 'teacher', action }), { statusCode: 403 });
  for (const patch of [{ type: 'bad' }, { itemId: 'missing' }, { value: 42 }, { value: 'x'.repeat(1001) }]) {
    assert.throws(() => model.apply(source, {}, { ...action, ...patch }), { statusCode: 400 });
  }
  clearComponentState({ component: source, state });
  assert.equal(state.exercises.corrections, undefined);
});

test('live input checks before dispatch, preserves nodes and caret, restores snapshots and blocks observers', async () => {
  const doc = createDocument(), actions = [];
  const projected = studentComponent(source, {});
  const node = renderSentenceCorrection(projected, { presentation: projected.presentation, onAction(action) {
    assert.equal(node.querySelector('.sentence-correction__check').hidden, false);
    actions.push(action);
  } }, doc);
  const input = node.querySelector('.sentence-correction__input');
  assert.equal(input.getAttribute('aria-label').includes(source.items[0].answers[1]), false);
  assert.equal(input.dataset.answer, undefined);
  input.value = source.items[0].answers[1]; await fire(input, 'input');
  assert.equal(actions.length, 1);
  const state = model.apply(source, {}, actions[0]);
  let assignments = 0, value = input.value;
  Object.defineProperty(input, 'value', { get: () => value, set: next => { assignments++; value = next; } });
  node.updateState(state);
  assert.equal(assignments, 0);
  assert.equal(node.querySelector('.sentence-correction__input'), input);
  node.setInteractive(false);
  assert.equal(input.readOnly, true);
  input.value = 'blocked'; await fire(input, 'input');
  assert.equal(input.value, source.items[0].answers[1]);
  assert.equal(actions.length, 1);
  node.updateState({});
  assert.equal(input.value, '');
  assert.equal(node.querySelector('.sentence-correction__check').hidden, true);
  const restored = renderSentenceCorrection(source, { exerciseState: state, interactive: false }, doc);
  assert.equal(restored.querySelector('.sentence-correction__input').value, source.items[0].answers[1]);
});

test('editor supports cancel, validation, save failure and answer changes', async () => {
  const errors = [], changes = [], dirty = [];
  let reject = true;
  const node = renderSentenceCorrection(source, { onError: error => errors.push(error),
    onDirtyChange: value => dirty.push(value), onSave: async payload => {
      if (reject) throw new Error('Offline');
      changes.push(payload); return { ...source, ...payload };
    } }, createDocument());
  const edit = node.querySelector('.sentence-correction__edit');
  await fire(edit, 'click');
  let inputs = node.querySelector('.sentence-correction__editor').querySelectorAll('input');
  inputs[0].value = 'Changed'; await fire(inputs[0], 'input');
  assert.equal(dirty.at(-1), true);
  await fire(node.querySelector('.sentence-correction__cancel'), 'click');
  assert.equal(node.querySelector('.sentence-correction__title').textContent, source.title);
  assert.equal(dirty.at(-1), false);
  await fire(edit, 'click');
  const answers = node.querySelector('textarea');
  answers.value = ''; await fire(answers, 'input'); await fire(edit, 'click');
  assert.equal(errors.length, 1); assert.equal(changes.length, 0);
  answers.value = 'Robot Boy has no gloves.\nRobot Boy does not have gloves.';
  await fire(answers, 'input'); await fire(edit, 'click');
  assert.equal(errors.at(-1), 'Offline');
  assert.equal(answers.disabled, false);
  assert.equal(node.querySelector('.sentence-correction__editor').hidden, false);
  reject = false; await fire(edit, 'click');
  assert.deepEqual(changes[0].items[0].answers, ['Robot Boy has no gloves.', 'Robot Boy does not have gloves.']);
  assert.equal(node.querySelector('.sentence-correction__editor').hidden, true);
  const input = node.querySelector('.sentence-correction__input');
  input.value = 'Robot Boy has no gloves'; await fire(input, 'input');
  assert.equal(node.querySelector('.sentence-correction__check').hidden, false);
});

test('queued typing is replayed after acknowledgements and teacher adapter stays read-only', () => {
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync('assets/class-component-adapters.js', 'utf8'), { window });
  const component = studentComponent(source, {}), adapters = window.ClassComponentAdapters;
  const action = value => ({ type: 'type-answer', componentId: source.id, itemId: 'robot', value });
  const pending = [action('Robot'), action(source.items[0].answers[0]), action('changed')];
  let confirmed = {};
  while (pending.length) {
    const state = { exercises: { corrections: confirmed } };
    pending.forEach(item => adapters.preview(component, state, item));
    assert.equal(state.exercises.corrections.answers.robot.value, 'changed');
    assert.equal(state.exercises.corrections.answers.robot.status, 'pending');
    confirmed = model.apply(source, confirmed, pending.shift());
  }
  const session = { role: 'teacher', connected: true, state: { exercises: { corrections: confirmed } }, send() {}, pendingActions: [] };
  const node = renderSentenceCorrection(component, adapters.options(component, session), createDocument());
  assert.equal(node.querySelector('input').readOnly, true);
  adapters.update(node, component, session);
  assert.equal(node.querySelector('input').readOnly, true);
  assert.equal(adapters.options(component, { ...session, role: 'student' }).interactive, true);
  assert.equal(adapters.options(component, { ...session, role: 'student', connected: false }).interactive, false);
});

test('template two adds eight corrections after Task 2 without changing template one', () => {
  const lesson = createSyntheticLesson('Grammar', { template: 'template-2' });
  const content = lesson.stages.find(stage => stage.id === 'grammar-focus').content;
  const task = content[5];
  assert.equal(task.type, 'sentenceCorrection');
  assert.equal(task.items.length, 8);
  assert.deepEqual(content[6], createSentenceCorrectionAnswerKey(task));
  const node = renderSentenceCorrection(task, {}, createDocument());
  const lists = node.querySelectorAll('ol');
  assert.deepEqual(lists.map(list => list.children.length), [4, 4]);
  assert.deepEqual(lists.map(list => list.start), [1, 5]);
  assert.equal(createSyntheticLesson('Grammar').stages.find(stage => stage.id === 'grammar-focus').content[5].type, 'miniSituation');
});
