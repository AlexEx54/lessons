'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const { fail, oneLine } = require('./helpers.js');

// The example dialogue of a role-play as a card for the student.

module.exports = {
  type: 'roleDialogue',
  kind: 'derived',
  label: 'Пример диалога',
  chrome: ['title', 'icon', 'accentColor', 'studentVisibility'],
  acceptsSource: control => (control.type === 'roleCards' ? null : 'пример диалога берётся только из ролевой игры.'),
  build({ sources }, { id, chrome }) {
    if (sources.length !== 1) fail(`Пример диалога ${id} должен ссылаться ровно на одну ролевую игру.`);
    const card = {
      type: 'markdownCard',
      id,
      title: chrome.title ?? 'Example Dialogue',
      icon: chrome.icon ?? 'chat',
      headingSize: 'large',
      accentColor: chrome.accentColor ?? '#3563D4',
      studentVisibility: chrome.studentVisibility ?? 'always',
      text: sources[0].data.dialogue.map(turn => `**${turn.speaker}:** ${oneLine(turn.text)}`).join('\n\n'),
    };
    normalizeMarkdownCard(card);
    return card;
  },
};
