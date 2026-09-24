'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { normalizeMarkdownCard } = require('../assets/components/markdown-card.js');
const { apply } = require('../assets/components/exercise-state.js');
const makeLesson = () => createSyntheticLesson('Exchange year', { template: 'template-2' });

test('template two owns eight ordered stages and a fixed 50-minute duration', () => {
  const lesson = makeLesson();
  assert.equal(lesson.meta.durationMinutes, 50);
  assert.deepEqual(lesson.stages.map(s => s.id), [
    'warm-up', 'lead-in', 'target-vocabulary', 'watch-and-interact',
    'grammar-presentation', 'grammar-focus', 'guided-speaking', 'wrap-up',
  ]);
  assert.deepEqual(lesson.stages.map(s => s.number), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('grammar discovery copies template one while task two has eight sentences and four answers', () => {
  const content = makeLesson().stages[4].content;
  const original = createSyntheticLesson('Test').stages.find(s => s.id === 'grammar-presentation').content;
  assert.deepEqual(content.slice(1, 5), original.slice(1, 5));
  assert.match(content[0].text, /tick the four grammatically correct sentences/);
  assert.doesNotMatch(content[0].text, /drop-down/);
  const task = content[5], item = task.items[0];
  assert.equal(task.type, 'checkboxChoice');
  assert.equal(task.items.length, 1);
  assert.equal(item.options.length, 8);
  assert.equal(item.answers.length, 4);
  assert.equal(content[6].studentVisibility, 'teacherOnly');
  normalizeMarkdownCard(content[6]);
  assert.equal(content[6].sections[1].text, 'Correct sentences: 1, 3, 4, 6.');
  content[1].text = 'Modified';
  assert.deepEqual(makeLesson().stages[4].content.slice(1, 5), original.slice(1, 5));
});

test('grammar checkbox task completes after all four correct answers, including after a mistake', () => {
  const task = makeLesson().stages[4].content[5], item = task.items[0];
  let state = {};
  for (const value of [item.options[1], ...item.answers]) {
    state = apply(task, state, { type: 'choose-option', componentId: task.id, itemId: item.id, value });
    assert.equal(state.answers[item.id].status, value === item.answers.at(-1) ? 'correct' : 'wrong');
  }
});
