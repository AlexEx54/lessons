'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  TEMPLATE_2_TARGET_VOCABULARY_RESPONSE_SCHEMA,
  applyTemplateTwoTargetVocabularyToSkeleton,
  buildTemplateTwoTargetVocabularyContent,
  createTemplateTwoSkeleton,
  templateTwoTargetVocabularyMessages,
} = require('../lib/ai-lesson-generator.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');

const GUESS_STATEMENTS = ['Somebody in our stories went camping last summer.', 'Somebody in our stories lost a hat at the beach.'];

const TERMS = ['go camping', 'tent', 'sunscreen', 'sunburn', 'sandy beach', 'sunglasses', 'waves', 'shell', 'ice cream', 'campfire'];

const GENERATED = {
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

test('generated Template 2 Target Vocabulary builds stories, guess answers and all tasks', () => {
  const content = buildTemplateTwoTargetVocabularyContent(GENERATED, GUESS_STATEMENTS);
  assert.deepEqual(content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'storyCards', 'markdownCard', 'multipleChoice',
    'dropdownChoice', 'dragWordsInText', 'gapFill', 'personalizedQuestions', 'markdownCard',
  ]);
  const [note, vocabulary, stories, guesses, meanings, context, drag, extra, questions, starters] = content;
  assert.match(note.blocks[1].text, /догадкам 4–5 из Lead-In/);
  assert.doesNotMatch(note.blocks[1].text, /супергеро/);
  assert.match(vocabulary.text, /^1\. \*\*go camping\*\* — meaning of go camping\n2\. \*\*tent\*\*/);
  assert.deepEqual(stories.items.map(item => [item.id, item.title, item.backgroundColor]), [
    ['story-1', 'Mia', '#EAE4FC'], ['story-2', 'Tom', '#FCE3F0'], ['story-3', 'Ana', '#FFF0E5'], ['story-4', 'Leo', '#E2FBFB'],
  ]);
  assert.equal(guesses.studentVisibility, 'teacherOnly');
  assert.equal(guesses.text, [
    '**4.** Somebody in our stories went camping last summer. — **FACT** · Mia: “Last summer I went camping with my dad.”',
    '**5.** Somebody in our stories lost a hat at the beach. — **MYTH** · Tom: “I wore my hat all day.”',
  ].join('\n\n'));
  assert.equal(meanings.items[0].question, 'What does “go camping” mean?');
  assert.deepEqual(meanings.items[1].options, ['wrong meaning of tent', 'meaning of tent']);
  assert.match(context.text, /^Meet Sam\. He \[\[context-1\]\] with friends\./);
  assert.ok(context.choices.every((choice, index) => choice.answer === GENERATED.contextChoices[index].answer
    && choice.options.includes(choice.answer)));
  assert.deepEqual(drag.words, ['campfire', 'shell', 'sunburn', 'sunscreen', 'tent', 'waves']);
  assert.match(extra.text, /^1\. Last summer I saw \*\*перевод go camping\*\* \[\[extra-1\]\]/);
  assert.equal(extra.gaps[9].answer, 'campfire');
  assert.equal(questions.items[0].id, 'question-1');
  assert.match(starters.text, /- \*\*Last summer I \.\.\.\*\*/);

  const lesson = applyTemplateTwoTargetVocabularyToSkeleton(createTemplateTwoSkeleton('Summer time'), GENERATED, GUESS_STATEMENTS);
  assert.equal(lesson.stages[2].content.length, 10);
});

test('synthetic Template 2 Target Vocabulary answers its own Lead-In guesses', () => {
  const lesson = createSyntheticLesson('Heroes', { template: 'template-2' });
  const [, guessOne, guessTwo] = lesson.stages[1].content[1].items.slice(2);
  const guesses = lesson.stages[2].content[3];
  assert.equal(guesses.id, 'target-vocabulary-guess-answers');
  assert.match(guesses.text, new RegExp(`^\\*\\*4\\.\\*\\* ${guessOne.text} — \\*\\*FACT\\*\\* · Forest Elf`));
  assert.match(guesses.text, new RegExp(`\\n\\n\\*\\*5\\.\\*\\* ${guessTwo.text} — \\*\\*MYTH\\*\\* · Moon Girl`));
});

test('generated Template 2 Target Vocabulary rejects damaged content', () => {
  assert.throws(
    () => buildTemplateTwoTargetVocabularyContent({ ...GENERATED, stories: GENERATED.stories.slice(1) }, GUESS_STATEMENTS),
    /4 истории/,
  );
  const wrongStory = structuredClone(GENERATED);
  wrongStory.guessChecks[0].story = 'Nobody';
  assert.throws(() => buildTemplateTwoTargetVocabularyContent(wrongStory, GUESS_STATEMENTS), /дословно совпадать/);
  const madeUpEvidence = structuredClone(GENERATED);
  madeUpEvidence.guessChecks[1].evidence = 'I lost my hat.';
  assert.throws(() => buildTemplateTwoTargetVocabularyContent(madeUpEvidence, GUESS_STATEMENTS), /дословно совпадать/);
  const markdownStarter = structuredClone(GENERATED);
  markdownStarter.sentenceStarters[0] = '**Last summer** I ...';
  assert.throws(() => buildTemplateTwoTargetVocabularyContent(markdownStarter, GUESS_STATEMENTS), /без разметки/);
  const wrongAnswer = structuredClone(GENERATED);
  wrongAnswer.contextChoices[0].answer = 'campfire';
  assert.throws(() => buildTemplateTwoTargetVocabularyContent(wrongAnswer, GUESS_STATEMENTS));
});

test('Template 2 Target Vocabulary prompt passes the topic, grammar and Lead-In guesses', () => {
  const messages = templateTwoTargetVocabularyMessages('Summer time', 'Past Simple', GUESS_STATEMENTS, { ageGroup: '15-18', level: 'B1' });
  assert.match(messages[0].content, /CEFR level: B1/);
  assert.match(messages[0].content, /confirmed or clearly contradicted by exactly one story/);
  assert.match(messages[0].content, /Never copy them/);
  assert.equal(messages[1].content, [
    'Lesson topic: Summer time',
    'Grammar topic: Past Simple',
    'Guess statements from the Lead-In:',
    '1. Somebody in our stories went camping last summer.',
    '2. Somebody in our stories lost a hat at the beach.',
  ].join('\n'));
  assert.deepEqual(TEMPLATE_2_TARGET_VOCABULARY_RESPONSE_SCHEMA.properties.guessChecks.items.properties.answer.enum, ['fact', 'myth']);
});

test('Template 2 recovery rebuilds Target Vocabulary with the recovered Lead-In guesses', () => {
  const leadIn = {
    checkStatements: [
      { text: 'You can get a sunburn on a cloudy day.', answer: 'fact', explanation: 'The sun can burn your skin through clouds.' },
      { text: 'Ice cream melts slowly in the sun.', answer: 'myth', explanation: 'Ice cream melts fast when it is hot.' },
      { text: 'Summer is the warmest season of the year.', answer: 'fact', explanation: 'Summer days are usually the hottest.' },
    ],
    guessStatements: GUESS_STATEMENTS,
    speakingSupport: ['In summer, people usually…', 'Last summer I…'],
  };
  const warmUp = {
    rows: [
      { options: ['beach', 'sea', 'sand', 'snow'], answer: 'snow', explanation: 'It is cold; the others are at the seaside.' },
      { options: ['swim', 'hot', 'run', 'jump'], answer: 'hot', explanation: 'It is an adjective; the others are verbs.' },
      { options: ['hat', 'sunglasses', 'scarf', 'shorts'], answer: 'scarf', explanation: 'It is for winter; the others are for summer.' },
      { options: ['ice cream', 'lemonade', 'soup', 'watermelon'], answer: 'soup', explanation: 'It is hot food; the others are cold.' },
    ],
  };
  const output = [
    `=== Lesson Metadata ===\n${JSON.stringify({ coverImagePrompt: 'Summer cover, no text.' })}`,
    `=== Warm-Up ===\n${JSON.stringify(warmUp)}`,
    `=== Lead-In ===\n${JSON.stringify(leadIn)}`,
    `=== Target Vocabulary ===\n${JSON.stringify(GENERATED)}`,
  ].join('\n\n');
  const recovered = recoverLessonGeneration(output, createTemplateTwoSkeleton('Summer time'), 'template-2');
  assert.equal(recovered.complete, true);
  assert.deepEqual(Object.keys(recovered.recoveredSections), ['lessonMetadata', 'warmUp', 'leadIn', 'targetVocabulary']);
});
