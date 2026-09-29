'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OPENROUTER_MODEL,
  buildTemplateTwoGuidedCommunicationContent: build,
  applyTemplateTwoGuidedCommunicationToSkeleton: apply,
  createTemplateTwoSkeleton,
  templateTwoGuidedCommunicationMessages,
  generateTemplateTwoGuidedCommunication,
  TEMPLATE_2_GUIDED_COMMUNICATION_RESPONSE_SCHEMA,
} = require('../lib/ai-lesson-generator.js');
const { createTemplateTwoLesson } = require('../lib/synthetic-template-two.js');
const { getLessonGenerationSections } = require('../lib/lesson-generation-sections.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION } = require('./fixtures/generated-template-two-guided-communication.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS, TRAVEL_TERMS } = require('./fixtures/generated-template-two-grammar-focus.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION } = require('./fixtures/generated-template-two-grammar-presentation.js');
const { TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR } = require('./fixtures/generated-template-two.js');

const vocabularyItems = TRAVEL_TERMS.map(term => ({ term, definition: 'meaning' }));
const byId = (items, id) => items.find(item => item.id === id);
const generated = () => structuredClone(GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION);

test('Template 2 Guided Communication fills the synthetic structure and keeps other stages', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const skeleton = createTemplateTwoSkeleton('Travel');
  const synthetic = createTemplateTwoLesson('Travel');
  assert.deepEqual(byId(skeleton.stages, 'guided-speaking').content, []);
  const lesson = apply(skeleton, GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION, vocabularyItems);
  assert.deepEqual(byId(skeleton.stages, 'guided-speaking').content, []);
  assert.deepEqual(byId(lesson.stages, 'watch-and-interact'), byId(skeleton.stages, 'watch-and-interact'));
  const [note, prompt, cards] = byId(lesson.stages, 'guided-speaking').content;
  const [syntheticNote, syntheticPrompt, syntheticCards] = byId(synthetic.stages, 'guided-speaking').content;

  // Only the success line varies; the rest of the note and the task prompt are fixed.
  assert.equal(note.text.replace(/\*\*Success:\*\* .*$/, ''), syntheticNote.text.replace(/\*\*Success:\*\* .*$/, ''));
  assert.match(note.text, /\n\n\*\*Success:\*\* The student tells a short travel story in the Past Simple and asks the teacher two questions\.$/);
  assert.deepEqual(prompt, syntheticPrompt);
  assert.deepEqual(cards.items.map(item => item.id), ['card-1', 'card-2', 'card-3']);
  assert.deepEqual(cards.items.map(item => item.cover), syntheticCards.items.map(item => item.cover));
  assert.deepEqual(cards.items.map(item => item.task.title), ['Card 1. My Last Journey', 'Card 2. Train or Plane?', 'Card 3. Ask Your Teacher']);
  assert.deepEqual(cards.items[2].task.miniTask, {
    text: 'Ask your teacher three questions about their last trip.', example: 'Example: Where did you go last holiday?',
  });
  assert.deepEqual(cards.items[0].task.help.vocabulary, ['journey', 'luggage', 'delay', 'ticket', 'seat', 'platform']);
  assert.equal(warn.mock.callCount(), 0);
});

test('Template 2 Guided Communication fails only when cards cannot be built', t => {
  t.mock.method(console, 'warn', () => {});
  for (const mutate of [
    g => g.cards.pop(),
    g => { g.successCriteria = ' '; },
    g => { g.cards[0].title = ''; },
    g => { g.cards[1].questions = []; },
    g => { g.cards[2].phrases[0] = ' '; },
  ]) {
    const invalid = generated();
    mutate(invalid);
    assert.throws(() => build(invalid, vocabularyItems));
  }
});

test('Template 2 Guided Communication logs vocabulary and language problems instead of failing', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const soft = generated();
  soft.cards[0].vocabulary = ['Journey', 'suitcase', 'journey', 'Luggage'];
  soft.cards[1].questions[0] = 'Ты любишь поезда?';
  const cards = build(soft, vocabularyItems)[2];
  assert.deepEqual(cards.items[0].task.help.vocabulary, ['journey', 'suitcase', 'luggage']);
  const warnings = warn.mock.calls.map(call => call.arguments[0]).join('\n');
  assert.match(warnings, /не из Target Vocabulary в карточке №1: suitcase/);
  assert.match(warnings, /Guided Communication содержит кириллицу в английском тексте: Ты любишь поезда\?/);
});

test('Template 2 Guided Communication prompt and pipeline receive grammar and vocabulary', () => {
  const section = getLessonGenerationSections('template-2').find(candidate => candidate.key === 'guidedSpeaking');
  const options = section.options({ grammarTopic: 'Past Simple' }, { targetVocabulary: { vocabularyItems } });
  assert.deepEqual(options, { grammarTopic: 'Past Simple', vocabularyItems });
  const messages = templateTwoGuidedCommunicationMessages('Travel', 'Past Simple', vocabularyItems, { ageGroup: '15-17', level: 'B1' });
  assert.match(messages[0].content, /Card 1: the learner describes or talks about themselves/);
  assert.match(messages[0].content, /Card 2: the learner imagines, compares or gives opinions/);
  assert.match(messages[0].content, /Card 3: the learner asks the teacher questions/);
  assert.match(messages[0].content, /Do not generate card numbers, cover emojis, colors/);
  assert.equal(messages[1].content, `Lesson topic: Travel\nGrammar topic: Past Simple\nTarget Vocabulary: ${JSON.stringify(TRAVEL_TERMS)}`);
});

test('Template 2 recovery keeps Guided Communication and drops an interrupted one', t => {
  // The shared recovery fixture has summer vocabulary, so the travel word lists only warn.
  t.mock.method(console, 'warn', () => {});
  const skeleton = createTemplateTwoSkeleton('Summer time');
  const beforeCommunication = [
    TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR,
    `=== Grammar Presentation ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION)}`,
    `=== Grammar Focus ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS)}`,
  ].join('\n\n');
  const output = `${beforeCommunication}\n\n=== Guided Communication ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION)}`;
  const recovered = recoverLessonGeneration(output, skeleton, 'template-2');
  assert.equal(recovered.validOutput, output);
  assert.deepEqual(recovered.recoveredSections.guidedSpeaking, GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION);
  const interrupted = recoverLessonGeneration(`${beforeCommunication}\n\n=== Guided Communication ===\n{"cards":`, skeleton, 'template-2');
  assert.equal(interrupted.complete, false);
  assert.equal(interrupted.validOutput, beforeCommunication);
});

test('Template 2 Guided Communication uses structured generation and validates provider output', async () => {
  const result = await generateTemplateTwoGuidedCommunication({
    topic: 'Travel', grammarTopic: 'Past Simple', vocabularyItems,
    apiKey: 'test', model: OPENROUTER_MODEL,
    fetchImpl: async (_url, options) => {
      const request = JSON.parse(options.body);
      assert.equal(request.response_format.json_schema.name, 'easyclass_template_two_guided_communication');
      assert.deepEqual(request.response_format.json_schema.schema, TEMPLATE_2_GUIDED_COMMUNICATION_RESPONSE_SCHEMA);
      return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION) } }] })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    },
  });
  assert.deepEqual(result.generated, GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION);
});
