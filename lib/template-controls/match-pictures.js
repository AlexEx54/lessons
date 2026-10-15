'use strict';

const { normalizeMatchWords } = require('../../assets/components/match-words.js');

// Match the lesson words with their pictures; built from a vocabulary with image prompts.

module.exports = {
  type: 'matchPictures',
  kind: 'derived',
  label: 'Слова и картинки',
  chrome: ['title', 'instruction'],
  inputs: { vocabulary: { type: 'vocabulary', required: true, requires: ['imagePrompt'] } },
  build(_data, { id, chrome, links }) {
    const task = {
      type: 'matchWords',
      id,
      title: chrome.title ?? 'Match the Words',
      instruction: chrome.instruction ?? 'Match the words with the pictures.',
      items: links.vocabulary.value.map(({ term, imagePrompt }, index) => ({ id: `item-${index + 1}`, term, imagePrompt })),
    };
    // Validation only: the stored task keeps its authored shape.
    normalizeMatchWords(task);
    return task;
  },
};
