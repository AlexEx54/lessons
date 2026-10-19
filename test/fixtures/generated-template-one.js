'use strict';

const { GENERATED_TARGET_VOCABULARY } = require('./generated-target-vocabulary.js');
const { GENERATED_READING } = require('./generated-reading.js');

// Model answers for the Template 1 stages that have no fixture file of their own.

const GENERATED_WARM_UP = Object.freeze({
  teacherNotes: '- Show the options and ask the learner to briefly explain their choice.\n\n**Say:** “Which space trip would you choose?”',
  yourTurnInstruction: 'Choose one option in each pair and explain your choice.',
  choices: Array.from({ length: 4 }, (_value, index) => ({
    options: [{
      caption: `Space option ${index + 1}A`,
      imagePrompt: `Square child-friendly educational illustration of space option ${index + 1}A, no text.`,
    }, {
      caption: `Space option ${index + 1}B`,
      imagePrompt: `Square child-friendly educational illustration of space option ${index + 1}B, no text.`,
    }],
  })),
  followUpQuestions: 'Which option was the most exciting? Why?',
  possibleLanguage: 'I would choose… because…',
});

const GENERATED_LEAD_IN = Object.freeze({
  teacherNotes: [
    'Read the text together with the learner and invite them to answer the questions.',
    '- Explain that **low-key** means slightly or to some extent.',
    '- If the third answer is short, encourage the learner to explain: *Why do you think so?*',
    '- After the answers, ask: *Can you guess what our lesson is about?*',
    '',
    '**Say:** *We are going to talk about space travel.*',
  ].join('\n'),
  message: '**@SpaceMax:** I low-key want to visit Mars. The trip is long, but seeing a new planet sounds amazing!',
  leadingImagePrompt: 'Child-friendly circular astronaut avatar, educational illustration, no text.',
  trailingImagePrompt: 'Child-friendly small planet symbol, educational illustration, no text.',
  questions: [
    'Which planet does Max want to visit?',
    'Why does the trip sound exciting to Max?',
    'Would you like to travel to another planet? Why or why not?',
  ],
  suggestedAnswers: [
    'Max wants to visit Mars.',
    'He thinks seeing a new planet sounds amazing.',
    'Yes, I would, because I want to see space.',
  ],
});

const GENERATED_WRAP_UP = Object.freeze({
  signsOfSuccess: 'The learner names three travel phrases and uses the Past Simple accurately in two clear sentences.',
  struggleSupport: 'Review three useful travel phrases and give one Past Simple model before the learner tries again.',
  positiveEnding: 'Say: “Great work! You can describe a past journey and explain your travel choices clearly.”',
  threePrompt: 'Name three words or phrases you remember about travel choices.',
  twoPrompt: 'Create two sentences about a past journey using the Past Simple.',
  twoCues: Object.freeze([
    'Say where you travelled and how you got there.',
    'Explain one travel choice you made and why.',
  ]),
  onePrompt: 'Can you describe a past journey and explain which travel option was best for you?',
  possibleLanguage: Object.freeze([
    'I travelled to…',
    'I booked a ticket because…',
    'The best option was…',
  ]),
});

// Target Vocabulary and Reading answers in the shape of the Template 1 controls, made from
// the answers to the old prompts: the context task is one text with numbered gaps,
// personalized questions have no targetTerm, and the gist question is a list of one.
function templateOneTargetVocabulary({ contextItems, personalizedQuestions, ...answer }) {
  return {
    ...answer,
    contextText: contextItems.map((item, index) => [item.before, `[[${index + 1}]]`, item.after].filter(Boolean).join(' ')).join(' '),
    contextChoices: contextItems.map(({ options, answer: term }) => ({ options, answer: term })),
    personalizedQuestions: personalizedQuestions.map(({ question, followUp }) => ({ question, followUp })),
  };
}

function templateOneReading({ gistQuestion, ...answer }) {
  return { ...answer, gistQuestions: [gistQuestion] };
}

const TEMPLATE_ONE_TARGET_VOCABULARY = templateOneTargetVocabulary(GENERATED_TARGET_VOCABULARY);
const TEMPLATE_ONE_READING = templateOneReading(GENERATED_READING);

module.exports = {
  GENERATED_LEAD_IN, GENERATED_WARM_UP, GENERATED_WRAP_UP, TEMPLATE_ONE_READING, TEMPLATE_ONE_TARGET_VOCABULARY,
};
