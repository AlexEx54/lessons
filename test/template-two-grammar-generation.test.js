'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OPENROUTER_MODEL,
  buildTemplateTwoGrammarPresentationContent: build,
  applyTemplateTwoGrammarPresentationToSkeleton: apply,
  createTemplateTwoSkeleton,
  templateTwoGrammarPresentationMessages,
  generateTemplateTwoGrammarPresentation,
  TEMPLATE_2_GRAMMAR_PRESENTATION_RESPONSE_SCHEMA,
} = require('../lib/ai-lesson-generator.js');
const { createTemplateTwoLesson } = require('../lib/synthetic-template-two.js');
const { getLessonGenerationSections } = require('../lib/lesson-generation-sections.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION: generated } = require('./fixtures/generated-template-two-grammar-presentation.js');
const { TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR } = require('./fixtures/generated-template-two.js');
const vocabularyItems = Array.from({ length: 10 }, (_, index) => ({ term: `travel word ${index}`, definition: 'meaning' }));
const byId = (items, id) => items.find(item => item.id === id);

test('Template 2 generates discovery and checkbox grammar while preserving static Watch', () => {
  const skeleton = createTemplateTwoSkeleton('Travel');
  const synthetic = createTemplateTwoLesson('Travel');
  assert.deepEqual(byId(skeleton.stages, 'grammar-presentation').content, []);
  const lesson = apply(skeleton, generated, () => 0);
  assert.deepEqual(byId(skeleton.stages, 'grammar-presentation').content, []);
  assert.deepEqual(byId(lesson.stages, 'watch-and-interact'), byId(synthetic.stages, 'watch-and-interact'));
  const content = byId(lesson.stages, 'grammar-presentation').content;
  assert.deepEqual(content.map(c => c.type), ['teacherNote', 'textPanel', 'textPanel', 'dragWordsInText', 'markdownCard', 'checkboxChoice', 'markdownCard']);
  assert.deepEqual(byId(content, 'grammar-presentation-teacher-note'), byId(byId(synthetic.stages, 'grammar-presentation').content, 'grammar-presentation-teacher-note'));
  const task = byId(content, 'grammar-presentation-check-the-rule');
  // The application shuffles the sentences instead of trusting the model's order.
  assert.deepEqual(task.items[0].options, [1, 2, 3, 4, 5, 6, 7, 0].map(index => generated.checkItems[index].sentence));
  assert.equal(task.items[0].answers.length, 4);
  const key = byId(content, 'grammar-presentation-answer-key');
  assert.equal(key.studentVisibility, 'teacherOnly');
  assert.equal(byId(key.sections, 'task-two-answers').text, 'Correct sentences: 2, 3, 6, 8.');
  assert.match(byId(key.sections, 'short-explanations').text, /^- \*We did not caught the train\.\* — After did not, use catch/);
});

test('Template 2 grammar validates counts, booleans, explanations, duplicates and shared discovery rules', () => {
  for (const mutate of [
    g => g.checkItems.pop(),
    g => { g.checkItems[0].isCorrect = false; },
    g => { g.checkItems[0].isCorrect = 'true'; },
    g => { g.checkItems[1].sentence = g.checkItems[0].sentence; },
    g => { g.checkItems[1].explanation = ''; },
    g => g.examples.pop(),
    g => { g.ruleDistractors[0] = g.ruleItems[0].answer; },
  ]) {
    const invalid = structuredClone(generated);
    mutate(invalid);
    assert.throws(() => build(invalid));
  }
});

test('Template 2 pipeline passes vocabulary and grammar; prompt has checkbox instructions', () => {
  const section = getLessonGenerationSections('template-2').find(candidate => candidate.key === 'grammarPresentation');
  const options = section.options({ grammarTopic: 'Past Simple' }, { targetVocabulary: { vocabularyItems } });
  assert.deepEqual(options, { grammarTopic: 'Past Simple', vocabularyItems });
  const messages = templateTwoGrammarPresentationMessages('Travel', options.grammarTopic, options.vocabularyItems, { ageGroup: '15-17', level: 'B1' });
  assert.match(messages[0].content, /Exactly four sentences/);
  assert.match(messages[0].content, /Leave explanation empty for correct sentences/);
  assert.match(messages[0].content, /Inflection is allowed/);
  assert.doesNotMatch(messages[0].content, /five checkItems|three distinct options/);
  assert.equal(messages[1].content, `Lesson topic: Travel\nGrammar topic: Past Simple\nTarget Vocabulary: ${JSON.stringify(vocabularyItems.map(item => item.term))}`);
});

test('Template 2 recovery keeps Grammar Presentation and drops an interrupted one', () => {
  const skeleton = createTemplateTwoSkeleton('Summer time');
  const output = `${TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR}\n\n=== Grammar Presentation ===\n${JSON.stringify(generated)}`;
  const recovered = recoverLessonGeneration(output, skeleton, 'template-2');
  assert.equal(recovered.validOutput, output);
  assert.deepEqual(recovered.recoveredSections.grammarPresentation, generated);
  const interrupted = recoverLessonGeneration(`${TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR}\n\n=== Grammar Presentation ===\n{"examples":`, skeleton, 'template-2');
  assert.equal(interrupted.complete, false);
  assert.equal(interrupted.validOutput, TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR);
});


test('Template 2 grammar uses structured generation and validates provider output', async () => {
  const result = await generateTemplateTwoGrammarPresentation({
    topic: 'Travel', grammarTopic: 'Past Simple', vocabularyItems,
    apiKey: 'test', model: OPENROUTER_MODEL,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.deepEqual(request.response_format.json_schema.schema, TEMPLATE_2_GRAMMAR_PRESENTATION_RESPONSE_SCHEMA);
      assert.match(request.messages[1].content, /travel word 0/);
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(generated) } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  assert.deepEqual(result.generated, generated);
});
