'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeStoryCards, renderStoryCards } = require('../assets/components/story-cards.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { studentComponent } = require('../lib/class-component-handlers.js');
const { createDocument } = require('./helpers/lesson-dom.js');
const stage = () => createSyntheticLesson('Superheroes', { template: 'template-2' }).stages[2];

test('template 2 keeps shared pronunciation guidance, uses its own task notes and explains every highlighted phrase', () => {
  const [notes, vocabulary, stories] = stage().content;
  const originalNotes = createSyntheticLesson('Test').stages[2].content[0];
  assert.deepEqual(notes.blocks[0], originalNotes.blocks[0]);
  assert.deepEqual(notes.blocks[2], originalNotes.blocks[2]);
  assert.match(notes.blocks[1].text, /Task 1.*истории/);
  assert.match(notes.blocks[1].text, /Task 2.*значение/);
  assert.match(notes.blocks[1].text, /Task 3.*выпадающих/);
  assert.equal(stories.items.length, 4);
  for (const item of stories.items) {
    for (const [phrase] of item.text.matchAll(/\*\*[^*]+\*\*/g)) assert.ok(vocabulary.text.includes(phrase), phrase);
  }
  assert.deepEqual(studentComponent(stories, {}), stories);
  assert.equal(studentComponent(notes, {}), null);
  assert.equal(studentComponent(vocabulary, {}), null);
});

test('story validation rejects duplicate ids, missing text, invalid colors and empty lists', () => {
  const source = stage().content[2];
  for (const change of [s => { delete s.id; }, s => { delete s.items[0].id; }, s => { s.items[1].id = s.items[0].id; }, s => { s.items[0].text = ''; },
    s => { s.items[0].backgroundColor = 'red'; }, s => { s.items = []; }]) {
    const invalid = structuredClone(source); change(invalid);
    assert.throws(() => normalizeStoryCards(invalid));
  }
  assert.deepEqual(normalizeStoryCards(source), source);
});

test('student reading renders four colored stories with bold phrases and no editing controls', () => {
  const source = stage().content[2];
  const node = renderStoryCards(source, { viewerRole: 'student', onSave: () => assert.fail() }, createDocument());
  assert.equal(node.querySelectorAll('article').length, 4);
  assert.equal(node.querySelectorAll('strong').length, 10);
  assert.equal(node.querySelectorAll('button').length, 0);
  assert.equal(node.querySelectorAll('article')[0].style['--story-background'], source.items[0].backgroundColor);
});
