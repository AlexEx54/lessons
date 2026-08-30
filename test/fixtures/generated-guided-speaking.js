'use strict';

const GENERATED_GUIDED_SPEAKING = Object.freeze({
  teacherNotes: [
    '- **Start:** Ask the learner to read the Student card and begin with one suggestion.',
    '- **For weaker learners:** Offer two choices and point to the Speaking Support phrases.',
    '- **For stronger learners:** Ask for reasons, alternatives, and a compromise.',
    '- **Watch for:** questions, reactions, suggestions, and a clear final decision.',
    '- **If stuck:** Model one suggestion and one follow-up question.',
    '- **Target vocabulary:** Encourage the learner to use “book a ticket” and “pack a suitcase”.',
    '- **Correct:** Help immediately only when communication stops; save other feedback for the end.',
    '- **Success:** The learner completes both mission actions and agrees on one travel plan.',
  ].join('\n'),
  usedVocabularyTerms: ['book a ticket', 'pack a suitcase'],
  roles: {
    student: {
      want: ['Travel by train', 'Visit a city near the sea'],
      avoid: ['Very early departures'],
      secret: ['You can spend £120', 'You need to pack a suitcase tonight'],
      mission: ['Ask one follow-up question', 'Suggest one compromise'],
      goal: 'Choose one weekend travel plan together.',
    },
    teacher: {
      want: ['Travel by plane', 'Visit a city with museums'],
      avoid: ['Long train journeys'],
      secret: ['You found a cheap afternoon flight', 'You must book a ticket today'],
      mission: ['Give one reason for your choice', 'Ask whether your partner agrees'],
      goal: 'Choose one weekend travel plan together.',
    },
  },
  speakingSupport: {
    reacting: ['Really?', 'That sounds exciting.', 'I see your point.'],
    followUpQuestions: ['Why do you prefer that?', 'How much will it cost?', 'What should we do first?'],
    clarification: ['What do you mean?', 'Do you mean this weekend?', 'Could you explain?'],
    suggestions: ['How about travelling by train?', 'We could leave after lunch.', 'Why don’t we compare the prices?'],
    agreeingDisagreeing: ['I agree.', 'That makes sense.', 'I see your point, but the train is too slow.'],
    decision: ['So, we agree on the afternoon flight.', 'Let’s choose the seaside city.', 'That is the best plan for both of us.'],
  },
  dialogue: [{
    speaker: 'Teacher', text: 'How about flying to Brighton this weekend?',
  }, {
    speaker: 'Student', text: 'I see your point, but I prefer travelling by train.',
  }, {
    speaker: 'Teacher', text: 'Why do you prefer that?',
  }, {
    speaker: 'Student', text: 'It is relaxing, and I need to pack a suitcase tonight.',
  }, {
    speaker: 'Teacher', text: 'I found a cheap afternoon flight, but we must book a ticket today.',
  }, {
    speaker: 'Student', text: 'That makes sense. Let’s choose the afternoon flight to the seaside.',
  }],
});

module.exports = { GENERATED_GUIDED_SPEAKING };
