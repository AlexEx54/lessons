'use strict';

const { normalizeDropdownChoice } = require('../../assets/components/dropdown-choice.js');
const {
  assertUnique, blockName, countWord, exactList, fail, flag, integer, listSchema, pick, requiredText, shuffle,
  stripMarkdown, warnCyrillic,
} = require('./helpers.js');

// A text with gaps; every gap is a dropdown of options. What the text is about and how it
// looks — one coherent paragraph, numbered separate sentences — and where the options come
// from — the lesson vocabulary, the grammar of the lesson — is in the instructions.

const EXAMPLE_TERMS = Object.freeze([
  'umbrella', 'bicycle', 'lighthouse', 'backpack', 'guitar', 'telescope',
  'sunflower', 'camera', 'ladder', 'kite', 'compass', 'tent',
]);

const where = index => `пропуске ${index + 1}`;

module.exports = {
  type: 'contextDropdown',
  label: 'Выбрать из выпадающих списков',
  group: 'vocabulary',
  description: 'Текст с пропусками-списками. О чём текст и как он оформлен, говорят указания.',
  params: {
    gaps: integer('Пропусков', 3, 12, 8),
    options: integer('Вариантов в пропуске', 2, 4, 3),
    minWords: integer('Слов в тексте: от', 30, 200, 70, { atMost: 'maxWords' }),
    maxWords: integer('Слов в тексте: до', 40, 250, 110),
    explanations: flag('Пояснения к ответам', false),
  },
  chrome: ['title', 'instruction', 'accentColor'],
  fields: ['text', 'choices'],
  answerKeyParts: {
    answers: { label: 'Ответы', title: 'Answers' },
    explanations: { label: 'Пояснения', title: 'Short explanations' },
  },
  schema: ({ params }) => ({
    text: { type: 'string', minLength: 1 },
    choices: listSchema(params.gaps, {
      type: 'object',
      additionalProperties: false,
      required: ['options', 'answer', ...(params.explanations ? ['explanation'] : [])],
      properties: {
        options: listSchema(params.options),
        answer: { type: 'string', minLength: 1 },
        ...(params.explanations && { explanation: { type: 'string', minLength: 1 } }),
      },
    }),
  }),
  rules: ({ params, f }) => [
    `${f.text}: ${params.minWords}–${params.maxWords} words with ${countWord(params.gaps)} gaps written [[1]] to [[${params.gaps}]] in order. No HTML; the only Markdown allowed is **bold**.`,
    `${f.choices}: one choice per gap, in the same order. options are ${countWord(params.options)} different words or short phrases, each in the form that fits the gap; answer is one of them, copied exactly. Every wrong option must clearly not fit its gap, so that only the answer is correct.${params.explanations ? ' explanation is one short sentence on why the answer is correct.' : ''}`,
  ],
  defaultInstructions: [
    'Choose useful words or short phrases connected to the topic of the stage. Use a different answer for every gap.',
    'The text is one coherent paragraph about a new person connected to the topic.',
  ].join('\n'),
  build({ text, choices }, context) {
    const { id, params, chrome, random } = context;
    warnCyrillic({ text, choices }, context);
    // Hard errors only where the task becomes unsolvable; the rest is logged.
    const gaps = exactList(choices, params.gaps, 'пропусков', context).map((choice, index) => {
      const options = assertUnique(
        exactList(choice?.options, params.options, `вариантов в ${where(index)}`, context)
          .map(option => requiredText(stripMarkdown(option, where(index), context), `вариант в ${where(index)}`, context)),
        `варианты в ${where(index)}`, context,
      );
      const answer = requiredText(stripMarkdown(choice.answer, where(index), context), `ответ в ${where(index)}`, context);
      if (!options.includes(answer)) fail(`${blockName(context)}: ответ в ${where(index)} должен точно совпадать с вариантом.`);
      if (params.explanations) requiredText(choice.explanation, `пояснение в ${where(index)}`, context);
      return { id: `context-${index + 1}`, options: shuffle(options, random), answer };
    });
    return normalizeDropdownChoice({
      type: 'dropdownChoice',
      id,
      title: chrome.title ?? 'Choose the correct options.',
      instruction: chrome.instruction ?? 'Choose the correct option from each dropdown list.',
      text: String(text || '').replace(/\[\[(\d+)\]\]/g, '[[context-$1]]'),
      ...pick(chrome, ['accentColor']),
      choices: gaps,
    });
  },
  // Without explanations the key is the answers only.
  answerKey({ component, data, params, part }) {
    if (part === 'answers') {
      return { list: true, lines: component.choices.map((choice, index) => `${index + 1}. **${choice.answer}**`) };
    }
    if (!params.explanations) return null;
    return { list: true, lines: data.choices.map((choice, index) => `${index + 1}. ${String(choice.explanation).trim()}`) };
  },
  example({ params }) {
    const terms = EXAMPLE_TERMS;
    const choices = Array.from({ length: params.gaps }, (_, index) => ({
      options: Array.from({ length: params.options }, (__, offset) => terms[(index + offset) % terms.length]),
      answer: terms[index % terms.length],
      ...(params.explanations && { explanation: `Star Kid needs a ${terms[index % terms.length]}.` }),
    }));
    return {
      text: choices.map((_, index) => `Star Kid has got [[${index + 1}]].`).join(' '),
      choices,
    };
  },
};
