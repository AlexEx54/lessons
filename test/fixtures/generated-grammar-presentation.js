'use strict';

const GENERATED_GRAMMAR_PRESENTATION = Object.freeze({
  examples: [
    'I **visited** London last summer.',
    'We **travelled** by train yesterday.',
    'Mia **did not miss** her flight.',
    '**Did you buy** a ticket online?',
    'The plane **left** at nine o’clock.',
  ],
  conceptCheckingQuestions: [
    'Did these actions happen in the past?',
    'Are the actions finished now?',
    'Do regular verbs usually end in -ed?',
    'Do we use the past form after did?',
  ],
  ruleItems: [{
    before: 'We use the Past Simple for finished actions in the ',
    answer: 'past',
    after: '.',
  }, {
    before: 'Regular verbs usually end in ',
    answer: '-ed',
    after: '.',
  }, {
    before: 'In negative sentences, use did not and the ',
    answer: 'base verb',
    after: '.',
  }, {
    before: 'Questions start with ',
    answer: 'Did',
    after: '.',
  }],
  ruleDistractors: ['future', '-ing form'],
  quickRuleSections: [{
    title: 'PAST SIMPLE',
    text: '- **use:** finished past actions\n- **positive:** subject + past form\n- **example:** “I visited London last summer.”',
  }, {
    title: 'NEGATIVES & QUESTIONS',
    text: '- **negative:** subject + did not + base verb\n- **question:** Did + subject + base verb?\n- **example:** “Did you buy a ticket?”',
  }],
  checkItems: [{
    before: 'Last year, I ',
    after: ' to Spain.',
    options: ['travelled', 'travel', 'am travelling'],
    answer: 'travelled',
    explanation: 'Last year shows a finished action in the past.',
  }, {
    before: 'We did not ',
    after: ' the early train.',
    options: ['caught', 'catch', 'catching'],
    answer: 'catch',
    explanation: 'After did not, we use the base verb.',
  }, {
    before: 'Did she ',
    after: ' the museum?',
    options: ['visited', 'visits', 'visit'],
    answer: 'visit',
    explanation: 'After Did, we use the base verb.',
  }, {
    before: 'The plane ',
    after: ' at nine yesterday.',
    options: ['leaves', 'left', 'leave'],
    answer: 'left',
    explanation: 'Left is the Past Simple form of leave.',
  }, {
    before: 'They ',
    after: ' their tickets online.',
    options: ['buy', 'are buying', 'bought'],
    answer: 'bought',
    explanation: 'Bought is the Past Simple form of buy.',
  }],
});

module.exports = { GENERATED_GRAMMAR_PRESENTATION };
