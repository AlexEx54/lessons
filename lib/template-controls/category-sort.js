'use strict';

const { normalizeCategorySort } = require('../../assets/components/category-sort.js');
const {
  assertUnique, blockName, countWord, exactList, fail, integer, listSchema, oneLine, requiredText, stripMarkdown,
  warnCyrillic,
} = require('./helpers.js');

// Word or phrase cards that the student sorts into two to four groups. Both counts are
// parameters, so the schema fixes the size of every group.

const MAX_TITLE = 40;
const MAX_CARD = 80;

const EXAMPLE_GROUPS = Object.freeze([
  { title: 'Fruit', cards: ['apple', 'banana', 'cherry', 'mango'] },
  { title: 'Vegetables', cards: ['carrot', 'potato', 'onion', 'cabbage'] },
  { title: 'Drinks', cards: ['orange juice', 'tea', 'lemonade', 'milk'] },
  { title: 'Desserts', cards: ['ice cream', 'chocolate cake', 'pancakes', 'cookies'] },
]);

function shortText(value, max, what, where, context) {
  const text = requiredText(oneLine(stripMarkdown(value, where, context)), what, context);
  if (text.length > max) fail(`${blockName(context)}: ${what} длиннее ${max} символов: «${text}».`);
  return text;
}

module.exports = {
  type: 'categorySort',
  label: 'Разложи по группам',
  group: 'vocabulary',
  description: 'Разложить карточки со словами или фразами по 2–4 группам.',
  params: {
    groups: integer('Групп', 2, 4, 3),
    cardsPerGroup: integer('Карточек в группе', 2, 4, 3),
  },
  chrome: ['title', 'instruction'],
  fields: ['groups'],
  schema: ({ params }) => ({
    groups: listSchema(params.groups, {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'cards'],
      properties: {
        title: { type: 'string', minLength: 1 },
        cards: listSchema(params.cardsPerGroup),
      },
    }),
  }),
  rules: ({ params, f }) => [
    `${f.groups}: exactly ${countWord(params.groups)} groups for a sorting task, each with exactly ${countWord(params.cardsPerGroup)} cards. The learner gets all cards shuffled and puts each one into its group.`,
    `Each group title is short (one to three words, at most ${MAX_TITLE} characters), and all group titles are different. Each card is a word or a short phrase of at most ${MAX_CARD} characters.`,
    'Every card belongs clearly to exactly one group and could not fit any other. All cards are different, and no card contains the title of its group.',
    'Cards must not give their group away by form: for example, do not make only one group all questions or all capitalised, unless that difference is the point of the task. Use plain text only: no Markdown or HTML.',
  ],
  defaultInstructions: 'Choose groups and cards connected to the topic of the stage.',
  build({ groups }, context) {
    const { id, params, chrome } = context;
    warnCyrillic(groups, context);
    const sorted = exactList(groups, params.groups, 'групп', context).map((group, index) => {
      const where = `группе ${index + 1}`;
      return {
        title: shortText(group?.title, MAX_TITLE, `название группы ${index + 1}`, where, context),
        cards: exactList(group?.cards, params.cardsPerGroup, `карточек в ${where}`, context)
          .map(card => shortText(card, MAX_CARD, `карточка в ${where}`, where, context)),
      };
    });
    assertUnique(sorted.map(group => group.title), 'названия групп', context);
    assertUnique(sorted.flatMap(group => group.cards), 'карточки', context);
    return normalizeCategorySort({
      type: 'categorySort',
      id,
      title: chrome.title ?? 'Sort the cards into groups.',
      instruction: chrome.instruction ?? 'Put each card into the right basket.',
      categories: sorted.map((group, index) => ({ id: `group-${index + 1}`, title: group.title })),
      // The exercise shuffles the cards itself, so they may stay in their groups here.
      items: sorted.flatMap((group, index) => group.cards.map(text => ({ text, categoryId: `group-${index + 1}` })))
        .map((item, index) => ({ id: `card-${index + 1}`, ...item })),
    });
  },
  answerKey: ({ component }) => ({
    list: false,
    lines: component.categories.map(category => `**${category.title}:** ${component.items
      .filter(item => item.categoryId === category.id).map(item => item.text).join(', ')}.`),
  }),
  example: ({ params }) => ({
    groups: EXAMPLE_GROUPS.slice(0, params.groups).map(group => ({ ...group, cards: group.cards.slice(0, params.cardsPerGroup) })),
  }),
};
