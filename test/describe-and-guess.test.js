'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { normalizeDescribeAndGuess } = require('../assets/components/describe-and-guess.js');

function component(overrides = {}) {
  return {
    type: 'describeAndGuess',
    id: 'target-vocabulary-describe-and-guess',
    title: ' Extra Task · Describe and Guess ',
    instruction: ' Take turns and describe the word. ',
    items: [{ id: 'word-one', text: ' level up ' }],
    howToPlay: {
      title: ' How to Play ',
      steps: [' Choose a word. ', ' Describe it. '],
      tip: ' Use examples. ',
    },
    ...overrides,
  };
}

test('normalizes editable Describe and Guess copy, words, and rules', () => {
  assert.deepEqual(normalizeDescribeAndGuess(component()), {
    type: 'describeAndGuess',
    id: 'target-vocabulary-describe-and-guess',
    title: 'Extra Task · Describe and Guess',
    instruction: 'Take turns and describe the word.',
    items: [{ id: 'word-one', text: 'level up' }],
    howToPlay: {
      title: 'How to Play',
      steps: ['Choose a word.', 'Describe it.'],
      tip: 'Use examples.',
    },
  });
});

test('accepts up to twelve words and eight editable rule steps', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: `word-${index + 1}`, text: `Word ${index + 1}` }));
  const steps = Array.from({ length: 8 }, (_, index) => `Step ${index + 1}`);
  const normalized = normalizeDescribeAndGuess(component({ items, howToPlay: { title: 'How', steps, tip: 'Tip' } }));
  assert.equal(normalized.items.length, 12);
  assert.equal(normalized.howToPlay.steps.length, 8);
});

test('rejects invalid Describe and Guess data', () => {
  assert.throws(() => normalizeDescribeAndGuess(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizeDescribeAndGuess(component({ items: [] })), /between 1 and 12/);
  assert.throws(() => normalizeDescribeAndGuess(component({ extra: true })), /unsupported fields/);
  assert.throws(() => normalizeDescribeAndGuess(component({ items: [
    { id: 'same-word', text: 'One' }, { id: 'same-word', text: 'Two' },
  ] })), /unique kebab-case/);
  assert.throws(() => normalizeDescribeAndGuess(component({ title: '**Title**' })), /HTML or Markdown/);
  assert.throws(() => normalizeDescribeAndGuess(component({ howToPlay: { title: 'How', steps: [], tip: 'Tip' } })), /between 1 and 8/);
  assert.throws(() => normalizeDescribeAndGuess(component({ howToPlay: { title: 'How', steps: ['Step'], tip: '<b>Tip</b>' } })), /HTML or Markdown/);
});

test('component exposes strike interaction and a reserved student visibility control', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'describe-and-guess.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'describe-and-guess.css'), 'utf8');
  assert.match(script, /describe-and-guess__word--crossed/);
  assert.match(script, /aria-pressed/);
  assert.match(script, /studentVisibilityControl/);
  assert.match(styles, /text-decoration:\s*line-through/);
  assert.match(script, /howToPlay:\s*normalized\.howToPlay/);
});
