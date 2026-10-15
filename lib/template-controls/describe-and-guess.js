'use strict';

const { normalizeDescribeAndGuess } = require('../../assets/components/describe-and-guess.js');
const {
  assertUnique, countWord, exactList, integer, listSchema, vocabularyTerm,
} = require('./helpers.js');

// A guessing game: describe a lesson word without saying it.

const HOW_TO_PLAY = Object.freeze({
  title: 'How to Play',
  steps: Object.freeze([
    'Choose a word from the list.',
    'Describe it without saying the word or any part of it.',
    'Your partner guesses the word.',
    'Click the word when it’s guessed. It will be crossed out.',
    'Take turns and keep playing!',
  ]),
  tip: 'You can use examples, actions, feelings and details, but don’t say the word!',
});

module.exports = {
  type: 'describeAndGuess',
  label: 'Describe and Guess',
  params: { items: integer(3, 12, 6) },
  chrome: ['title', 'instruction', 'howToPlay'],
  fields: ['terms'],
  // The field rule already speaks about vocabulary items, wherever they come from.
  inputs: { vocabulary: { type: 'vocabulary', required: true, sameStageRule: () => '' } },
  schema: ({ params }) => ({ terms: listSchema(params.items) }),
  rules: ({ params, f }) => [
    `Select exactly ${countWord(params.items)} distinct vocabulary items for ${f.terms}.`,
  ],
  defaultInstructions: '',
  build({ terms }, context) {
    const { id, params, chrome, links } = context;
    const words = exactList(terms, params.items, 'слов', context)
      .map(term => vocabularyTerm(term, links.vocabulary.value, 'слово для игры', context));
    assertUnique(words, 'слова для игры', context);
    const game = {
      type: 'describeAndGuess',
      id,
      title: chrome.title ?? 'Describe and Guess',
      instruction: chrome.instruction ?? 'Take turns with your teacher. Describe the word without saying it. Can your partner guess it?',
      items: words.map((text, index) => ({ id: `item-${index + 1}`, text })),
      howToPlay: structuredClone(chrome.howToPlay ?? HOW_TO_PLAY),
    };
    // Validation only: the stored game keeps its authored shape.
    normalizeDescribeAndGuess(game);
    return game;
  },
  example: ({ params, links }) => ({ terms: links.vocabulary.value.slice(0, params.items).map(item => item.term) }),
};
