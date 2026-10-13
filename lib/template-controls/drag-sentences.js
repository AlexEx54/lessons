'use strict';

const { normalizeDragWordsInText } = require('../../assets/components/drag-words-in-text.js');
const { countWord, exactList, integer, listSchema } = require('./helpers.js');

// Short sentences with one vocabulary gap each; the missing words form the word bank.

module.exports = {
  type: 'dragSentences',
  label: 'Перетащить слова в предложения',
  params: { sentences: integer(3, 8, 6) },
  chrome: ['title', 'instruction'],
  fields: ['sentences'],
  // The field rule already speaks about vocabulary items, wherever they come from.
  inputs: { vocabulary: { type: 'vocabulary', required: true, sameStageRule: () => '' } },
  schema: ({ params }) => ({ sentences: listSchema(params.sentences) }),
  rules: ({ params, f }) => [
    `${f.sentences}: exactly ${countWord(params.sentences)} short sentences, each with exactly one gap written as the missing vocabulary item in double square brackets, for example "I put on my [[sunglasses]]." Use ${countWord(params.sentences)} different items in the form that fits the sentence.`,
  ],
  defaultInstructions: '',
  build({ sentences }, context) {
    const { id, params, chrome } = context;
    exactList(sentences, params.sentences, 'предложений', context);
    const words = sentences.flatMap(sentence => [...String(sentence).matchAll(/\[\[(.+?)\]\]/g)].map(match => match[1]));
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
  example: ({ params, links }) => ({
    sentences: Array.from({ length: params.sentences }, (_, index) => {
      const terms = links.vocabulary.value;
      return `Star Kid has got [[${terms[index % terms.length].term}]].`;
    }),
  }),
};
