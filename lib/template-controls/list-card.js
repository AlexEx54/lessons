'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const {
  assertPlainText, choice, countWord, cycle, exactList, flag, integer, listSchema, plainTextRule, requiredText, text,
  textList, warnCyrillic,
} = require('./helpers.js');

// A card with a short generated list: speaking support, sentence starters, challenges.
// `fixedBefore` lines are always shown first; `intro` is a fixed paragraph above the list.

const FORMATS = Object.freeze({
  paragraphs: { label: 'Абзацами', join: items => items.join('\n\n') },
  bullets: { label: 'Списком', join: items => items.map(item => `- ${item}`).join('\n') },
  boldBullets: { label: 'Списком, жирным', join: items => items.map(item => `- **${item}**`).join('\n') },
  numbered: { label: 'Нумерованным списком', join: items => items.map((item, index) => `${index + 1}. ${item}`).join('\n') },
  slashSeparated: { label: 'Через косую черту', join: items => items.join(' / ') },
});

const EXAMPLE_ITEMS = Object.freeze(['My superhero has got …', 'I think … because …', 'I would like to …', 'In my opinion, …']);

module.exports = {
  type: 'listCard',
  label: 'Список',
  params: {
    items: integer('Строк', 1, 10, 3),
    format: choice(
      'Вид списка',
      Object.fromEntries(Object.entries(FORMATS).map(([key, format]) => [key, format.label])),
      'bullets',
    ),
    fixedBefore: textList('Постоянные строки в начале', []),
    intro: text('Вступление', ''),
    plainText: flag('Без разметки', false),
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
    const list = FORMATS[params.format].join([...params.fixedBefore, ...lines]);
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
