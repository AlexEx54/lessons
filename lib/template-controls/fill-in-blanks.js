'use strict';

const { normalizeFillInBlanks } = require('../../assets/components/fill-in-blanks.js');
const {
  assertUnique, blockName, countWord, cycle, exactList, fail, integer, listSchema, oneLine, requiredText,
} = require('./helpers.js');

// Sentences with one typed gap each; the answers form the word bank. Where the words come
// from — the lesson vocabulary, the topic of the stage or a list given by the teacher — is
// in the instructions.

const EXAMPLE_ITEMS = Object.freeze([
  { before: 'I always take an', answer: 'umbrella', after: 'when it rains.' },
  { before: 'Mia rides her', answer: 'bicycle', after: 'to school.' },
  { before: 'The ship follows the light of the', answer: 'lighthouse', after: 'at night.' },
  { before: 'Leo put his books in his', answer: 'backpack', after: '.' },
  { before: 'My brother plays the', answer: 'guitar', after: 'in a band.' },
  { before: 'We looked at the Moon through a', answer: 'telescope', after: '.' },
  { before: 'A tall', answer: 'sunflower', after: 'grows in our garden.' },
  { before: 'Dad took a photo with his new', answer: 'camera', after: '.' },
  { before: 'She climbed the', answer: 'ladder', after: 'to reach the roof.' },
  { before: 'The children flew a', answer: 'kite', after: 'on the beach.' },
]);

module.exports = {
  type: 'fillInBlanks',
  label: 'Вписать слова в предложения',
  group: 'vocabulary',
  description: 'Предложения с пропусками и рамкой слов над ними. Какие слова взять, говорят указания.',
  params: { items: integer('Предложений', 3, 10, 6) },
  chrome: ['title', 'instruction'],
  fields: ['items'],
  schema: ({ params }) => ({
    items: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['before', 'answer', 'after'],
      properties: {
        before: { type: 'string' },
        answer: { type: 'string', minLength: 1 },
        after: { type: 'string' },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.items)} sentences in ${f.items}, each with one gap: before + answer + after form the sentence; answer is the word or short phrase the learner types into the gap, in the form that fits the sentence. Use ${countWord(params.items)} different answers.`,
  ],
  defaultInstructions: 'Choose useful words or short phrases connected to the topic of the stage.',
  build({ items }, context) {
    const { id, params, chrome } = context;
    const sentences = exactList(items, params.items, 'предложений', context).map((item, index) => {
      const before = oneLine(item?.before);
      const after = oneLine(item?.after);
      if (!before && !after) fail(`${blockName(context)}: вокруг пропуска ${index + 1} нет текста.`);
      return { before, answer: requiredText(oneLine(item?.answer), `ответ в предложении ${index + 1}`, context), after };
    });
    assertUnique(sentences.map(item => item.answer), 'ответы', context);
    const task = {
      type: 'fillInBlanks',
      id,
      title: chrome.title ?? 'Fill in the Blanks',
      instruction: chrome.instruction ?? 'Use the words and phrases in the box to complete the sentences.',
      items: sentences.map((sentence, index) => ({ id: `item-${index + 1}`, ...sentence })),
    };
    // Validation only: the stored task keeps its authored shape.
    normalizeFillInBlanks(task);
    return task;
  },
  example: ({ params }) => ({ items: cycle(EXAMPLE_ITEMS, params.items) }),
};
