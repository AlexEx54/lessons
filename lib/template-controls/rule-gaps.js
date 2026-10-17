'use strict';

const { normalizeDragWordsInText } = require('../../assets/components/drag-words-in-text.js');
const {
  assertUnique, blockName, countWord, cycle, exactList, fail, integer, listSchema, requiredText, shuffle,
} = require('./helpers.js');

// A grammar rule with gaps: the answers and a few distractors form the word bank.

const EXAMPLE_ITEMS = Object.freeze([
  { before: 'We use have got to talk about ', answer: 'things', after: ' we own.' },
  { before: 'With he, she and it we use ', answer: 'has got', after: '.' },
  { before: 'The negative form is ', answer: 'hasn’t got', after: ' or haven’t got.' },
  { before: 'In questions, ', answer: 'has', after: ' or have goes first.' },
  { before: 'A short answer is: Yes, I ', answer: 'have', after: '.' },
  { before: 'In speech we often say ', answer: 'I’ve got', after: '.' },
]);
const EXAMPLE_DISTRACTORS = Object.freeze(['places', 'did', 'will']);

module.exports = {
  type: 'ruleGaps',
  label: 'Правило с пропусками',
  group: 'grammar',
  description: 'Правило с пропусками: перетащить слова в текст правила.',
  params: {
    gaps: integer('Пропусков', 2, 6, 4),
    distractors: integer('Лишних вариантов', 0, 3, 2),
  },
  chrome: ['title', 'instruction'],
  fields: ['items', 'distractors'],
  schema: ({ params }) => ({
    items: listSchema(params.gaps, {
      type: 'object',
      additionalProperties: false,
      required: ['before', 'answer', 'after'],
      properties: {
        before: { type: 'string' },
        answer: { type: 'string', minLength: 1 },
        after: { type: 'string' },
      },
    }),
    distractors: listSchema(params.distractors),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.gaps)} ${f.items}. Each item must form a clear rule statement when before + answer + after are joined.`,
    `The ${countWord(params.gaps)} answers in ${f.items} must be distinct. Provide exactly ${countWord(params.distractors)} plausible but incorrect ${f.distractors}, distinct from each other and from every answer.`,
    `Do not use Markdown, HTML, or [[gap]] markers in ${f.items} or ${f.distractors}.`,
  ],
  defaultInstructions: '',
  build({ items, distractors }, context) {
    const { id, params, chrome, random } = context;
    const rule = exactList(items, params.gaps, 'частей правила', context).map((item, index) => {
      const before = typeof item?.before === 'string' ? item.before : '';
      const after = typeof item?.after === 'string' ? item.after : '';
      const answer = requiredText(item?.answer, `ответ в части правила ${index + 1}`, context);
      if (!before.trim() && !after.trim()) fail(`${blockName(context)}: вокруг ответа ${index + 1} нет текста.`);
      return { before, answer, after };
    });
    const answers = assertUnique(rule.map(item => item.answer), 'ответы', context);
    const wrong = assertUnique(
      exactList(distractors, params.distractors, 'дистракторов', context).map(value => requiredText(value, 'дистрактор', context)),
      'дистракторы', context,
    );
    assertUnique([...answers, ...wrong], 'ответы и дистракторы', context);
    const task = {
      type: 'dragWordsInText',
      id,
      title: chrome.title ?? 'Complete the Rule',
      instruction: chrome.instruction ?? 'Drag the correct words into the gaps.',
      words: shuffle([...answers, ...wrong], random),
      text: rule.map(item => `${item.before}[[${item.answer}]]${item.after}`).join('\n\n'),
    };
    normalizeDragWordsInText(task);
    return task;
  },
  answerKey: ({ component }) => ({
    list: false,
    lines: [`${[...component.text.matchAll(/\[\[(.+?)\]\]/g)].map((match, index) => `${index + 1} ${match[1]}`).join(', ')}.`],
  }),
  example: ({ params }) => ({
    items: cycle(EXAMPLE_ITEMS, params.gaps),
    distractors: cycle(EXAMPLE_DISTRACTORS, params.distractors),
  }),
};
