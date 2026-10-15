'use strict';

// Lessons of the former hand-written synthetic mode, saved once as data for component
// tests. Their content does not depend on the topic. Every call returns a fresh copy.
const LESSONS = Object.freeze({
  'template-1': require('../fixtures/synthetic-template-one.json'),
  'template-2': require('../fixtures/synthetic-template-two.json'),
});

function syntheticLesson(template = 'template-1') {
  return structuredClone(LESSONS[template]);
}

module.exports = { syntheticLesson };
