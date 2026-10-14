'use strict';

// Template 2 moved from hand-written prompt builders to lib/templates/template-2.json.
// These checks compare both implementations on the same input until step 0c removes
// the old one: same user messages and answer schemas, prompts that differ only in the
// listed lines, and byte-identical lessons built from the same answers.

const test = require('node:test');
const assert = require('node:assert/strict');
const old = require('../lib/ai-lesson-generator.js');
const PROMPT_CHANGES = require('./fixtures/template-two-prompt-changes.js');
const fixtures = require('./fixtures/generated-template-two.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION } = require('./fixtures/generated-template-two-grammar-presentation.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS, TRAVEL_TERMS } = require('./fixtures/generated-template-two-grammar-focus.js');
const { GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION } = require('./fixtures/generated-template-two-guided-communication.js');
const { GENERATED_TEMPLATE_TWO_WRAP_UP } = require('./fixtures/generated-template-two-wrap-up.js');
const { TEMPLATE_TWO, byId, statements, templateTwoSkeleton } = require('./helpers/template-two.js');

const profile = { ageGroup: '15-18', level: 'B1' };
const topic = 'Summer time';
const warmUpTopic = 'Beach day';
const grammarTopic = 'Past Simple';
const guesses = fixtures.GENERATED_TEMPLATE_TWO_LEAD_IN.guessStatements;
const summerWords = fixtures.GENERATED_TEMPLATE_TWO_TARGET_VOCABULARY.vocabularyItems;
const travelWords = TRAVEL_TERMS.map(term => ({ term, definition: 'meaning' }));

const STAGES = [
  {
    key: 'warm-up',
    messages: () => old.templateTwoWarmUpMessages(warmUpTopic, profile),
    schema: old.TEMPLATE_2_WARM_UP_RESPONSE_SCHEMA,
    answer: fixtures.GENERATED_TEMPLATE_TWO_WARM_UP,
    build: (lesson, answer) => old.applyTemplateTwoWarmUpToSkeleton(lesson, answer),
  },
  {
    key: 'lead-in',
    messages: () => old.templateTwoLeadInMessages(topic, grammarTopic, profile),
    schema: old.TEMPLATE_2_LEAD_IN_RESPONSE_SCHEMA,
    answer: fixtures.GENERATED_TEMPLATE_TWO_LEAD_IN,
    build: (lesson, answer) => old.applyTemplateTwoLeadInToSkeleton(lesson, answer),
  },
  {
    key: 'target-vocabulary',
    messages: () => old.templateTwoTargetVocabularyMessages(topic, grammarTopic, guesses, profile),
    schema: old.TEMPLATE_2_TARGET_VOCABULARY_RESPONSE_SCHEMA,
    answer: fixtures.GENERATED_TEMPLATE_TWO_TARGET_VOCABULARY,
    build: (lesson, answer) => old.applyTemplateTwoTargetVocabularyToSkeleton(lesson, answer, guesses),
    variables: { leadInGuesses: statements(guesses, 4) },
  },
  {
    key: 'grammar-presentation',
    messages: () => old.templateTwoGrammarPresentationMessages(topic, grammarTopic, summerWords, profile),
    schema: old.TEMPLATE_2_GRAMMAR_PRESENTATION_RESPONSE_SCHEMA,
    answer: GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION,
    build: (lesson, answer, random) => old.applyTemplateTwoGrammarPresentationToSkeleton(lesson, answer, random),
    variables: { targetVocabulary: summerWords },
  },
  {
    key: 'grammar-focus',
    messages: () => old.templateTwoGrammarFocusMessages(topic, grammarTopic, travelWords, profile),
    schema: old.TEMPLATE_2_GRAMMAR_FOCUS_RESPONSE_SCHEMA,
    answer: GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS,
    build: (lesson, answer, random) => old.applyTemplateTwoGrammarFocusToSkeleton(lesson, answer, travelWords, random),
    variables: { targetVocabulary: travelWords },
  },
  {
    key: 'guided-speaking',
    messages: () => old.templateTwoGuidedCommunicationMessages(topic, grammarTopic, travelWords, profile),
    schema: old.TEMPLATE_2_GUIDED_COMMUNICATION_RESPONSE_SCHEMA,
    answer: GENERATED_TEMPLATE_TWO_GUIDED_COMMUNICATION,
    build: (lesson, answer) => old.applyTemplateTwoGuidedCommunicationToSkeleton(lesson, answer, travelWords),
    variables: { targetVocabulary: travelWords },
  },
  {
    key: 'wrap-up',
    messages: () => old.wrapUpMessages(topic, grammarTopic, travelWords, profile),
    schema: old.WRAP_UP_RESPONSE_SCHEMA,
    answer: GENERATED_TEMPLATE_TWO_WRAP_UP,
    build: (lesson, answer) => old.applyWrapUpToSkeleton(lesson, answer),
    variables: { targetVocabulary: travelWords },
  },
];

const request = stage => TEMPLATE_TWO.request(stage.key, {
  inputs: TEMPLATE_TWO.resolveInputs({ topic, warmUpTopic, grammarTopic }),
  variables: stage.variables || {},
  preamble: old.learnerProfileInstructions(profile),
});

// The same pseudo-random sequence for both builds. The old Target Vocabulary builder
// shuffles with Math.random, so it is replaced for the duration of a build.
function withSeededRandom(t, build) {
  let state = 7;
  const random = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const mocked = t.mock.method(Math, 'random', random);
  try {
    return build(random);
  } finally {
    mocked.mock.restore();
  }
}

// Ids of items inside Grammar Focus tasks became shorter; nothing refers to them.
const shortItemIds = value => JSON.parse(JSON.stringify(value)
  .replace(/grammar-focus-(choice|gap|translation|pair)-(\d+)/g, '$1-$2')
  .replace(/grammar-focus-correction-(\d+)/g, 'correction-$1')
  .replace(/grammar-quick-rule-(\d+)/g, 'quick-rule-$1'));

test('Template 2 runs every generated stage in the old order', () => {
  assert.deepEqual(TEMPLATE_TWO.steps.map(step => step.key), STAGES.map(stage => stage.key));
});

for (const stage of STAGES) {
  test(`${stage.key}: the user message and the answer schema are unchanged`, () => {
    const { messages, schema } = request(stage);
    assert.equal(messages[1].content, stage.messages()[1].content);
    // The model writes the vocabulary list before the stories now: answer fields follow display order.
    assert.deepEqual({ ...schema, required: [...schema.required].sort() }, { ...stage.schema, required: [...stage.schema.required].sort() });
  });

  test(`${stage.key}: the prompt differs only in the listed lines`, () => {
    const before = stage.messages()[0].content.split('\n');
    const after = request(stage).messages[0].content.split('\n');
    assert.deepEqual({
      removed: before.filter(line => !after.includes(line)),
      added: after.filter(line => !before.includes(line)),
    }, PROMPT_CHANGES[stage.key]);
  });

  test(`${stage.key}: the same answer builds the same content`, t => {
    t.mock.method(console, 'warn', () => {});
    const expected = withSeededRandom(t, random => stage.build(old.createTemplateTwoSkeleton(topic), structuredClone(stage.answer), random));
    const actual = withSeededRandom(t, random => TEMPLATE_TWO.apply(stage.key, {
      lesson: templateTwoSkeleton(topic), variables: stage.variables || {},
    }, structuredClone(stage.answer), { random }));
    assert.deepEqual(byId(actual.lesson.stages, stage.key).content, shortItemIds(byId(expected.stages, stage.key).content));
  });
}

test('the skeleton is the same, including the static Watch stage', () => {
  const options = { ageGroup: '9-11', level: 'B2', model: 'test/model' };
  assert.deepEqual(templateTwoSkeleton(topic, options), old.createTemplateTwoSkeleton(topic, options));
});
