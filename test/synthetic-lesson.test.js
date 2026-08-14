'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');

test('synthetic lesson contains seven ordered stages and the mock-aligned warm-up prompts', () => {
  const lesson = createSyntheticLesson('  Space travel  ');
  assert.equal(lesson.meta.topic, 'Space travel');
  assert.equal(lesson.meta.durationMinutes, 45);
  assert.equal(lesson.stages.length, 7);
  assert.deepEqual(lesson.stages.map(stage => stage.id), [
    'warm-up', 'lead-in', 'target-vocabulary', 'reading-listening',
    'grammar-focus', 'guided-speaking', 'wrap-up',
  ]);
  assert.ok(lesson.stages.every((stage, index) => stage.number === index + 1));
  assert.deepEqual(lesson.stages[0].content.map(component => component.type), [
    'teacherNote', 'taskPrompt', 'thisOrThat', 'taskPrompt',
  ]);
  assert.equal(lesson.stages[0].content[0].id, 'warm-up-teacher-note');
  assert.match(lesson.stages[0].content[0].text, /^- Не заставляйте/);
  assert.match(lesson.stages[0].content[0].text, /\*\*Say:\*\*/);
  assert.deepEqual(lesson.stages[0].content.filter(component => component.type === 'taskPrompt').map(prompt => prompt.variant), ['yourTurn', 'followUp']);
  assert.equal(lesson.stages[0].content[1].id, 'warm-up-your-turn-prompt');
  assert.equal(lesson.stages[0].content[3].id, 'warm-up-follow-up-prompt');
  assert.equal(lesson.stages[0].content[1].support, undefined);
  assert.deepEqual(lesson.stages[0].content[1], {
    type: 'taskPrompt',
    id: 'warm-up-your-turn-prompt',
    variant: 'yourTurn',
    title: 'Your turn!',
    text: 'Which one did you do more this summer? Answer with a word or a short sentence.',
  });
  assert.equal(lesson.stages[0].content[2].items.length, 4);
  assert.ok(lesson.stages[0].content[2].items.every(item => item.options.length === 2));
  assert.ok(lesson.stages[0].content[2].items.flatMap(item => item.options).every(option => option.imagePrompt && !option.imageSrc));
  assert.deepEqual(lesson.stages[0].content[3], {
    type: 'taskPrompt',
    id: 'warm-up-follow-up-prompt',
    variant: 'followUp',
    title: 'Follow-up questions:',
    text: 'What was your favorite game this summer? Did you play every day?',
    support: {
      title: 'Possible language:',
      text: 'I built…, I swam…, I explored…',
    },
  });
  assert.deepEqual(lesson.stages[1].content.map(component => component.type), [
    'teacherNote', 'taskPrompt', 'illustratedTextPanel', 'textPanel',
  ]);
  assert.equal(lesson.stages[1].content[0].id, 'lead-in-teacher-note');
  assert.equal(lesson.stages[1].content[1].variant, 'yourTurn');
  assert.deepEqual(lesson.stages[1].content[2], {
    type: 'illustratedTextPanel',
    id: 'lead-in-gamer-message',
    text: '**@GamerAlex:** Guys, my parents took my PC away for 2 weeks! They said I need to “touch grass” and go outside. I survived, but the graphics in the real world are boring… 🙄🌿',
    backgroundColor: '#252A38',
    leadingPicture: {
      imagePrompt: 'Circular friendly gamer profile avatar with a purple and blue gradient, playful simplified face, no text, transparent background.',
    },
    trailingPicture: {
      imagePrompt: 'Minimal gray gaming community chat symbol, simple flat icon, no text, transparent background.',
    },
  });
  assert.deepEqual(lesson.stages[1].content[3], {
    type: 'textPanel',
    id: 'lead-in-discussion-questions',
    text: '1. What does “touch grass” mean?\n2. Do you agree that real-world graphics are boring?\n3. How many days can you survive without your PC or console?',
    backgroundColor: '#FFFFFF',
  });
  assert.ok(lesson.stages.slice(2).every(stage => stage.content === null));
});

test('synthetic warm-up component copy does not depend on the user topic', () => {
  const first = createSyntheticLesson('Space travel').stages[0].content;
  const second = createSyntheticLesson('Healthy habits').stages[0].content;
  assert.deepEqual(first, second);
});

test('synthetic lead-in component copy does not depend on the user topic', () => {
  const first = createSyntheticLesson('Space travel').stages[1].content;
  const second = createSyntheticLesson('Healthy habits').stages[1].content;
  assert.deepEqual(first, second);
});
