'use strict';

const { normalizePersonalizedQuestions } = require('../../assets/components/personalized-questions.js');
const { countWord, cycle, exactList, integer, listSchema } = require('./helpers.js');

// Questions about the student's own life. Whether they use the lesson words, react to a
// text of the stage or ask for an opinion is in the instructions.

const EXAMPLE_QUESTIONS = Object.freeze([
  { question: 'What do you usually do after school?', followUp: 'Who do you do it with?' },
  { question: 'Which place in your town do you like most?', followUp: 'Why do you like it?' },
  { question: 'What is the best present you have ever got?', followUp: 'Who gave it to you?' },
  { question: 'What would you like to learn next year?', followUp: 'Why is it important to you?' },
  { question: 'How do you spend a perfect weekend?', followUp: 'What do you never do at the weekend?' },
  { question: 'Which app do you use every day?', followUp: 'What do you use it for?' },
  { question: 'What was your favourite toy when you were little?', followUp: 'Do you still have it?' },
  { question: 'Where would you like to travel?', followUp: 'What would you do there?' },
]);

module.exports = {
  type: 'personalizedQuestions',
  label: 'Личные вопросы',
  group: 'speaking',
  description: 'Вопросы о жизни ученика. Нужны ли в них слова урока, говорят указания.',
  params: { items: integer('Вопросов', 2, 8, 4) },
  chrome: ['title', 'instruction'],
  fields: ['questions'],
  schema: ({ params }) => ({
    questions: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['question', 'followUp'],
      properties: {
        question: { type: 'string', minLength: 1 },
        followUp: { type: 'string', minLength: 1 },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `${f.questions}: exactly ${countWord(params.items)} questions. followUp is a short extra question.`,
  ],
  defaultInstructions: 'Questions about the student’s own life and experience.',
  build({ questions }, context) {
    const { id, params, chrome } = context;
    exactList(questions, params.items, 'вопросов', context);
    return normalizePersonalizedQuestions({
      type: 'personalizedQuestions',
      id,
      title: chrome.title ?? 'Personalised Questions',
      instruction: chrome.instruction ?? 'Answer the questions out loud. There are no right or wrong answers!',
      items: questions.map(({ question, followUp }, index) => ({ id: `question-${index + 1}`, question, followUp })),
    });
  },
  example: ({ params }) => ({ questions: cycle(EXAMPLE_QUESTIONS, params.items) }),
};
