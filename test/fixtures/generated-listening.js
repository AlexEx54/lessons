'use strict';

const LISTENING_SCRIPT = [
  'Maya: Hi, Leo! Are you ready for our class trip tomorrow?',
  'Leo: Almost. I still need to pack a suitcase, but I made a list so I do not forget anything.',
  'Maya: Good idea. I packed last night because we have to catch a flight at eight in the morning.',
  'Leo: I know. My dad will drive me to the airport at six. Did you book a ticket online?',
  'Maya: Our teacher did it for the whole class. She also sent us the boarding information.',
  'Leo: Great. I feel a little nervous about going through security. I have never flown without my family.',
  'Maya: Do not worry. We will stay together, and the teacher will help us. After security, we can find our gate and get some breakfast.',
  'Leo: That sounds better. What do you want to do when we arrive in Edinburgh?',
  'Maya: I want to visit the castle and take photos of the old streets. I am also excited to try local food.',
  'Leo: Me too. I think the best moment will be when we board a plane and see the city from above.',
  'Maya: Definitely. Now finish packing and go to bed early!',
  'Leo: I will. See you at the airport tomorrow!',
].join('\n');

const GENERATED_LISTENING = Object.freeze({
  script: LISTENING_SCRIPT,
  gistQuestions: [{
    question: 'Where are Maya and Leo going?',
    options: ['On a class trip to Edinburgh.', 'On a family holiday to London.', 'On a day trip to the countryside.'],
    answers: ['On a class trip to Edinburgh.'],
    explanation: 'They are preparing for their class trip and Maya says they will arrive in Edinburgh.',
  }, {
    question: 'What are the friends mainly talking about?',
    options: ['Preparing for their flight.', 'Things they want to do in Edinburgh.', 'Problems with their homework.'],
    answers: ['Preparing for their flight.', 'Things they want to do in Edinburgh.'],
    explanation: 'They discuss packing, the airport, the flight, and their plans in Edinburgh.',
  }],
  detailQuestions: [{
    question: 'What time is the flight?',
    options: ['At six in the morning.', 'At eight in the morning.', 'At ten in the morning.'],
    answer: 'At eight in the morning.',
    explanation: 'Maya says they have to catch a flight at eight.',
  }, {
    question: 'Who booked the tickets?',
    options: ['Maya.', 'Leo’s dad.', 'Their teacher.'],
    answer: 'Their teacher.',
    explanation: 'Their teacher booked tickets for the whole class.',
  }, {
    question: 'Why does Leo feel nervous?',
    options: ['He has never flown without his family.', 'He cannot find his suitcase.', 'He does not like Edinburgh.'],
    answer: 'He has never flown without his family.',
    explanation: 'Leo says this is his first flight without his family.',
  }, {
    question: 'What does Maya want to visit?',
    options: ['The airport museum.', 'The castle.', 'A football stadium.'],
    answer: 'The castle.',
    explanation: 'Maya says she wants to visit the castle.',
  }, {
    question: 'What does Maya tell Leo to do?',
    options: ['Buy breakfast.', 'Call the teacher.', 'Finish packing and go to bed early.'],
    answer: 'Finish packing and go to bed early.',
    explanation: 'That is Maya’s final advice to Leo.',
  }],
});

module.exports = { GENERATED_LISTENING, LISTENING_SCRIPT };
