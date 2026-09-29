'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  TEMPLATE_2_WARM_UP_RESPONSE_SCHEMA,
  applyLessonMetadataToSkeleton,
  applyTemplateTwoWarmUpToSkeleton,
  buildTemplateTwoWarmUpContent,
  createTemplateTwoSkeleton,
  templateTwoWarmUpMessages,
} = require('../lib/ai-lesson-generator.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');

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

test('Template 2 AI skeleton keeps synthetic stages and leaves generated stages empty for the model', () => {
  const skeleton = createTemplateTwoSkeleton('  Travel  ', { ageGroup: '9-11', level: 'B1', model: 'test/model' });
  const synthetic = createSyntheticLesson('Travel', { template: 'template-2' });
  assert.equal(skeleton.meta.topic, 'Travel');
  assert.equal(skeleton.meta.level, 'B1');
  assert.equal(skeleton.meta.ageGroup, '9-11');
  assert.equal(skeleton.meta.generatedBy, 'openrouter:test/model');
  assert.deepEqual(skeleton.stages[0].content, []);
  assert.equal(skeleton.stages[0].subtitle, 'Find the Odd One Out!');
  assert.deepEqual(skeleton.stages[1].content, []);
  assert.deepEqual(skeleton.stages[2].content, []);
  assert.deepEqual(skeleton.stages[4].content, []);
  assert.deepEqual(skeleton.stages[3], synthetic.stages[3]);
  assert.deepEqual(skeleton.stages.slice(5), synthetic.stages.slice(5));
});

test('generated Template 2 Warm-Up builds the note, Odd One Out, and a linked answer key', () => {
  const [note, exercise, key] = buildTemplateTwoWarmUpContent(GENERATED);
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
  assert.equal(key.studentVisibility, 'teacherOnly');
  assert.match(key.text, /^1\. \*\*ticket\*\* — It is a document/);

  const lesson = applyTemplateTwoWarmUpToSkeleton(createTemplateTwoSkeleton('Travel'), GENERATED);
  assert.deepEqual(lesson.stages[0].content.map(component => component.type), [
    'teacherNote', 'oddOneOut', 'markdownCard',
  ]);
});

test('synthetic Template 2 Warm-Up uses the same teacher note', () => {
  const [note] = createSyntheticLesson('Heroes', { template: 'template-2' }).stages[0].content;
  assert.match(note.text, /\*\*Goal:\*\*/);
  assert.match(note.text, /"Strong!"/);
});

test('generated Template 2 Warm-Up rejects damaged rows', () => {
  assert.throws(() => buildTemplateTwoWarmUpContent({ rows: GENERATED.rows.slice(1) }), /четыре строки/);
  const missingAnswer = structuredClone(GENERATED);
  missingAnswer.rows[1].answer = 'slow';
  assert.throws(() => buildTemplateTwoWarmUpContent(missingAnswer), /Отметьте лишнее слово в строке 2/);
  const repeated = structuredClone(GENERATED);
  repeated.rows[2].options[3] = 'Station';
  assert.throws(() => buildTemplateTwoWarmUpContent(repeated), /не должны повторяться/);
  const markdown = structuredClone(GENERATED);
  markdown.rows[3].explanation = 'It is a **problem**.';
  assert.throws(() => buildTemplateTwoWarmUpContent(markdown), /без разметки/);
});

test('Template 2 Warm-Up prompt and schema ask only for the four rows', () => {
  const messages = templateTwoWarmUpMessages('Travel', { ageGroup: '15-18', level: 'B2' });
  assert.match(messages[0].content, /CEFR level: B2/);
  assert.match(messages[0].content, /Find the Odd One Out/);
  assert.match(messages[0].content, /exactly four rows/);
  assert.match(messages[0].content, /answer must repeat the odd word exactly/);
  assert.equal(messages[1].content, 'Lesson topic: Travel');
  assert.deepEqual(TEMPLATE_2_WARM_UP_RESPONSE_SCHEMA.required, ['rows']);
  assert.equal(TEMPLATE_2_WARM_UP_RESPONSE_SCHEMA.properties.rows.items.properties.options.minItems, 4);
});

test('Template 2 recovery knows only its own sections', () => {
  const skeleton = createTemplateTwoSkeleton('Travel');
  const metadata = { coverImagePrompt: 'Travel cover, no text.' };
  const output = `=== Lesson Metadata ===\n${JSON.stringify(metadata)}\n\n=== Warm-Up ===\n${JSON.stringify(GENERATED)}`;
  const recovered = recoverLessonGeneration(output, skeleton, 'template-2');
  // Lead-In is still missing, so the generation continues from it.
  assert.equal(recovered.complete, false);
  assert.deepEqual(Object.keys(recovered.recoveredSections), ['lessonMetadata', 'warmUp']);

  const partial = recoverLessonGeneration(
    `=== Lesson Metadata ===\n${JSON.stringify(metadata)}\n\n=== Warm-Up ===\n{"rows":[]}`,
    applyLessonMetadataToSkeleton(skeleton, metadata),
    'template-2',
  );
  assert.equal(partial.complete, false);
  assert.deepEqual(Object.keys(partial.recoveredSections), ['lessonMetadata']);
  assert.equal(partial.validOutput, `=== Lesson Metadata ===\n${JSON.stringify(metadata)}`);

  assert.equal(recoverLessonGeneration(output, skeleton, 'template-1').complete, false);
  assert.throws(() => recoverLessonGeneration(output, skeleton, 'template-9'), /Неизвестный шаблон/);
});
