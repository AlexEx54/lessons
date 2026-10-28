'use strict';

const { normalizeMatchWords } = require('../../assets/components/match-words.js');
const { assertUnique, countWord, cycle, exactList, integer, listSchema, requiredText } = require('./helpers.js');

// Match words with their pictures. Where the words come from — the lesson vocabulary,
// the topic of the stage or a list given by the teacher — is in the instructions.

const EXAMPLE_TERMS = Object.freeze([
  'umbrella', 'bicycle', 'lighthouse', 'backpack', 'guitar', 'telescope',
  'sunflower', 'camera', 'ladder', 'kite', 'compass', 'tent',
]);

module.exports = {
  type: 'matchPictures',
  label: 'Слова и картинки',
  group: 'vocabulary',
  description: 'Сопоставить слова с картинками. Какие слова взять, говорят указания блока.',
  params: { items: integer('Слов', 4, 12, 8) },
  chrome: ['title', 'instruction'],
  fields: ['items'],
  schema: ({ params }) => ({
    items: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['term', 'imagePrompt'],
      properties: {
        term: { type: 'string', minLength: 1 },
        imagePrompt: { type: 'string', minLength: 1 },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `${f.items}: exactly ${countWord(params.items)} items for a word-to-picture matching task. term is the word or short phrase the learner sees; imagePrompt describes the picture that shows it.`,
    'Every imagePrompt must be in English and describe a modern square educational illustration suitable for teenagers, with no text. Avoid childish or preschool aesthetics.',
  ],
  defaultInstructions: [
    'Choose useful words or short phrases connected to the topic of the stage.',
    'The pictures appear together, so each one must make its term recognizable and clearly distinguishable from every other term in the set.',
    'Plan all image concepts together before writing the final prompts. Give each term a distinct visual scene with a clear identifying cue. Compare each scene against all other terms: if another term would be an equally reasonable answer, redesign the scene.',
    'Avoid similar scenes for different terms, such as multiple students sitting at desks or multiple calendars. Prefer concrete actions, objects, and observable contrasts over facial expressions, mood, or generic topic-related settings.',
    'Do not rely on invisible properties or intentions, such as a phone being silent, a goal being realistic, or a student feeling motivated. Show the action or contrast that makes the meaning visible.',
    'For abstract terms, use a simple two-panel scene if needed to show repetition, a change, or a contrast. Specify what appears in each panel.',
    'Write each imagePrompt as a self-contained drawing instruction. Describe the main subject, exact action, and identifying visual cue first, then style and background. Do not merely ask the generator to illustrate the term: describe exactly what the viewer should see.',
    'Make the identifying cue large and prominent enough to recognize in a small thumbnail. Use a simple composition with only necessary details. Avoid decorative clutter and do not rely on readable words, labels, numbers, or sentences.',
    'Use a consistent modern educational illustration style across the set. Before returning the result, mentally match each proposed image against the full list of terms without its intended label. Revise any scene that lacks a visible identifying cue or fits multiple terms.',
  ].join('\n'),
  build({ items }, context) {
    const { id, params, chrome } = context;
    const pictures = exactList(items, params.items, 'слов', context).map((item, index) => ({
      id: `item-${index + 1}`,
      term: requiredText(item?.term, 'слово', context),
      imagePrompt: requiredText(item?.imagePrompt, `картинка слова ${item?.term}`, context),
    }));
    // Two equal words would leave the learner guessing which picture is meant.
    assertUnique(pictures.map(item => item.term), 'слова', context);
    const task = {
      type: 'matchWords',
      id,
      title: chrome.title ?? 'Match the Words',
      instruction: chrome.instruction ?? 'Match the words with the pictures.',
      items: pictures,
    };
    // Validation only: the stored task keeps its authored shape.
    normalizeMatchWords(task);
    return task;
  },
  example: ({ params }) => ({
    items: cycle(EXAMPLE_TERMS, params.items).map(term => ({
      term, imagePrompt: `Square educational illustration of a ${term}, no text.`,
    })),
  }),
};
