'use strict';

// A consistent Template 2 generation up to Target Vocabulary: the stories answer the Lead-In guesses.
const GUESS_STATEMENTS = ['Somebody in our stories went camping last summer.', 'Somebody in our stories lost a hat at the beach.'];

const TERMS = ['go camping', 'tent', 'sunscreen', 'sunburn', 'sandy beach', 'sunglasses', 'waves', 'shell', 'ice cream', 'campfire'];

const GENERATED_TEMPLATE_TWO_TARGET_VOCABULARY = {
  stories: [
    { name: 'Mia', emoji: '⛺', text: 'Last summer I **went camping** with my dad. We slept in a small **tent** and sat by the **campfire** every night.' },
    { name: 'Tom', emoji: '🏖️', text: 'I went to a **sandy beach** in July. I forgot my **sunscreen**, so I got a bad **sunburn**. I wore my hat all day.' },
    { name: 'Ana', emoji: '🌊', text: 'I loved the big **waves**. I found a beautiful **shell** on the sand and took it home.' },
    { name: 'Leo', emoji: '🍦', text: 'Every day I ate **ice cream** in the park. I wore my new **sunglasses** because it was very sunny.' },
  ],
  vocabularyItems: TERMS.map(term => ({ term, definition: `meaning of ${term}`, distractor: `wrong meaning of ${term}` })),
  guessChecks: [
    { story: 'Mia', answer: 'fact', evidence: 'Last summer I went camping with my dad.' },
    { story: 'Tom', answer: 'myth', evidence: 'I wore my hat all day.' },
  ],
  contextText: 'Meet Sam. He [[1]] with friends. They had a [[2]]. He used [[3]] but got a [[4]]. The [[5]] were big. He found a [[6]]. He wore [[7]]. He ate [[8]].',
  contextChoices: [
    { options: ['went camping', 'tent', 'shell'], answer: 'went camping' },
    { options: ['tent', 'waves', 'sunburn'], answer: 'tent' },
    { options: ['sunscreen', 'shell', 'tent'], answer: 'sunscreen' },
    { options: ['sunburn', 'tent', 'shell'], answer: 'sunburn' },
    { options: ['waves', 'tent', 'shell'], answer: 'waves' },
    { options: ['shell', 'tent', 'waves'], answer: 'shell' },
    { options: ['sunglasses', 'tent', 'shell'], answer: 'sunglasses' },
    { options: ['ice cream', 'tent', 'shell'], answer: 'ice cream' },
  ],
  dragSentences: [
    'We slept in a [[tent]].',
    'Put on [[sunscreen]] before you swim.',
    'I got a [[sunburn]] on my nose.',
    'The [[waves]] were very high.',
    'She found a pink [[shell]].',
    'We sang songs around the [[campfire]].',
  ],
  translationSentences: TERMS.map(term => ({ before: 'Last summer I saw', hint: `перевод ${term}`, answer: term })),
  personalizedQuestions: [
    { question: 'Have you ever **gone camping**?', followUp: 'Where did you go?' },
    { question: 'Do you like **ice cream**?', followUp: 'What flavour?' },
    { question: 'Do you wear **sunglasses** in summer?', followUp: 'Why?' },
    { question: 'Have you ever had a **sunburn**?', followUp: 'What happened?' },
  ],
  sentenceStarters: ['Last summer I ...', 'I usually ...', 'My favourite ...'],
};

const GENERATED_TEMPLATE_TWO_LEAD_IN = {
  checkStatements: [
    { text: 'You can get a sunburn on a cloudy day.', answer: 'fact', explanation: 'The sun can burn your skin through clouds.' },
    { text: 'Ice cream melts slowly in the sun.', answer: 'myth', explanation: 'Ice cream melts fast when it is hot.' },
    { text: 'Summer is the warmest season of the year.', answer: 'fact', explanation: 'Summer days are usually the hottest.' },
  ],
  guessStatements: GUESS_STATEMENTS,
  speakingSupport: ['In summer, people usually…', 'Last summer I…'],
};

const GENERATED_TEMPLATE_TWO_WARM_UP = {
  rows: [
    { options: ['beach', 'sea', 'sand', 'snow'], answer: 'snow', explanation: 'It is cold; the others are at the seaside.' },
    { options: ['swim', 'hot', 'run', 'jump'], answer: 'hot', explanation: 'It is an adjective; the others are verbs.' },
    { options: ['hat', 'sunglasses', 'scarf', 'shorts'], answer: 'scarf', explanation: 'It is for winter; the others are for summer.' },
    { options: ['ice cream', 'lemonade', 'soup', 'watermelon'], answer: 'soup', explanation: 'It is hot food; the others are cold.' },
  ],
};

// Recovery output of every section before Grammar Presentation.
const TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR = [
  `=== Lesson Metadata ===\n${JSON.stringify({ coverImagePrompt: 'Summer cover, no text.' })}`,
  `=== Warm-Up ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_WARM_UP)}`,
  `=== Lead-In ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_LEAD_IN)}`,
  `=== Target Vocabulary ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_TARGET_VOCABULARY)}`,
].join('\n\n');

module.exports = {
  GENERATED_TEMPLATE_TWO_LEAD_IN,
  GENERATED_TEMPLATE_TWO_TARGET_VOCABULARY,
  TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR,
};
