'use strict';

const { normalizeFillInBlanks } = require('../../assets/components/fill-in-blanks.js');
const {
  assertUnique, blockName, countWord, exactList, fail, integer, listSchema, oneLine, requiredText, vocabularyTerm,
} = require('./helpers.js');

// Sentences with one typed gap each: a vocabulary item in the form that fits the sentence.

module.exports = {
  type: 'fillInBlanks',
  label: 'Вписать слова в предложения',
  group: 'vocabulary',
  description: 'Вписать слова урока в предложения с пропусками.',
  params: { items: integer('Предложений', 3, 10, 6) },
  chrome: ['title', 'instruction'],
  fields: ['items'],
  // The field rule already speaks about vocabulary items, wherever they come from.
  inputs: { vocabulary: { type: 'vocabulary', required: true, sameStageRule: () => '' } },
  schema: ({ params }) => ({
    items: listSchema(params.items, {
      type: 'object',
      additionalProperties: false,
      required: ['targetTerm', 'before', 'answer', 'after'],
      properties: {
        targetTerm: { type: 'string', minLength: 1 },
        before: { type: 'string' },
        answer: { type: 'string', minLength: 1 },
        after: { type: 'string' },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.items)} ${f.items} sentences. Each targetTerm must exactly match a vocabulary item; answer may be its grammatically correct inflected form. Use ${countWord(params.items)} different target terms.`,
  ],
  defaultInstructions: '',
  build({ items }, context) {
    const { id, params, chrome, links } = context;
    const sentences = exactList(items, params.items, 'предложений', context).map((item, index) => {
      const before = oneLine(item?.before);
      const after = oneLine(item?.after);
      if (!before && !after) fail(`${blockName(context)}: вокруг пропуска ${index + 1} нет текста.`);
      return {
        targetTerm: vocabularyTerm(item?.targetTerm, links.vocabulary.value, 'targetTerm', context),
        before,
        answer: requiredText(oneLine(item?.answer), `ответ в предложении ${index + 1}`, context),
        after,
      };
    });
    assertUnique(sentences.map(item => item.targetTerm), 'слова в предложениях', context);
    const task = {
      type: 'fillInBlanks',
      id,
      title: chrome.title ?? 'Fill in the Blanks',
      instruction: chrome.instruction ?? 'Use the words and phrases in the box to complete the sentences.',
      items: sentences.map(({ before, answer, after }, index) => ({ id: `item-${index + 1}`, before, answer, after })),
    };
    // Validation only: the stored task keeps its authored shape.
    normalizeFillInBlanks(task);
    return task;
  },
  example: ({ params, links }) => ({
    items: links.vocabulary.value.slice(0, params.items).map(({ term }) => ({
      targetTerm: term, before: 'Star Kid has got', answer: term, after: 'today.',
    })),
  }),
};
