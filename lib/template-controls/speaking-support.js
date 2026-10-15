'use strict';

const { normalizeSpeakingSupport } = require('../../assets/components/speaking-support.js');
const {
  blockName, countWord, cycle, exactList, fail, integer, listSchema, oneLine, requiredText,
} = require('./helpers.js');

// Short phrases for a speaking task, grouped into the fixed categories of the component.

const CATEGORIES = Object.freeze({
  reacting: 'Reacting',
  followUpQuestions: 'Follow-up questions',
  clarification: 'Clarification',
  suggestions: 'Suggestions',
  agreeingDisagreeing: 'Agreeing / Disagreeing',
  decision: 'Decision',
});

const EXAMPLE_PHRASES = Object.freeze({
  reacting: ['Really?', 'That sounds fun.', 'I see.'],
  followUpQuestions: ['Why?', 'How much is it?', 'What should we do first?'],
  clarification: ['What do you mean?', 'Could you explain?', 'Do you mean today?'],
  suggestions: ['How about…?', 'We could…', 'Why don’t we…?'],
  agreeingDisagreeing: ['I agree.', 'That makes sense.', 'I see your point, but…'],
  decision: ['So, we agree on…', 'Let’s choose…', 'That is the best plan.'],
});

const CYRILLIC = /[Ѐ-ӿ]/u;

module.exports = {
  type: 'speakingSupport',
  label: 'Speaking Support',
  params: { phrases: integer(2, 5, 3) },
  chrome: ['title'],
  fields: ['phrases'],
  schema: ({ params }) => ({
    phrases: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(CATEGORIES),
      properties: Object.fromEntries(Object.keys(CATEGORIES).map(key => [key, listSchema(params.phrases)])),
    },
  }),
  rules: ({ params, f }) => [
    `For every category in ${f.phrases} create exactly ${countWord(params.phrases)} short phrases.`,
  ],
  defaultInstructions: '',
  build({ phrases }, context) {
    const { id, params, chrome } = context;
    if (CYRILLIC.test(JSON.stringify(phrases ?? ''))) fail(`${blockName(context)}: фразы должны быть на английском языке.`);
    const support = {
      type: 'speakingSupport',
      id,
      title: chrome.title ?? 'Speaking Support',
      sections: Object.fromEntries(Object.entries(CATEGORIES).map(([key, title]) => [key, {
        title,
        text: exactList(phrases?.[key], params.phrases, `фраз ${title}`, context)
          .map(phrase => `- ${requiredText(oneLine(phrase), `фраза ${title}`, context)}`).join('\n'),
      }])),
    };
    // Validation only: the stored support keeps its authored shape.
    normalizeSpeakingSupport(support);
    return support;
  },
  example: ({ params }) => ({
    phrases: Object.fromEntries(Object.entries(EXAMPLE_PHRASES).map(([key, list]) => [key, cycle(list, params.phrases)])),
  }),
};
