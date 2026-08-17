'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  normalizePersonalizedQuestions,
} = require('../assets/components/personalized-questions.js');

function component(overrides = {}) {
  return {
    type: 'personalizedQuestions',
    id: 'target-vocabulary-personalized-questions',
    title: ' Task 4 · Personalised Questions ',
    instruction: ' Answer the questions out loud. ',
    items: [{
      id: 'favorite-time-outdoors',
      question: ' What’s your favorite way to **spend time outdoors**? ',
      followUp: ' Who do you usually spend that time with? ',
    }],
    ...overrides,
  };
}

test('personalized questions normalizes its stable JSON contract and inline emphasis', () => {
  assert.deepEqual(normalizePersonalizedQuestions(component()), {
    type: 'personalizedQuestions',
    id: 'target-vocabulary-personalized-questions',
    title: 'Task 4 · Personalised Questions',
    instruction: 'Answer the questions out loud.',
    items: [{
      id: 'favorite-time-outdoors',
      question: 'What’s your favorite way to **spend time outdoors**?',
      followUp: 'Who do you usually spend that time with?',
    }],
  });
  const twelve = Array.from({ length: 12 }, (_, index) => ({
    id: `question-${index + 1}`,
    question: `Question ${index + 1}?`,
    followUp: `Follow-up ${index + 1}?`,
  }));
  assert.equal(normalizePersonalizedQuestions(component({ items: twelve })).items.length, 12);
});

test('personalized questions rejects malformed counts, ids, unsafe markup, and unsupported fields', () => {
  assert.throws(() => normalizePersonalizedQuestions(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizePersonalizedQuestions(component({ items: [] })), /between 1 and 12/);
  assert.throws(() => normalizePersonalizedQuestions(component({ extra: true })), /unsupported fields/);
  assert.throws(() => normalizePersonalizedQuestions(component({ items: [
    { id: 'same-id', question: 'One?', followUp: 'Why?' },
    { id: 'same-id', question: 'Two?', followUp: 'Why?' },
  ] })), /unique kebab-case/);
  assert.throws(() => normalizePersonalizedQuestions(component({ items: [{
    id: 'bad-question', question: '', followUp: 'Why?',
  }] })), /item question/);
  assert.throws(() => normalizePersonalizedQuestions(component({ items: [{
    id: 'bad-follow-up', question: 'Question?', followUp: '',
  }] })), /item follow-up/);
  assert.throws(() => normalizePersonalizedQuestions(component({ items: [{
    id: 'html-question', question: '<b>Question?</b>', followUp: 'Why?',
  }] })), /safe inline Markdown/);
  assert.throws(() => normalizePersonalizedQuestions(component({ items: [{
    id: 'link-question', question: '[Question](https://example.com)', followUp: 'Why?',
  }] })), /safe inline Markdown/);
  assert.throws(() => normalizePersonalizedQuestions(component({ items: [{
    id: 'multiline-question', question: 'Question?\n- Another', followUp: 'Why?',
  }] })), /safe inline Markdown/);
  assert.throws(() => normalizePersonalizedQuestions(component({ title: '**Task 4**' })), /safe inline Markdown/);
});

test('personalized questions is registered with editing, ordering, emphasis, and responsive styles', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'personalized-questions.css'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'assets', 'components', 'personalized-questions.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(css, /counter-reset:\s*personalized-question/);
  assert.match(css, /personalized-questions__question strong/);
  assert.match(css, /personalized-questions__follow-up/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(source, /Переместить вверх/);
  assert.match(source, /Добавить вопрос/);
  assert.match(source, /personalized-questions__remove/);
  assert.match(editor, /personalizedQuestions: component/);
  assert.match(editor, /savePersonalizedQuestions/);
  assert.match(page, /components\/personalized-questions\.js/);
  assert.match(page, /components\/personalized-questions\.css/);
});
