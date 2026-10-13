'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const { countWord, cycle, exactList, integer, listSchema, pickVocabulary, requiredText, warnCyrillic } = require('./helpers.js');

// Writing support: a word bank picked from the lesson vocabulary, a model sentence and a minimum task.

module.exports = {
  type: 'wordBankSupport',
  label: 'Банк слов и образец',
  params: {
    words: integer(3, 12, 8),
    minimumTask: { default: 'Write 3 sentences if you need extra support.' },
  },
  chrome: ['title', 'icon', 'accentColor', 'studentVisibility'],
  fields: ['words', 'modelSentence'],
  inputs: { vocabulary: { type: 'vocabulary', required: true } },
  schema: ({ params }) => ({
    words: listSchema(params.words),
    modelSentence: { type: 'string', minLength: 1 },
  }),
  rules: ({ params, links, f }) => [
    `Select exactly ${countWord(params.words)} distinct entries from ${links.vocabulary.label} for ${f.words}, copying each entry exactly.`,
  ],
  defaultInstructions: 'modelSentence: one natural sentence using the target grammar and lesson context.',
  build({ words, modelSentence }, context) {
    const { id, params, chrome, links } = context;
    const requested = exactList(words, params.words, 'слов', context).map(word => requiredText(word, 'слово банка', context));
    warnCyrillic([modelSentence], context);
    const card = {
      type: 'markdownCard',
      id,
      title: chrome.title ?? 'Support',
      icon: chrome.icon ?? 'lifeRing',
      accentColor: chrome.accentColor ?? '#20A85B',
      studentVisibility: chrome.studentVisibility ?? 'always',
      text: [
        `- **Word bank:** ${pickVocabulary(requested, links.vocabulary.value, 'банке слов', context).join(', ')}`,
        `- **Model sentence:** “${requiredText(modelSentence, 'образец предложения', context)}”`,
        ...(params.minimumTask ? [`- **Minimum task:** ${params.minimumTask}`] : []),
      ].join('\n'),
    };
    normalizeMarkdownCard(card);
    return card;
  },
  example: ({ params, links }) => ({
    words: cycle(links.vocabulary.value.map(item => item.term), params.words),
    modelSentence: 'My superhero has got a red cape and black boots.',
  }),
};
