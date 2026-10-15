'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const {
  assertPlainText, countWord, cycle, exactList, integer, listSchema, plainTextRule, requiredText, warnCyrillic,
} = require('./helpers.js');

// A card with a short generated list: speaking support, sentence starters, challenges.
// `fixedBefore` lines are always shown first; `intro` is a fixed paragraph above the list.

const FORMATS = Object.freeze({
  paragraphs: items => items.join('\n\n'),
  bullets: items => items.map(item => `- ${item}`).join('\n'),
  boldBullets: items => items.map(item => `- **${item}**`).join('\n'),
  numbered: items => items.map((item, index) => `${index + 1}. ${item}`).join('\n'),
  slashSeparated: items => items.join(' / '),
});

const EXAMPLE_ITEMS = Object.freeze(['My superhero has got …', 'I think … because …', 'I would like to …', 'In my opinion, …']);

const isTextList = value => value.every(item => typeof item === 'string' && item.trim() !== '')
  ? null
  : 'нужен список непустых строк';

module.exports = {
  type: 'listCard',
  label: 'Список',
  params: {
    items: integer(1, 10, 3),
    format: { values: Object.keys(FORMATS), default: 'bullets' },
    fixedBefore: { default: [], check: isTextList },
    intro: { default: '' },
    plainText: { default: false },
  },
  chrome: ['title', 'icon', 'accentColor', 'studentVisibility'],
  fields: ['items'],
  schema: ({ params }) => ({ items: listSchema(params.items) }),
  rules: ({ params, f }) => [
    `${f.items}: exactly ${countWord(params.items)} items.`,
    params.plainText ? plainTextRule([f.items]) : '',
  ],
  defaultInstructions: '',
  build({ items }, context) {
    const { id, params, chrome } = context;
    const lines = exactList(items, params.items, 'строк', context).map(item => requiredText(item, 'строка списка', context));
    if (params.plainText) assertPlainText(lines, context);
    warnCyrillic(lines, context);
    const list = FORMATS[params.format]([...params.fixedBefore, ...lines]);
    const card = {
      type: 'markdownCard',
      id,
      title: chrome.title ?? 'Support',
      icon: chrome.icon ?? 'chat',
      accentColor: chrome.accentColor ?? '#20A85B',
      studentVisibility: chrome.studentVisibility ?? 'always',
      text: params.intro ? `${params.intro}\n\n${list}` : list,
    };
    normalizeMarkdownCard(card);
    return card;
  },
  example: ({ params }) => ({ items: cycle(EXAMPLE_ITEMS, params.items) }),
};
