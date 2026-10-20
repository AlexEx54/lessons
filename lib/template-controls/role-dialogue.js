'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const { fail, oneLine } = require('./helpers.js');

// The example dialogue of a role-play as a card for the student.

module.exports = {
  type: 'roleDialogue',
  kind: 'derived',
  label: 'Пример диалога',
  group: 'speaking',
  description: 'Пример диалога к ролевой игре. Собирается без ИИ.',
  chrome: ['title', 'icon', 'accentColor', 'studentVisibility'],
  sourceLabel: 'диалог',
  acceptsSource: control => (control.type === 'roleCards' ? null : 'пример диалога берётся только из ролевой игры.'),
  build({ source }, { id, chrome }) {
    if (!source) fail(`Пример диалога ${id} должен ссылаться на ролевую игру.`);
    const card = {
      type: 'markdownCard',
      id,
      title: chrome.title ?? 'Example Dialogue',
      icon: chrome.icon ?? 'chat',
      headingSize: 'large',
      accentColor: chrome.accentColor ?? '#3563D4',
      studentVisibility: chrome.studentVisibility ?? 'always',
      text: source.data.dialogue.map(turn => `**${turn.speaker}:** ${oneLine(turn.text)}`).join('\n\n'),
    };
    normalizeMarkdownCard(card);
    return card;
  },
};
