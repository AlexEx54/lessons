'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const {
  assertUnique, blockName, countWord, cycle, exactList, fail, integer, listSchema, requiredText,
} = require('./helpers.js');

// The words of the lesson. Later tasks read them through the `vocabulary` output;
// with `imagePrompts` every word also gets a picture for matching tasks.

const EXAMPLE_ITEMS = Object.freeze([
  { term: 'curly hair', definition: 'hair with curls', distractor: 'hair with no curls' },
  { term: 'big eyes', definition: 'large eyes', distractor: 'very small eyes' },
  { term: 'long straight hair', definition: 'long hair without curls', distractor: 'short hair with lots of curls' },
  { term: 'silver mask', definition: 'a silver cover for your face', distractor: 'silver shoes for your feet' },
  { term: 'superhero suit', definition: 'special clothes a superhero wears', distractor: 'a superhero’s house' },
  { term: 'boots', definition: 'shoes that cover your ankles or legs', distractor: 'clothes you wear on your hands' },
  { term: 'gloves', definition: 'clothes that cover your hands', distractor: 'clothes for your head' },
  { term: 'belt', definition: 'something you wear around your waist', distractor: 'something you wear around your neck' },
  { term: 'green hair', definition: 'hair that is green', distractor: 'hair that is very long' },
  { term: 'pointed ears', definition: 'ears with narrow tips', distractor: 'very round ears' },
  { term: 'cape', definition: 'a long coat without sleeves', distractor: 'a hat with a wide brim' },
  { term: 'mask', definition: 'a cover for your face', distractor: 'a cover for your hands' },
]);

const IMAGE_RULE = 'Every imagePrompt must explicitly describe a modern square educational illustration suitable for teenagers, with no text. Avoid childish or preschool aesthetics.';
const SQUARE_WITHOUT_TEXT = Object.freeze([/\bsquare\b/i, /\b(?:no|without)\s+(?:visible\s+)?text\b/i]);

module.exports = {
  type: 'vocabularyList',
  label: 'Слова урока',
  params: {
    items: integer(4, 12, 10),
    distractors: { default: true },
    imagePrompts: { default: false },
  },
  chrome: ['title', 'icon', 'accentColor', 'studentVisibility'],
  fields: ['items'],
  outputs: {
    vocabulary: {
      type: 'vocabulary',
      field: 'items',
      features: params => [params.distractors && 'distractor', params.imagePrompts && 'imagePrompt'].filter(Boolean),
      size: params => params.items,
    },
  },
  schema: ({ params }) => {
    const properties = {
      term: { type: 'string', minLength: 1 },
      definition: { type: 'string', minLength: 1 },
    };
    if (params.distractors) properties.distractor = { type: 'string', minLength: 1 };
    if (params.imagePrompts) properties.imagePrompt = { type: 'string', minLength: 1 };
    return {
      items: listSchema(params.items, {
        type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
      }),
    };
  },
  rules: ({ params, f }) => [
    `${f.items}: exactly ${countWord(params.items)} items. term is the dictionary form shown in the vocabulary list. definition is a short, simple English definition.${
      params.distractors ? ' distractor is a plausible but wrong definition of similar length.' : ''}${
      params.imagePrompts ? ' imagePrompt is an English prompt for a picture that shows the term.' : ''}`,
    params.imagePrompts ? IMAGE_RULE : '',
  ],
  defaultInstructions: 'Useful words or short phrases for the topic.',
  build({ items }, context) {
    const { id, params, chrome } = context;
    exactList(items, params.items, 'слов', context);
    const terms = items.map(item => requiredText(item?.term, 'слово', context));
    assertUnique(terms, 'слова', context);
    items.forEach(item => {
      requiredText(item.definition, `определение слова ${item.term}`, context);
      if (params.distractors) requiredText(item.distractor, `неверное определение слова ${item.term}`, context);
      if (!params.imagePrompts) return;
      const imagePrompt = requiredText(item.imagePrompt, `картинка слова ${item.term}`, context);
      if (!SQUARE_WITHOUT_TEXT.every(pattern => pattern.test(imagePrompt))) {
        fail(`${blockName(context)}: картинки слов должны быть квадратными иллюстрациями без текста.`);
      }
    });
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
  exports: (component, { params, data }) => ({
    vocabulary: data.items.map(({ term, definition, distractor, imagePrompt }) => ({
      term: term.trim(),
      definition: definition.trim(),
      ...(params.distractors ? { distractor: distractor.trim() } : {}),
      ...(params.imagePrompts ? { imagePrompt: imagePrompt.trim() } : {}),
    })),
  }),
  example: ({ params }) => ({
    items: cycle(EXAMPLE_ITEMS, params.items).map(({ term, definition, distractor }) => ({
      term,
      definition,
      ...(params.distractors ? { distractor } : {}),
      ...(params.imagePrompts ? { imagePrompt: `Square educational illustration of ${term}, no text.` } : {}),
    })),
  }),
};
