'use strict';

const TERMS = Object.freeze([
  'book a ticket',
  'pack a suitcase',
  'catch a flight',
  'miss a flight',
  'go through security',
  'show a passport',
  'board a plane',
  'take off',
  'land',
  'pick up luggage',
]);

const GENERATED_TARGET_VOCABULARY = Object.freeze({
  vocabularyItems: TERMS.map((term, index) => ({
    term,
    definition: [
      'buy or reserve a ticket',
      'put your things into a travel bag',
      'get on your plane before it leaves',
      'arrive too late for your plane',
      'complete the airport safety check',
      'let someone see your travel document',
      'get onto a plane',
      'leave the ground',
      'come down to the ground',
      'collect your bags after a flight',
    ][index],
    imagePrompt: `Child-friendly square educational illustration of travelers who ${term}, bright clean style, no text.`,
  })),
  extraExplanations: [{
    term: 'book a ticket',
    explanation: '“Book” means reserve or buy here, not something you read.',
  }, {
    term: 'catch a flight',
    explanation: '“Catch” means arrive in time and travel on the flight.',
  }, {
    term: 'go through security',
    explanation: 'This is the airport safety check before the gates.',
  }, {
    term: 'board a plane',
    explanation: '“Board” means get onto the plane.',
  }, {
    term: 'pick up luggage',
    explanation: 'This means collect your bags after landing.',
  }],
  contextItems: [{
    before: 'First, I need to', answer: 'book a ticket', after: 'for my summer trip.',
    options: ['book a ticket', 'land', 'pick up luggage'],
  }, {
    before: 'The night before the trip, I', answer: 'pack a suitcase', after: 'with clothes and shoes.',
    options: ['show a passport', 'pack a suitcase', 'take off'],
  }, {
    before: 'I leave home early because I do not want to', answer: 'miss a flight', after: '.',
    options: ['miss a flight', 'board a plane', 'land'],
  }, {
    before: 'At the airport, all passengers', answer: 'go through security', after: 'before visiting the gate.',
    options: ['pick up luggage', 'go through security', 'catch a flight'],
  }, {
    before: 'At passport control, I', answer: 'show a passport', after: 'to an officer.',
    options: ['pack a suitcase', 'show a passport', 'book a ticket'],
  }, {
    before: 'When my group is called, I', answer: 'board a plane', after: 'and find my seat.',
    options: ['board a plane', 'land', 'miss a flight'],
  }, {
    before: 'Soon the plane is ready to', answer: 'take off', after: '.',
    options: ['take off', 'pick up luggage', 'go through security'],
  }, {
    before: 'After we', answer: 'land', after: ', I follow the signs to the baggage area.',
    options: ['catch a flight', 'book a ticket', 'land'],
  }],
  fillInBlanks: [{
    targetTerm: 'book a ticket', before: 'Yesterday I', answer: 'booked a ticket', after: 'online.',
  }, {
    targetTerm: 'pack a suitcase', before: 'Mia', answer: 'packed a suitcase', after: 'for her holiday.',
  }, {
    targetTerm: 'catch a flight', before: 'We left early to', answer: 'catch a flight', after: 'at 8 a.m.',
  }, {
    targetTerm: 'miss a flight', before: 'Leo nearly', answer: 'missed his flight', after: 'because of traffic.',
  }, {
    targetTerm: 'go through security', before: 'Every passenger must', answer: 'go through security', after: 'before boarding.',
  }, {
    targetTerm: 'show a passport', before: 'Please', answer: 'show your passport', after: 'at the desk.',
  }],
  personalizedQuestions: [{
    targetTerm: 'book a ticket',
    question: 'Do you prefer to **book a ticket** online or at a travel office?',
    followUp: 'Why is that way easier for you?',
  }, {
    targetTerm: 'pack a suitcase',
    question: 'When do you usually **pack a suitcase** before a trip?',
    followUp: 'What do you always take with you?',
  }, {
    targetTerm: 'catch a flight',
    question: 'What time do you arrive at the airport to **catch a flight**?',
    followUp: 'How do you travel to the airport?',
  }, {
    targetTerm: 'pick up luggage',
    question: 'Is it usually quick to **pick up luggage** after your flight?',
    followUp: 'Have you ever waited a long time for a bag?',
  }],
  sentenceStarters: [
    'Before a flight, I usually ...',
    'At the airport, I need to ...',
    'One time I nearly ...',
  ],
  describeAndGuessTerms: [
    'book a ticket', 'pack a suitcase', 'catch a flight',
    'go through security', 'board a plane', 'pick up luggage',
  ],
});

module.exports = { GENERATED_TARGET_VOCABULARY, TERMS };
