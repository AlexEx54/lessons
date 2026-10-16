'use strict';

const { normalizeGuidedCommunicationCards } = require('../../assets/components/guided-communication-cards.js');
const {
  countWord, cycle, exactList, integer, listSchema, pickVocabulary, requiredText, warnCyrillic,
} = require('./helpers.js');

// Task cards for guided speaking: the student picks one, turns it over and talks with the teacher.

const DEFAULT_COVERS = Object.freeze([
  { emoji: '😎', backgroundColor: '#C7DDFB' },
  { emoji: '🤩', backgroundColor: '#ECEBFF' },
  { emoji: '🤓', backgroundColor: '#DFCEF3' },
]);

const EXAMPLE_CARDS = Object.freeze([
  {
    title: 'My Superhero',
    questions: ['What is your superhero’s name?', 'Has your superhero got a cape or a mask?', 'What colour is your superhero suit?', 'What special appearance has your superhero got?'],
    miniTask: 'Describe your superhero in 3–4 sentences.',
    miniTaskExample: '',
    phrases: ['My superhero’s name is ...', 'He has got ... / She has got ...', 'He hasn’t got ... / She hasn’t got ...', 'His / Her suit is ...', 'He / She looks ...'],
    sentenceStarters: ['My superhero is called ...', 'He has got ...', 'She has got ...', 'He hasn’t got ...', 'Her favourite colour is ...'],
  },
  {
    title: 'My Superhero Friend',
    questions: ['Have you got a favourite superhero? Who is it?', 'What has your perfect superhero friend got?', 'Has your superhero friend got boots, gloves or a belt?', 'Why do you like this superhero?'],
    miniTask: 'Ask your teacher: What has your perfect superhero friend got?',
    miniTaskExample: '',
    phrases: ['My perfect superhero friend has got ...', 'He / She has got ...', 'He / She hasn’t got ...', 'I like ... because ...', 'My favourite superhero is ...'],
    sentenceStarters: ['My favourite superhero is ...', 'My perfect superhero friend has got ...', 'He / She has got ... and ...', 'He / She hasn’t got ...', 'I like this superhero because ...'],
  },
  {
    title: 'Ask and Answer',
    questions: ['Have you got a superhero costume at home?', 'If you are a superhero, have you got a mask?', 'What colour boots have you got in your superhero costume?', 'Has your superhero got a belt with gadgets?'],
    miniTask: 'Ask your teacher one question about their superhero.',
    miniTaskExample: 'Example: Has your superhero got a cape?',
    phrases: ['Have you got ...?', 'Has your superhero got ...?', 'Yes, I have. / No, I haven’t.', 'Yes, he has. / No, she hasn’t.', 'It is ... / They are ...'],
    sentenceStarters: ['Have you got ...?', 'Has your superhero got ...?', 'Yes, he has got ...', 'No, she hasn’t got ...', 'My superhero has got ...'],
  },
]);

module.exports = {
  type: 'communicationCards',
  label: 'Карточки для разговора',
  params: {
    cards: integer('Карточек', 1, 6, 3),
    questions: integer('Вопросов на карточке', 2, 6, 4),
    vocabularyMin: integer('Слов урока на карточке: от', 2, 12, 6, { atMost: 'vocabularyMax' }),
    vocabularyMax: integer('Слов урока на карточке: до', 2, 12, 10),
    phrases: integer('Полезных фраз', 2, 8, 5),
    starters: integer('Начал предложений', 2, 8, 5),
  },
  chrome: ['covers'],
  fields: ['cards'],
  inputs: { vocabulary: { type: 'vocabulary', required: true } },
  schema: ({ params }) => ({
    cards: listSchema(params.cards, {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'questions', 'miniTask', 'miniTaskExample', 'vocabulary', 'phrases', 'sentenceStarters'],
      properties: {
        title: { type: 'string', minLength: 1 },
        questions: listSchema(params.questions),
        miniTask: { type: 'string', minLength: 1 },
        miniTaskExample: { type: 'string' },
        vocabulary: { type: 'array', minItems: params.vocabularyMin, maxItems: params.vocabularyMax, items: { type: 'string', minLength: 1 } },
        phrases: listSchema(params.phrases),
        sentenceStarters: listSchema(params.starters),
      },
    }),
  }),
  rules: ({ params, links, f }) => [
    `Create exactly ${countWord(params.cards)} ${f.cards}. Each card needs a short title of two to four words, exactly ${countWord(params.questions)} open questions, one short miniTask, ${params.vocabularyMin}–${params.vocabularyMax} distinct entries copied exactly from ${links.vocabulary.label}, exactly ${countWord(params.phrases)} useful phrases and exactly ${countWord(params.starters)} sentence starters ending with "...".`,
  ],
  defaultInstructions: 'Each card offers a different kind of speaking task about the lesson topic. Set miniTaskExample to an empty string unless the card needs an example.',
  build({ cards }, context) {
    const { id, params, chrome, links } = context;
    warnCyrillic(cards, context);
    const covers = chrome.covers ?? DEFAULT_COVERS;
    exactList(cards, params.cards, 'карточек', context);
    return normalizeGuidedCommunicationCards({
      type: 'guidedCommunicationCards',
      id,
      items: cards.map((card, index) => {
        const where = `карточке ${index + 1}`;
        return {
          id: `card-${index + 1}`,
          cover: { ...covers[index % covers.length], title: `Card ${index + 1}` },
          task: {
            title: `Card ${index + 1}. ${requiredText(card?.title, `название в ${where}`, context)}`,
            questions: card.questions,
            miniTask: { text: card.miniTask, example: typeof card.miniTaskExample === 'string' ? card.miniTaskExample : '' },
            help: {
              vocabulary: pickVocabulary(card.vocabulary, links.vocabulary.value, where, context),
              phrases: card.phrases,
              sentenceStarters: card.sentenceStarters,
            },
          },
        };
      }),
    });
  },
  example: ({ params, links }) => {
    const terms = links.vocabulary.value.map(item => item.term);
    return {
      cards: cycle(EXAMPLE_CARDS, params.cards).map(card => ({
        ...card,
        questions: cycle(card.questions, params.questions),
        vocabulary: cycle(terms, params.vocabularyMin),
        phrases: cycle(card.phrases, params.phrases),
        sentenceStarters: cycle(card.sentenceStarters, params.starters),
      })),
    };
  },
};
