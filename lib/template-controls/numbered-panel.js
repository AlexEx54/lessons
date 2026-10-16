'use strict';

const { normalizeTextPanel } = require('../../assets/components/text-panel.js');
const {
  blockName, countWord, cycle, exactList, fail, flag, integer, listSchema, pick, requiredText,
} = require('./helpers.js');

// A panel with an optional heading and a numbered list: example sentences, questions.
// Without accentColor or showBorder in the chrome the text panel defaults apply.

const EXAMPLE_ITEMS = Object.freeze([
  'Flash Kid **has got** curly hair.',
  'Moon Girl **has got** a silver mask.',
  'Fire Boy **hasn’t got** a cape.',
  'Forest Elf **has got** pointed ears.',
  'They **have got** superhero suits.',
]);

module.exports = {
  type: 'numberedPanel',
  label: 'Нумерованный список',
  params: {
    items: integer('Пунктов', 2, 8, 5),
    boldTargetGrammar: flag('Выделять грамматику жирным', false),
  },
  chrome: ['heading', 'subheading', 'accentColor', 'backgroundColor', 'showBorder'],
  fields: ['items'],
  schema: ({ params }) => ({ items: listSchema(params.items) }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.items)} ${f.items}.`,
    params.boldTargetGrammar ? `${f.items}: in every item, wrap the target grammar form in exactly one pair of **bold** Markdown markers.` : '',
  ],
  defaultInstructions: '',
  build({ items }, context) {
    const { id, params, chrome } = context;
    const lines = exactList(items, params.items, 'пунктов', context).map(item => requiredText(item, 'пункт', context));
    if (params.boldTargetGrammar && lines.some(line => (line.match(/\*\*[^*\n]+\*\*/g) || []).length !== 1)) {
      fail(`${blockName(context)}: каждый пункт должен один раз выделять целевую грамматику жирным.`);
    }
    const panel = {
      type: 'textPanel',
      id,
      text: [
        chrome.heading ? `{l}**${chrome.heading}**{/l}` : '',
        chrome.subheading ? `{muted}{s}${chrome.subheading}{/s}{/muted}` : '',
        lines.map((line, index) => `${index + 1}. ${line}`).join('\n'),
      ].filter(Boolean).join('\n\n'),
      backgroundColor: chrome.backgroundColor ?? '#FFFFFF',
      ...pick(chrome, ['accentColor', 'showBorder']),
    };
    normalizeTextPanel(panel);
    return panel;
  },
  example: ({ params }) => ({
    items: cycle(EXAMPLE_ITEMS, params.items).map(item => (params.boldTargetGrammar ? item : item.replace(/\*\*/g, ''))),
  }),
};
