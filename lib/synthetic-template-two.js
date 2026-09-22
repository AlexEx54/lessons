'use strict';
const { normalizeOddOneOut, createOddOneOutAnswerKey } = require('../assets/components/odd-one-out.js');

const { normalizeFactOrMyth, createFactOrMythAnswerKey } = require('../assets/components/fact-or-myth.js');


const { normalizeMultipleChoice } = require('../assets/components/multiple-choice.js');
const { normalizeDropdownChoice } = require('../assets/components/dropdown-choice.js');
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
  const teacherNote = createTargetVocabularyTeacherNote();
  teacherNote.blocks.find(block => block.id === 'target-vocabulary-exercise-lead-in').text = [
    '**Task 1:** Прочитайте истории супергероев. Попросите ученика обратить внимание на выделенные слова и найти одежду и особенности внешности.',
    '**Task 2:** Попросите ученика выбрать значение каждого слова. При затруднении вернитесь к историям. После ошибки можно попробовать ещё раз.',
    '**Task 3:** Сначала прочитайте весь текст, затем выберите слова из выпадающих списков. В конце попросите ученика прочитать получившуюся историю вслух.',
  ].join('\n\n');
  const meanings = [
    ['cape', 'What is a cape?', 'A long piece of clothing you wear on your back', 'Something you wear on your hands'],
    ['mask', 'What is a mask?', 'Something that covers part of your face', 'Something you wear on your feet'],
    ['superhero-suit', 'What is a superhero suit?', 'Special clothes a superhero wears', 'A superhero’s house'],
    ['boots', 'What are boots?', 'Shoes that usually cover part of your legs', 'Clothes you wear on your hands'],
    ['gloves', 'What are gloves?', 'Clothes for your hands', 'Clothes for your head'],
    ['belt', 'What is a belt?', 'Something you wear around your waist', 'Something you wear around your neck'],
    ['curly-hair', 'What does curly hair look like?', 'It has curls', 'It has no curves'],
    ['straight-hair', 'What does straight hair look like?', 'It has no curls', 'It has lots of curls'],
    ['big-eyes', 'What does “big eyes” mean?', 'The eyes are large', 'The eyes are very small'],
    ['pointed-ears', 'What are pointed ears?', 'Ears with a sharp shape at the top', 'Very round ears'],
  ];
  return [teacherNote, {
    type: 'markdownCard', id: 'target-vocabulary-card', title: 'Vocabulary',
    icon: 'book', accentColor: '#20A85B', studentVisibility: 'controlled',
    text: vocabulary.map(([term, meaning], index) => `${index + 1}. **${term}** — ${meaning}`).join('\n'),
  }, normalizeStoryCards({
    type: 'storyCards', id: 'target-vocabulary-stories',
    title: 'Task 1. Read the stories. Pay attention to the words in bold.',
    items: TEMPLATE_2_STORIES,
  }), normalizeMultipleChoice({
    type: 'multipleChoice', id: 'target-vocabulary-meanings', variant: 'compact',
    title: 'Task 2. Choose the correct meaning for the words from the text.',
    instruction: 'Choose one answer for each question.',
    items: meanings.map(([id, question, answer, distractor], index) => ({
      id, question, answer, options: index % 2 ? [distractor, answer] : [answer, distractor],
    })),
  }), normalizeDropdownChoice({
    type: 'dropdownChoice', id: 'target-vocabulary-context-dropdown',
    title: 'Task 3. Vocabulary in Context — Dropdown',
    instruction: 'Fill in the blanks with the correct words from the dropdown lists.',
    text: 'Meet Star Kid, our new superhero! His hair has lots of curls, so he has got [[curly-hair-gap]]. His [[big-eyes-gap]] are large and bright. He wears a [[mask-gap]] over his face to hide who he is. His special superhero clothes are a blue [[suit-gap]]. A red [[cape-gap]] hangs from his shoulders and flies behind his back when he runs. On his feet, he wears [[boots-gap]] that cover his legs below the knees. His [[gloves-gap]] keep his hands warm. Finally, he puts a [[belt-gap]] around his waist to carry his tools. Now he is ready to help his friends!',
    choices: [
      { id: 'curly-hair-gap', options: ['straight hair', 'curly hair', 'green hair'], answer: 'curly hair' },
      { id: 'big-eyes-gap', options: ['big eyes', 'pointed ears', 'gloves'], answer: 'big eyes' },
      { id: 'mask-gap', options: ['belt', 'cape', 'mask'], answer: 'mask' },
      { id: 'suit-gap', options: ['superhero suit', 'mask', 'belt'], answer: 'superhero suit' },
      { id: 'cape-gap', options: ['mask', 'cape', 'belt'], answer: 'cape' },
      { id: 'boots-gap', options: ['gloves', 'pointed ears', 'boots'], answer: 'boots' },
      { id: 'gloves-gap', options: ['gloves', 'boots', 'big eyes'], answer: 'gloves' },
      { id: 'belt-gap', options: ['cape', 'belt', 'mask'], answer: 'belt' },
    ],
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
