'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { createDocument } = require('./helpers/lesson-dom.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const model = require('../assets/components/exercise-state.js');
const { renderMatchWords } = require('../assets/components/match-words.js');
const { renderDropdownChoice } = require('../assets/components/dropdown-choice.js');
const { renderFillInBlanks } = require('../assets/components/fill-in-blanks.js');
const { renderDescribeAndGuess } = require('../assets/components/describe-and-guess.js');
const content = createSyntheticLesson('Vocabulary').stages.find(stage => stage.id === 'target-vocabulary').content;
const component = type => structuredClone(content.find(item => item.type === type));
const fire = (node, name, event = {}) => { for (const listener of node.listeners[name] || []) listener({ target: node, preventDefault() {}, ...event }); };
const byClass = (node, name) => node.querySelectorAll(`.${name}`);

test('matching shares selection, reacts locally, reports a wrong attempt once and restores successful pairs', t => {
  const doc = createDocument(), source = component('matchWords'), actions = [];
  const layout = model.createLayout(source), presentation = model.presentation(source, layout);
  const node = renderMatchWords(source, { presentation, interactive: true, onAction: action => actions.push(action), showImagePrompts: false }, doc);
  const teacher = renderMatchWords(source, { presentation, interactive: false, onAction: () => assert.fail('observer action'), showImagePrompts: false }, doc);
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', callback => { timers.push(callback); return timers.length; });
  const chip = byClass(node, 'match-words__chip')[0];
  const target = byClass(node, 'match-words__target')[0];
  fire(chip, 'click');
  assert.equal(actions[0].type, 'select-word');
  let state = model.apply(source, {}, actions[0], layout);
  teacher.updateState(state);
  assert.equal(byClass(teacher, 'match-words__chip')[0].getAttribute('aria-pressed'), 'true');
  fire(byClass(teacher, 'match-words__chip')[1], 'click');
  assert.equal(actions.length, 1);
  const wordIndex = layout.wordIds.indexOf(chip.dataset.itemId);
  const correctTarget = byClass(node, 'match-words__target')[wordIndex];
  const wrongTarget = byClass(node, 'match-words__target')[(wordIndex + 1) % source.items.length];
  fire(wrongTarget, 'click');
  assert.equal(actions[1].type, 'match-word');
  assert.equal(chip.hidden, false);
  assert.equal(wrongTarget.classList.contains('match-words__target--wrong'), true);
  state = model.apply(source, state, actions[1], layout);
  node.updateState(state);
  teacher.updateState(state);
  assert.equal(wrongTarget.classList.contains('match-words__target--wrong'), true);
  const timerCount = timers.length;
  teacher.updateState(structuredClone(state));
  assert.equal(timers.length, timerCount, 'other state updates must not replay an old attempt');
  fire(chip, 'click');
  state = model.apply(source, state, actions.at(-1), layout);
  node.updateState(state);
  fire(correctTarget, 'click');
  state = model.apply(source, state, actions.at(-1), layout);
  node.updateState(state);
  teacher.updateState(state);
  assert.equal(chip.hidden, true);
  assert.equal(correctTarget.querySelector('.match-words__drop-label').textContent, chip.textContent);
  assert.equal(byClass(teacher, 'match-words__chip')[0].hidden, true);
  const restored = renderMatchWords(source, { presentation, exerciseState: state, interactive: false }, doc);
  assert.equal(byClass(restored, 'match-words__chip')[0].hidden, true);
  assert.equal(timers.length, timerCount, 'mounting persisted state does not animate old feedback');
  assert.ok(target);
});

test('starting a drag selects the word on the server and disposing removes drag listeners and ghost', () => {
  const doc = createDocument(), source = component('matchWords'), actions = [];
  const node = renderMatchWords(source, { onAction: action => actions.push(action) }, doc);
  const chip = byClass(node, 'match-words__chip')[0];
  doc.elementFromPoint = () => null;
  fire(chip, 'pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
  fire(chip, 'pointermove', { pointerId: 1, clientX: 20, clientY: 0 });
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'select-word');
  assert.equal(actions[0].itemId, chip.dataset.itemId);
  assert.equal(chip.getAttribute('aria-pressed'), 'true');
  assert.equal(doc.body.children.length, 1);
  node.dispose();
  assert.equal(doc.body.children.length, 0);
  assert.equal(doc.listeners.pointerup.length, 0);
  assert.equal(doc.listeners.pointercancel.length, 0);
});

test('teacher dropdown uses live adapter permissions, shares answers and locks on success or disconnect', () => {
  const source = component('dropdownChoice'), doc = createDocument(), actions = [];
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const projected = { ...source, presentation: model.presentation(source) };
  const session = { role: 'teacher', connected: true, state: { exercises: {} }, send: action => actions.push(action) };
  const node = renderDropdownChoice(source, window.ClassComponentAdapters.options(projected, session), doc);
  const select = byClass(node, 'dropdown-choice__select')[0];
  assert.equal(select.disabled, false);
  select.value = source.choices[0].answer;
  fire(select, 'change');
  assert.equal(actions.length, 1);
  session.state.exercises[source.id] = model.apply(source, {}, actions[0]);
  window.ClassComponentAdapters.update(node, projected, session);
  assert.equal(select.value, source.choices[0].answer);
  assert.equal(select.disabled, true);
  session.state.exercises = {};
  session.connected = false;
  window.ClassComponentAdapters.update(node, projected, session);
  assert.equal(select.disabled, true);
  select.value = source.choices[0].answer;
  fire(select, 'change');
  assert.equal(actions.length, 1);
});

test('local dropdown and synchronized dropdown use the same result display and retry/lock behavior', () => {
  const source = component('dropdownChoice'), doc = createDocument();
  const local = renderDropdownChoice(source, {}, doc);
  const live = renderDropdownChoice(source, { presentation: model.presentation(source), onAction() {} }, doc);
  const localSelect = byClass(local, 'dropdown-choice__select')[0], liveSelect = byClass(live, 'dropdown-choice__select')[0];
  for (const value of [source.choices[0].options.find(option => option !== source.choices[0].answer), source.choices[0].answer]) {
    localSelect.value = value;
    fire(localSelect, 'change');
    live.updateState(model.apply(source, {}, { type: 'choose-word', itemId: source.choices[0].id, value }));
    assert.equal(localSelect.dataset.state, liveSelect.dataset.state);
    assert.equal(localSelect.className, liveSelect.className);
    assert.equal(localSelect.disabled, liveSelect.disabled);
  }
});

test('text updates preserve the existing input and do not assign an unchanged value; teacher is read-only', () => {
  const source = component('fillInBlanks'), doc = createDocument(), layout = model.createLayout(source);
  const presentation = model.presentation(source, layout);
  const student = renderFillInBlanks({ id: source.id, type: source.type }, { presentation, viewerRole: 'student', onAction() {} }, doc);
  const teacher = renderFillInBlanks(source, { presentation, interactive: false, viewerRole: 'teacher' }, doc);
  const input = byClass(student, 'fill-in-blanks__input')[0];
  let value = 'unfinished', assignments = 0;
  Object.defineProperty(input, 'value', { get: () => value, set: next => { assignments++; value = next; } });
  const state = model.apply(source, {}, { type: 'type-answer', itemId: source.items[0].id, value });
  student.updateState(state);
  teacher.updateState(state);
  assert.equal(assignments, 0);
  assert.equal(byClass(student, 'fill-in-blanks__input')[0], input);
  assert.equal(byClass(teacher, 'fill-in-blanks__input')[0].readOnly, true);
  assert.equal(byClass(teacher, 'fill-in-blanks__input')[0].value, value);
  assert.equal(byClass(student, 'fill-in-blanks__answer-key').length, 0);
  assert.equal(byClass(teacher, 'fill-in-blanks__answers')[0].children[0].textContent, source.items[0].answer);
  const correct = model.apply(source, state, { type: 'type-answer', itemId: source.items[0].id, value: source.items[0].answer });
  student.updateState(correct);
  assert.equal(byClass(student, 'fill-in-blanks__check')[0].hidden, false);
  student.setInteractive(false);
  assert.equal(input.readOnly, true);
});

test('describe and guess uses explicit shared marks and exposes visibility control only to teacher', () => {
  const source = component('describeAndGuess'), doc = createDocument(), actions = [], visibility = [];
  const teacher = renderDescribeAndGuess(source, { viewerRole: 'teacher', onAction: action => actions.push(action), onStudentVisibilityChange: value => visibility.push(value) }, doc);
  const student = renderDescribeAndGuess(source, { viewerRole: 'student', onAction: action => actions.push(action) }, doc);
  assert.equal(byClass(student, 'describe-and-guess__show').length, 0);
  fire(byClass(teacher, 'describe-and-guess__show')[0], 'click');
  assert.deepEqual(visibility, [true]);
  fire(byClass(student, 'describe-and-guess__word')[0], 'click');
  const state = model.apply(source, {}, actions[0]);
  teacher.updateState(state);
  student.updateState(state);
  assert.equal(byClass(teacher, 'describe-and-guess__word')[0].getAttribute('aria-pressed'), 'true');
  fire(byClass(teacher, 'describe-and-guess__word')[0], 'click');
  assert.equal(actions[1].crossed, false);
  student.setInteractive(false);
  fire(byClass(student, 'describe-and-guess__word')[1], 'click');
  assert.equal(actions.length, 2);
});

test('pending text overlays old acknowledgements without predicting correctness or emitting another action', () => {
  const window = {};
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const source = component('fillInBlanks'), doc = createDocument();
  const presentation = model.presentation(source, model.createLayout(source));
  const data = { type: source.type, id: source.id, presentation };
  const state = { exercises: { [source.id]: { answers: { [source.items[0].id]: { value: 'a', status: 'pending' } } } } };
  const node = renderFillInBlanks(data, { ...window.ClassComponentAdapters.options(data, { role: 'student', connected: true, state, send: () => assert.fail('state update echoed') }), viewerRole: 'student' }, doc);
  window.ClassComponentAdapters.preview(data, state, { type: 'type-answer', componentId: source.id, itemId: source.items[0].id, value: 'abc' });
  window.ClassComponentAdapters.update(node, data, { role: 'student', connected: true, state });
  assert.equal(byClass(node, 'fill-in-blanks__input')[0].value, 'abc');
  assert.equal(byClass(node, 'fill-in-blanks__check')[0].hidden, true);
});

test('a dropped ghost finishes locally and pending matches survive selection acknowledgement', t => {
  const doc = createDocument(), source = component('matchWords'), actions = [], timers = [];
  t.mock.method(globalThis, 'setTimeout', callback => { timers.push(callback); return timers.length; });
  const layout = model.createLayout(source), presentation = model.presentation(source, layout);
  const node = renderMatchWords(source, { presentation, onAction: action => actions.push(action) }, doc);
  const chip = byClass(node, 'match-words__chip')[0];
  const index = layout.wordIds.indexOf(chip.dataset.itemId);
  const target = byClass(node, 'match-words__target')[index];
  doc.elementFromPoint = () => target;
  fire(chip, 'pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
  fire(chip, 'pointermove', { pointerId: 1, clientX: 20, clientY: 0 });
  fire(doc, 'pointerup', { pointerId: 1, clientX: 20, clientY: 0 });
  fire(chip, 'click');
  assert.deepEqual(actions.map(action => action.type), ['select-word', 'match-word']);
  const selected = model.apply(source, {}, actions[0], layout);
  assert.equal(chip.hidden, true);
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const preview = { exercises: { [source.id]: selected } };
  window.ClassComponentAdapters.preview({ ...source, presentation }, preview, actions[1]);
  node.updateState(preview.exercises[source.id], { pending: true });
  assert.equal(doc.body.children.length, 1);
  assert.equal(chip.hidden, true);
  assert.equal(target.classList.contains('match-words__target--matched'), true);
  const matched = model.apply(source, selected, actions[1], layout);
  node.updateState(matched);
  assert.equal(chip.hidden, true);
  assert.equal(target.classList.contains('match-words__target--matched'), true);
  timers.forEach(callback => callback());
  assert.equal(doc.body.children.length, 0);
  fire(byClass(node, 'match-words__chip')[1], 'click');
  const count = actions.length;
  fire(target, 'click');
  assert.equal(actions.length, count, 'a completed picture cannot accept another word');
});

test('snapshot feedback is not replayed and a disconnected pending drop releases its ghost', t => {
  const doc = createDocument(), source = component('matchWords'), timers = [];
  t.mock.method(globalThis, 'setTimeout', callback => { timers.push(callback); return timers.length; });
  const layout = model.createLayout(source), presentation = model.presentation(source, layout);
  const node = renderMatchWords(source, { presentation, onAction() {} }, doc);
  const wrong = model.apply(source, {}, { type: 'match-word', itemId: layout.wordIds[0], targetId: layout.pictureIds[1] }, layout);
  node.updateState(wrong, { feedback: false });
  assert.equal(timers.length, 0);
  const chip = byClass(node, 'match-words__chip')[0];
  const target = byClass(node, 'match-words__target')[0];
  doc.elementFromPoint = () => target;
  fire(chip, 'pointerdown', { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 0, clientY: 0 });
  fire(chip, 'pointermove', { pointerId: 1, clientX: 20, clientY: 0 });
  fire(doc, 'pointerup', { pointerId: 1, clientX: 20, clientY: 0 });
  node.updateState(wrong, { pending: false });
  node.setInteractive(false);
  timers.forEach(callback => callback());
  assert.equal(doc.body.children.length, 0);
  assert.equal(chip.hidden, false);
});

 test('queued matches retain local results through old acknowledgements and roll back to confirmed state', t => {
  const doc = createDocument(), source = component('matchWords');
  const layout = model.createLayout(source), presentation = model.presentation(source, layout);
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  let confirmed = {}, pending = [];
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', callback => { timers.push(callback); return timers.length; });
  function paint() {
    const state = { exercises: { [source.id]: structuredClone(confirmed) } };
    for (const action of pending) window.ClassComponentAdapters.preview({ ...source, presentation }, state, action);
    node.updateState(state.exercises[source.id]);
  }
  const node = renderMatchWords(source, { presentation, onAction(action) { pending.push(action); paint(); } }, doc);
  const chips = byClass(node, 'match-words__chip'), targets = byClass(node, 'match-words__target');
  for (const chip of chips.slice(0, 2)) {
    fire(chip, 'click');
    fire(targets[layout.wordIds.indexOf(chip.dataset.itemId)], 'click');
    assert.equal(chip.hidden, true);
  }
  assert.equal(pending.length, 4);
  const count = timers.length;
  while (pending.length) {
    confirmed = model.apply(source, confirmed, pending.shift(), layout);
    paint();
    assert.ok(chips.slice(0, 2).every(chip => chip.hidden));
  }
  assert.equal(timers.length, count, 'acknowledgements never replay feedback');
  fire(chips[2], 'click');
  fire(targets[layout.wordIds.indexOf(chips[2].dataset.itemId)], 'click');
  assert.equal(chips[2].hidden, true);
  pending = [];
  paint();
  assert.equal(chips[2].hidden, false);
  assert.ok(chips.slice(0, 2).every(chip => chip.hidden));
 });
