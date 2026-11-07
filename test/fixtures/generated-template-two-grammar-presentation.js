'use strict';
const { GENERATED_GRAMMAR_PRESENTATION } = require('./generated-grammar-presentation.js');
const GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION = {
  ...GENERATED_GRAMMAR_PRESENTATION,
  checkQuestions: [{
    question: 'Which four sentences are grammatically correct?',
    options: [
      'I visited London last summer.',
      'We did not caught the train.',
      'Did she visit the museum?',
      'The plane left at nine yesterday.',
      'They buyed tickets online.',
      'Did you bought a ticket?',
      'Mia did not miss her flight.',
      'I travel to Spain last year.',
    ],
    answers: ['I visited London last summer.', 'Did she visit the museum?', 'The plane left at nine yesterday.', 'Mia did not miss her flight.'],
    explanation: [
      'Incorrect sentences:',
      '1. *We did not caught the train.* — After did not, use catch: We did not catch the train.',
      '2. *They buyed tickets online.* — Buy is irregular: They bought tickets online.',
      '3. *Did you bought a ticket?* — After Did, use buy: Did you buy a ticket?',
      '4. *I travel to Spain last year.* — Use the past form: I travelled to Spain last year.',
    ].join('\n'),
  }],
};
module.exports = { GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION };
