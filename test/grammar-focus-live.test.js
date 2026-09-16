'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const { createDocument } = require('./helpers/lesson-dom.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const model = require('../assets/components/exercise-state.js');
const tree = require('../assets/components/component-tree.js');
const { renderGapFill } = require('../assets/components/gap-fill.js');
const { renderMiniSituation } = require('../assets/components/mini-situation.js');
const { renderCardRow, normalizeCardRow } = require('../assets/components/card-row.js');
const { studentComponent, applyComponentAction } = require('../lib/class-component-handlers.js');
const content = createSyntheticLesson('Grammar').stages.find(stage => stage.id === 'grammar-focus').content;
const fire = (node, name) => (node.listeners[name] || []).forEach(listener => listener({ preventDefault() {} }));

for (const [type, render, selector] of [
  ['gapFill', renderGapFill, '.gap-fill__input'],
  ['miniSituation', renderMiniSituation, '.mini-situation__input'],
]) test(`${type}: local feedback precedes event; shared server rules, DOM identity and observer mode`, () => {
  const component = content.find(item => item.type === type);
  const itemId = component.gaps?.[0].id || 'sentence-1';
  const value = component.gaps?.[0].answer || 'My sentence.';
  const projected = studentComponent(component, {});
  let node, calls = 0;
  node = render(projected, { presentation: projected.presentation, onAction(action) {
    calls++;
    assert.equal(node.querySelector(selector).value, value);
    if (type === 'gapFill') assert.equal(node.querySelector('.gap-fill__check').hidden, false);
    const state = {};
    applyComponentAction({ component, state, role: 'student', action });
    assert.deepEqual(state.exercises[component.id], model.apply(projected.presentation, {}, action));
  } }, createDocument());
  const input = node.querySelector(selector);
  input.value = value;
  fire(input, 'input');
  assert.equal(calls, 1);
  const state = model.apply(component, {}, { type: 'type-answer', itemId, value });
  let assignments = 0, stored = input.value;
  Object.defineProperty(input, 'value', { get: () => stored, set: next => { assignments++; stored = next; } });
  node.updateState(state);
  assert.equal(assignments, 0, 'acknowledgement must not disturb the caret');
  assert.equal(node.querySelector(selector), input);
  assert.equal(calls, 1);
  node.setInteractive(false);
  input.value = 'unauthorized'; fire(input, 'input');
  assert.equal(input.value, value);
  assert.equal(input.readOnly, true);
  assert.equal(calls, 1);
  node.updateState({});
  assert.equal(input.value, '');
  if (type === 'gapFill') {
    assert.equal(node.querySelector('.gap-fill__check').hidden, true);
    assert.equal(input.dataset.answer, undefined);
    assert.equal(node.textContent.includes(value), false);
  }
  const observer = render(projected, { presentation: projected.presentation, exerciseState: state, interactive: false }, createDocument());
  assert.equal(observer.querySelector(selector).value, value);
  for (const action of [
    { type: 'unknown', itemId, value }, { type: 'type-answer', itemId: 'missing', value },
    { type: 'type-answer', itemId, value: 'a'.repeat(1001) }, { type: 'type-answer', itemId, value: 42 },
  ]) assert.throws(() => model.apply(component, {}, action), { statusCode: 400 });
  const teacherState = {};
  applyComponentAction({ component, state: teacherState, role: 'teacher', action: { type: 'type-answer', itemId, value } });
  assert.equal(teacherState.exercises[component.id].answers[itemId].value, value);
});

test('gap matching preserves apostrophe rules and correct answers remain editable', () => {
  const component = { type: 'gapFill', gaps: [{ id: 'one', answer: "don't go" }] };
  const correct = model.apply(component, {}, { type: 'type-answer', itemId: 'one', value: '  DON’T   GO ' });
  assert.equal(correct.answers.one.status, 'correct');
  assert.equal(model.apply(component, correct, { type: 'type-answer', itemId: 'one', value: '' }).answers.one.status, 'pending');
});

test('nested cards filter private content, support one visible child and receive individual session options', () => {
  const row = structuredClone(content.find(item => item.type === 'cardRow'));
  row.items[0].studentVisibility = 'always';
  row.items[1].studentVisibility = 'controlled';
  row.items[2].studentVisibility = 'teacherOnly';
  const projected = studentComponent(row, {});
  assert.equal(projected.presentation.items.length, 1);
  assert.equal(JSON.stringify(projected).includes(row.items[2].text), false);
  assert.throws(() => normalizeCardRow(projected.presentation));
  const window = { ExerciseState: model, ComponentTree: tree };
  vm.runInNewContext(fs.readFileSync('assets/class-component-adapters.js', 'utf8'), { window });
  const adapters = window.ClassComponentAdapters;
  const session = { role: 'student', connected: true, state: {}, send: () => assert.fail('student action') };
  const student = renderCardRow(projected, adapters.options(projected, session), createDocument());
  assert.equal(student.componentNodes.size, 1);
  const actions = [];
  const teacherSession = { role: 'teacher', connected: true, state: {}, send: action => actions.push(action) };
  const teacher = renderCardRow(row, adapters.options(row, teacherSession), createDocument());
  adapters.update(teacher, row, teacherSession);
  const card = teacher.componentNodes.get(row.items[1].id);
  const toggle = card.querySelector('button');
  assert.ok(toggle);
  fire(toggle, 'click');
  assert.equal(actions[0].componentId, row.items[1].id);
  assert.equal(actions[0].visible, true);
  const child = tree.collectComponents([{ content: [row] }]).find(item => item.id === actions[0].componentId);
  const state = {};
  applyComponentAction({ component: child, state, role: 'teacher', action: actions[0] });
  const revealed = studentComponent(row, state);
  assert.equal(revealed.presentation.items.length, 2);
  const shown = renderCardRow(revealed, adapters.options(revealed, { ...session, state }), createDocument());
  assert.equal(shown.componentNodes.size, 2);
  adapters.update(teacher, row, { ...teacherSession, state, connected: false });
  assert.equal(toggle.disabled, true);
  row.items[0].studentVisibility = 'teacherOnly';
  assert.equal(studentComponent(row, {}), null);
});
