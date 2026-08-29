'use strict';

const READING_TEXT = [
  'Last spring, my class planned a trip to Edinburgh. Our teacher asked us to book a ticket online and check the travel times carefully. I was excited because it was my first journey without my family. The evening before the trip, I had to pack a suitcase with warm clothes, comfortable shoes, and a small notebook.',
  'We met at the airport very early. Everyone wanted to catch a flight at eight o’clock, so nobody was late. First, we had to go through security. I felt nervous when an officer checked my bag, but the process was quick and easy. Then we found our gate and bought some water for the journey.',
  'When it was time to board a plane, our teacher counted all the students again. I sat next to my friend Leo by the window. We talked about the places we wanted to visit and watched the city become smaller below us. The flight was calm, and the clouds looked like a white sea.',
  'In Edinburgh, we visited a castle, walked through old streets, and tried a local dessert. My favourite moment was drawing the castle in my notebook while a guide told us its history. The trip helped me feel more independent, and now I would happily travel with my class again.',
].join('\n\n');

const GENERATED_READING = Object.freeze({
  title: 'My First Class Trip',
  subtitle: 'A student travel story',
  text: READING_TEXT,
  headerImagePrompt: 'Small circular child-friendly avatar of a happy teenage traveler, educational illustration, no text.',
  textImagePrompt: 'Wide child-friendly educational illustration of students arriving at Edinburgh airport with a teacher, warm colorful style, no readable text.',
  usedVocabularyTerms: [
    'book a ticket', 'pack a suitcase', 'catch a flight', 'go through security', 'board a plane',
  ],
  gistQuestion: {
    question: 'What is the main idea of the text?',
    options: [
      'A student becomes more confident during a class trip.',
      'A class has many serious problems at an airport.',
      'A student explains how to draw an old castle.',
    ],
    answer: 'A student becomes more confident during a class trip.',
    explanation: 'The writer describes a successful first trip without their family.',
  },
  detailQuestions: [{
    question: 'Why was the writer especially excited?',
    options: [
      'It was their first journey without their family.',
      'They planned to meet family in Edinburgh.',
      'They had never visited an airport before.',
    ],
    answer: 'It was their first journey without their family.',
    explanation: 'The writer says it was their first journey without their family.',
  }, {
    question: 'What did the writer put in the suitcase?',
    options: [
      'Warm clothes, comfortable shoes, and a notebook.',
      'Food, a camera, and a history book.',
      'Sports clothes, boots, and a laptop.',
    ],
    answer: 'Warm clothes, comfortable shoes, and a notebook.',
    explanation: 'These three things are listed in the first paragraph.',
  }, {
    question: 'How did the writer feel at security?',
    options: ['Nervous.', 'Angry.', 'Bored.'],
    answer: 'Nervous.',
    explanation: 'The writer felt nervous while an officer checked the bag.',
  }, {
    question: 'Where did the writer sit on the plane?',
    options: ['Next to Leo by the window.', 'Next to the teacher.', 'Alone near the door.'],
    answer: 'Next to Leo by the window.',
    explanation: 'The writer sat beside Leo and watched the view through the window.',
  }, {
    question: 'What was the writer’s favourite moment?',
    options: [
      'Drawing the castle while listening to its history.',
      'Buying water before the flight.',
      'Trying a local dessert with Leo.',
    ],
    answer: 'Drawing the castle while listening to its history.',
    explanation: 'The final paragraph identifies drawing the castle as the favourite moment.',
  }],
});

module.exports = { GENERATED_READING, READING_TEXT };
