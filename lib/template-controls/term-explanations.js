'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const {
  assertUnique, countWord, exactList, integer, listSchema, requiredText, vocabularyTerm,
} = require('./helpers.js');

// Short explanations of the trickiest lesson words for the teacher.

module.exports = {
  type: 'termExplanations',
  label: 'Пояснения к словам',
  params: { items: integer('Слов с пояснением', 1, 10, 5) },
  chrome: ['title', 'icon', 'accentColor', 'studentVisibility'],
  fields: ['items'],
  // The field rule already speaks about vocabulary items, wherever they come from.
  inputs: { vocabulary: { type: 'vocabulary', required: true, sameStageRule: () => '' } },
  schema: ({ params }) => ({
    items: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['term', 'explanation'],
      properties: {
        term: { type: 'string', minLength: 1 },
        explanation: { type: 'string', minLength: 1 },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `${f.items}: select exactly ${countWord(params.items)} vocabulary items that genuinely need extra explanation and explain each briefly for the teacher in simple English.`,
  ],
  defaultInstructions: '',
  build({ items }, context) {
    const { id, params, chrome, links } = context;
    const explained = exactList(items, params.items, 'пояснений', context).map(item => ({
      term: vocabularyTerm(item?.term, links.vocabulary.value, 'слово в пояснении', context),
      explanation: requiredText(item?.explanation, 'пояснение', context),
    }));
    assertUnique(explained.map(item => item.term), 'слова в пояснениях', context);
    const card = {
      type: 'markdownCard',
      id,
      title: chrome.title ?? 'Words That Need Extra Explanation',
      text: explained.map(item => `- **${item.term}** — ${item.explanation}`).join('\n'),
      icon: chrome.icon ?? 'book',
      accentColor: chrome.accentColor ?? '#6545F5',
      studentVisibility: chrome.studentVisibility ?? 'teacherOnly',
    };
    normalizeMarkdownCard(card);
    return card;
  },
  example: ({ params, links }) => ({
    items: links.vocabulary.value.slice(0, params.items).map(({ term, definition }) => ({
      term, explanation: `It means “${definition}”.`,
    })),
  }),
};
