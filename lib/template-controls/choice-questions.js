'use strict';

const { normalizeCheckboxChoice } = require('../../assets/components/checkbox-choice.js');
const { normalizeMultipleChoice } = require('../../assets/components/multiple-choice.js');
const {
  assertUnique, blockName, countWord, cycle, exactList, fail, flag, integer, listSchema, pick, requiredText, shuffle,
} = require('./helpers.js');

// Questions with lettered options: about a text, an audio or the words of the lesson —
// the instructions say which. With `maxAnswers` above one a question may have several
// correct options and the task becomes a checkbox choice.

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
  description: 'Вопросы с вариантами ответа: к тексту, аудио или словам урока.',
  params: {
    questions: integer('Вопросов', 1, 12, 5),
    options: integer('Вариантов в вопросе', 2, 4, 3),
    maxAnswers: integer('Верных ответов в вопросе, до', 1, 3, 1, { atMost: 'options' }),
    explanations: flag('Пояснения к ответам', true),
  },
  // The compact look, without letters, exists for one answer per question only.
  chrome: ['title', 'instruction', 'variant'],
  fields: ['questions'],
  schema: ({ params }) => {
    const answer = params.maxAnswers === 1
      ? { answer: { type: 'string', minLength: 1 } }
      : { answers: { type: 'array', minItems: 1, maxItems: params.maxAnswers, items: { type: 'string', minLength: 1 } } };
    const properties = {
      question: { type: 'string', minLength: 1 },
      options: listSchema(params.options),
      ...answer,
      ...(params.explanations && { explanation: { type: 'string', minLength: 1 } }),
    };
    return {
      questions: listSchema(params.questions, {
        type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
      }),
    };
  },
  rules: ({ params, f }) => [
    `${f.questions}: exactly ${countWord(params.questions)} ${params.questions === 1 ? 'question' : 'questions'}.`,
    `Every question in ${f.questions} must have exactly ${countWord(params.options)} distinct plain-text options, ${
      params.maxAnswers === 1 ? 'one answer' : `one to ${countWord(params.maxAnswers)} answers`} copied exactly from its options${
      params.explanations ? ', and a short useful explanation' : ''}.`,
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
      // A checkbox choice shows no explanation; the answer key does.
      const explanation = params.explanations ? requiredText(item?.explanation, `объяснение в ${where}`, context) : '';
      if (multiple) return { ...question, answers };
      return { ...question, answer: answers[0], ...(explanation && { explanation }) };
    });
    const task = {
      type: multiple ? 'checkboxChoice' : 'multipleChoice',
      id,
      title: chrome.title ?? 'Choose the correct answer',
      instruction: chrome.instruction ?? 'Choose the correct options.',
      ...(multiple ? {} : pick(chrome, ['variant'])),
      items,
    };
    // Validation only: the stored task keeps its authored shape.
    (multiple ? normalizeCheckboxChoice : normalizeMultipleChoice)(task);
    return task;
  },
  // "B — because…" for one question, "1B — …", "2A, C — …" for several; without
  // explanations just the letters.
  answerKey: ({ component, data, params }) => ({
    list: false,
    lines: component.items.map((item, index) => {
      const answers = item.answers ?? [item.answer];
      const number = component.items.length > 1 ? `${index + 1}` : '';
      const line = `${number}${letters(answers.map(answer => item.options.indexOf(answer)))}`;
      return params.explanations ? `${line} — ${String(data.questions[index].explanation).trim()}` : line;
    }),
  }),
  example: ({ params }) => ({
    questions: cycle(EXAMPLE_QUESTIONS, params.questions).map(({ question, options }) => {
      const used = options.slice(0, params.options);
      return {
        question,
        options: used,
        ...(params.maxAnswers === 1 ? { answer: used[0] } : { answers: used.slice(0, Math.min(params.maxAnswers, used.length - 1)) }),
        ...(params.explanations && { explanation: 'The text says so in the first paragraph.' }),
      };
    }),
  }),
};
