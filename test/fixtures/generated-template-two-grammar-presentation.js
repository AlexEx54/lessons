'use strict';
const { GENERATED_GRAMMAR_PRESENTATION } = require('./generated-grammar-presentation.js');
const GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION = {
  ...GENERATED_GRAMMAR_PRESENTATION,
  checkItems: [
    ['I visited London last summer.', true, ''],
    ['We did not caught the train.', false, 'After did not, use catch: We did not catch the train.'],
    ['Did she visit the museum?', true, ''],
    ['The plane left at nine yesterday.', true, ''],
    ['They buyed tickets online.', false, 'Buy is irregular: They bought tickets online.'],
    ['Did you bought a ticket?', false, 'After Did, use buy: Did you buy a ticket?'],
    ['Mia did not miss her flight.', true, ''],
    ['I travel to Spain last year.', false, 'Use the past form: I travelled to Spain last year.'],
  ].map(([sentence, isCorrect, explanation]) => ({ sentence, isCorrect, explanation })),
};
module.exports = { GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION };
