'use strict';

const { normalizeThreeTwoOne } = require('../../assets/components/three-two-one.js');
const { blockName, countWord, cycle, exactList, fail, integer, listSchema, requiredText } = require('./helpers.js');

// The 3–2–1 lesson review: recall three things, make two sentences, answer one question.

const CYRILLIC = /[Ѐ-ӿ]/u;
const EXAMPLE_CUES = Object.freeze(['Say what your superhero has got.', 'Say what your superhero hasn’t got.', 'Ask a friend about their superhero.']);

function assertEnglish(value, context) {
  if (typeof value === 'string' && CYRILLIC.test(value)) fail(`${blockName(context)}: нужен текст только на английском.`);
  if (Array.isArray(value)) value.forEach(item => assertEnglish(item, context));
}

module.exports = {
  type: 'threeTwoOne',
  label: '3–2–1',
  group: 'speaking',
  description: 'Итог урока: три слова, два предложения, один вопрос.',
  params: { twoCues: integer('Подсказок для шага «2»', 1, 4, 2) },
  chrome: ['oneLabel'],
  fields: ['threePrompt', 'twoPrompt', 'twoCues', 'onePrompt'],
  schema: ({ params }) => ({
    threePrompt: { type: 'string', minLength: 1 },
    twoPrompt: { type: 'string', minLength: 1 },
    twoCues: listSchema(params.twoCues),
    onePrompt: { type: 'string', minLength: 1 },
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.twoCues)} ${f.twoCues}.`,
    'Do not use HTML. Use Markdown only when natural emphasis is useful inside prompts or cues.',
  ],
  defaultInstructions: [
    'The threePrompt asks the learner to recall three words or phrases from the lesson.',
    'The twoPrompt asks for two topic-related sentences with the target grammar; each of the twoCues gives a different idea for one sentence.',
    'The onePrompt is one practical can-do question about the lesson topic.',
  ].join('\n'),
  build(data, context) {
    const { id, params, chrome } = context;
    Object.values(data).forEach(value => assertEnglish(value, context));
    const cues = exactList(data.twoCues, params.twoCues, 'подсказок для шага two', context)
      .map((cue, index) => requiredText(cue, `подсказку ${index + 1}`, context));
    const task = {
      type: 'threeTwoOne',
      id,
      steps: {
        three: { prompt: requiredText(data.threePrompt, 'задание шага three', context) },
        two: {
          prompt: requiredText(data.twoPrompt, 'задание шага two', context),
          text: cues.map((cue, index) => `${index + 1}. ${cue}`).join('\n'),
        },
        one: {
          label: chrome.oneLabel ?? 'Can-do question',
          prompt: requiredText(data.onePrompt, 'задание шага one', context),
        },
      },
    };
    normalizeThreeTwoOne(task);
    return task;
  },
  example: ({ params }) => ({
    threePrompt: 'Name three words or phrases you remember from the lesson.',
    twoPrompt: 'Create two sentences with the target grammar.',
    twoCues: cycle(EXAMPLE_CUES, params.twoCues),
    onePrompt: 'Can you describe your own superhero in three sentences?',
  }),
};
