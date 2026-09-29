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
const {
  GENERATED_TEMPLATE_TWO_LEAD_IN,
  GENERATED_TEMPLATE_TWO_TARGET_VOCABULARY: GENERATED,
  TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR,
} = require('./fixtures/generated-template-two.js');

const GUESS_STATEMENTS = GENERATED_TEMPLATE_TWO_LEAD_IN.guessStatements;

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
  const recovered = recoverLessonGeneration(TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR, createTemplateTwoSkeleton('Summer time'), 'template-2');
  assert.equal(recovered.complete, false);
  assert.deepEqual(Object.keys(recovered.recoveredSections), ['lessonMetadata', 'warmUp', 'leadIn', 'targetVocabulary']);
});
