'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeDragWordsInText,
  parseMarkedText,
} = require('../assets/components/drag-words-in-text.js');

function component(overrides = {}) {
  return {
    type: 'dragWordsInText',
    id: 'grammar-presentation-complete-the-rule',
    title: ' Complete the Rule ',
    instruction: ' Drag the correct words into the gaps. ',
    words: ['past', 'base verb', 'comfortable', '-ing', 'future', 'infinitive with to'],
    text: 'used to + [[base verb]]. We use it for habits or states that were true in the [[past]] but are different now.\n\nget used to + noun / verb + [[-ing]]. It means to become [[comfortable]] with a new situation.',
    ...overrides,
  };
}

test('drag words in text normalizes copy, bank order, and gap markers', () => {
  assert.deepEqual(normalizeDragWordsInText(component({
    words: [' past ', '  base   verb ', 'comfortable', '-ing', 'future', 'infinitive with to'],
    text: 'used to + [[  base   verb ]]. We use it for habits or states that were true in the [[past]] but are different now.\n\nget used to + noun / verb + [[-ing]]. It means to become [[comfortable]] with a new situation.',
  })), {
    type: 'dragWordsInText',
    id: 'grammar-presentation-complete-the-rule',
    title: 'Complete the Rule',
    instruction: 'Drag the correct words into the gaps.',
    words: ['past', 'base verb', 'comfortable', '-ing', 'future', 'infinitive with to'],
    text: 'used to + [[base verb]]. We use it for habits or states that were true in the [[past]] but are different now.\n\nget used to + noun / verb + [[-ing]]. It means to become [[comfortable]] with a new situation.',
  });
  const parts = parseMarkedText(normalizeDragWordsInText(component()).text);
  assert.deepEqual(parts.filter(part => part.type === 'gap').map(part => part.answer), [
    'base verb', 'past', '-ing', 'comfortable',
  ]);
  assert.equal(parts.filter(part => part.type === 'text').some(part => part.text.includes('\n\n')), true);
});

test('drag words in text allows an exercise without distractors when there are enough gaps', () => {
  const normalized = normalizeDragWordsInText(component({
    words: ['past', 'present'],
    text: 'It happened in the [[past]], not the [[present]].',
  }));
  assert.deepEqual(normalized.words, ['past', 'present']);
  assert.equal(normalized.text, 'It happened in the [[past]], not the [[present]].');
});

test('drag words in text rejects malformed type, counts, markers, and extra fields', () => {
  assert.throws(() => normalizeDragWordsInText(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizeDragWordsInText(component({ id: 'Bad Id' })), /type.*kebab-case/);
  assert.throws(() => normalizeDragWordsInText(component({ words: ['only'] })), /between 2 and 12 words/);
  assert.throws(() => normalizeDragWordsInText(component({
    words: Array.from({ length: 13 }, (_, index) => `word-${index + 1}`),
    text: 'A [[word-1]] gap.',
  })), /between 2 and 12 words/);
  assert.throws(() => normalizeDragWordsInText(component({
    words: ['past', 'future'],
    text: 'No gaps here.',
  })), /between 1 and 8 gaps/);
  assert.throws(() => normalizeDragWordsInText(component({
    words: Array.from({ length: 9 }, (_, index) => `word-${index + 1}`),
    text: Array.from({ length: 9 }, (_, index) => `[[word-${index + 1}]]`).join(' '),
  })), /between 1 and 8 gaps/);
  assert.throws(() => normalizeDragWordsInText(component({
    words: ['past', 'future'],
    text: 'It was [[past]] and [[past]].',
  })), /answers must be unique/);
  assert.throws(() => normalizeDragWordsInText(component({
    words: ['past', 'future'],
    text: 'It was [[present]].',
  })), /must match the word bank/);
  assert.throws(() => normalizeDragWordsInText(component({
    words: ['past', 'past'],
    text: 'It was [[past]].',
  })), /words must be unique/);
  assert.throws(() => normalizeDragWordsInText(component({
    words: ['past', 'future'],
    text: 'It was [[]].',
  })), /empty gaps/);
  assert.throws(() => normalizeDragWordsInText(component({
    words: ['past', 'future'],
    text: 'It was [[past]] and leftover [[.',
  })), /unmatched gap markers/);
  assert.throws(() => normalizeDragWordsInText(component({
    title: '<b>Rule</b>',
  })), /HTML or Markdown/);
  assert.throws(() => normalizeDragWordsInText(component({ extra: true })), /unsupported fields/);
});

test('drag words in text is registered with in-place editing and play styles', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'drag-words-in-text.css'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  const check = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  assert.match(css, /drag-words-in-text__chip--picked/);
  assert.match(css, /drag-words-in-text__gap--correct/);
  assert.match(css, /drag-words-in-text__gap--wrong/);
  assert.match(css, /drag-words-in-text__ghost/);
  assert.match(css, /drag-words-in-text--editing/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.doesNotMatch(css, /drag-words-in-text__editor-item/);
  assert.match(editor, /dragWordsInText: component/);
  assert.match(editor, /saveDragWordsInText/);
  assert.match(page, /components\/drag-words-in-text\.js/);
  assert.match(page, /components\/drag-words-in-text\.css/);
  assert.match(check, /drag-words-in-text\.js/);
});
