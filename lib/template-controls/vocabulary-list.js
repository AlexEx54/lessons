'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const {
  assertUnique, countWord, cycle, exactList, integer, listSchema, requiredText,
} = require('./helpers.js');

// The words of the lesson. Later tasks read them through the `vocabulary` output.

const EXAMPLE_ITEMS = Object.freeze([
  { term: 'curly hair', definition: 'hair with curls' },
  { term: 'big eyes', definition: 'large eyes' },
  { term: 'long straight hair', definition: 'long hair without curls' },
  { term: 'silver mask', definition: 'a silver cover for your face' },
  { term: 'superhero suit', definition: 'special clothes a superhero wears' },
  { term: 'boots', definition: 'shoes that cover your ankles or legs' },
  { term: 'gloves', definition: 'clothes that cover your hands' },
  { term: 'belt', definition: 'something you wear around your waist' },
  { term: 'green hair', definition: 'hair that is green' },
  { term: 'pointed ears', definition: 'ears with narrow tips' },
  { term: 'cape', definition: 'a long coat without sleeves' },
  { term: 'mask', definition: 'a cover for your face' },
]);

module.exports = {
  type: 'vocabularyList',
  label: 'Слова урока',
  group: 'vocabulary',
  description: 'Список слов урока с определениями. Отдаёт словарь другим блокам.',
  params: {
    items: integer('Слов', 4, 12, 10),
  },
  chrome: ['title', 'icon', 'accentColor', 'studentVisibility'],
  fields: ['items'],
  outputs: { vocabulary: 'vocabulary' },
  schema: ({ params }) => ({
    items: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['term', 'definition'],
      properties: {
        term: { type: 'string', minLength: 1 },
        definition: { type: 'string', minLength: 1 },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `${f.items}: exactly ${countWord(params.items)} items. term is the dictionary form shown in the vocabulary list. definition is a short, simple English definition.`,
  ],
  defaultInstructions: 'Useful words or short phrases for the topic.',
  build({ items }, context) {
    const { id, params, chrome } = context;
    exactList(items, params.items, 'слов', context);
    const terms = items.map(item => requiredText(item?.term, 'слово', context));
    assertUnique(terms, 'слова', context);
    items.forEach(item => requiredText(item.definition, `определение слова ${item.term}`, context));
    const card = {
      type: 'markdownCard',
      id,
      title: chrome.title ?? 'Vocabulary',
      icon: chrome.icon ?? 'book',
      accentColor: chrome.accentColor ?? '#20A85B',
      studentVisibility: chrome.studentVisibility ?? 'controlled',
      text: items.map(({ term, definition }, index) => `${index + 1}. **${term}** — ${definition}`).join('\n'),
    };
    normalizeMarkdownCard(card);
    return card;
  },
  exports: (component, { data }) => ({
    vocabulary: data.items.map(({ term, definition }) => ({ term: term.trim(), definition: definition.trim() })),
  }),
  example: ({ params }) => ({ items: cycle(EXAMPLE_ITEMS, params.items) }),
};
