'use strict';

const { normalizeOddOneOut } = require('../../assets/components/odd-one-out.js');
const { countWord, cycle, exactList, integer, listSchema, plainTextRule } = require('./helpers.js');

const EXAMPLE_ROWS = Object.freeze([
  { options: ['fly', 'jump', 'run', 'strong'], answer: 'strong', explanation: 'It is an adjective; the other words can be verbs.' },
  { options: ['cape', 'car', 'mask', 'boots'], answer: 'car', explanation: 'It is a vehicle; the others can be worn.' },
  { options: ['robot', 'spider', 'bat', 'cat'], answer: 'robot', explanation: 'It is a machine; the others are animals.' },
  { options: ['head', 'arm', 'laser', 'leg'], answer: 'laser', explanation: 'It is not a body part; the others are body parts.' },
]);

module.exports = {
  type: 'oddOneOut',
  label: 'Find the Odd One Out',
  params: { rows: integer(2, 8, 4) },
  chrome: ['title', 'instruction'],
  fields: ['rows'],
  schema: ({ params }) => ({
    rows: listSchema(params.rows, {
      type: 'object',
      additionalProperties: false,
      required: ['options', 'answer', 'explanation'],
      properties: {
        options: listSchema(4),
        answer: { type: 'string', minLength: 1 },
        explanation: { type: 'string', minLength: 1 },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.rows)} ${f.rows}. Each row has exactly four different single English words or very short phrases known at the target CEFR level.`,
    'In each row, three words share one clear category and exactly one word does not belong. Avoid rows where another word could equally be the odd one out.',
    'answer must repeat the odd word exactly as written in options.',
    plainTextRule([f.rows]),
  ],
  defaultInstructions: [
    'Use a different kind of category in each row, for example part of speech, meaning group, function, or place. Keep the difficulty growing slightly from the first row to the last.',
    'Every word must be directly connected to the provided topic, so that the rows together introduce it.',
    'Place the odd word in a different position in different rows.',
    'explanation is for the teacher: one short English sentence that names why the odd word is different and what the other three have in common.',
  ].join('\n'),
  build({ rows }, context) {
    const { id, params, chrome } = context;
    exactList(rows, params.rows, 'строк', context);
    return normalizeOddOneOut({
      type: 'oddOneOut',
      id,
      title: chrome.title ?? 'Find the Odd One Out!',
      instruction: chrome.instruction ?? 'Look at the four words in each row. Find the odd word and explain your choice.',
      items: rows.map((row, index) => ({
        id: `row-${index + 1}`, options: row?.options, answer: row?.answer, explanation: row?.explanation,
      })),
    });
  },
  answerKey: ({ component }) => ({
    list: true,
    lines: component.items.map((item, index) => `${index + 1}. **${item.answer}** — ${item.explanation}`),
  }),
  example: ({ params }) => ({ rows: cycle(EXAMPLE_ROWS, params.rows) }),
};
