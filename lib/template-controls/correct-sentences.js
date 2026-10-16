'use strict';

const { normalizeCheckboxChoice } = require('../../assets/components/checkbox-choice.js');
const {
  assertUnique, blockName, countWord, cycle, exactList, fail, integer, listSchema, requiredText, shuffle,
} = require('./helpers.js');

// "Tick the correct sentences": a mix of correct sentences and sentences with a grammar error.

const EXAMPLE_ITEMS = Object.freeze([
  { sentence: 'Flash Kid has got curly hair.', isCorrect: true, explanation: '' },
  { sentence: 'Moon Girl have got a silver mask.', isCorrect: false, explanation: 'With she, use has got: Moon Girl has got a silver mask.' },
  { sentence: 'Have you got a superhero suit?', isCorrect: true, explanation: '' },
  { sentence: 'Fire Boy hasn’t got a cape.', isCorrect: true, explanation: '' },
  { sentence: 'They has got gloves.', isCorrect: false, explanation: 'With they, use have got: They have got gloves.' },
  { sentence: 'Has she got pointed ears?', isCorrect: true, explanation: '' },
  { sentence: 'I hasn’t got a belt.', isCorrect: false, explanation: 'With I, use haven’t got: I haven’t got a belt.' },
  { sentence: 'Do he has got boots?', isCorrect: false, explanation: 'Questions start with Has: Has he got boots?' },
  { sentence: 'She have got a dog.', isCorrect: false, explanation: 'With she, use has got: She has got a dog.' },
  { sentence: 'We hasn’t got capes.', isCorrect: false, explanation: 'With we, use haven’t got: We haven’t got capes.' },
  { sentence: 'Has they got masks?', isCorrect: false, explanation: 'With they, use have: Have they got masks?' },
]);

const sameText = text => text.trim().replace(/\s+/g, ' ');

module.exports = {
  type: 'correctSentences',
  label: 'Выбрать верные предложения',
  params: {
    sentences: integer('Предложений', 4, 8, 8),
    correct: integer('Верных предложений', 1, 4, 4, { atMost: 'sentences' }),
  },
  chrome: ['title', 'instruction', 'question'],
  fields: ['items'],
  answerKeyParts: ['answers', 'explanations'],
  schema: ({ params }) => ({
    items: listSchema(params.sentences, {
      type: 'object',
      additionalProperties: false,
      required: ['sentence', 'isCorrect', 'explanation'],
      properties: {
        sentence: { type: 'string', minLength: 1 },
        isCorrect: { type: 'boolean' },
        explanation: { type: 'string' },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.sentences)} ${f.items} with sentence, isCorrect (boolean), and explanation. Exactly ${countWord(params.correct)} sentences must be grammatically correct and ${countWord(params.sentences - params.correct)} incorrect.`,
    'Each incorrect sentence must contain a clear error in the target grammar. Its explanation must explain the error and give the corrected sentence. Leave explanation empty for correct sentences.',
    `Do not use Markdown, HTML, or [[gap]] markers in ${f.items}.`,
  ],
  defaultInstructions: '',
  build({ items }, context) {
    const { id, params, chrome, random } = context;
    exactList(items, params.sentences, 'предложений', context);
    const sentences = assertUnique(items.map((item, index) => requiredText(item?.sentence, `предложение ${index + 1}`, context)), 'предложения', context);
    const checks = items.map((item, index) => {
      if (typeof item.isCorrect !== 'boolean') fail(`${blockName(context)}: isCorrect должен быть true или false.`);
      return {
        sentence: sentences[index],
        isCorrect: item.isCorrect,
        explanation: item.isCorrect ? '' : requiredText(item.explanation, `объяснение ${index + 1}`, context),
      };
    });
    const shuffled = shuffle(checks, random);
    const task = normalizeCheckboxChoice({
      type: 'checkboxChoice',
      id,
      title: chrome.title ?? 'Tick the sentences that are correct.',
      instruction: chrome.instruction ?? 'Read the sentences and tick the grammatically correct ones.',
      items: [{
        id: 'correct-sentences',
        question: chrome.question ?? 'Which sentences are grammatically correct?',
        options: shuffled.map(item => item.sentence),
        answers: shuffled.filter(item => item.isCorrect).map(item => item.sentence),
      }],
    });
    if (task.items[0].answers.length !== params.correct) {
      fail(`${blockName(context)}: должно быть ${params.correct} правильных предложений из ${params.sentences}.`);
    }
    return task;
  },
  answerKey({ component, data, part }) {
    const { options, answers } = component.items[0];
    if (part === 'answers') {
      const numbers = options.flatMap((text, index) => (answers.includes(text) ? [index + 1] : []));
      return { list: false, lines: [`Correct sentences: ${numbers.join(', ')}.`] };
    }
    // Explanations quote their sentences, so they stay right after the teacher reorders the task.
    const explanations = new Map(data.items.map(item => [sameText(item.sentence), String(item.explanation).trim()]));
    return {
      list: true,
      lines: options.filter(text => !answers.includes(text)).map(text => `- *${text}* — ${explanations.get(sameText(text))}`),
    };
  },
  example: ({ params }) => {
    const correct = EXAMPLE_ITEMS.filter(item => item.isCorrect);
    const wrong = EXAMPLE_ITEMS.filter(item => !item.isCorrect);
    return {
      items: [...cycle(correct, params.correct), ...cycle(wrong, params.sentences - params.correct)],
    };
  },
};
