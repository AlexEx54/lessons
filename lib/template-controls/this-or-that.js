'use strict';

const { normalizeThisOrThat } = require('../../assets/components/this-or-that.js');
const { countWord, cycle, exactList, integer, listSchema } = require('./helpers.js');

// Pairs of pictures: the student picks one option in each pair and explains why.

const EXAMPLE_PAIRS = Object.freeze([
  ['beach', 'mountains'],
  ['pizza', 'burger'],
  ['cats', 'dogs'],
  ['books', 'films'],
  ['summer', 'winter'],
  ['bus', 'bike'],
]);

const OPTION_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['caption', 'imagePrompt'],
  properties: {
    caption: { type: 'string', minLength: 1 },
    imagePrompt: { type: 'string', minLength: 1 },
  },
});

module.exports = {
  type: 'thisOrThat',
  label: 'This or That',
  group: 'speaking',
  description: 'Выбрать одно из двух и объяснить почему. С картинками.',
  params: { pairs: integer('Пар', 2, 8, 4) },
  fields: ['choices'],
  schema: ({ params }) => ({
    choices: listSchema(params.pairs, {
      type: 'object',
      additionalProperties: false,
      required: ['options'],
      properties: { options: listSchema(2, OPTION_SCHEMA) },
    }),
  }),
  // Only what the block cannot be built without; what the pairs are about is in the
  // instructions, so the same block serves a topic warm-up or a vocabulary drill.
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.pairs)} This or That pairs in ${f.choices}: in each pair the learner picks one of exactly two options.`,
    'Every imagePrompt must be in English and describe a modern square educational illustration suitable for teenagers, with no text. Avoid childish or preschool aesthetics.',
  ],
  defaultInstructions: [
    'Make the two options in each pair clearly contrasting and engaging: things the learner can easily have an opinion about.',
    'Connect every pair to the topic of the stage.',
    'Write each caption in natural English at the target CEFR level.',
  ].join('\n'),
  build({ choices }, context) {
    const { id, params } = context;
    const component = {
      type: 'thisOrThat',
      id,
      items: exactList(choices, params.pairs, 'пар', context).map((item, itemIndex) => ({
        id: `choice-${itemIndex + 1}`,
        options: (Array.isArray(item?.options) ? item.options : []).map((option, optionIndex) => ({
          id: `choice-${itemIndex + 1}-${optionIndex === 0 ? 'a' : 'b'}`,
          caption: String(option?.caption || '').trim(),
          imagePrompt: String(option?.imagePrompt || '').trim(),
        })),
      })),
    };
    // Validation only: the stored component keeps its authored shape.
    normalizeThisOrThat(component);
    return component;
  },
  example: ({ params }) => ({
    choices: cycle(EXAMPLE_PAIRS, params.pairs).map(pair => ({
      options: pair.map(caption => ({ caption, imagePrompt: `Square educational illustration of ${caption}, no text.` })),
    })),
  }),
};
