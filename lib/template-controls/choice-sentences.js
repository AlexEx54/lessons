'use strict';

const { normalizeDropdownChoice } = require('../../assets/components/dropdown-choice.js');
const {
  assertUnique, blockName, countWord, cycle, exactList, fail, integer, listSchema, pick, requiredText, shuffle,
  stripMarkdown, warnCyrillic,
} = require('./helpers.js');

// Sentences with one dropdown gap each: choose the correct grammar option.

const EXAMPLE_ITEMS = Object.freeze([
  { before: 'Flash Kid ', after: ' curly hair.', options: ['has got', 'have got', 'got', 'is got'], answer: 'has got', explanation: 'With he, use has got.' },
  { before: 'We ', after: ' capes.', options: ['hasn’t got', 'haven’t got', 'not got', 'don’t got'], answer: 'haven’t got', explanation: 'With we, use haven’t got.' },
  { before: '', after: ' Moon Girl got a mask?', options: ['Have', 'Has', 'Does', 'Is'], answer: 'Has', explanation: 'Questions with she start with Has.' },
  { before: 'They ', after: ' red boots.', options: ['has got', 'have got', 'having', 'is having'], answer: 'have got', explanation: 'With they, use have got.' },
]);

module.exports = {
  type: 'choiceSentences',
  label: 'Выбор формы в предложениях',
  group: 'grammar',
  description: 'Предложения, где нужную форму выбирают из выпадающего списка.',
  params: {
    items: integer('Предложений', 3, 12, 8),
    options: integer('Вариантов в пропуске', 2, 4, 3),
  },
  chrome: ['title', 'instruction', 'accentColor'],
  fields: ['items'],
  answerKeyParts: {
    answers: { label: 'Ответы', title: 'Answers' },
    explanations: { label: 'Пояснения', title: 'Short explanations' },
  },
  schema: ({ params }) => ({
    items: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['before', 'answer', 'after', 'options', 'explanation'],
      properties: {
        before: { type: 'string' },
        answer: { type: 'string', minLength: 1 },
        after: { type: 'string' },
        options: listSchema(params.options),
        explanation: { type: 'string', minLength: 1 },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.items)} ${f.items}. Each must form one natural sentence from before + answer + after, have exactly ${countWord(params.options)} distinct plain-text options, copy answer exactly from its options, and include a short explanation.`,
  ],
  defaultInstructions: 'Include affirmative, negative, and question forms whenever the grammar topic supports them.',
  build({ items }, context) {
    const { id, params, chrome, random } = context;
    warnCyrillic(items, context);
    // Hard errors only where the task becomes unsolvable; the rest is logged.
    const choices = exactList(items, params.items, 'предложений', context).map((item, index) => {
      const where = `предложении ${index + 1}`;
      const before = stripMarkdown(item?.before, where, context);
      const after = stripMarkdown(item?.after, where, context);
      if (!before.trim() && !after.trim()) console.warn(`${blockName(context)}: в ${where} нет текста вокруг ответа.`);
      const answer = requiredText(stripMarkdown(item?.answer, where, context), `ответ в ${where}`, context);
      const options = assertUnique(
        exactList(item?.options, params.options, `вариантов в ${where}`, context)
          .map(option => requiredText(stripMarkdown(option, where, context), `вариант в ${where}`, context)),
        `варианты в ${where}`, context,
      );
      if (!options.includes(answer)) fail(`${blockName(context)}: ответ в ${where} должен точно совпадать с вариантом.`);
      requiredText(item.explanation, `объяснение в ${where}`, context);
      return { before, after, answer, options: shuffle(options, random) };
    });
    const task = {
      type: 'dropdownChoice',
      id,
      title: chrome.title ?? 'Choose the correct options.',
      instruction: chrome.instruction ?? 'Read each sentence and choose the correct grammar option.',
      text: choices.map((choice, index) => `**${index + 1}.** ${choice.before}[[choice-${index + 1}]]${choice.after}`).join('\n'),
      ...pick(chrome, ['accentColor']),
      choices: choices.map((choice, index) => ({ id: `choice-${index + 1}`, options: choice.options, answer: choice.answer })),
    };
    normalizeDropdownChoice(task);
    return task;
  },
  answerKey({ component, data, part }) {
    if (part === 'answers') {
      return { list: false, lines: component.choices.map((choice, index) => `**${index + 1}.** ${choice.answer}`) };
    }
    return { list: true, lines: data.items.map((item, index) => `${index + 1}. ${String(item.explanation).trim()}`) };
  },
  example: ({ params }) => ({
    items: cycle(EXAMPLE_ITEMS, params.items).map(item => ({ ...item, options: item.options.slice(0, params.options) })),
  }),
};
