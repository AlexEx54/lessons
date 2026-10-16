'use strict';

const { normalizeSentenceCorrection } = require('../../assets/components/sentence-correction.js');
const { correctionAnswersMatch } = require('../../assets/components/exercise-state.js');
const {
  blockName, countWord, cycle, exactList, fail, integer, listSchema, pick, requiredText, stripMarkdown, warnCyrillic,
} = require('./helpers.js');

// Sentences with one grammar mistake each: the student rewrites them correctly.

const EXAMPLE_ITEMS = Object.freeze([
  { incorrect: 'Flash Kid have got curly hair.', corrections: ['Flash Kid has got curly hair.'] },
  { incorrect: 'We hasn’t got capes.', corrections: ['We haven’t got capes.', 'We have not got capes.'] },
  { incorrect: 'Have Moon Girl got a mask?', corrections: ['Has Moon Girl got a mask?'] },
  { incorrect: 'They has got red boots.', corrections: ['They have got red boots.'] },
]);

module.exports = {
  type: 'sentenceCorrection',
  label: 'Исправить ошибки',
  params: { items: integer('Предложений', 3, 12, 8) },
  chrome: ['title', 'instruction', 'accentColor'],
  fields: ['items'],
  schema: ({ params }) => ({
    items: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['incorrect', 'corrections'],
      properties: {
        incorrect: { type: 'string', minLength: 1 },
        corrections: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string', minLength: 1 } },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.items)} ${f.items}. Each incorrect sentence must contain exactly one mistake in the target grammar. corrections must contain the corrected whole sentence; add a second version only for an equally correct variant such as a contraction.`,
  ],
  defaultInstructions: '',
  build({ items }, context) {
    const { id, params, chrome } = context;
    warnCyrillic(items, context);
    const corrections = exactList(items, params.items, 'предложений', context).map((item, index) => {
      const where = `предложении ${index + 1}`;
      const text = requiredText(stripMarkdown(item?.incorrect, where, context), where, context);
      const answers = (Array.isArray(item?.corrections) ? item.corrections : [])
        .map(value => stripMarkdown(value, where, context).trim())
        .filter(Boolean)
        .filter((value, position, all) => !correctionAnswersMatch(value, all.slice(0, position)));
      if (!answers.length) fail(`${blockName(context)}: нет исправления в ${where}.`);
      if (correctionAnswersMatch(text, answers)) console.warn(`${blockName(context)}: исправление в ${where} совпадает с исходным предложением.`);
      return { text, answers };
    });
    return normalizeSentenceCorrection({
      type: 'sentenceCorrection',
      id,
      title: chrome.title ?? 'Correct the mistakes.',
      instruction: chrome.instruction ?? 'There is one mistake in each sentence. Rewrite it correctly.',
      ...pick(chrome, ['accentColor']),
      items: corrections.map((item, index) => ({ id: `correction-${index + 1}`, ...item })),
    });
  },
  answerKey: ({ component }) => ({
    list: false,
    lines: component.items.map((item, index) => `**${index + 1}.** ${item.answers.join(' / ')}`),
  }),
  example: ({ params }) => ({ items: cycle(EXAMPLE_ITEMS, params.items) }),
};
