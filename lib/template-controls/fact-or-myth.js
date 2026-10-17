'use strict';

const { normalizeFactOrMyth } = require('../../assets/components/fact-or-myth.js');
const { countWord, cycle, exactList, integer, listSchema, plainTextRule } = require('./helpers.js');

// Statements to check now and statements to guess; the guesses are checked later in the
// lesson, so they go out as a `statements` variable numbered as they appear in the task.

const EXAMPLE_CHECKS = Object.freeze([
  { text: 'Batman has got a black cape and a black mask.', answer: 'fact', explanation: 'He has got a black cape and mask.' },
  { text: 'All superheroes have got a cape.', answer: 'myth', explanation: 'Spider-Man and Iron Man have not got a cape.' },
  { text: 'The Hulk has got a cool superhero suit and boots.', answer: 'myth', explanation: 'He has not got a suit or boots. He has got purple shorts and green skin.' },
]);
const EXAMPLE_GUESSES = Object.freeze([
  'Somebody in our stories has got green hair.',
  'Somebody in our stories has got a purple jacket.',
]);

module.exports = {
  type: 'factOrMyth',
  label: 'Fact or Myth',
  group: 'comprehension',
  description: 'Утверждения по теме: решить, факт это или миф.',
  params: {
    checkStatements: integer('Утверждений для проверки', 1, 6, 3),
    guessStatements: integer('Догадок для историй', 1, 4, 2),
  },
  chrome: ['title', 'instruction', 'guessNote'],
  fields: ['checkStatements', 'guessStatements'],
  outputs: {
    guessStatements: { type: 'statements', field: 'guessStatements', size: params => params.guessStatements },
  },
  schema: ({ params }) => ({
    checkStatements: listSchema(params.checkStatements, {
      type: 'object',
      additionalProperties: false,
      required: ['text', 'answer', 'explanation'],
      properties: {
        text: { type: 'string', minLength: 1 },
        answer: { type: 'string', enum: ['fact', 'myth'] },
        explanation: { type: 'string', minLength: 1 },
      },
    }),
    guessStatements: listSchema(params.guessStatements),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.checkStatements)} ${f.checkStatements} and exactly ${countWord(params.guessStatements)} ${f.guessStatements}.`,
    'explanation is for the teacher: one short sentence that proves the answer.',
    plainTextRule([f.checkStatements, f.guessStatements]),
  ],
  defaultInstructions: [
    'checkStatements: statements about the lesson topic in general that the student can judge from everyday knowledge and explain. Include at least one fact and at least one myth. Use only common, uncontroversial knowledge.',
    'guessStatements: statements the student cannot know yet and must guess; the lesson answers them later.',
  ].join('\n'),
  build({ checkStatements, guessStatements }, context) {
    const { id, params, chrome } = context;
    exactList(checkStatements, params.checkStatements, 'утверждений на проверку', context);
    exactList(guessStatements, params.guessStatements, 'утверждений на догадку', context);
    const guessNote = chrome.guessNote ?? 'Students guess now and check later in the stories.';
    return normalizeFactOrMyth({
      type: 'factOrMyth',
      id,
      title: chrome.title ?? 'Read the sentences. Is it a FACT or MYTH?',
      instruction: chrome.instruction ?? 'Choose Fact or Myth for each sentence.',
      items: [
        ...checkStatements.map(item => ({ text: item?.text, mode: 'check', answer: item?.answer, explanation: item?.explanation })),
        ...guessStatements.map(text => ({ text, mode: 'guess', answer: null, explanation: guessNote })),
      ].map((item, index) => ({ id: `statement-${index + 1}`, ...item })),
    });
  },
  exports: component => ({
    guessStatements: component.items
      .map((item, index) => ({ number: index + 1, text: item.text, mode: item.mode }))
      .filter(item => item.mode === 'guess')
      .map(({ number, text }) => ({ number, text })),
  }),
  answerKey: ({ component }) => ({
    list: true,
    lines: component.items.map((item, index) => (
      `${index + 1}. **${item.mode === 'guess' ? 'GUESS 🤷' : item.answer.toUpperCase()}** — ${item.explanation}`
    )),
  }),
  example: ({ params }) => ({
    checkStatements: cycle(EXAMPLE_CHECKS, params.checkStatements),
    guessStatements: cycle(EXAMPLE_GUESSES, params.guessStatements),
  }),
};
