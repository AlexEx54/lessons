'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const { requiredText } = require('./helpers.js');

// A card with one generated Markdown text, such as a task instruction for the student.

module.exports = {
  type: 'textCard',
  label: 'Карточка с текстом',
  group: 'notes',
  description: 'Карточка с коротким текстом для ученика: задание или подсказка.',
  chrome: ['title', 'icon', 'accentColor', 'studentVisibility'],
  fields: ['text'],
  schema: () => ({ text: { type: 'string', minLength: 1 } }),
  defaultInstructions: '',
  build({ text }, context) {
    const { id, chrome } = context;
    const card = {
      type: 'markdownCard',
      id,
      title: chrome.title ?? 'Your turn!',
      text: requiredText(text, 'текст карточки', context),
      icon: chrome.icon ?? 'chat',
      accentColor: chrome.accentColor ?? '#1EAD58',
      studentVisibility: chrome.studentVisibility ?? 'always',
    };
    normalizeMarkdownCard(card);
    return card;
  },
  example: () => ({ text: 'Choose one option in each pair and explain your choice.' }),
};
