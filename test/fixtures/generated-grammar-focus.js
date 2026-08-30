'use strict';

const GENERATED_GRAMMAR_FOCUS = Object.freeze({
  teacherNotes: {
    transitionPhrases: '- “Now let’s practise the Past Simple.”\n- “Choose the form that completes each past event.”',
    struggleTips: '- Ask the learner to find past-time expressions.\n- Remind them that questions and negatives use **did + base verb**.',
    correctionTiming: '- **Correct now:** wrong Past Simple verb forms.\n- **Correct later:** small pronunciation or vocabulary slips.',
    successCriteria: '- The learner uses the Past Simple correctly four or five times.\n- They can make a negative and ask a past question.',
  },
  task1Items: [{
    before: 'Last month, I ', after: ' a ticket to London.',
    options: ['booked', 'book', 'am booking'], answer: 'booked',
    explanation: 'Last month shows a finished past action.',
  }, {
    before: 'Mia did not ', after: ' her flight.',
    options: ['missed', 'miss', 'missing'], answer: 'miss',
    explanation: 'After did not, use the base verb.',
  }, {
    before: 'Did Leo ', after: ' a suitcase?',
    options: ['packed', 'packs', 'pack'], answer: 'pack',
    explanation: 'After Did, use the base verb.',
  }, {
    before: 'We ', after: ' through security at eight.',
    options: ['go', 'went', 'are going'], answer: 'went',
    explanation: 'Went is the Past Simple form of go.',
  }, {
    before: 'The passengers ', after: ' their passports at the desk.',
    options: ['showed', 'show', 'are showing'], answer: 'showed',
    explanation: 'The completed airport action needs the Past Simple.',
  }, {
    before: 'The plane ', after: ' on time yesterday.',
    options: ['lands', 'landed', 'is landing'], answer: 'landed',
    explanation: 'Yesterday tells us to use the Past Simple.',
  }, {
    before: 'We did not ', after: ' our luggage immediately.',
    options: ['picked up', 'picking up', 'pick up'], answer: 'pick up',
    explanation: 'Use the base form after did not.',
  }, {
    before: 'Did the plane ', after: ' at nine?',
    options: ['take off', 'took off', 'takes off'], answer: 'take off',
    explanation: 'Use the base form after Did.',
  }],
  task2Dialogue: '**Mia:** Where {{gap}} you {{gap}} last weekend?\n**Leo:** I {{gap}} to Paris with my family.\n**Mia:** How did you get ready?\n**Leo:** I {{gap}} a ticket and {{gap}} a suitcase.\n**Mia:** {{gap}} you {{gap}} the early flight?\n**Leo:** Yes. We {{gap}} through security and the plane {{gap}} at seven.',
  task2Gaps: [{ answer: 'did', example: '' }, { answer: 'go', example: 'go' },
    { answer: 'travelled', example: 'travel' }, { answer: 'booked', example: 'book' },
    { answer: 'packed', example: 'pack' }, { answer: 'Did', example: '' },
    { answer: 'catch', example: 'catch' }, { answer: 'went', example: 'go' },
    { answer: 'took off', example: 'take off' }],
  miniSituation: {
    prompt: 'You came home after an exciting flight. Tell a friend how you prepared, what happened at the airport, and what you enjoyed most.',
    imagePrompt: 'Child-friendly educational illustration of a happy young traveler arriving at an airport with a suitcase, no text.',
  },
  writingSupport: [
    'Last weekend, I ...', 'First, I ...', 'At the airport, we ...',
    'I did not ...', 'My favourite moment was ... because ...',
  ],
  supportWordBank: [
    'book a ticket', 'pack a suitcase', 'catch a flight', 'miss a flight',
    'go through security', 'show a passport', 'board a plane', 'take off',
  ],
  modelSentence: 'Last weekend, I booked a ticket and flew to London.',
  challengeItems: [
    'Add one negative Past Simple sentence.',
    'Ask one Past Simple question.',
    'Give a reason with because.',
    'Use at least three words from the word bank.',
    'Link two ideas with but or so.',
  ],
});

module.exports = { GENERATED_GRAMMAR_FOCUS };
