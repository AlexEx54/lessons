'use strict';

const { normalizeTaskPrompt } = require('../../assets/components/task-prompt.js');
const { requiredText } = require('./helpers.js');

// Follow-up questions after an activity, with possible language for the answer.

module.exports = {
  type: 'followUpQuestions',
  label: 'Вопросы после задания',
  chrome: ['title', 'supportTitle'],
  fields: ['questions', 'language'],
  schema: () => ({
    questions: { type: 'string', minLength: 1 },
    language: { type: 'string', minLength: 1 },
  }),
  defaultInstructions: '',
  build({ questions, language }, context) {
    const { id, chrome } = context;
    const prompt = {
      type: 'taskPrompt',
      id,
      variant: 'followUp',
      title: chrome.title ?? 'Follow-up questions:',
      text: requiredText(questions, 'вопросы', context),
      support: {
        title: chrome.supportTitle ?? 'Possible language:',
        text: requiredText(language, 'подсказки для ответа', context),
      },
    };
    normalizeTaskPrompt(prompt);
    return prompt;
  },
  example: () => ({
    questions: 'Which option did you like most? Why?',
    language: 'I would choose… because…',
  }),
};
