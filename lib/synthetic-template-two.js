'use strict';
const { normalizeOddOneOut, createOddOneOutAnswerKey } = require('../assets/components/odd-one-out.js');

const { normalizeFactOrMyth, createFactOrMythAnswerKey } = require('../assets/components/fact-or-myth.js');

function createTemplateTwoLeadIn() {
  const exercise = normalizeFactOrMyth({
    type: 'factOrMyth', id: 'lead-in-fact-or-myth',
    title: 'Read the sentences. Is it a FACT or MYTH?',
    instruction: 'Choose Fact or Myth for each sentence.',
    items: [
      { id: 'statement-one', text: 'Batman has got a black cape and a black mask.', mode: 'check', answer: 'fact', explanation: 'He has got a black cape and mask.' },
      { id: 'statement-two', text: 'All superheroes have got a cape.', mode: 'check', answer: 'myth', explanation: "Spider-Man has not got a cape. Iron Man has not got a cape. Practise has not got." },
      { id: 'statement-three', text: 'The Hulk has got a cool superhero suit and boots.', mode: 'check', answer: 'myth', explanation: 'He has not got a suit or boots. He has got purple trousers or shorts and green skin.' },
      { id: 'statement-four', text: 'Our new superhero today has got green hair and big ears.', mode: 'guess', answer: null, explanation: 'Students guess now and check later in the text.' },
      { id: 'statement-five', text: 'Our new superhero has got a purple jacket and yellow boots.', mode: 'guess', answer: null, explanation: 'Students guess now and check later in the text.' },
    ],
  });
  return [
    { type: 'teacherNote', id: 'lead-in-teacher-note', text: [
      '- **Step 1:** Introduce Fact (true) and Myth (false). Use thumbs up / thumbs down gestures.',
      '- **Step 2:** Read the sentences one by one and ask students to vote using the Fact and Myth buttons.',
      '- **Step 3:** For 1–3, ask them to explain their answer.',
      '- **Step 4:** For 4–5, let them guess and do not reveal the answer yet.',
      '- **Transition:** Let’s check our guesses in the text and find out!',
    ].join('\n') },
    exercise,
    { type: 'markdownCard', id: 'lead-in-speaking-support', title: 'Speaking Support', icon: 'chat', accentColor: '#E5AD16', studentVisibility: 'always',
      text: "I think it’s a fact / myth because…\n\nBatman has got…\n\nSpider-Man hasn’t got…" },
    createFactOrMythAnswerKey(exercise),
  ];
}

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
      subtitle: stage.id === 'warm-up' ? 'Find the Odd One Out!' : stage.id === 'lead-in' ? 'Fact or Myth?' : '',
      content: stage.id === 'warm-up' ? [teacherNote, exercise, createOddOneOutAnswerKey(exercise)] : stage.id === 'lead-in' ? createTemplateTwoLeadIn() : null,
    })),
  };
}
module.exports = { createTemplateTwoLesson };
