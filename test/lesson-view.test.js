'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const { createDocument } = require('./helpers/lesson-dom.js');
const source = fs.readFileSync(path.join(__dirname, '../assets/lesson-view.js'), 'utf8');
function fixture() {
  const document = createDocument(), calls = [];
  const window = { scrollTo() {}, ThisOrThatComponent: { renderThisOrThat(component, options) {
    calls.push({ component, options });
    return document.createElement('section');
  } } };
  vm.runInNewContext(source, { window, document });
  const lesson = { meta: { title: 'Shared lesson', level: 'A2' }, stages: [
    { id: 'warm-up', number: 1, title: 'Warm Up', durationMinutes: 5, content: [{ type: 'thisOrThat', id: 'choice' }] },
    { id: 'lead-in', number: 2, title: 'Lead In', durationMinutes: 5, content: null },
  ] };
  return { document, window, calls, lesson };
}
test('shared view retains editor navigation, dirty guard and renderer options', () => {
  const { document, window, calls, lesson } = fixture();
  let allowed = false;
  const options = { onSave() {} };
  const view = window.LessonView.create({ componentOptions: () => options, beforeSelect: () => allowed });
  view.render(lesson);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options, options);
  assert.equal(document.getElementById('stage-title').textContent, 'Warm Up');
  const next = document.getElementById('next-stage');
  assert.equal(next.disabled, false);
  next.click();
  assert.equal(document.getElementById('stage-title').textContent, 'Warm Up');
  allowed = true;
  next.click();
  assert.equal(document.getElementById('stage-title').textContent, 'Lead In');
  assert.equal(next.disabled, true);
  document.getElementById('previous-stage').click();
  assert.equal(calls.length, 2);
  assert.ok(view.mounted.has('choice'));
});
test('student sees the same shared renderer and full stage list with no navigation', () => {
  const { document, window, calls, lesson } = fixture();
  const view = window.LessonView.create({ canSelect: () => false, componentOptions: () => ({ viewerRole: 'student' }) });
  view.render(lesson);
  assert.equal(calls[0].options.viewerRole, 'student');
  assert.equal(document.getElementById('lesson-stages').children.length, 2);
  assert.ok(document.getElementById('lesson-stages').children.every(button => button.disabled));
  assert.equal(document.getElementById('next-stage').disabled, true);
  view.selectStage(1);
  assert.equal(document.getElementById('stage-title').textContent, 'Warm Up');
});

test('shared view can restore a stage by id without changing default draft navigation', () => {
  const { document, window, lesson } = fixture();
  const view = window.LessonView.create({ initialStageId: () => 'lead-in' });
  view.render(lesson);
  assert.equal(document.getElementById('stage-title').textContent, 'Lead In');
  document.getElementById('previous-stage').click();
  assert.equal(document.getElementById('stage-title').textContent, 'Warm Up');
});

test('revealing and hiding a sibling leaves the mounted exercise in place', () => {
  const { document, window, calls, lesson } = fixture();
  const view = window.LessonView.create();
  view.render(lesson);
  const exercise = view.mounted.get('choice');
  const container = document.getElementById('stage-components');
  let removedExercise = false, disposed = false;
  const remove = container.removeChild;
  container.removeChild = function(node) { if (node === exercise) removedExercise = true; remove.call(this, node); };
  exercise.dispose = () => { disposed = true; };
  const stage = { ...lesson.stages[0], content: [{ type: 'thisOrThat', id: 'revealed' }, ...lesson.stages[0].content] };
  view.renderStageContent(stage, true);
  assert.equal(view.mounted.get('choice'), exercise);
  assert.equal(container.children[1], exercise);
  assert.equal(calls.length, 2);
  view.renderStageContent(lesson.stages[0], true);
  assert.equal(container.children[0], exercise);
  assert.equal(removedExercise, false);
  assert.equal(disposed, false);
  view.selectStage(1, true);
  assert.equal(disposed, true);
});
