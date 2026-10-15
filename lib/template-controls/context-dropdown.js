'use strict';

const { normalizeDropdownChoice } = require('../../assets/components/dropdown-choice.js');
const { countWord, exactList, integer, listSchema, shuffle } = require('./helpers.js');

// A paragraph with gaps; every gap is a dropdown of vocabulary items.

module.exports = {
  type: 'contextDropdown',
  label: 'Слова в контексте',
  params: {
    gaps: integer(3, 12, 8),
    options: integer(2, 4, 3),
    minWords: integer(30, 200, 70),
    maxWords: integer(40, 250, 110),
  },
  chrome: ['title', 'instruction'],
  fields: ['text', 'choices'],
  // The field rules already speak about vocabulary items, wherever they come from.
  inputs: { vocabulary: { type: 'vocabulary', required: true, sameStageRule: () => '' } },
  schema: ({ params }) => ({
    text: { type: 'string', minLength: 1 },
    choices: listSchema(params.gaps, {
      type: 'object',
      additionalProperties: false,
      required: ['options', 'answer'],
      properties: {
        options: listSchema(params.options),
        answer: { type: 'string', minLength: 1 },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `${f.text}: one coherent paragraph (${params.minWords}–${params.maxWords} words) with ${countWord(params.gaps)} gaps written [[1]] to [[${params.gaps}]] in order.`,
    `${f.choices}: one choice per gap, in the same order. options are ${countWord(params.options)} different vocabulary items in the form that fits the gap; answer is one of them, copied exactly. Use ${countWord(params.gaps)} different answers and vary the position of the answer.`,
  ],
  defaultInstructions: 'The paragraph is about a new person connected to the topic.',
  build({ text, choices }, context) {
    const { id, params, chrome, random } = context;
    exactList(choices, params.gaps, 'пропусков', context);
    return normalizeDropdownChoice({
      type: 'dropdownChoice',
      id,
      title: chrome.title ?? 'Vocabulary in Context',
      instruction: chrome.instruction ?? 'Fill in the blanks with the correct words from the dropdown lists.',
      text: String(text || '').replace(/\[\[(\d+)\]\]/g, '[[context-$1]]'),
      choices: choices.map(({ options, answer }, index) => ({
        id: `context-${index + 1}`, options: shuffle(options, random), answer,
      })),
    });
  },
  answerKey: ({ component }) => ({
    list: true,
    lines: component.choices.map((choice, index) => `${index + 1}. **${choice.answer}**`),
  }),
  example({ params, links }) {
    const terms = links.vocabulary.value.map(item => item.term);
    const choices = Array.from({ length: params.gaps }, (_, index) => ({
      options: Array.from({ length: params.options }, (__, offset) => terms[(index + offset) % terms.length]),
      answer: terms[index % terms.length],
    }));
    return {
      text: choices.map((_, index) => `Star Kid has got [[${index + 1}]].`).join(' '),
      choices,
    };
  },
};
