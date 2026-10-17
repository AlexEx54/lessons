'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { applyLessonMetadataToSkeleton } = require('../lib/ai-lesson-generator.js');
const { createGenerationPlan } = require('../lib/lesson-generation-plan.js');
const { findSystemTemplate } = require('../lib/lesson-templates/system-templates.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { syntheticLesson } = require('./helpers/synthetic-lessons.js');
const { stageContent, stageRequest, templateTwoPlan, templateTwoSkeleton } = require('./helpers/template-two.js');

const GENERATED = {
  rows: [
    { options: ['bus', 'train', 'ticket', 'tram'], answer: 'ticket',
      explanation: 'It is a document; the others are vehicles.' },
    { options: ['ride', 'fast', 'drive', 'walk'], answer: 'fast',
      explanation: 'It is an adjective; the others are verbs.' },
    { options: ['station', 'airport', 'port', 'seat'], answer: 'seat',
      explanation: 'It is inside a vehicle; the others are places.' },
    { options: ['delay', 'journey', 'trip', 'tour'], answer: 'delay',
      explanation: 'It is a problem; the others are kinds of travel.' },
  ],
};
const buildWarmUp = generated => stageContent('warm-up', generated);

test('Template 2 AI skeleton keeps synthetic stages and leaves generated stages empty for the model', () => {
  const skeleton = templateTwoSkeleton('  Travel  ', { ageGroup: '9-11', level: 'B1', model: 'test/model' });
  const synthetic = syntheticLesson('template-2');
  assert.equal(skeleton.meta.topic, 'Travel');
  assert.equal(skeleton.meta.level, 'B1');
  assert.equal(skeleton.meta.ageGroup, '9-11');
  assert.equal(skeleton.meta.generatedBy, 'openrouter:test/model');
  assert.equal(skeleton.meta.durationMinutes, 50);
  assert.equal(skeleton.stages[0].subtitle, 'Find the Odd One Out!');
  for (const index of [0, 1, 2, 4, 5, 6, 7]) assert.deepEqual(skeleton.stages[index].content, []);
  assert.deepEqual(skeleton.stages[3], synthetic.stages[3]);
});

test('generated Template 2 Warm-Up builds the note, Odd One Out, and a linked answer key', () => {
  const [note, exercise, key] = buildWarmUp(GENERATED);
  assert.equal(note.type, 'teacherNote');
  assert.match(note.text, /^\*\*Goal:\*\* The main goal of this stage/);
  assert.match(note.text, /\*\*Error Correction:\*\* Focus purely on fluency/);
  assert.match(note.text, /\*\*Say:\*\* "Hello! How are you today\?/);
  assert.match(note.text, /\*\*Teacher's Tips \(Handling the activity\):\*\*/);
  assert.match(note.text, /\(e\.g\., "Ticket!"\).*'Ticket is the odd one out because\.\.\.'/);
  assert.match(note.text, /- \*\*Scaffolding for weaker students:\*\*/);
  assert.equal(exercise.type, 'oddOneOut');
  assert.deepEqual(exercise.items.map(item => item.id), ['row-1', 'row-2', 'row-3', 'row-4']);
  assert.deepEqual(exercise.items[0].options, GENERATED.rows[0].options);
  assert.equal(key.id, 'warm-up-odd-one-out-answer-key');
  assert.equal(key.title, 'Answer Keys');
  assert.equal(key.studentVisibility, 'teacherOnly');
  assert.match(key.text, /^1\. \*\*ticket\*\* — It is a document/);
});

test('synthetic Template 2 Warm-Up uses the same teacher note', () => {
  const [note] = syntheticLesson('template-2').stages[0].content;
  assert.equal(note.text.replaceAll('Strong', 'Ticket'), buildWarmUp(GENERATED)[0].text);
});

test('generated Template 2 Warm-Up rejects damaged rows', () => {
  assert.throws(() => buildWarmUp({ rows: GENERATED.rows.slice(1) }), /нужно ровно 4 \(строк\), получено 3/);
  const missingAnswer = structuredClone(GENERATED);
  missingAnswer.rows[1].answer = 'slow';
  assert.throws(() => buildWarmUp(missingAnswer), /Отметьте лишнее слово в строке 2/);
  const repeated = structuredClone(GENERATED);
  repeated.rows[2].options[3] = 'Station';
  assert.throws(() => buildWarmUp(repeated), /не должны повторяться/);
  const markdown = structuredClone(GENERATED);
  markdown.rows[3].explanation = 'It is a **problem**.';
  assert.throws(() => buildWarmUp(markdown), /без разметки/);
  assert.throws(() => buildWarmUp({}), /нет поля rows/);
});

test('Template 2 Warm-Up prompt and schema ask only for the four rows', () => {
  const { messages, schema } = stageRequest('warm-up', { warmUpTopic: 'Trains', profile: { ageGroup: '15-18', level: 'B2' } });
  assert.match(messages[0].content, /CEFR level: B2/);
  assert.match(messages[0].content, /Find the Odd One Out/);
  assert.match(messages[0].content, /Create exactly four rows\./);
  assert.match(messages[0].content, /answer must repeat the odd word exactly/);
  assert.equal(messages[1].content, 'Lesson topic: Trains');
  assert.equal(stageRequest('warm-up').messages[1].content, 'Lesson topic: Travel');
  assert.deepEqual(schema.required, ['rows']);
  assert.equal(schema.properties.rows.items.properties.options.minItems, 4);
});

test('Template 2 recovery knows only its own steps', () => {
  const skeleton = templateTwoSkeleton('Travel');
  const plan = templateTwoPlan({ topic: 'Travel' });
  const metadata = { coverImagePrompt: 'Travel cover, no text.' };
  const output = `=== Lesson Metadata ===\n${JSON.stringify(metadata)}\n\n=== Warm Up ===\n${JSON.stringify(GENERATED)}`;
  const recovered = recoverLessonGeneration(output, skeleton, plan);
  // Lead-In is still missing, so the generation continues from it.
  assert.equal(recovered.complete, false);
  assert.deepEqual(Object.keys(recovered.recoveredSections), ['lessonMetadata', 'warm-up']);

  const partial = recoverLessonGeneration(
    `=== Lesson Metadata ===\n${JSON.stringify(metadata)}\n\n=== Warm Up ===\n{"rows":[]}`,
    applyLessonMetadataToSkeleton(skeleton, metadata),
    plan,
  );
  assert.equal(partial.complete, false);
  assert.deepEqual(Object.keys(partial.recoveredSections), ['lessonMetadata']);
  assert.equal(partial.validOutput, `=== Lesson Metadata ===\n${JSON.stringify(metadata)}`);

  const templateOne = createGenerationPlan(findSystemTemplate('template-1').definition, { inputs: { topic: 'Travel', grammarTopic: 'Past Simple' } });
  assert.equal(recoverLessonGeneration(output, skeleton, templateOne).complete, false);
});
