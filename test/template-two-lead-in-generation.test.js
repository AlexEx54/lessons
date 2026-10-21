'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { syntheticLesson } = require('./helpers/synthetic-lessons.js');
const { GENERATED_TEMPLATE_TWO_WARM_UP } = require('./fixtures/generated-template-two.js');
const { applyStage, stageContent, stageRequest, templateTwoPlan, templateTwoSkeleton } = require('./helpers/template-two.js');

const GENERATED = {
  checkStatements: [
    { text: 'You can get a sunburn on a cloudy day.', answer: 'fact', explanation: 'The sun can burn your skin through clouds.' },
    { text: 'Ice cream melts slowly in the sun.', answer: 'myth', explanation: 'Ice cream melts fast when it is hot.' },
    { text: 'Summer is the warmest season of the year.', answer: 'fact', explanation: 'Summer days are usually the hottest.' },
  ],
  guessStatements: ['Somebody in our stories went camping last summer.', 'Somebody in our stories lost a hat at the beach.'],
  speakingSupport: 'In summer, people usually…\n\nLast summer I…',
};
const buildLeadIn = generated => stageContent('lead-in', generated);

test('generated Template 2 Lead-In builds the note, Fact or Myth, support, and answer key', () => {
  const [note, exercise, key, support] = buildLeadIn(GENERATED);
  assert.equal(note.id, 'lead-in-teacher-note');
  assert.match(note.text, /^\*\*Say:\*\* "Now let's play a game called '\*\*Fact or Myth\?\*\*'/);
  assert.match(note.text, /the words \*\*Fact\*\* \(100% true\) and \*\*Myth\*\* \(false \/ not true\)/);
  assert.match(note.text, /- \*\*Elicit Explanations \(Questions 1–3\):\*\*.*\*\*Speaking Support\*\*/);
  assert.match(note.text, /\*\*Do not reveal the correct answer here!\*\*/);
  assert.match(note.text, /\*\*Post-Task Discussion\*\*\n\n\*\*Say:\*\* "You have some really interesting ideas!/);

  assert.equal(exercise.type, 'factOrMyth');
  assert.deepEqual(exercise.items.map(item => [item.id, item.mode, item.answer]), [
    ['statement-1', 'check', 'fact'],
    ['statement-2', 'check', 'myth'],
    ['statement-3', 'check', 'fact'],
    ['statement-4', 'guess', null],
    ['statement-5', 'guess', null],
  ]);
  assert.equal(exercise.items[3].text, GENERATED.guessStatements[0]);

  assert.equal(support.id, 'lead-in-speaking-support');
  assert.equal(support.text, 'I think it’s a fact / myth because…\n\nIn summer, people usually…\n\nLast summer I…');
  assert.equal(key.studentVisibility, 'teacherOnly');
  assert.match(key.text, /^1\. \*\*FACT\*\* — The sun can burn/);
  assert.match(key.text, /\n5\. \*\*GUESS 🤷\*\*/);
});

test('Template 2 Lead-In hands its guesses to the stories with their task numbers', () => {
  const { variables } = applyStage('lead-in', GENERATED);
  assert.deepEqual(variables.leadInGuesses, [
    { number: 4, text: 'Somebody in our stories went camping last summer.' },
    { number: 5, text: 'Somebody in our stories lost a hat at the beach.' },
  ]);
});

test('synthetic Template 2 Lead-In uses the same teacher note', () => {
  const [note, exercise, support] = syntheticLesson('template-2').stages[1].content;
  assert.equal(note.text, buildLeadIn(GENERATED)[0].text);
  assert.equal(exercise.items[0].text, 'Batman has got a black cape and a black mask.');
  assert.match(support.text, /Batman has got…/);
});

test('generated Template 2 Lead-In rejects damaged content', () => {
  assert.throws(
    () => buildLeadIn({ ...GENERATED, checkStatements: GENERATED.checkStatements.slice(1) }),
    /нужно ровно 3 \(утверждений на проверку\)/,
  );
  const wrongAnswer = structuredClone(GENERATED);
  wrongAnswer.checkStatements[1].answer = 'maybe';
  assert.throws(() => buildLeadIn(wrongAnswer), /Некорректный ответ в строке 2/);
  const markdownStatement = structuredClone(GENERATED);
  markdownStatement.guessStatements[1] = 'Somebody in our stories lost a **hat**.';
  assert.throws(() => buildLeadIn(markdownStatement), /без разметки/);
});

test('Template 2 Lead-In prompt uses the topic, grammar, a neutral guess format and the stories ahead', () => {
  const { messages, schema } = stageRequest('lead-in', { topic: 'Summer time', profile: { ageGroup: '15-18', level: 'B1' } });
  assert.match(messages[0].content, /CEFR level: B1/);
  assert.match(messages[0].content, /Fact or Myth\? template/);
  // The stories in Target Vocabulary ask the Lead-In to prepare guesses for them.
  assert.match(messages[0].content, /Later in this lesson the student reads four short first-person stories/);
  assert.match(messages[0].content, /Start each with "Somebody in our stories"/);
  assert.match(messages[0].content, /Never copy them/);
  assert.equal(messages[1].content, 'Lesson topic: Summer time\nGrammar topic: Past Simple');
  assert.deepEqual(schema.required, ['checkStatements', 'guessStatements', 'speakingSupport']);
  assert.deepEqual(schema.properties.checkStatements.items.properties.answer.enum, ['fact', 'myth']);
});

test('Template 2 recovery restores Lead-In and waits for Target Vocabulary', () => {
  const output = [
    `=== Lesson Metadata ===\n${JSON.stringify({ coverImagePrompt: 'Summer cover, no text.' })}`,
    `=== Warm Up ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_WARM_UP)}`,
    `=== Lead In ===\n${JSON.stringify(GENERATED)}`,
  ].join('\n\n');
  const recovered = recoverLessonGeneration(output, templateTwoSkeleton('Summer time'), templateTwoPlan());
  assert.equal(recovered.complete, false);
  assert.deepEqual(Object.keys(recovered.recoveredSections), ['lessonMetadata', 'warm-up', 'lead-in']);
});
