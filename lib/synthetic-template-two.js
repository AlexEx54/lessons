'use strict';
const { normalizeOddOneOut, createOddOneOutAnswerKey } = require('../assets/components/odd-one-out.js');

const { normalizeFactOrMyth, createFactOrMythAnswerKey } = require('../assets/components/fact-or-myth.js');


const { normalizeStoryCards } = require('../assets/components/story-cards.js');
const { createTargetVocabularyTeacherNote } = require('./target-vocabulary-static.js');

const TEMPLATE_2_STORIES = [
  { id: 'flash-kid', emoji: '⚡', title: 'Flash Kid', backgroundColor: '#EAE4FC',
    text: "Hi! I'm Flash Kid. I've got **curly hair** and **big eyes**. My superhero clothes are blue and yellow. I've got a yellow cape, too. I can run very fast!" },
  { id: 'moon-girl', emoji: '🌙', title: 'Moon Girl', backgroundColor: '#FCE3F0',
    text: "My name is Moon Girl. I've got **long straight hair**. I've got a **silver mask** and a purple **superhero suit**. Nobody knows who I am when I wear my mask!" },
  { id: 'fire-boy', emoji: '🔥', title: 'Fire Boy', backgroundColor: '#FFF0E5',
    text: "I'm Fire Boy. I've got red **boots** and orange **gloves**. I've also got a black **belt** with my superhero tools. I help people when there is danger." },
  { id: 'forest-elf', emoji: '🌿', title: 'Forest Elf', backgroundColor: '#E2FBFB',
    text: "Hi! I'm Forest Elf. I've got **green hair** and two **pointed ears**. I've got brown boots, a green cape and a superhero suit. I can talk to animals and climb trees very quickly." },
];

function createTemplateTwoTargetVocabulary() {
  const vocabulary = [
    ['curly hair', 'hair with curls'], ['big eyes', 'large eyes'],
    ['long straight hair', 'long hair without curls'], ['silver mask', 'a silver cover for your face'],
    ['superhero suit', 'special clothes a superhero wears'], ['boots', 'shoes that cover your ankles or legs'],
    ['gloves', 'clothes that cover your hands'], ['belt', 'something you wear around your waist'],
    ['green hair', 'hair that is green'], ['pointed ears', 'ears with narrow tips'],
  ];
  return [createTargetVocabularyTeacherNote(), {
    type: 'markdownCard', id: 'target-vocabulary-card', title: 'Vocabulary',
    icon: 'book', accentColor: '#20A85B', studentVisibility: 'controlled',
    text: vocabulary.map(([term, meaning], index) => `${index + 1}. **${term}** — ${meaning}`).join('\n'),
  }, normalizeStoryCards({
    type: 'storyCards', id: 'target-vocabulary-stories',
    title: 'Task 1. Read the stories. Pay attention to the words in bold.',
    items: TEMPLATE_2_STORIES,
  })];
}

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
      content: stage.id === 'warm-up' ? [teacherNote, exercise, createOddOneOutAnswerKey(exercise)] : stage.id === 'lead-in' ? createTemplateTwoLeadIn() : stage.id === 'target-vocabulary' ? createTemplateTwoTargetVocabulary() : null,
    })),
  };
}
module.exports = { createTemplateTwoLesson };
