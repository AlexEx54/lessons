'use strict';

const { normalizeMultipleChoice } = require('../../assets/components/multiple-choice.js');

// "What does X mean?" for every word, with its definition and the wrong one.

module.exports = {
  type: 'vocabularyMeanings',
  kind: 'derived',
  label: 'Значения слов',
  chrome: ['title', 'instruction'],
  inputs: { vocabulary: { type: 'vocabulary', requires: ['distractor'], required: true } },
  build(_, { id, chrome, links }) {
    return normalizeMultipleChoice({
      type: 'multipleChoice',
      id,
      variant: 'compact',
      title: chrome.title ?? 'Choose the correct meaning.',
      instruction: chrome.instruction ?? 'Choose one answer for each question.',
      items: links.vocabulary.value.map(({ term, definition, distractor }, index) => ({
        id: `meaning-${index + 1}`,
        question: `What does “${term}” mean?`,
        answer: definition,
        options: index % 2 ? [distractor, definition] : [definition, distractor],
      })),
    });
  },
};
