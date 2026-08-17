'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  answersMatch,
  normalizeFillInBlanks,
  shouldShowAnswerKey,
} = require('../assets/components/fill-in-blanks.js');

function component(overrides = {}) {
  return {
    type: 'fillInBlanks',
    id: 'target-vocabulary-fill-in-blanks',
    title: ' Task 3 · Fill in the Blanks ',
    instruction: ' Type the correct word or phrase. ',
    items: [{
      id: 'fill-item-one',
      before: ' After a long week, I like to ',
      answer: ' chill out ',
      after: ' and watch a movie. ',
    }],
    ...overrides,
  };
}

test('fill in the blanks normalizes its stable JSON contract', () => {
  assert.deepEqual(normalizeFillInBlanks(component()), {
    type: 'fillInBlanks',
    id: 'target-vocabulary-fill-in-blanks',
    title: 'Task 3 · Fill in the Blanks',
    instruction: 'Type the correct word or phrase.',
    items: [{
      id: 'fill-item-one',
      before: 'After a long week, I like to',
      answer: 'chill out',
      after: 'and watch a movie.',
    }],
  });
  const twelve = Array.from({ length: 12 }, (_, index) => ({
    id: `fill-item-${index + 1}`,
    before: `Sentence ${index + 1}`,
    answer: 'answer',
    after: '',
  }));
  assert.equal(normalizeFillInBlanks(component({ items: twelve })).items.length, 12);
});

test('fill in the blanks rejects malformed counts, ids, markup, and empty content', () => {
  assert.throws(() => normalizeFillInBlanks(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [] })), /between 1 and 12/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [{
    id: 'Bad Id', before: 'Sentence', answer: 'answer', after: '',
  }] })), /unique kebab-case/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [
    { id: 'same-id', before: 'One', answer: 'one', after: '' },
    { id: 'same-id', before: 'Two', answer: 'two', after: '' },
  ] })), /unique kebab-case/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [{
    id: 'empty-sentence', before: '', answer: 'answer', after: '',
  }] })), /sentence text/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [{
    id: 'empty-answer', before: 'Sentence', answer: '', after: '',
  }] })), /item answer/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [{
    id: 'markup', before: '<b>Sentence</b>', answer: 'answer', after: '',
  }] })), /HTML or Markdown/);
  assert.throws(() => normalizeFillInBlanks({ ...component(), answerKey: ['duplicate'] }), /unsupported fields/);
});

test('answer matching is live-friendly and has no wrong state', () => {
  assert.equal(answersMatch('  CHILL   OUT ', 'chill out'), true);
  assert.equal(answersMatch('chill', 'chill out'), false);
  assert.equal(answersMatch('', 'chill out'), false);
  assert.equal(shouldShowAnswerKey('teacher'), true);
  assert.equal(shouldShowAnswerKey('student'), false);
  assert.throws(() => shouldShowAnswerKey('admin'), /viewer role/);
});

test('fill in the blanks is registered with editing, answer-key, and responsive styles', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'fill-in-blanks.css'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(css, /fill-in-blanks__field--correct/);
  assert.match(css, /top:\s*50%/);
  assert.match(css, /transform:\s*translateY\(-50%\)/);
  assert.match(css, /fill-in-blanks__check::before/);
  assert.match(css, /top:\s*3px/);
  assert.match(css, /transform:\s*rotate\(45deg\)/);
  assert.doesNotMatch(css, /field--wrong/);
  assert.match(css, /fill-in-blanks__answer-key/);
  assert.match(css, /fill-in-blanks__answer-edit/);
  assert.match(css, /padding:\s*10px 4px 0 56px/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(editor, /fillInBlanks: component/);
  assert.match(editor, /saveFillInBlanks/);
  assert.match(page, /components\/fill-in-blanks\.js/);
  assert.match(page, /components\/fill-in-blanks\.css/);
});
