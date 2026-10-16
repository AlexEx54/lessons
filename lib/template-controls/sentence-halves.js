'use strict';

const { normalizeSentenceMatching } = require('../../assets/components/sentence-matching.js');
const { countWord, cycle, exactList, integer, listSchema, requiredText, stripMarkdown, warnCyrillic } = require('./helpers.js');

// Sentences split in two halves; the student matches them.

const EXAMPLE_ITEMS = Object.freeze([
  { left: 'Flash Kid has got', right: 'curly hair and big eyes.' },
  { left: 'Moon Girl hasn’t got', right: 'a cape, but she has got a mask.' },
  { left: 'Have you got', right: 'a superhero suit at home?' },
  { left: 'Fire Boy and Ice Girl have got', right: 'special belts with tools.' },
  { left: 'Forest Elf has got', right: 'green hair and pointed ears.' },
  { left: 'Has Night Fox got', right: 'orange gloves?' },
]);

module.exports = {
  type: 'sentenceHalves',
  label: 'Соединить половинки предложений',
  params: { pairs: integer('Пар', 2, 12, 6) },
  chrome: ['title'],
  fields: ['items'],
  schema: ({ params }) => ({
    items: listSchema(params.pairs, {
      type: 'object',
      additionalProperties: false,
      required: ['left', 'right'],
      properties: {
        left: { type: 'string', minLength: 1 },
        right: { type: 'string', minLength: 1 },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.pairs)} ${f.items}. Each left + " " + right must form one natural sentence using the target grammar. Split the sentences so that every left half fits exactly one right half. All halves must be distinct.`,
  ],
  defaultInstructions: '',
  build({ items }, context) {
    const { id, params, chrome } = context;
    warnCyrillic(items, context);
    const pairs = exactList(items, params.pairs, 'пар', context).map((item, index) => {
      const where = `паре ${index + 1}`;
      return {
        left: requiredText(stripMarkdown(item?.left, where, context), `левую часть в ${where}`, context),
        right: requiredText(stripMarkdown(item?.right, where, context), `правую часть в ${where}`, context),
      };
    });
    return normalizeSentenceMatching({
      type: 'sentenceMatching',
      id,
      title: chrome.title ?? 'Match the sentence halves.',
      instruction: `Match 1–${pairs.length} with A–${String.fromCharCode(64 + pairs.length)}.`,
      items: pairs.map((pair, index) => ({ id: `pair-${index + 1}`, ...pair })),
    });
  },
  example: ({ params }) => ({
    // Repeated example pairs would not be distinct, so number them past the list.
    items: cycle(EXAMPLE_ITEMS, params.pairs).map((pair, index) => (
      index < EXAMPLE_ITEMS.length ? pair : { left: `${index + 1}. ${pair.left}`, right: `${pair.right} (${index + 1})` }
    )),
  }),
};
