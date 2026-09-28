'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  TEMPLATE_2_LEAD_IN_RESPONSE_SCHEMA,
  applyTemplateTwoLeadInToSkeleton,
  buildTemplateTwoLeadInContent,
  createTemplateTwoSkeleton,
  templateTwoLeadInMessages,
} = require('../lib/ai-lesson-generator.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');

const GENERATED = {
  checkStatements: [
    { text: 'You can get a sunburn on a cloudy day.', answer: 'fact', explanation: 'The sun can burn your skin through clouds.' },
    { text: 'Ice cream melts slowly in the sun.', answer: 'myth', explanation: 'Ice cream melts fast when it is hot.' },
    { text: 'Summer is the warmest season of the year.', answer: 'fact', explanation: 'Summer days are usually the hottest.' },
  ],
  guessStatements: ['Somebody in our stories went camping last summer.', 'Somebody in our stories lost a hat at the beach.'],
  speakingSupport: ['In summer, people usually…', 'Last summer I…'],
};

test('generated Template 2 Lead-In builds the note, Fact or Myth, support, and answer key', () => {
  const [note, exercise, support, key] = buildTemplateTwoLeadInContent(GENERATED);
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

  const lesson = applyTemplateTwoLeadInToSkeleton(createTemplateTwoSkeleton('Summer time'), GENERATED);
  assert.deepEqual(lesson.stages[1].content, [note, exercise, support, key]);
});

test('synthetic Template 2 Lead-In uses the same teacher note', () => {
  const [note, exercise, support] = createSyntheticLesson('Heroes', { template: 'template-2' }).stages[1].content;
  assert.equal(note.text, buildTemplateTwoLeadInContent(GENERATED)[0].text);
  assert.equal(exercise.items[0].text, 'Batman has got a black cape and a black mask.');
  assert.match(support.text, /Batman has got…/);
});

test('generated Template 2 Lead-In rejects damaged content', () => {
  assert.throws(
    () => buildTemplateTwoLeadInContent({ ...GENERATED, checkStatements: GENERATED.checkStatements.slice(1) }),
    /3 утверждения на проверку, 2 на догадку/,
  );
  assert.throws(() => buildTemplateTwoLeadInContent({ ...GENERATED, speakingSupport: ['Only one…'] }), /2 опоры/);
  const wrongAnswer = structuredClone(GENERATED);
  wrongAnswer.checkStatements[1].answer = 'maybe';
  assert.throws(() => buildTemplateTwoLeadInContent(wrongAnswer), /Некорректный ответ в строке 2/);
  const markdownStatement = structuredClone(GENERATED);
  markdownStatement.guessStatements[1] = 'Somebody in our stories lost a **hat**.';
  assert.throws(() => buildTemplateTwoLeadInContent(markdownStatement), /без разметки/);
  assert.throws(
    () => buildTemplateTwoLeadInContent({ ...GENERATED, speakingSupport: ['# Heading', 'Last summer I…'] }),
    /Speaking Support должны быть обычным текстом/,
  );
});

test('Template 2 Lead-In prompt uses the topic, grammar, and a neutral guess format', () => {
  const messages = templateTwoLeadInMessages('Summer time', 'Past Simple', { ageGroup: '15-18', level: 'B1' });
  assert.match(messages[0].content, /CEFR level: B1/);
  assert.match(messages[0].content, /Fact or Myth\? template/);
  assert.match(messages[0].content, /Start each with "Somebody in our stories"/);
  assert.match(messages[0].content, /Never copy them/);
  assert.equal(messages[1].content, 'Lesson topic: Summer time\nGrammar topic: Past Simple');
  assert.deepEqual(TEMPLATE_2_LEAD_IN_RESPONSE_SCHEMA.required, ['checkStatements', 'guessStatements', 'speakingSupport']);
  assert.deepEqual(
    TEMPLATE_2_LEAD_IN_RESPONSE_SCHEMA.properties.checkStatements.items.properties.answer.enum,
    ['fact', 'myth'],
  );
});

test('Template 2 recovery is complete only with Lead-In', () => {
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
    `=== Lead-In ===\n${JSON.stringify(GENERATED)}`,
  ].join('\n\n');
  const recovered = recoverLessonGeneration(output, createTemplateTwoSkeleton('Summer time'), 'template-2');
  assert.equal(recovered.complete, true);
  assert.deepEqual(Object.keys(recovered.recoveredSections), ['lessonMetadata', 'warmUp', 'leadIn']);
});
