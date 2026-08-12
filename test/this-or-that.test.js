'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { normalizeThisOrThat } = require('../assets/components/this-or-that.js');

function component(overrides = {}) {
  return {
    type: 'thisOrThat',
    id: 'warm-up-this-or-that',
    items: [{
      id: 'choice-one',
      options: [
        { id: 'option-one', caption: 'First option', imagePrompt: 'Square illustration one' },
        { id: 'option-two', caption: 'Second option', imagePrompt: 'Square illustration two' },
      ],
    }],
    ...overrides,
  };
}

test('this or that normalizes one to eight pairs and preserves server image URLs', () => {
  const normalized = normalizeThisOrThat(component());
  assert.equal(normalized.items.length, 1);
  const withImage = component();
  withImage.items[0].options[0].imageSrc = ' /api/lesson-draft-assets/draft/image.png ';
  assert.equal(normalizeThisOrThat(withImage).items[0].options[0].imageSrc, '/api/lesson-draft-assets/draft/image.png');

  const eight = component({
    items: Array.from({ length: 8 }, (_, index) => ({
      id: `choice-${index + 1}`,
      options: [0, 1].map(side => ({
        id: `option-${index + 1}-${side + 1}`,
        caption: `Caption ${side}`,
        imagePrompt: `Prompt ${side}`,
      })),
    })),
  });
  assert.equal(normalizeThisOrThat(eight).items.length, 8);
});

test('this or that rejects malformed counts, text, and duplicate or non-kebab ids', () => {
  assert.throws(() => normalizeThisOrThat(component({ type: 'other' })), /kebab-case id/);
  assert.throws(() => normalizeThisOrThat(component({ items: [] })), /between 1 and 8/);
  assert.throws(() => normalizeThisOrThat(component({ items: Array.from({ length: 9 }, (_, index) => ({
    id: `choice-${index}`, options: [{ id: `left-${index}`, caption: 'Left', imagePrompt: 'Prompt' }, { id: `right-${index}`, caption: 'Right', imagePrompt: 'Prompt' }],
  })) })), /between 1 and 8/);
  const wrongOptions = component();
  wrongOptions.items[0].options.pop();
  assert.throws(() => normalizeThisOrThat(wrongOptions), /exactly two/);
  const duplicate = component();
  duplicate.items[0].options[1].id = 'option-one';
  assert.throws(() => normalizeThisOrThat(duplicate), /unique kebab-case/);
  const emptyPrompt = component();
  emptyPrompt.items[0].options[0].imagePrompt = ' ';
  assert.throws(() => normalizeThisOrThat(emptyPrompt), /image prompt/);
});

test('this or that CSS defines selected, dimmed, prompt and responsive states', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'this-or-that.css'), 'utf8');
  assert.match(css, /this-or-that__option--selected/);
  assert.match(css, /this-or-that__option--dimmed/);
  assert.match(css, /this-or-that__media--prompt/);
  assert.match(css, /@media \(max-width: 820px\)/);
});
