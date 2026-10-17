'use strict';

const { normalizeGapFill } = require('../../assets/components/gap-fill.js');
const { blockName, countWord, cycle, exactList, integer, listSchema, pick, requiredText, stripMarkdown } = require('./helpers.js');

// Russian sentences to translate into English with the target grammar.

const CYRILLIC = /[Ѐ-ӿ]/u;

const EXAMPLE_ITEMS = Object.freeze([
  { ru: 'У моего супергероя есть красный плащ.', en: 'My superhero has got a red cape' },
  { ru: 'У неё большие зелёные глаза.', en: 'She has got big green eyes' },
  { ru: 'У него нет перчаток.', en: 'He hasn’t got gloves' },
  { ru: 'У твоего супергероя есть пояс?', en: 'Has your superhero got a belt' },
  { ru: 'У нас нет сапог.', en: 'We haven’t got boots' },
]);

module.exports = {
  type: 'translationSentences',
  label: 'Перевод предложений',
  group: 'grammar',
  description: 'Перевести предложения с русского на английский.',
  params: { items: integer('Предложений', 3, 12, 10) },
  chrome: ['title', 'instruction', 'accentColor', 'studentVisibility', 'fieldSize'],
  fields: ['items'],
  schema: ({ params }) => ({
    items: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['ru', 'en'],
      properties: {
        ru: { type: 'string', minLength: 1 },
        en: { type: 'string', minLength: 1 },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.items)} ${f.items}. ru is a short Russian sentence; en is its natural English translation using the target grammar.`,
  ],
  defaultInstructions: 'Choose sentences that have one clear, unambiguous English translation.',
  build({ items }, context) {
    const { id, params, chrome } = context;
    const translations = exactList(items, params.items, 'предложений', context).map((item, index) => {
      const where = `переводе ${index + 1}`;
      const ru = requiredText(stripMarkdown(item?.ru, where, context), `русское предложение в ${where}`, context);
      const en = requiredText(stripMarkdown(item?.en, where, context), `английский ответ в ${where}`, context);
      if (!CYRILLIC.test(ru)) console.warn(`${blockName(context)}: в ${where} русское предложение без кириллицы: ${ru}`);
      if (CYRILLIC.test(en)) console.warn(`${blockName(context)}: в ${where} английский ответ содержит кириллицу: ${en}`);
      return { ru, en };
    });
    return normalizeGapFill({
      type: 'gapFill',
      id,
      title: chrome.title ?? 'Translate the sentences.',
      instruction: chrome.instruction ?? 'Translate the sentences from Russian to English.',
      ...pick(chrome, ['accentColor', 'studentVisibility', 'fieldSize']),
      text: translations.map((item, index) => `**${index + 1}.** ${item.ru} [[translation-${index + 1}]]`).join('\n'),
      gaps: translations.map((item, index) => ({ id: `translation-${index + 1}`, answer: item.en })),
    });
  },
  answerKey: ({ component }) => ({
    list: false,
    lines: component.gaps.map((gap, index) => `**${index + 1}.** ${gap.answer}`),
  }),
  example: ({ params }) => ({ items: cycle(EXAMPLE_ITEMS, params.items) }),
};
