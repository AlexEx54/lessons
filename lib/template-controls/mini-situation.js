'use strict';

const { normalizeMiniSituation } = require('../../assets/components/mini-situation.js');
const { blockName, countWord, integer, requiredText } = require('./helpers.js');

// Free writing practice: a situation with a picture; the student writes a few sentences
// and the teacher checks them.

const WITHOUT_TEXT = /\b(?:no|without)\s+(?:visible\s+)?text\b/i;

module.exports = {
  type: 'miniSituation',
  label: 'Mini Situation',
  params: {
    minSentences: integer(3, 8, 3),
    maxSentences: integer(3, 8, 5),
  },
  chrome: ['title', 'instruction', 'backgroundColor'],
  fields: ['situation'],
  schema: () => ({
    situation: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt', 'imagePrompt'],
      properties: {
        prompt: { type: 'string', minLength: 1 },
        imagePrompt: { type: 'string', minLength: 1 },
      },
    },
  }),
  rules: ({ params, f }) => [
    `Create a topic-related ${f.situation} prompt that elicits ${countWord(params.minSentences)} to ${countWord(params.maxSentences)} uses of the target grammar and an English modern educational imagePrompt suitable for teenagers that explicitly requires no text and avoids childish or preschool aesthetics.`,
  ],
  defaultInstructions: '',
  build({ situation }, context) {
    const { id, params, chrome } = context;
    const imagePrompt = requiredText(situation?.imagePrompt, 'картинка ситуации', context);
    if (!WITHOUT_TEXT.test(imagePrompt)) console.warn(`${blockName(context)}: картинка не требует явно иллюстрацию без текста.`);
    const task = {
      type: 'miniSituation',
      id,
      title: chrome.title ?? 'Free Practice — Mini Situation',
      instruction: chrome.instruction ?? `Read the situation and write ${params.minSentences}–${params.maxSentences} sentences. Your answer will be checked by the teacher.`,
      sentenceCount: params.maxSentences,
      situation: {
        type: 'illustratedTextPanel',
        id: `${id}-prompt`,
        text: requiredText(situation?.prompt, 'ситуация', context),
        backgroundColor: chrome.backgroundColor ?? '#F4F0FF',
        leadingPicture: { imagePrompt },
      },
    };
    // Validation only: the stored task keeps its authored shape.
    normalizeMiniSituation(task);
    return task;
  },
  example: () => ({
    situation: {
      prompt: 'Your friend missed the school trip. Write a message and tell them what happened.',
      imagePrompt: 'Students on a school trip in a museum, modern educational illustration, no text.',
    },
  }),
};
