'use strict';

const { normalizeGapFill } = require('../../assets/components/gap-fill.js');
const { assertUnique, countWord, cycle, exactList, integer, listSchema, pick } = require('./helpers.js');

// Sentences that end with a Russian hint; the learner types the English word or phrase.
// Which words — the lesson vocabulary or any other — is in the instructions.

const ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['before', 'hint', 'answer'],
  properties: {
    before: { type: 'string', minLength: 1 },
    hint: { type: 'string', minLength: 1 },
    answer: { type: 'string', minLength: 1 },
  },
});

const EXAMPLE_SENTENCES = Object.freeze([
  { before: 'I always take an', hint: 'зонт', answer: 'umbrella' },
  { before: 'Mia rides her', hint: 'велосипед', answer: 'bicycle' },
  { before: 'Leo put his books in his', hint: 'рюкзак', answer: 'backpack' },
  { before: 'My brother plays the', hint: 'гитара', answer: 'guitar' },
  { before: 'We looked at the Moon through a', hint: 'телескоп', answer: 'telescope' },
  { before: 'Dad took a photo with his new', hint: 'фотоаппарат', answer: 'camera' },
  { before: 'She climbed up the', hint: 'лестница', answer: 'ladder' },
  { before: 'The children flew a', hint: 'воздушный змей', answer: 'kite' },
  { before: 'A tall', hint: 'подсолнух', answer: 'sunflower' },
  { before: 'The ship follows the light of the', hint: 'маяк', answer: 'lighthouse' },
  { before: 'We slept in a', hint: 'палатка', answer: 'tent' },
  { before: 'The hikers found the way with a', hint: 'компас', answer: 'compass' },
]);

module.exports = {
  type: 'translationHints',
  label: 'Слова по русским подсказкам',
  group: 'vocabulary',
  description: 'Вспомнить английское слово по русской подсказке. Какие слова взять, говорят указания.',
  params: { items: integer('Предложений', 3, 12, 10) },
  chrome: ['title', 'instruction', 'studentVisibility'],
  fields: ['sentences'],
  schema: ({ params }) => ({ sentences: listSchema(params.items, ITEM_SCHEMA) }),
  rules: ({ params, f }) => [
    `${f.sentences}: exactly ${countWord(params.items)} sentences. The missing word or short phrase is always the last words of the sentence. before is the English text before it; hint is its Russian translation; answer is the English word or phrase exactly as the learner should type it. Use ${countWord(params.items)} different answers.`,
  ],
  defaultInstructions: 'Choose useful words or short phrases connected to the topic of the stage.',
  build({ sentences }, context) {
    const { id, params, chrome } = context;
    exactList(sentences, params.items, 'предложений', context);
    assertUnique(sentences.map(({ answer }) => answer), 'ответы', context);
    return normalizeGapFill({
      type: 'gapFill',
      id,
      title: chrome.title ?? 'Type the English words.',
      instruction: chrome.instruction ?? 'Type the English word or phrase next to each Russian hint.',
      ...pick(chrome, ['studentVisibility']),
      text: sentences.map(({ before, hint }, index) => `${index + 1}. ${before} **${hint}** [[extra-${index + 1}]]`).join('\n'),
      gaps: sentences.map(({ answer }, index) => ({ id: `extra-${index + 1}`, answer })),
    });
  },
  example: ({ params }) => ({ sentences: cycle(EXAMPLE_SENTENCES, params.items) }),
};
