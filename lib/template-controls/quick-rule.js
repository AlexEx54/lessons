'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const { blockName, countWord, fail, integer, requiredText } = require('./helpers.js');

// A short rule summary: one to three titled Markdown sections side by side.

const EXAMPLE_SECTIONS = Object.freeze([
  { title: 'HAVE GOT', text: '- **meaning:** things we own, family, appearance\n- **form:** I / you / we / they have got; he / she / it has got\n- **example:** “I’ve got a red cape.”' },
  { title: 'NEGATIVES & QUESTIONS', text: '- **negative:** haven’t got / hasn’t got\n- **question:** Have you got …? Has she got …?\n- **short answers:** Yes, I have. / No, she hasn’t.' },
  { title: 'TIP', text: '- In speech, use short forms: I’ve got, she’s got.' },
]);

module.exports = {
  type: 'quickRule',
  label: 'Краткое правило',
  params: {
    minSections: integer(1, 3, 1),
    maxSections: integer(1, 3, 3),
  },
  chrome: ['title', 'layout', 'icon', 'accentColor', 'studentVisibility'],
  fields: ['sections'],
  schema: ({ params }) => ({
    sections: {
      type: 'array',
      minItems: params.minSections,
      maxItems: params.maxSections,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text'],
        properties: {
          title: { type: 'string', minLength: 1 },
          text: { type: 'string', minLength: 1 },
        },
      },
    },
  }),
  rules: ({ params, f }) => [
    `Create ${countWord(params.minSections)} to ${countWord(params.maxSections)} ${f.sections}, each with a short title and Markdown text.`,
  ],
  defaultInstructions: 'Use concise Markdown bullet points to cover meaning and form, with an example at the target CEFR level where useful.',
  build({ sections }, context) {
    const { id, params, chrome } = context;
    if (!Array.isArray(sections) || sections.length < params.minSections || sections.length > params.maxSections) {
      fail(`${blockName(context)}: нужно от ${params.minSections} до ${params.maxSections} секций.`);
    }
    const card = {
      type: 'markdownCard',
      id,
      title: chrome.title ?? 'Quick Rule',
      layout: chrome.layout ?? 'columns',
      sections: sections.map((section, index) => ({
        id: `quick-rule-${index + 1}`,
        title: requiredText(section?.title, `заголовок секции ${index + 1}`, context),
        text: requiredText(section?.text, `текст секции ${index + 1}`, context),
      })),
      icon: chrome.icon ?? 'bulb',
      accentColor: chrome.accentColor ?? '#6545F5',
      studentVisibility: chrome.studentVisibility ?? 'always',
    };
    normalizeMarkdownCard(card);
    return card;
  },
  example: ({ params }) => ({ sections: EXAMPLE_SECTIONS.slice(0, params.maxSections) }),
};
