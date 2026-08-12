'use strict';

const STAGE_BLUEPRINTS = Object.freeze([
  Object.freeze({ id: 'warm-up', title: 'Warm Up', durationMinutes: 5, icon: 'sparkles' }),
  Object.freeze({ id: 'lead-in', title: 'Lead In', durationMinutes: 5, icon: 'compass' }),
  Object.freeze({ id: 'target-vocabulary', title: 'Target Vocabulary', durationMinutes: 8, icon: 'cards' }),
  Object.freeze({ id: 'reading-listening', title: 'Reading / Listening', durationMinutes: 8, icon: 'book' }),
  Object.freeze({ id: 'grammar-focus', title: 'Grammar Focus', durationMinutes: 8, icon: 'cap' }),
  Object.freeze({ id: 'guided-speaking', title: 'Guided Speaking', durationMinutes: 8, icon: 'chat' }),
  Object.freeze({ id: 'wrap-up', title: 'Wrap-Up', durationMinutes: 3, icon: 'check' }),
]);

function createSyntheticLesson(topic) {
  const normalizedTopic = String(topic || '').trim();
  return {
    schemaVersion: 'lesson-draft-v1',
    meta: {
      topic: normalizedTopic,
      title: normalizedTopic,
      level: 'A2',
      lessonNumber: 1,
      durationMinutes: 45,
      generatedBy: 'synthetic',
    },
    stages: STAGE_BLUEPRINTS.map((stage, index) => ({
      ...stage,
      number: index + 1,
      content: null,
    })),
  };
}

module.exports = { STAGE_BLUEPRINTS, createSyntheticLesson };
