'use strict';

const { createControlCatalog } = require('../lesson-templates/control-catalog.js');

// Every control a lesson template can use.
const CONTROL_CATALOG = createControlCatalog([
  require('./audio-script.js'),
  require('./choice-questions.js'),
  require('./choice-sentences.js'),
  require('./communication-cards.js'),
  require('./context-dropdown.js'),
  require('./correct-sentences.js'),
  require('./cue-gaps.js'),
  require('./describe-and-guess.js'),
  require('./dialogue-gaps.js'),
  require('./drag-sentences.js'),
  require('./fact-or-myth.js'),
  require('./fill-in-blanks.js'),
  require('./match-pictures.js'),
  require('./mini-situation.js'),
  require('./odd-one-out.js'),
  require('./personalized-questions.js'),
  require('./quick-rule.js'),
  require('./reading-text.js'),
  require('./repeat-audio.js'),
  require('./role-cards.js'),
  require('./role-dialogue.js'),
  require('./rule-gaps.js'),
  require('./sentence-correction.js'),
  require('./sentence-halves.js'),
  require('./speaking-support.js'),
  require('./story-cards.js'),
  require('./story-guess-key.js'),
  require('./term-explanations.js'),
  require('./this-or-that.js'),
  require('./three-two-one.js'),
  require('./translation-hints.js'),
  require('./translation-sentences.js'),
  require('./vocabulary-list.js'),
  require('./vocabulary-meanings.js'),
  require('./word-bank-support.js'),
]);

module.exports = { CONTROL_CATALOG };
