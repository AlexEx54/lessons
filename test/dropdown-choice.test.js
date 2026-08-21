'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { getSelectionState, normalizeDropdownChoice, parseChoiceText } = require('../assets/components/dropdown-choice.js');

function component(overrides = {}) {
  return {
    type: 'dropdownChoice',
    id: 'grammar-check-the-rule',
    title: ' Task 2. Check the Rule ',
    instruction: ' Choose the correct option. ',
    text: '1. I [[past-routine]] finish early.\n2. I could not [[adaptation]] waking up early.',
    choices: [{
      id: 'past-routine', options: ['used to', 'get used to', 'getting used to'], answer: 'used to',
    }, {
      id: 'adaptation', options: ['used to', 'get used to', 'getting used to'], answer: 'get used to',
    }],
    ...overrides,
  };
}

test('dropdown choice normalizes marked text, choices, line breaks, and repeated answers', () => {
  const normalized = normalizeDropdownChoice(component());
  assert.equal(normalized.title, 'Task 2. Check the Rule');
  assert.match(normalized.text, /\n2\. I could not/);
  assert.deepEqual(parseChoiceText(normalized.text).filter(part => part.type === 'gap').map(part => part.token), [
    'past-routine', 'adaptation',
  ]);
  const repeated = component({
    text: 'One [[first]]. Two [[second]].',
    choices: [
      { id: 'first', options: ['used to', 'get used to'], answer: 'used to' },
      { id: 'second', options: ['used to', 'get used to'], answer: 'used to' },
    ],
  });
  assert.deepEqual(normalizeDropdownChoice(repeated).choices.map(choice => choice.answer), ['used to', 'used to']);
});

test('dropdown choice rejects the removed segments format and malformed canonical data', () => {
  assert.throws(() => normalizeDropdownChoice({ ...component(), segments: [] }), /unsupported fields/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), type: 'other' }), /type.*kebab-case/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), text: 'No gap.' }), /between 1 and 12 gaps/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), text: '[[Bad Id]]', choices: component().choices }), /kebab-case/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), text: '[[past-routine]] only' }), /must match exactly/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), text: '[[past-routine]] and [[past-routine]]' }), /markers must be unique/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), choices: [
    { id: 'past-routine', options: ['one'], answer: 'one' },
    component().choices[1],
  ] }), /between 2 and 12 options/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), choices: [
    { id: 'past-routine', options: ['one', ' one '], answer: 'one' },
    component().choices[1],
  ] }), /options must be unique/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), choices: [
    { id: 'past-routine', options: ['one', 'two'], answer: 'three' },
    component().choices[1],
  ] }), /answer must match/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), text: '**Bold** [[past-routine]] and [[adaptation]].' }), /HTML or Markdown/);
});

test('dropdown choice selection states allow retries and identify a correct answer', () => {
  assert.equal(getSelectionState('', 'answer'), 'empty');
  assert.equal(getSelectionState('wrong', 'answer'), 'wrong');
  assert.equal(getSelectionState('answer', 'answer'), 'correct');
});

test('dropdown choice is registered with editing, persistence, and responsive states', () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'assets', 'components', 'dropdown-choice.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'dropdown-choice.css'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(source, /dropdown-choice__choices-editor/);
  assert.match(source, /settings\.onSave/);
  assert.match(css, /dropdown-choice__select--correct/);
  assert.match(css, /dropdown-choice--editing/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(editor, /saveDropdownChoice/);
  assert.match(page, /components\/inline-gap-text\.js/);
  assert.match(page, /components\/dropdown-choice\.js/);
});
