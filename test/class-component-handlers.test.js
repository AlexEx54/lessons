'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { studentComponent, applyComponentAction } = require('../lib/class-component-handlers.js');

test('component policies exclude unknown and private content regardless of visibility state', () => {
  const state = { visibleCards: { secret: true } };
  for (const component of [
    { id: 'secret', type: 'teacherNote' },
    { id: 'secret', type: 'unknown' },
    { id: 'secret', type: 'markdownCard', studentVisibility: 'teacherOnly' },
  ]) assert.equal(studentComponent(component, state), null);
  const card = { id: 'secret', type: 'markdownCard', studentVisibility: 'controlled' };
  assert.equal(studentComponent(card, {}), null);
  assert.equal(studentComponent(card, state), card);
});

test('visibility actions cannot reveal teacher-only cards or change static components', () => {
  const state = { selections: {} };
  const context = { role: 'teacher', state, action: { type: 'set-visibility', visible: true } };
  for (const studentVisibility of ['always', 'teacherOnly']) {
    assert.throws(() => applyComponentAction({ ...context, component: { id: 'secret', type: 'markdownCard', studentVisibility } }));
  }
  assert.throws(() => applyComponentAction({ ...context, component: { id: 'text', type: 'textPanel' } }));
  assert.throws(() => applyComponentAction({ ...context, action: { type: 'set-visibility', visible: 'true' }, component: { id: 'card', type: 'markdownCard', studentVisibility: 'controlled' } }));
  assert.deepEqual(state, { selections: {} });
});

test('wrap-up content is shared safely and only the student can change self-assessment', () => {
  const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
  const content = createSyntheticLesson('Wrap-up').stages.find(stage => stage.id === 'wrap-up').content;
  const note = content.find(component => component.type === 'teacherNote');
  const reflection = content.find(component => component.type === 'threeTwoOne');
  const assessment = content.find(component => component.type === 'selfAssessment');
  assert.equal(studentComponent(note, {}), null);
  assert.equal(studentComponent(reflection, {}), reflection);
  assert.equal(studentComponent(assessment, {}), assessment);

  const state = {};
  const action = { type: 'select-assessment', componentId: assessment.id, selectedId: 'withHelp' };
  const fs = require('node:fs');
  const vm = require('node:vm');
  const window = { ExerciseState: require('../assets/components/exercise-state.js') };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const preview = {};
  window.ClassComponentAdapters.preview(assessment, preview, action);
  applyComponentAction({ role: 'student', component: assessment, state, action });
  assert.equal(JSON.stringify(preview), JSON.stringify(state));
  assert.equal(state.selfAssessments[assessment.id], 'withHelp');
  assert.throws(() => applyComponentAction({ role: 'teacher', component: assessment, state, action }), { statusCode: 403 });
  assert.throws(() => applyComponentAction({ role: 'student', component: assessment, state,
    action: { ...action, selectedId: 'invented' } }), { statusCode: 400 });
  assert.equal(state.selfAssessments[assessment.id], 'withHelp');
  applyComponentAction({ role: 'student', component: assessment, state,
    action: { ...action, selectedId: null } });
  assert.equal(state.selfAssessments[assessment.id], undefined);
});

test('vocabulary handlers reject observer edits, invalid targets, oversized input and hidden game actions', () => {
  const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
  const model = require('../assets/components/exercise-state.js');
  const content = createSyntheticLesson('Vocabulary').stages.find(stage => stage.id === 'target-vocabulary').content;
  const match = content.find(c => c.type === 'matchWords');
  const dropdown = content.find(c => c.type === 'dropdownChoice');
  const fill = content.find(c => c.type === 'fillInBlanks');
  const game = content.find(c => c.type === 'describeAndGuess');
  const state = { _layouts: { [match.id]: model.createLayout(match) } };
  const act = (component, action, role = 'student') => applyComponentAction({ component, action, role, state });
  for (const exercise of [match, dropdown, fill]) assert.throws(() => act(exercise, {}, 'teacher'), { statusCode: 403 });
  assert.throws(() => act(match, { type: 'match-word', itemId: match.items[0].id, targetId: match.items[0].id }), { statusCode: 400 });
  assert.throws(() => act(match, { type: 'select-word', itemId: 'missing' }), { statusCode: 400 });
  assert.throws(() => act(dropdown, { type: 'choose-word', itemId: dropdown.choices[0].id, value: 'missing' }), { statusCode: 400 });
  assert.throws(() => act(fill, { type: 'type-answer', itemId: fill.items[0].id, value: 'a'.repeat(1001) }), { statusCode: 400 });
  assert.throws(() => act(game, { type: 'set-crossed', itemId: game.items[0].id, crossed: true }), { statusCode: 403 });
  assert.throws(() => act(game, { type: 'set-visibility', visible: true }), { statusCode: 403 });
  assert.equal(state.exercises, undefined, 'rejected actions must not create progress');
  const correct = { type: 'choose-word', itemId: dropdown.choices[0].id, value: dropdown.choices[0].answer };
  act(dropdown, correct);
  assert.throws(() => act(dropdown, { ...correct, value: '' }), { statusCode: 400 });
  const typed = { type: 'type-answer', itemId: fill.items[0].id, value: fill.items[0].answer };
  act(fill, typed);
  act(fill, { ...typed, value: '' });
  assert.equal(state.exercises[fill.id].answers[typed.itemId].status, 'pending', 'typed answers remain editable after success');
});

test('reading validates choices on server and local preview uses the same rules', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const model = require('../assets/components/exercise-state.js');
  const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
  const component = createSyntheticLesson('Reading').stages.find(s => s.id === 'reading').content.find(c => c.type === 'multipleChoice');
  const item = component.items[0];
  const state = {};
  const action = { type: 'choose-option', componentId: component.id, itemId: item.id, value: item.answer };
  for (const invalid of [{ ...action, itemId: 'missing' }, { ...action, value: 'missing' }, { ...action, type: 'unknown' }]) {
    assert.throws(() => applyComponentAction({ role: 'student', component, state, action: invalid }), { statusCode: 400 });
  }
  assert.deepEqual(state, {});
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const projected = studentComponent(component, state);
  const preview = {};
  window.ClassComponentAdapters.preview(projected, preview, action);
  applyComponentAction({ role: 'student', component, state, action });
  assert.equal(JSON.stringify(preview), JSON.stringify(state));
  assert.throws(() => applyComponentAction({ role: 'student', component, state, action }), { statusCode: 400 });
});

test('listening projects hidden transcripts and validates checkbox choices with the shared reducer', () => {
  const fs = require('node:fs');
  const vm = require('node:vm');
  const model = require('../assets/components/exercise-state.js');
  const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
  const content = createSyntheticLesson('Listening').stages.find(stage => stage.id === 'listening').content;
  const audio = content.find(component => component.type === 'audioPlayer');
  const checkbox = content.find(component => component.type === 'checkboxChoice');
  const hidden = studentComponent(audio, {});
  assert.equal(hidden.presentation.script, undefined);
  assert.equal(JSON.stringify(hidden).includes(audio.script), false);
  const revealed = studentComponent(audio, { visibleCards: { [audio.id]: true } });
  assert.equal(revealed.presentation.script, audio.script);

  const item = checkbox.items[0];
  const wrong = item.options.find(value => !item.answers.includes(value));
  const state = {};
  const action = { type: 'choose-option', componentId: checkbox.id, itemId: item.id, value: wrong };
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const projected = studentComponent(checkbox, state);
  const preview = {};
  window.ClassComponentAdapters.preview(projected, preview, action);
  applyComponentAction({ role: 'student', component: checkbox, state, action });
  assert.equal(JSON.stringify(preview), JSON.stringify(state));
  assert.equal(state.exercises[checkbox.id].answers[item.id].status, 'wrong');

  const correct = { ...action, value: item.answers[0] };
  window.ClassComponentAdapters.preview(projected, preview, correct);
  applyComponentAction({ role: 'student', component: checkbox, state, action: correct });
  assert.equal(JSON.stringify(preview), JSON.stringify(state));
  assert.equal(state.exercises[checkbox.id].answers[item.id].status, 'correct');
  assert.throws(() => applyComponentAction({ role: 'teacher', component: checkbox, state, action: correct }), { statusCode: 403 });
});
