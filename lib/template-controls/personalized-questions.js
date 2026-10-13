'use strict';

const { normalizePersonalizedQuestions } = require('../../assets/components/personalized-questions.js');
const { countWord, exactList, integer, listSchema } = require('./helpers.js');

// Questions about the student's own life, optionally built around the lesson words.

const HIGHLIGHT_RULE = 'Each question contains at least one vocabulary item in **bold**.';

module.exports = {
  type: 'personalizedQuestions',
  label: 'Личные вопросы',
  params: { items: integer(2, 8, 4) },
  chrome: ['title', 'instruction'],
  fields: ['questions'],
  inputs: { highlight: { type: 'vocabulary', sameStageRule: () => HIGHLIGHT_RULE } },
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
  rules: ({ params, links, f }) => [
    `${f.questions}: exactly ${countWord(params.items)} questions. followUp is a short extra question.`,
    links.highlight && !links.highlight.sameStage ? HIGHLIGHT_RULE : '',
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
  example: ({ params, links }) => ({
    questions: Array.from({ length: params.items }, (_, index) => {
      const terms = links.highlight?.value.map(item => item.term) || ['superhero'];
      const term = links.highlight ? `**${terms[index % terms.length]}**` : terms[0];
      return { question: `Would your superhero have ${term}?`, followUp: 'Why or why not?' };
    }),
  }),
};
