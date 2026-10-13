'use strict';

const { createControlCatalog } = require('../lesson-templates/control-catalog.js');

// Every control a lesson template can use.
const CONTROL_CATALOG = createControlCatalog([
  require('./answer-key.js'),
  require('./choice-sentences.js'),
  require('./communication-cards.js'),
  require('./context-dropdown.js'),
  require('./correct-sentences.js'),
  require('./cue-gaps.js'),
  require('./drag-sentences.js'),
  require('./fact-or-myth.js'),
  require('./list-card.js'),
  require('./numbered-panel.js'),
  require('./odd-one-out.js'),
  require('./personalized-questions.js'),
  require('./quick-rule.js'),
  require('./rule-gaps.js'),
  require('./sentence-correction.js'),
  require('./sentence-halves.js'),
  require('./story-cards.js'),
  require('./story-guess-key.js'),
  require('./teacher-note-sections.js'),
  require('./three-two-one.js'),
  require('./translation-hints.js'),
  require('./translation-sentences.js'),
  require('./vocabulary-list.js'),
  require('./vocabulary-meanings.js'),
  require('./word-bank-support.js'),
]);

module.exports = { CONTROL_CATALOG };
