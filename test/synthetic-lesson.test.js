'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');

test('synthetic lesson contains seven ordered stages and a warm-up teacher note', () => {
  const lesson = createSyntheticLesson('  Space travel  ');
  assert.equal(lesson.meta.topic, 'Space travel');
  assert.equal(lesson.meta.durationMinutes, 45);
  assert.equal(lesson.stages.length, 7);
  assert.deepEqual(lesson.stages.map(stage => stage.id), [
    'warm-up', 'lead-in', 'target-vocabulary', 'reading-listening',
    'grammar-focus', 'guided-speaking', 'wrap-up',
  ]);
  assert.ok(lesson.stages.every((stage, index) => stage.number === index + 1));
  assert.deepEqual(lesson.stages[0].content.map(component => component.type), ['teacherNote']);
  assert.equal(lesson.stages[0].content[0].id, 'warm-up-teacher-note');
  assert.match(lesson.stages[0].content[0].text, /^- Не заставляйте/);
  assert.match(lesson.stages[0].content[0].text, /\*\*Say:\*\*/);
  assert.ok(lesson.stages.slice(1).every(stage => stage.content === null));
});
