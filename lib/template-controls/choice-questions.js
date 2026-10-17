'use strict';

const { normalizeCheckboxChoice } = require('../../assets/components/checkbox-choice.js');
const { normalizeMultipleChoice } = require('../../assets/components/multiple-choice.js');
const {
  assertUnique, blockName, countWord, cycle, exactList, fail, integer, listSchema, requiredText, shuffle,
} = require('./helpers.js');

// Comprehension questions with lettered options. With `maxAnswers` above one a question
// may have several correct options and the task becomes a checkbox choice.

const EXAMPLE_QUESTIONS = Object.freeze([
  { question: 'What is the text mainly about?', options: ['A school trip', 'A new phone', 'A football match', 'A birthday'] },
  { question: 'Where does the story happen?', options: ['At school', 'At home', 'In a shop', 'On a bus'] },
  { question: 'Who helps the main character?', options: ['A friend', 'A teacher', 'A parent', 'A neighbour'] },
]);

const letters = indexes => indexes.sort((a, b) => a - b).map(index => String.fromCharCode(65 + index)).join(', ');

module.exports = {
  type: 'choiceQuestions',
  label: 'Вопросы с вариантами',
  group: 'comprehension',
  description: 'Вопросы с вариантами ответа к тексту или аудио.',
  params: {
    questions: integer('Вопросов', 1, 10, 5),
    options: integer('Вариантов в вопросе', 2, 4, 3),
    maxAnswers: integer('Верных ответов в вопросе, до', 1, 3, 1, { atMost: 'options' }),
  },
  chrome: ['title', 'instruction'],
  fields: ['questions'],
  schema: ({ params }) => {
    const answer = params.maxAnswers === 1
      ? { answer: { type: 'string', minLength: 1 } }
      : { answers: { type: 'array', minItems: 1, maxItems: params.maxAnswers, items: { type: 'string', minLength: 1 } } };
    const properties = {
      question: { type: 'string', minLength: 1 },
      options: listSchema(params.options),
      ...answer,
      explanation: { type: 'string', minLength: 1 },
    };
    return {
      questions: listSchema(params.questions, {
        type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
      }),
    };
  },
  rules: ({ params, f }) => [
    `${f.questions}: exactly ${countWord(params.questions)} ${params.questions === 1 ? 'question' : 'questions'}.`,
    params.maxAnswers === 1
      ? `Every question in ${f.questions} must have exactly ${countWord(params.options)} distinct plain-text options, one answer copied exactly from its options, and a short useful explanation.`
      : `Every question in ${f.questions} must have exactly ${countWord(params.options)} distinct plain-text options, one to ${countWord(params.maxAnswers)} answers copied exactly from its options, and a short useful explanation.`,
  ],
  defaultInstructions: '',
  build({ questions }, context) {
    const { id, params, chrome, random } = context;
    const multiple = params.maxAnswers > 1;
    const items = exactList(questions, params.questions, 'вопросов', context).map((item, index) => {
      const where = `вопросе ${index + 1}`;
      const options = assertUnique(
        exactList(item?.options, params.options, `вариантов в ${where}`, context)
          .map(option => requiredText(option, `вариант в ${where}`, context)),
        `варианты в ${where}`, context,
      );
      const answers = (multiple ? (Array.isArray(item?.answers) ? item.answers : []) : [item?.answer])
        .map(answer => requiredText(answer, `ответ в ${where}`, context));
      if (answers.length === 0 || answers.length > params.maxAnswers || answers.some(answer => !options.includes(answer))) {
        fail(`${blockName(context)}: ответ в ${where} должен точно совпадать с вариантом.`);
      }
      const question = {
        id: `question-${index + 1}`,
        question: requiredText(item?.question, `текст в ${where}`, context),
        options: shuffle(options, random),
      };
      const explanation = requiredText(item?.explanation, `объяснение в ${where}`, context);
      return multiple ? { ...question, answers } : { ...question, answer: answers[0], explanation };
    });
    const task = {
      type: multiple ? 'checkboxChoice' : 'multipleChoice',
      id,
      title: chrome.title ?? 'Choose the correct answer',
      instruction: chrome.instruction ?? 'Choose the correct options.',
      items,
    };
    // Validation only: the stored task keeps its authored shape.
    (multiple ? normalizeCheckboxChoice : normalizeMultipleChoice)(task);
    return task;
  },
  // "B — because…" for one question, "1B — …", "2A, C — …" for several.
  answerKey: ({ component, data }) => ({
    list: false,
    lines: component.items.map((item, index) => {
      const answers = item.answers ?? [item.answer];
      const explanation = String(data.questions[index].explanation).trim();
      const number = component.items.length > 1 ? `${index + 1}` : '';
      return `${number}${letters(answers.map(answer => item.options.indexOf(answer)))} — ${explanation}`;
    }),
  }),
  example: ({ params }) => ({
    questions: cycle(EXAMPLE_QUESTIONS, params.questions).map(({ question, options }) => {
      const used = options.slice(0, params.options);
      return {
        question,
        options: used,
        ...(params.maxAnswers === 1 ? { answer: used[0] } : { answers: used.slice(0, Math.min(params.maxAnswers, used.length - 1)) }),
        explanation: 'The text says so in the first paragraph.',
      };
    }),
  }),
};
