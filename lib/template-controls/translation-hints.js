'use strict';

const { normalizeGapFill } = require('../../assets/components/gap-fill.js');
const { countWord, exactList, listSchema, pick } = require('./helpers.js');

// One sentence per vocabulary item: the item is the last words, shown as a Russian hint.

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

module.exports = {
  type: 'translationHints',
  label: 'Слова по русским подсказкам',
  chrome: ['title', 'instruction', 'studentVisibility'],
  fields: ['sentences'],
  // The field rule already speaks about vocabulary items, wherever they come from.
  inputs: { vocabulary: { type: 'vocabulary', required: true, sameStageRule: () => '' } },
  schema: ({ links }) => ({
    sentences: links.vocabulary.size === undefined
      ? { type: 'array', minItems: 1, items: ITEM_SCHEMA }
      : listSchema(links.vocabulary.size, ITEM_SCHEMA),
  }),
  rules: ({ links, f }) => [
    `${f.sentences}: ${links.vocabulary.size === undefined ? '' : `exactly ${countWord(links.vocabulary.size)} sentences, `}one for each vocabulary item. The item is always the last words of the sentence. before is the English text before it; hint is the item translated into Russian; answer is the English item exactly as the student should type it.`,
  ],
  defaultInstructions: '',
  build({ sentences }, context) {
    const { id, chrome, links } = context;
    exactList(sentences, links.vocabulary.value.length, 'предложений', context);
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
  example: ({ links }) => ({
    sentences: links.vocabulary.value.map(({ term }) => ({ before: 'Star Kid has got', hint: `«${term}» по-русски`, answer: term })),
  }),
};
