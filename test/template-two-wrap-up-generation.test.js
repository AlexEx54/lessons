'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTemplateTwoSkeleton } = require('../lib/ai-lesson-generator.js');
const { createTemplateTwoLesson } = require('../lib/synthetic-template-two.js');
const { getLessonGenerationSections } = require('../lib/lesson-generation-sections.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { GENERATED_TEMPLATE_TWO_WRAP_UP } = require('./fixtures/generated-template-two-wrap-up.js');
const { GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION } = require('./fixtures/generated-template-two-guided-communication.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS, TRAVEL_TERMS } = require('./fixtures/generated-template-two-grammar-focus.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION } = require('./fixtures/generated-template-two-grammar-presentation.js');
const { TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR } = require('./fixtures/generated-template-two.js');

const vocabularyItems = TRAVEL_TERMS.map(term => ({ term, definition: 'meaning' }));
const byId = (items, id) => items.find(item => item.id === id);
const wrapUpSection = () => getLessonGenerationSections('template-2').at(-1);

test('Template 2 Wrap-Up is the last generated section and receives grammar and vocabulary', () => {
  const section = wrapUpSection();
  assert.equal(section.key, 'wrapUp');
  assert.deepEqual(section.options({ grammarTopic: 'Past Simple' }, { targetVocabulary: { vocabularyItems } }),
    { grammarTopic: 'Past Simple', vocabularyItems });
});

test('Template 2 Wrap-Up fills the synthetic structure and keeps other stages', () => {
  const skeleton = createTemplateTwoSkeleton('Travel');
  const synthetic = createTemplateTwoLesson('Travel');
  assert.deepEqual(byId(skeleton.stages, 'wrap-up').content, []);
  const lesson = wrapUpSection().apply(skeleton, GENERATED_TEMPLATE_TWO_WRAP_UP);
  assert.deepEqual(lesson.stages.filter(stage => stage.id !== 'wrap-up'), skeleton.stages.filter(stage => stage.id !== 'wrap-up'));
  const content = byId(lesson.stages, 'wrap-up').content;
  const syntheticContent = byId(synthetic.stages, 'wrap-up').content;
  assert.deepEqual(content.map(component => [component.type, component.id]), syntheticContent.map(component => [component.type, component.id]));
  assert.deepEqual(content[2], syntheticContent[2]);
  assert.match(content[0].text, /^- \*\*Signs of success:\*\* The student names three travel words/);
  assert.equal(content[1].steps.two.text, '1. Say how you travelled last time.\n2. Say what you forgot or lost on a trip.');
  assert.equal(content[3].text, 'Last summer I went to ... / I travelled by ... / I didn’t take my ...');
});

test('Template 2 recovery completes with Wrap-Up and drops an interrupted one', t => {
  // The shared recovery fixture has summer vocabulary, so the travel word lists only warn.
  t.mock.method(console, 'warn', () => {});
  const skeleton = createTemplateTwoSkeleton('Summer time');
  const beforeWrapUp = [
    TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR,
    `=== Grammar Presentation ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION)}`,
    `=== Grammar Focus ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS)}`,
    `=== Guided Communication ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION)}`,
  ].join('\n\n');
  const complete = recoverLessonGeneration(`${beforeWrapUp}\n\n=== Wrap-Up ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_WRAP_UP)}`, skeleton, 'template-2');
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.recoveredSections.wrapUp, GENERATED_TEMPLATE_TWO_WRAP_UP);
  const interrupted = recoverLessonGeneration(`${beforeWrapUp}\n\n=== Wrap-Up ===\n{"teacherNotes":`, skeleton, 'template-2');
  assert.equal(interrupted.complete, false);
  assert.equal(interrupted.validOutput, beforeWrapUp);
});
