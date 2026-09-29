'use strict';

// Matches the Travel / Past Simple fixtures: vocabulary comes from TRAVEL_TERMS.
const GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION = Object.freeze({
  successCriteria: 'The student tells a short travel story in the Past Simple and asks the teacher two questions.',
  cards: [{
    title: 'My Last Journey',
    questions: [
      'Where did you go on your last journey?',
      'How did you travel there?',
      'What did you take in your luggage?',
      'Was there a delay? What did you do?',
    ],
    miniTask: 'Tell me about your last journey in 4–5 sentences.',
    miniTaskExample: '',
    vocabulary: ['journey', 'luggage', 'delay', 'ticket', 'seat', 'platform'],
    phrases: ['Last summer I went to ...', 'We travelled by ...', 'I took ... with me.', 'There was a ...', 'It was ... because ...'],
    sentenceStarters: ['My last journey was to ...', 'I travelled by ...', 'I packed ...', 'I didn’t ...', 'In the end, I ...'],
  }, {
    title: 'Train or Plane?',
    questions: [
      'Did you prefer the train or the plane last time? Why?',
      'Which trip was more comfortable?',
      'What was difficult about the journey?',
      'Would you choose the same way again?',
    ],
    miniTask: 'Compare two trips you took and say which one was better.',
    miniTaskExample: '',
    vocabulary: ['journey', 'seat', 'delay', 'timetable', 'passport', 'bus stop', 'map'],
    phrases: ['I think the train was better because ...', 'The plane was faster, but ...', 'I didn’t like ...', 'It took ... hours.', 'Next time I ...'],
    sentenceStarters: ['The first trip was ...', 'The second trip was ...', 'I preferred ... because ...', 'I didn’t enjoy ...', 'It took ...'],
  }, {
    title: 'Ask Your Teacher',
    questions: [
      'Where did your teacher go last holiday?',
      'How did they travel?',
      'Did they have any problems on the way?',
      'What did they see there?',
    ],
    miniTask: 'Ask your teacher three questions about their last trip.',
    miniTaskExample: 'Example: Where did you go last holiday?',
    vocabulary: ['ticket', 'passport', 'luggage', 'map', 'bus stop', 'timetable'],
    phrases: ['Where did you ...?', 'How did you ...?', 'Did you ...?', 'What did you ...?', 'Really? That sounds ...'],
    sentenceStarters: ['Where did you ...?', 'Did you have ...?', 'How long did ...?', 'What did you see ...?', 'Did you like ...?'],
  }],
});

module.exports = { GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION };
