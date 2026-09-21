'use strict';
const { normalizeOddOneOut, createOddOneOutAnswerKey } = require('../assets/components/odd-one-out.js');

function createTemplateTwoLesson(topic, blueprints, teacherNote) {
  const exercise = normalizeOddOneOut({
    type: 'oddOneOut', id: 'warm-up-odd-one-out',
    title: 'Find the Odd One Out!',
    instruction: 'Look at the four words in each row. Find the odd word and explain your choice.',
    items: [
      { id: 'row-one', options: ['fly', 'jump', 'run', 'strong'], answer: 'strong',
        explanation: 'It is an adjective; the other words can be verbs.' },
      { id: 'row-two', options: ['cape', 'car', 'mask', 'boots'], answer: 'car',
        explanation: 'It is a vehicle; the others can be worn.' },
      { id: 'row-three', options: ['robot', 'spider', 'bat', 'cat'], answer: 'robot',
        explanation: 'It is a machine; the others are animals.' },
      { id: 'row-four', options: ['head', 'arm', 'laser', 'leg'], answer: 'laser',
        explanation: 'It is not a body part; the others are body parts.' },
    ],
  });
  return {
    schemaVersion: 'lesson-draft-v1',
    meta: { topic: String(topic || '').trim(), title: String(topic || '').trim(),
      level: 'A2', lessonNumber: 1, durationMinutes: 50, generatedBy: 'synthetic' },
    stages: blueprints.map((stage, index) => ({ ...stage, number: index + 1,
      subtitle: stage.id === 'warm-up' ? 'Find the Odd One Out!' : '',
      content: stage.id === 'warm-up' ? [teacherNote, exercise, createOddOneOutAnswerKey(exercise)] : null,
    })),
  };
}
module.exports = { createTemplateTwoLesson };
