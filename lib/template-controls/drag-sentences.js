'use strict';

const { normalizeDragWordsInText } = require('../../assets/components/drag-words-in-text.js');
const { assertUnique, countWord, cycle, exactList, integer, listSchema } = require('./helpers.js');

// Short sentences with one gap each; the missing words form the word bank. Where the words
// come from — the lesson vocabulary, the topic of the stage or a list given by the teacher —
// is in the instructions.

const EXAMPLE_SENTENCES = Object.freeze([
  'I always take an [[umbrella]] when it rains.',
  'Mia rides her [[bicycle]] to school.',
  'Leo put his books in his [[backpack]].',
  'My brother plays the [[guitar]] in a band.',
  'We looked at the Moon through a [[telescope]].',
  'Dad took a photo with his new [[camera]].',
  'She climbed the [[ladder]] to reach the roof.',
  'The children flew a [[kite]] on the beach.',
]);

module.exports = {
  type: 'dragSentences',
  label: 'Перетащить слова в предложения',
  group: 'vocabulary',
  description: 'Перетащить слова в пропуски в предложениях. Какие слова взять, говорят указания.',
  params: { sentences: integer('Предложений', 3, 8, 6) },
  chrome: ['title', 'instruction'],
  fields: ['sentences'],
  schema: ({ params }) => ({ sentences: listSchema(params.sentences) }),
  rules: ({ params, f }) => [
    `${f.sentences}: exactly ${countWord(params.sentences)} short sentences, each with exactly one gap written as the missing word or short phrase in double square brackets, for example "I put on my [[sunglasses]]." Use ${countWord(params.sentences)} different answers, each in the form that fits the sentence.`,
  ],
  defaultInstructions: 'Choose useful words or short phrases connected to the topic of the stage.',
  build({ sentences }, context) {
    const { id, params, chrome } = context;
    exactList(sentences, params.sentences, 'предложений', context);
    const words = sentences.flatMap(sentence => [...String(sentence).matchAll(/\[\[(.+?)\]\]/g)].map(match => match[1]));
    assertUnique(words, 'слова в пропусках', context);
    return normalizeDragWordsInText({
      type: 'dragWordsInText',
      id,
      title: chrome.title ?? 'Drag the correct words into the gaps.',
      instruction: chrome.instruction ?? 'Use each word once.',
      // Alphabetical order so the word bank does not follow the order of the sentences.
      words: [...words].sort((a, b) => a.localeCompare(b)),
      text: sentences.join('\n'),
    });
  },
  example: ({ params }) => ({ sentences: cycle(EXAMPLE_SENTENCES, params.sentences) }),
};
