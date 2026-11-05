'use strict';

const { normalizeDragWordsInText } = require('../../assets/components/drag-words-in-text.js');
const { assertUnique, countWord, cycle, exactList, integer, listSchema, requiredText } = require('./helpers.js');

// Sentences with one gap each; the missing words, with optional distractors, form the word
// bank. What the sentences are about — the lesson vocabulary, a grammar rule, the topic of
// the stage — is in the instructions.

const EXAMPLE_SENTENCES = Object.freeze([
  'I always take an [[umbrella]] when it rains.',
  'Mia rides her [[bicycle]] to school.',
  'Leo put his books in his [[backpack]].',
  'My brother plays the [[guitar]] in a band.',
  'We looked at the Moon through a [[telescope]].',
  'Dad took a photo with his new [[camera]].',
  'She climbed the [[ladder]] to reach the roof.',
  'The children flew a [[kite]] on the beach.',
]);
const EXAMPLE_DISTRACTORS = Object.freeze(['pillow', 'spoon', 'carpet']);

const gapsOf = text => [...text.matchAll(/\[\[(.+?)\]\]/g)].map(match => match[1]);

module.exports = {
  type: 'dragSentences',
  label: 'Перетащить слова в предложения',
  group: 'vocabulary',
  description: 'Перетащить слова в пропуски (можно с лишними). О чём предложения, говорят указания.',
  params: {
    sentences: integer('Предложений', 2, 8, 6),
    distractors: integer('Лишних вариантов', 0, 3, 0),
  },
  chrome: ['title', 'instruction'],
  fields: ['sentences', 'distractors'],
  schema: ({ params }) => ({
    sentences: listSchema(params.sentences),
    ...(params.distractors > 0 && { distractors: listSchema(params.distractors) }),
  }),
  rules: ({ params, f }) => [
    `${f.sentences}: exactly ${countWord(params.sentences)} short sentences, each with exactly one gap written as the missing word or short phrase in double square brackets, for example "I put on my [[sunglasses]]." Use ${countWord(params.sentences)} different answers, each in the form that fits the sentence. No Markdown or HTML.`,
    ...(params.distractors > 0 ? [
      `${f.distractors}: exactly ${countWord(params.distractors)} plausible but wrong words or short phrases for the word bank, different from each other and from every answer. No Markdown, HTML or square brackets.`,
    ] : []),
  ],
  defaultInstructions: 'Choose useful words or short phrases connected to the topic of the stage.',
  build({ sentences, distractors = [] }, context) {
    const { id, params, chrome } = context;
    exactList(sentences, params.sentences, 'предложений', context);
    const answers = assertUnique(sentences.flatMap(sentence => gapsOf(String(sentence))), 'слова в пропусках', context);
    const wrong = exactList(distractors, params.distractors, 'лишних вариантов', context)
      .map(value => requiredText(value, 'лишний вариант', context));
    assertUnique([...answers, ...wrong], 'слова в пропусках и лишние варианты', context);
    return normalizeDragWordsInText({
      type: 'dragWordsInText',
      id,
      title: chrome.title ?? 'Drag the correct words into the gaps.',
      instruction: chrome.instruction ?? 'Use each word once.',
      // Alphabetical order so the word bank does not follow the order of the sentences.
      words: [...answers, ...wrong].sort((a, b) => a.localeCompare(b)),
      // Every sentence is a paragraph of its own.
      text: sentences.join('\n\n'),
    });
  },
  answerKey: ({ component }) => ({
    list: false,
    lines: [`${gapsOf(component.text).map((answer, index) => `${index + 1} ${answer}`).join(', ')}.`],
  }),
  example: ({ params }) => ({
    sentences: cycle(EXAMPLE_SENTENCES, params.sentences),
    ...(params.distractors > 0 && { distractors: cycle(EXAMPLE_DISTRACTORS, params.distractors) }),
  }),
};
