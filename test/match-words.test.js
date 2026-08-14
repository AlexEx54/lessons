'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { normalizeMatchWords } = require('../assets/components/match-words.js');

function component(overrides = {}) {
  return {
    type: 'matchWords',
    id: 'target-vocabulary-match-words',
    title: 'Task 1 · Match the Words',
    instruction: 'Match the words with the pictures.',
    items: [{ id: 'hang-out', term: 'to hang out', imagePrompt: 'Friends spending time together' }],
    ...overrides,
  };
}

test('match words normalizes one to twelve items and preserves image URLs', () => {
  const normalized = normalizeMatchWords(component());
  assert.equal(normalized.items.length, 1);
  const withImage = component();
  withImage.items[0].imageSrc = ' /api/lesson-draft-assets/draft/image.png ';
  assert.equal(normalizeMatchWords(withImage).items[0].imageSrc, '/api/lesson-draft-assets/draft/image.png');

  const twelve = component({
    items: Array.from({ length: 12 }, (_, index) => ({
      id: `word-${index + 1}`, term: `Term ${index + 1}`, imagePrompt: `Prompt ${index + 1}`,
    })),
  });
  assert.equal(normalizeMatchWords(twelve).items.length, 12);
});

test('match words rejects malformed counts, text, and ids', () => {
  assert.throws(() => normalizeMatchWords(component({ type: 'other' })), /kebab-case id/);
  assert.throws(() => normalizeMatchWords(component({ title: ' ' })), /title/);
  assert.throws(() => normalizeMatchWords(component({ instruction: '' })), /instruction/);
  assert.throws(() => normalizeMatchWords(component({ items: [] })), /between 1 and 12/);
  assert.throws(() => normalizeMatchWords(component({
    items: Array.from({ length: 13 }, (_, index) => ({ id: `word-${index}`, term: 'Term', imagePrompt: 'Prompt' })),
  })), /between 1 and 12/);
  assert.throws(() => normalizeMatchWords(component({
    items: [{ id: 'Bad Id', term: 'Term', imagePrompt: 'Prompt' }],
  })), /unique kebab-case/);
  assert.throws(() => normalizeMatchWords(component({
    items: [{ id: 'same-id', term: 'One', imagePrompt: 'One' }, { id: 'same-id', term: 'Two', imagePrompt: 'Two' }],
  })), /unique kebab-case/);
  assert.throws(() => normalizeMatchWords(component({
    items: [{ id: 'empty-term', term: ' ', imagePrompt: 'Prompt' }],
  })), /item term/);
});

test('match words CSS defines correct image overlay, wrong feedback, drag ghost, and responsive grids', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'match-words.css'), 'utf8');
  assert.match(css, /match-words__feedback--correct/);
  assert.match(css, /match-words__feedback--wrong/);
  assert.match(css, /match-words__drag-ghost/);
  assert.match(css, /grid-template-columns: repeat\(5/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
