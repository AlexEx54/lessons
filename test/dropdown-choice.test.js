'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  getSelectionState,
  normalizeDropdownChoice,
} = require('../assets/components/dropdown-choice.js');

function component(overrides = {}) {
  return {
    type: 'dropdownChoice',
    id: 'target-vocabulary-context-dropdown',
    title: ' Task 2 · Vocabulary in Context — Dropdown ',
    instruction: ' Fill in the blanks. ',
    segments: [{ type: 'text', text: 'I wanted ' }, {
      type: 'choice',
      id: 'hang-out-context',
      options: ['to get bored', 'to hang out (with friends)', 'to stay up late'],
      answer: 'to hang out (with friends)',
    }, { type: 'text', text: ' this summer.' }],
    ...overrides,
  };
}

test('dropdown choice normalizes structured inline content', () => {
  const normalized = normalizeDropdownChoice(component());
  assert.equal(normalized.title, 'Task 2 · Vocabulary in Context — Dropdown');
  assert.equal(normalized.instruction, 'Fill in the blanks.');
  assert.equal(normalized.segments[0].text, 'I wanted ');
  assert.deepEqual(normalized.segments[1], {
    type: 'choice',
    id: 'hang-out-context',
    options: ['to get bored', 'to hang out (with friends)', 'to stay up late'],
    answer: 'to hang out (with friends)',
  });

  const twelveChoices = [];
  for (let index = 1; index <= 12; index += 1) {
    twelveChoices.push({ type: 'text', text: `Part ${index} ` });
    twelveChoices.push({
      type: 'choice', id: `choice-${index}`, options: ['first', 'second'], answer: 'first',
    });
  }
  assert.equal(
    normalizeDropdownChoice(component({ segments: twelveChoices })).segments.filter(segment => segment.type === 'choice').length,
    12,
  );
});

test('dropdown choice rejects malformed segments, ids, options, answers, and markup', () => {
  assert.throws(() => normalizeDropdownChoice(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizeDropdownChoice(component({ segments: [] })), /non-empty segments/);
  assert.throws(() => normalizeDropdownChoice(component({
    segments: [{ type: 'video', text: 'Unsupported' }],
  })), /unsupported segment/);
  assert.throws(() => normalizeDropdownChoice(component({
    segments: [{ type: 'choice', id: 'Bad Id', options: ['one', 'two'], answer: 'one' }],
  })), /unique kebab-case/);
  assert.throws(() => normalizeDropdownChoice(component({
    segments: [
      { type: 'choice', id: 'same-id', options: ['one', 'two'], answer: 'one' },
      { type: 'choice', id: 'same-id', options: ['one', 'two'], answer: 'one' },
    ],
  })), /unique kebab-case/);
  assert.throws(() => normalizeDropdownChoice(component({
    segments: [{ type: 'choice', id: 'few-options', options: ['one'], answer: 'one' }],
  })), /at least two options/);
  assert.throws(() => normalizeDropdownChoice(component({
    segments: [{ type: 'choice', id: 'duplicate-options', options: ['one', ' one '], answer: 'one' }],
  })), /options must be unique/);
  assert.throws(() => normalizeDropdownChoice(component({
    segments: [{ type: 'choice', id: 'missing-answer', options: ['one', 'two'], answer: 'three' }],
  })), /answer must match/);
  assert.throws(() => normalizeDropdownChoice(component({
    segments: [{ type: 'text', text: '**Markdown**' }, {
      type: 'choice', id: 'choice-one', options: ['one', 'two'], answer: 'one',
    }],
  })), /HTML or Markdown/);
  assert.throws(() => normalizeDropdownChoice(component({
    segments: [{ type: 'text', text: '<strong>HTML</strong>' }, {
      type: 'choice', id: 'choice-one', options: ['one', 'two'], answer: 'one',
    }],
  })), /HTML or Markdown/);
  const thirteen = Array.from({ length: 13 }, (_, index) => ({
    type: 'choice', id: `choice-${index + 1}`, options: ['one', 'two'], answer: 'one',
  }));
  assert.throws(() => normalizeDropdownChoice(component({ segments: thirteen })), /between 1 and 12/);
});

test('dropdown choice selection states allow retries and identify a correct answer', () => {
  assert.equal(getSelectionState('', 'answer'), 'empty');
  assert.equal(getSelectionState('wrong', 'answer'), 'wrong');
  assert.equal(getSelectionState('answer', 'answer'), 'correct');
  assert.equal(getSelectionState('wrong', 'answer'), 'wrong');
  assert.equal(getSelectionState('answer', 'answer'), 'correct');
});

test('dropdown choice is registered with correct, wrong, and responsive presentation states', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'dropdown-choice.css'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(css, /dropdown-choice__select--correct/);
  assert.match(css, /dropdown-choice__select--wrong/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(editor, /dropdownChoice: component/);
  assert.match(page, /components\/dropdown-choice\.js/);
  assert.match(page, /components\/dropdown-choice\.css/);
});
