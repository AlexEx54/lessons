'use strict';

const { itemFromText, normalizeSentenceBuilder } = require('../../assets/components/sentence-builder-model.js');
const {
  assertUnique, blockName, countWord, exactList, fail, flag, integer, listSchema, oneLine, requiredText, stripMarkdown,
  text, warnCyrillic,
} = require('./helpers.js');

// A sentence cut into word cards that the learner puts in order. [Brackets] keep a phrase
// on one card; other correct orders of the same cards are accepted too.

const MIN_CARDS = 3;
const MAX_CARDS = 10;
const MAX_OTHER_ORDERS = 3;

const EXAMPLE_ITEMS = Object.freeze([
  { sentence: 'You should [turn off] your phone in class.', otherOrders: [] },
  { sentence: 'Students shouldn’t [play games] during lessons.', otherOrders: [] },
  {
    sentence: 'You should take [your phone] and [your keys] with you.',
    otherOrders: ['You should take [your keys] and [your phone] with you.'],
  },
  { sentence: 'Should we [use our phones] for homework?', otherOrders: [] },
  { sentence: 'We shouldn’t [check messages] [every five minutes].', otherOrders: [] },
  { sentence: 'Teachers should [explain the rules] [at the start of the year].', otherOrders: [] },
  { sentence: 'You shouldn’t [take photos of] your classmates [without asking].', otherOrders: [] },
  { sentence: 'Should students [keep their phones] [in their bags]?', otherOrders: [] },
  { sentence: 'I think we should [talk to each other] at lunch.', otherOrders: [] },
  { sentence: 'You should [ask your teacher] [before you use] your phone.', otherOrders: [] },
  { sentence: 'Parents shouldn’t [call their children] during lessons.', otherOrders: [] },
  { sentence: 'We should [put our phones] [on silent] [before the test].', otherOrders: [] },
]);

// The game reports a broken sentence without saying which block or sentence it is.
function sentenceItem(lines, id, where, context) {
  try {
    return itemFromText(lines.join('\n'), id);
  } catch (error) {
    return fail(`${blockName(context)}: ${where}: ${error.message}`);
  }
}

// An order that does not use exactly the main sentence's cards would make the whole
// sentence unsolvable for the game, so it is dropped rather than failing the lesson.
function otherOrders(sentence, orders, where, context) {
  const kept = [];
  const written = (Array.isArray(orders) ? orders : []).map(order => oneLine(stripMarkdown(order, where, context)));
  for (const order of written.filter(Boolean)) {
    if (order === sentence || kept.includes(order)) continue;
    if (kept.length === MAX_OTHER_ORDERS) {
      console.warn(`${blockName(context)}: в ${where} больше ${MAX_OTHER_ORDERS} других порядков, лишние убраны.`);
      break;
    }
    try {
      itemFromText(`${sentence}\n${order}`, 'order-check');
      kept.push(order);
    } catch {
      console.warn(`${blockName(context)}: в ${where} другой порядок не из тех же карточек, убран: ${order}`);
    }
  }
  return kept;
}

module.exports = {
  type: 'sentenceBuilder',
  label: 'Собрать предложение',
  group: 'grammar',
  description: 'Собрать предложение из перемешанных карточек со словами. Ответы проверяет сама игра.',
  params: {
    sentences: integer('Предложений', 2, 12, 6),
    hints: flag('Подсказки', true),
    completionText: text('Поздравление в конце', 'Purr-fect! Well done!'),
  },
  chrome: ['title', 'instruction'],
  fields: ['items'],
  schema: ({ params }) => ({
    items: listSchema(params.sentences, {
      type: 'object',
      additionalProperties: false,
      required: ['sentence', 'otherOrders'],
      properties: {
        sentence: { type: 'string', minLength: 1 },
        otherOrders: { type: 'array', maxItems: MAX_OTHER_ORDERS, items: { type: 'string', minLength: 1 } },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create exactly ${countWord(params.sentences)} ${f.items} for a sentence-building game: the learner gets the cards of each sentence shuffled and puts them in order. Each sentence is one short natural sentence with normal capitalisation and end punctuation, and all sentences are different.`,
    `Every word of a sentence is a card. Wrap a phrase in square brackets to keep it on one card, for example "She [is going to] travel." Each sentence has ${MIN_CARDS} to ${MAX_CARDS} cards; a bracketed phrase counts as one card. Use no Markdown and no other brackets.`,
    `otherOrders lists other correct orders of exactly the same cards, each card written the same way with the same brackets, capitalisation and punctuation; at most ${countWord(MAX_OTHER_ORDERS)}, and an empty list when only the main order is correct. Prefer sentences whose word order is fixed.`,
  ],
  defaultInstructions: 'Each sentence uses the target grammar.',
  build({ items }, context) {
    const { id, params, chrome } = context;
    warnCyrillic(items, context);
    const sentences = exactList(items, params.sentences, 'предложений', context).map((item, index) => {
      const where = `предложении ${index + 1}`;
      const sentence = requiredText(oneLine(stripMarkdown(item?.sentence, where, context)), `предложение ${index + 1}`, context);
      const built = sentenceItem([sentence], 'card-check', where, context);
      if (built.tokens.length < MIN_CARDS || built.tokens.length > MAX_CARDS) {
        console.warn(`${blockName(context)}: в ${where} ${built.tokens.length} карточек, нужно от ${MIN_CARDS} до ${MAX_CARDS}.`);
      }
      return { sentence, others: otherOrders(sentence, item?.otherOrders, where, context) };
    });
    assertUnique(sentences.map(({ sentence }) => sentence), 'предложения', context);
    return normalizeSentenceBuilder({
      type: 'sentenceBuilder',
      id,
      title: chrome.title ?? 'Make the sentence',
      instruction: chrome.instruction ?? 'Put the words in the right order.',
      hintsEnabled: params.hints,
      completionText: params.completionText,
      items: sentences.map(({ sentence, others }, index) => (
        sentenceItem([sentence, ...others], `sentence-${index + 1}`, `предложении ${index + 1}`, context)
      )),
    });
  },
  example: ({ params }) => ({ items: EXAMPLE_ITEMS.slice(0, params.sentences) }),
};
