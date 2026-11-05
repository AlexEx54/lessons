'use strict';

const GENERATED_GRAMMAR_PRESENTATION = Object.freeze({
  examples: [
    '1. I **visited** London last summer.',
    '2. We **travelled** by train yesterday.',
    '3. Mia **did not miss** her flight.',
    '4. **Did you buy** a ticket online?',
    '5. The plane **left** at nine o’clock.',
  ].join('\n'),
  conceptCheckingQuestions: [
    '1. Did these actions happen in the past?',
    '2. Are the actions finished now?',
    '3. Do regular verbs usually end in -ed?',
    '4. Do we use the past form after did?',
  ].join('\n'),
  ruleSentences: [
    'We use the Past Simple for finished actions in the [[past]].',
    'Regular verbs usually end in [[-ed]].',
    'In negative sentences, use did not and the [[base verb]].',
    'Questions start with [[Did]].',
  ],
  ruleDistractors: ['future', '-ing form'],
  quickRuleSections: [{
    title: 'PAST SIMPLE',
    text: '- **use:** finished past actions\n- **positive:** subject + past form\n- **example:** “I visited London last summer.”',
  }, {
    title: 'NEGATIVES & QUESTIONS',
    text: '- **negative:** subject + did not + base verb\n- **question:** Did + subject + base verb?\n- **example:** “Did you buy a ticket?”',
  }],
  checkText: [
    '**1.** Last year, I [[1]] to Spain.',
    '**2.** We did not [[2]] the early train.',
    '**3.** Did she [[3]] the museum?',
    '**4.** The plane [[4]] at nine yesterday.',
    '**5.** They [[5]] their tickets online.',
  ].join('\n'),
  checkChoices: [
    { options: ['travelled', 'travel', 'am travelling'], answer: 'travelled', explanation: 'Last year shows a finished action in the past.' },
    { options: ['caught', 'catch', 'catching'], answer: 'catch', explanation: 'After did not, we use the base verb.' },
    { options: ['visited', 'visits', 'visit'], answer: 'visit', explanation: 'After Did, we use the base verb.' },
    { options: ['leaves', 'left', 'leave'], answer: 'left', explanation: 'Left is the Past Simple form of leave.' },
    { options: ['buy', 'are buying', 'bought'], answer: 'bought', explanation: 'Bought is the Past Simple form of buy.' },
  ],
});

module.exports = { GENERATED_GRAMMAR_PRESENTATION };
