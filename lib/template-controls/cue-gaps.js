'use strict';

const { normalizeGapFill } = require('../../assets/components/gap-fill.js');
const {
  blockName, countWord, cycle, exactList, integer, listSchema, pick, requiredText, stripMarkdown, warnCyrillic,
} = require('./helpers.js');

// Sentences with one gap each: type the correct form of the word given as a cue.

const EXAMPLE_ITEMS = Object.freeze([
  { before: 'Flash Kid ', answer: 'has got', after: ' curly hair.', cue: 'have got' },
  { before: 'We ', answer: 'haven’t got', after: ' capes.', cue: 'not have got' },
  { before: 'Moon Girl ', answer: 'has got', after: ' a silver mask.', cue: 'have got' },
  { before: 'They ', answer: 'have got', after: ' red boots.', cue: 'have got' },
]);

module.exports = {
  type: 'cueGaps',
  label: 'Пропуски с подсказкой',
  group: 'grammar',
  description: 'Вписать форму слова по подсказке в скобках.',
  params: { items: integer('Предложений', 3, 12, 8) },
  chrome: ['title', 'instruction', 'accentColor'],
  fields: ['items'],
  schema: ({ params }) => ({
    items: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['before', 'answer', 'after', 'cue'],
      properties: {
        before: { type: 'string' },
        answer: { type: 'string', minLength: 1 },
        after: { type: 'string' },
        cue: { type: 'string' },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.items)} ${f.items}. before + answer + after must form one natural sentence. Set cue to the base form the learner must change (for example a base verb) and answer to the correct form.`,
  ],
  defaultInstructions: 'Separate sentences, not a dialogue.',
  build({ items }, context) {
    const { id, params, chrome } = context;
    warnCyrillic(items, context);
    const gaps = exactList(items, params.items, 'предложений', context).map((item, index) => {
      const where = `предложении ${index + 1}`;
      const before = stripMarkdown(item?.before, where, context);
      const after = stripMarkdown(item?.after, where, context);
      if (!before.trim() && !after.trim()) console.warn(`${blockName(context)}: в ${where} нет текста вокруг ответа.`);
      return {
        before,
        after,
        cue: stripMarkdown(item?.cue, where, context).trim(),
        answer: requiredText(stripMarkdown(item?.answer, where, context), `ответ в ${where}`, context),
      };
    });
    return normalizeGapFill({
      type: 'gapFill',
      id,
      title: chrome.title ?? 'Complete the gaps with the correct form of the words.',
      instruction: chrome.instruction ?? 'Read each sentence and type the correct form.',
      ...pick(chrome, ['accentColor']),
      text: gaps.map((gap, index) => `**${index + 1}.** ${gap.before}[[gap-${index + 1}]]${gap.after}`).join('\n\n'),
      gaps: gaps.map((gap, index) => ({ id: `gap-${index + 1}`, example: gap.cue, answer: gap.answer })),
    });
  },
  answerKey: ({ component }) => ({
    list: false,
    lines: component.gaps.map((gap, index) => `**${index + 1}.** ${gap.answer}`),
  }),
  example: ({ params }) => ({ items: cycle(EXAMPLE_ITEMS, params.items) }),
};
