'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { syntheticLesson } = require('./helpers/synthetic-lessons.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { GENERATED_TEMPLATE_TWO_WRAP_UP } = require('./fixtures/generated-template-two-wrap-up.js');
const { GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION } = require('./fixtures/generated-template-two-guided-communication.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS, TRAVEL_TERMS } = require('./fixtures/generated-template-two-grammar-focus.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION } = require('./fixtures/generated-template-two-grammar-presentation.js');
const { TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR } = require('./fixtures/generated-template-two.js');
const { TEMPLATE_TWO, applyStage, byId, stageContent, stageRequest, templateTwoPlan, templateTwoSkeleton } = require('./helpers/template-two.js');

const vocabularyItems = TRAVEL_TERMS.map(term => ({ term, definition: 'meaning' }));
const variables = { targetVocabulary: vocabularyItems };

test('Template 2 Wrap-Up is the last generated step and receives grammar and vocabulary', () => {
  assert.equal(TEMPLATE_TWO.steps.at(-1).key, 'wrap-up');
  const { messages, schema } = stageRequest('wrap-up', { variables });
  assert.equal(messages[1].content, `Lesson topic: Travel\nGrammar topic: Past Simple\nTarget Vocabulary: ${JSON.stringify(TRAVEL_TERMS)}`);
  assert.match(messages[0].content, /positiveEnding: One concise line for Teacher’s Notes: a ready-to-say positive ending\./);
  assert.deepEqual(schema.required, ['signsOfSuccess', 'struggleSupport', 'positiveEnding', 'threePrompt', 'twoPrompt', 'twoCues', 'onePrompt', 'possibleLanguage']);
});

test('Template 2 Wrap-Up fills the synthetic structure and keeps other stages', () => {
  const skeleton = templateTwoSkeleton('Travel');
  const synthetic = syntheticLesson('template-2');
  const { lesson } = applyStage('wrap-up', GENERATED_TEMPLATE_TWO_WRAP_UP, { variables });
  assert.deepEqual(lesson.stages.filter(stage => stage.id !== 'wrap-up'), skeleton.stages.filter(stage => stage.id !== 'wrap-up'));
  const content = byId(lesson.stages, 'wrap-up').content;
  const syntheticContent = byId(synthetic.stages, 'wrap-up').content;
  assert.deepEqual(content.map(component => [component.type, component.id]), syntheticContent.map(component => [component.type, component.id]));
  assert.deepEqual(content[2], syntheticContent[2]);
  assert.match(content[0].text, /^- \*\*Signs of success:\*\* The student names three travel words/);
  assert.equal(content[1].steps.two.text, '1. Say how you travelled last time.\n2. Say what you forgot or lost on a trip.');
  assert.equal(content[3].text, 'Last summer I went to ... / I travelled by ... / I didn’t take my ...');
});

test('Template 2 Wrap-Up rejects Russian in the 3–2–1 task', () => {
  const russianTask = structuredClone(GENERATED_TEMPLATE_TWO_WRAP_UP);
  russianTask.twoCues[0] = 'Расскажи о поездке.';
  assert.throws(() => stageContent('wrap-up', russianTask, { variables }), /нужен текст только на английском/);
});

test('Template 2 recovery completes with Wrap-Up and drops an interrupted one', t => {
  // The shared recovery fixture has summer vocabulary, so the travel word lists only warn.
  t.mock.method(console, 'warn', () => {});
  const skeleton = templateTwoSkeleton('Summer time');
  const beforeWrapUp = [
    TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR,
    `=== Grammar Presentation ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION)}`,
    `=== Grammar Focus ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS)}`,
    `=== Guided Communication ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION)}`,
  ].join('\n\n');
  const complete = recoverLessonGeneration(`${beforeWrapUp}\n\n=== Wrap-Up ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_WRAP_UP)}`, skeleton, templateTwoPlan());
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.recoveredSections['wrap-up'], GENERATED_TEMPLATE_TWO_WRAP_UP);
  const interrupted = recoverLessonGeneration(`${beforeWrapUp}\n\n=== Wrap-Up ===\n{"signsOfSuccess":`, skeleton, templateTwoPlan());
  assert.equal(interrupted.complete, false);
  assert.equal(interrupted.validOutput, beforeWrapUp);
});
