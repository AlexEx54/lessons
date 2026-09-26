'use strict';
const { itemFromText } = require('../assets/components/sentence-builder-model.js');

// Reusable configuration for a future template; not included in template 2.
function createSentenceBuilderExample(id = 'sentence-builder') {
  return {
    type: 'sentenceBuilder', id,
    title: 'Make the sentence', instruction: 'Put the words in the right order.',
    hintsEnabled: true, completionText: 'Purr-fect! Well done!',
    items: [
      itemFromText('My hero can fly.', 'sentence-one'),
      itemFromText('She is wearing [a red cape].', 'sentence-two'),
      itemFromText('He is [stronger than] me.', 'sentence-three'),
      itemFromText('We can [help people] together.', 'sentence-four'),
    ],
  };
}

module.exports = { createSentenceBuilderExample };
