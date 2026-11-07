'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { OPENROUTER_MODEL } = require('../lib/ai-lesson-generator.js');
const { syntheticLesson } = require('./helpers/synthetic-lessons.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION: generated } = require('./fixtures/generated-template-two-grammar-presentation.js');
const { TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR } = require('./fixtures/generated-template-two.js');
const { parseMarkdown } = require('../assets/components/safe-markdown.js');
const { applyStage, byId, stageContent, stageRequest, templateTwoPlan, templateTwoSkeleton } = require('./helpers/template-two.js');

const vocabularyItems = Array.from({ length: 10 }, (_, index) => ({ term: `travel word ${index}`, definition: 'meaning' }));
const variables = { targetVocabulary: vocabularyItems };
const build = (answer, random) => stageContent('grammar-presentation', answer, { variables, random });

test('Template 2 generates discovery and checkbox grammar while preserving static Watch', () => {
  const synthetic = syntheticLesson('template-2');
  const { lesson } = applyStage('grammar-presentation', generated, { variables, random: () => 0 });
  assert.deepEqual(byId(lesson.stages, 'watch-and-interact'), byId(synthetic.stages, 'watch-and-interact'));
  const content = byId(lesson.stages, 'grammar-presentation').content;
  assert.deepEqual(content.map(c => c.type), [
    'teacherNote', 'textPanel', 'textPanel', 'dragWordsInText', 'markdownCard', 'markdownCard', 'checkboxChoice', 'markdownCard',
  ]);
  assert.deepEqual(byId(content, 'grammar-presentation-teacher-note'), byId(byId(synthetic.stages, 'grammar-presentation').content, 'grammar-presentation-teacher-note'));
  const task = byId(content, 'grammar-presentation-check-the-rule');
  // The application shuffles the sentences instead of trusting the model's order.
  const [question] = generated.checkQuestions;
  assert.equal(task.items[0].question, question.question);
  assert.deepEqual(task.items[0].options, [1, 2, 3, 4, 5, 6, 7, 0].map(index => question.options[index]));
  assert.deepEqual(task.items[0].answers, question.answers);
  // Each task's key follows it.
  const ruleKey = byId(content, 'grammar-presentation-complete-the-rule-answer-key');
  assert.equal(ruleKey.studentVisibility, 'teacherOnly');
  assert.match(ruleKey.sections[0].text, /^1 /);
  const key = byId(content, 'grammar-presentation-check-the-rule-answer-key');
  assert.deepEqual(key.sections.map(section => section.id), ['answers-left']);
  assert.equal(key.sections[0].text, `B, C, F, H — ${question.explanation}`);
  // The lead-in line keeps the explanations a list of their own.
  const [lead, list] = parseMarkdown(key.sections[0].text);
  assert.equal(lead.type, 'paragraph');
  assert.deepEqual([list.type, list.ordered, list.items.length], ['list', true, 4]);
});

test('Template 2 grammar validates counts, answers, explanations, duplicates and shared discovery rules', () => {
  for (const mutate of [
    g => g.checkQuestions[0].options.pop(),
    g => { g.checkQuestions[0].answers.push(g.checkQuestions[0].options[1]); },
    g => { g.checkQuestions[0].answers[0] = 'I visit London last summer.'; },
    g => { g.checkQuestions[0].options[1] = g.checkQuestions[0].options[0]; },
    g => { g.checkQuestions[0].explanation = ''; },
    g => g.checkQuestions.push(structuredClone(g.checkQuestions[0])),
    g => { g.ruleDistractors[0] = 'past'; },
  ]) {
    const invalid = structuredClone(generated);
    mutate(invalid);
    assert.throws(() => build(invalid));
  }
});

test('Template 2 Grammar Presentation prompt receives vocabulary and grammar and asks for checkbox sentences', () => {
  const { messages } = stageRequest('grammar-presentation', { variables, profile: { ageGroup: '15-17', level: 'B1' } });
  assert.match(messages[0].content, /One question: "Which four sentences are grammatically correct\?"/);
  assert.match(messages[0].content, /Exactly four are grammatically correct/);
  assert.match(messages[0].content, /start with the line "Incorrect sentences:", then a numbered Markdown list/);
  assert.match(messages[0].content, /Inflection is allowed/);
  assert.doesNotMatch(messages[0].content, /five checkItems|three distinct options/);
  assert.equal(messages[1].content, `Lesson topic: Travel\nGrammar topic: Past Simple\nTarget Vocabulary: ${JSON.stringify(vocabularyItems.map(item => item.term))}`);
});

test('Template 2 recovery keeps Grammar Presentation and drops an interrupted one', () => {
  const skeleton = templateTwoSkeleton('Summer time');
  const output = `${TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR}\n\n=== Grammar Presentation ===\n${JSON.stringify(generated)}`;
  const recovered = recoverLessonGeneration(output, skeleton, templateTwoPlan());
  assert.equal(recovered.validOutput, output);
  assert.deepEqual(recovered.recoveredSections['grammar-presentation'], generated);
  const interrupted = recoverLessonGeneration(`${TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR}\n\n=== Grammar Presentation ===\n{"examples":`, skeleton, templateTwoPlan());
  assert.equal(interrupted.complete, false);
  assert.equal(interrupted.validOutput, TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR);
});

test('Template 2 plan sends the stage prompt with structured output and validates the answer', async () => {
  const plan = templateTwoPlan({ topic: 'Travel' });
  const state = { lesson: templateTwoSkeleton('Travel'), variables };
  const request = stageRequest('grammar-presentation', { variables, profile: { ageGroup: '12-14', level: 'A2' } });
  const reply = answer => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(answer) } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
  const connection = answer => ({
    apiKey: 'test', model: OPENROUTER_MODEL,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      assert.equal(body.response_format.json_schema.name, 'easyclass_grammar_presentation');
      assert.deepEqual(body.response_format.json_schema.schema, request.schema);
      assert.deepEqual(body.messages, request.messages);
      return reply(answer);
    },
  });
  const result = await plan.generate('grammar-presentation', state, connection(generated));
  assert.deepEqual(result.generated, generated);
  await assert.rejects(plan.generate('grammar-presentation', state, connection({ ...generated, checkQuestions: [] })), /нужно ровно 1/);
});
