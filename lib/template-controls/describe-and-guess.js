'use strict';

const { normalizeDescribeAndGuess } = require('../../assets/components/describe-and-guess.js');
const { countWord, cycle, exactList, integer, listSchema, oneLine } = require('./helpers.js');

// A guessing game: describe a word without saying it. Where the words come from — the
// lesson vocabulary, the topic of the stage or a list given by the teacher — is in the
// instructions.

const EXAMPLE_TERMS = Object.freeze([
  'umbrella', 'birthday party', 'lighthouse', 'homework', 'roller coaster', 'best friend',
  'snowman', 'museum', 'pizza', 'alarm clock', 'football match', 'library',
]);

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
  group: 'speaking',
  description: 'Игра: описать слово, не называя его. Какие слова взять, говорят указания.',
  params: { items: integer('Слов для игры', 3, 12, 6) },
  chrome: ['title', 'instruction', 'howToPlay'],
  fields: ['terms'],
  schema: ({ params }) => ({ terms: listSchema(params.items) }),
  rules: ({ params, f }) => [
    `${f.terms}: exactly ${countWord(params.items)} different words or short phrases for the learner to describe.`,
  ],
  defaultInstructions: 'Useful words or short phrases connected to the topic of the stage.',
  build({ terms }, context) {
    const { id, params, chrome } = context;
    const words = exactList(terms, params.items, 'слов', context).map(oneLine);
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
  example: ({ params }) => ({ terms: cycle(EXAMPLE_TERMS, params.items) }),
};
