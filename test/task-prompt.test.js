'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { normalizeTaskPrompt } = require('../assets/components/task-prompt.js');

test('task prompt accepts both variants and an optional support section', () => {
  assert.deepEqual(normalizeTaskPrompt({
    variant: 'yourTurn', title: ' Your turn! ', text: ' Answer. ',
  }), { title: 'Your turn!', text: 'Answer.', support: null });
  assert.deepEqual(normalizeTaskPrompt({
    variant: 'followUp',
    title: 'Follow-up questions:',
    text: 'Why?',
    support: { title: 'Possible language:', text: '**Because** …' },
  }).support, { title: 'Possible language:', text: '**Because** …' });
});

test('task prompt rejects unsupported variants and incomplete visible sections', () => {
  assert.throws(() => normalizeTaskPrompt({ variant: 'other', title: 'Title', text: 'Text' }), /supported variant/);
  assert.throws(() => normalizeTaskPrompt({ variant: 'yourTurn', title: '', text: 'Text' }), /non-empty/);
  assert.throws(() => normalizeTaskPrompt({
    variant: 'followUp', title: 'Title', text: 'Text', support: { title: 'Support', text: '' },
  }), /support requires/);
});

test('task prompt styles derive variants and divider from component structure', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'task-prompt.css'), 'utf8');
  assert.match(css, /\.task-prompt--your-turn/);
  assert.match(css, /\.task-prompt--follow-up|--task-prompt-accent/);
  assert.match(css, /\.task-prompt__support \{[^}]*border-top:/s);
});
