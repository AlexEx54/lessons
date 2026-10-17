'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const { fail } = require('./helpers.js');

// Teacher card that answers earlier guesses with quotes from the stories.
// Guesses keep the numbers they have in their task.

module.exports = {
  type: 'storyGuessKey',
  kind: 'derived',
  label: 'Ответы на догадки',
  group: 'comprehension',
  description: 'Проверка догадок по историям. Собирается без ИИ.',
  chrome: ['title', 'accentColor'],
  inputs: { guesses: { type: 'statements', required: true } },
  singleSource: true,
  sourceLabel: 'ответы',
  acceptsSource: control => (control.type === 'storyCards' ? null : 'ответы на догадки собираются только из историй.'),
  build({ sources }, { id, chrome, links }) {
    const checks = sources[0]?.data?.guessChecks;
    if (sources.length !== 1 || !Array.isArray(checks)) fail(`Блоку ${id} нужны истории, которые проверяют догадки.`);
    const guesses = links.guesses.value;
    const card = {
      type: 'markdownCard',
      id,
      title: chrome.title ?? 'Check Your Guesses',
      icon: 'check',
      accentColor: chrome.accentColor ?? '#E5AD16',
      studentVisibility: 'teacherOnly',
      // Bold numbers instead of a Markdown list, which would renumber the guesses from 1.
      text: checks.map(({ story, answer, evidence }, index) => (
        `**${guesses[index].number}.** ${guesses[index].text} — **${answer.toUpperCase()}** · ${story}: “${evidence}”`
      )).join('\n\n'),
    };
    normalizeMarkdownCard(card);
    return card;
  },
};
