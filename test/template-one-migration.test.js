'use strict';

// Template 1 moved from hand-written prompt builders to lib/templates/template-1.json.
// These checks compare both implementations on the same input until step 0c removes
// the old one: same user messages, answer schemas that differ only where Template 1
// took over a Template 2 control, prompts that differ only in the listed lines, and
// byte-identical lessons built from the same answers.

const test = require('node:test');
const assert = require('node:assert/strict');
const old = require('../lib/ai-lesson-generator.js');
const PROMPT_CHANGES = require('./fixtures/template-one-prompt-changes.js');
const { GENERATED_LEAD_IN, GENERATED_WARM_UP, GENERATED_WRAP_UP } = require('./fixtures/generated-template-one.js');
const { GENERATED_TARGET_VOCABULARY } = require('./fixtures/generated-target-vocabulary.js');
const { GENERATED_READING } = require('./fixtures/generated-reading.js');
const { GENERATED_LISTENING } = require('./fixtures/generated-listening.js');
const { GENERATED_GRAMMAR_PRESENTATION } = require('./fixtures/generated-grammar-presentation.js');
const { GENERATED_GRAMMAR_FOCUS } = require('./fixtures/generated-grammar-focus.js');
const { GENERATED_GUIDED_SPEAKING } = require('./fixtures/generated-guided-speaking.js');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');
const { compileTemplate } = require('../lib/lesson-templates/template-engine.js');
const { createGenerationSkeleton } = require('../lib/lesson-generation-plan.js');

const TEMPLATE_ONE_DEFINITION = require('../lib/templates/template-1.json');
const TEMPLATE_ONE = compileTemplate(TEMPLATE_ONE_DEFINITION, CONTROL_CATALOG);

const profile = { ageGroup: '15-18', level: 'B1' };
const topic = 'Space travel';
const warmUpTopic = 'Holidays in space';
const grammarTopic = 'Past Simple';

const travelWords = GENERATED_TARGET_VOCABULARY.vocabularyItems;
const byId = (items, id) => items.find(item => item.id === id);

// Ids of items inside tasks became short and the same in every template; nothing refers to them.
const shortItemIds = value => JSON.parse(JSON.stringify(value)
  .replace(/warm-up-choice-(\d+)/g, 'choice-$1')
  .replace(/(?:vocabulary|fill|describe)-item-(\d+)/g, 'item-$1')
  .replace(/personalized-question-(\d+)/g, 'question-$1')
  .replace(/"main-idea"/g, '"question-1"')
  .replace(/(?:reading|listening)-(?:gist|detail)-(\d+)/g, 'question-$1')
  .replace(/grammar-check-(\d+)/g, 'choice-$1')
  .replace(/grammar-focus-(choice|gap)-(\d+)/g, '$1-$2')
  .replace(/grammar-quick-rule-(\d+)/g, 'quick-rule-$1'));

const TEMPLATE_TWO_SCHEMA = old.TEMPLATE_2_TARGET_VOCABULARY_RESPONSE_SCHEMA.properties;

// Target Vocabulary uses the Template 2 controls: the context task is one text with
// numbered gaps, personalized questions have no targetTerm, and there are three starters.
function targetVocabularySchema(schema) {
  const { contextItems, ...properties } = structuredClone(schema.properties);
  delete properties.personalizedQuestions.items.properties.targetTerm;
  properties.personalizedQuestions.items.required = ['question', 'followUp'];
  properties.sentenceStarters = { ...properties.sentenceStarters, maxItems: 3, minItems: 3 };
  Object.assign(properties, {
    contextText: TEMPLATE_TWO_SCHEMA.contextText,
    contextChoices: TEMPLATE_TWO_SCHEMA.contextChoices,
  });
  return { ...schema, properties, required: Object.keys(properties) };
}

function targetVocabularyAnswer({ contextItems, personalizedQuestions, ...answer }) {
  return {
    ...answer,
    contextText: contextItems.map((item, index) => [item.before, `[[${index + 1}]]`, item.after].filter(Boolean).join(' ')).join(' '),
    contextChoices: contextItems.map(({ options, answer: term }) => ({ options, answer: term })),
    personalizedQuestions: personalizedQuestions.map(({ question, followUp }) => ({ question, followUp })),
  };
}

const STAGES = [
  {
    key: 'warm-up',
    messages: () => old.warmUpMessages(warmUpTopic, profile),
    schema: old.WARM_UP_RESPONSE_SCHEMA,
    answer: GENERATED_WARM_UP,
    build: (lesson, answer) => old.applyWarmUpToSkeleton(lesson, answer),
  },
  {
    key: 'lead-in',
    messages: () => old.leadInMessages(topic, profile),
    schema: old.LEAD_IN_RESPONSE_SCHEMA,
    answer: GENERATED_LEAD_IN,
    build: (lesson, answer) => old.applyLeadInToSkeleton(lesson, answer),
  },
  {
    key: 'target-vocabulary',
    messages: () => old.targetVocabularyMessages(topic, profile),
    schema: old.TARGET_VOCABULARY_RESPONSE_SCHEMA,
    newSchema: targetVocabularySchema,
    answer: GENERATED_TARGET_VOCABULARY,
    newAnswer: targetVocabularyAnswer,
    build: (lesson, answer) => old.applyTargetVocabularyToSkeleton(lesson, answer),
    // The Template 2 dropdown stores the default accent colour of the component.
    expectedChanges: content => content.map(component => (component.type === 'dropdownChoice'
      ? { ...component, accentColor: '#17182D' }
      : component)),
  },
  {
    key: 'reading',
    messages: () => old.readingMessages(topic, grammarTopic, travelWords, profile),
    schema: old.READING_RESPONSE_SCHEMA,
    // The gist question is a list of one, like every other question set, and the text
    // uses five or six vocabulary items, as the prompt always asked.
    newSchema: ({ properties: { gistQuestion, ...properties }, ...schema }) => {
      const reading = {
        ...properties,
        gistQuestions: { type: 'array', minItems: 1, maxItems: 1, items: gistQuestion },
        usedVocabularyTerms: { ...properties.usedVocabularyTerms, minItems: 5 },
      };
      return { ...schema, properties: reading, required: Object.keys(reading) };
    },
    answer: GENERATED_READING,
    newAnswer: ({ gistQuestion, ...answer }) => ({ ...answer, gistQuestions: [gistQuestion] }),
    build: (lesson, answer, random) => old.applyReadingToSkeleton(lesson, answer, travelWords, random),
    variables: { targetVocabulary: travelWords },
  },
  {
    key: 'listening',
    messages: () => old.listeningMessages(topic, grammarTopic, travelWords, profile),
    schema: old.LISTENING_RESPONSE_SCHEMA,
    answer: GENERATED_LISTENING,
    build: (lesson, answer, random) => old.applyListeningToSkeleton(lesson, answer, random),
    variables: { targetVocabulary: travelWords },
  },
  {
    key: 'grammar-presentation',
    messages: () => old.grammarPresentationMessages(topic, grammarTopic, profile),
    schema: old.GRAMMAR_PRESENTATION_RESPONSE_SCHEMA,
    // Check the Rule is the Template 2 choice task: the same fields in another order.
    newSchema: schema => {
      const checkItems = structuredClone(schema.properties.checkItems);
      checkItems.items.required = ['before', 'answer', 'after', 'options', 'explanation'];
      return { ...schema, properties: { ...schema.properties, checkItems } };
    },
    answer: GENERATED_GRAMMAR_PRESENTATION,
    build: (lesson, answer, random) => old.applyGrammarPresentationToSkeleton(lesson, answer, random),
    // The choice task numbers its sentences in bold, and the answer key has the
    // Template 2 sections: rule answers, check answers, explanations.
    // Its options are shuffled now, as in every choice task, so they are compared sorted.
    comparable: content => content.map(component => (component.id === 'grammar-presentation-check-the-rule'
      ? { ...component, choices: component.choices.map(choice => ({ ...choice, options: [...choice.options].sort() })) }
      : component)),
    expectedChanges: (content, answer) => content.map(component => {
      if (component.id === 'grammar-presentation-check-the-rule') {
        return { ...component, text: component.text.replace(/^(\d+)\. /gm, '**$1.** ') };
      }
      if (component.id !== 'grammar-presentation-answer-key') return component;
      const explanations = byId(component.sections, 'short-explanations');
      return {
        ...component,
        sections: [
          { id: 'task-one-answers', title: 'Task 1 Rule', text: `${answer.ruleItems.map((item, index) => `${index + 1} ${item.answer}`).join(', ')}.` },
          { id: 'task-two-answers', title: 'Task 2', text: answer.checkItems.map((item, index) => `**${index + 1}.** ${item.answer}`).join('\n\n') },
          explanations,
        ],
      };
    }),
  },
  {
    key: 'grammar-focus',
    messages: () => old.grammarFocusMessages(topic, grammarTopic, travelWords, profile),
    schema: old.GRAMMAR_FOCUS_RESPONSE_SCHEMA,
    answer: GENERATED_GRAMMAR_FOCUS,
    build: (lesson, answer, random) => old.applyGrammarFocusToSkeleton(lesson, answer, travelWords, random),
    variables: { targetVocabulary: travelWords },
  },
  {
    key: 'guided-speaking',
    messages: () => old.guidedSpeakingMessages(topic, travelWords, profile),
    schema: old.GUIDED_SPEAKING_RESPONSE_SCHEMA,
    answer: GENERATED_GUIDED_SPEAKING,
    build: (lesson, answer) => old.applyGuidedSpeakingToSkeleton(lesson, answer, travelWords),
    variables: { targetVocabulary: travelWords },
  },
  {
    key: 'wrap-up',
    messages: () => old.wrapUpMessages(topic, grammarTopic, travelWords, profile),
    schema: old.WRAP_UP_RESPONSE_SCHEMA,
    answer: GENERATED_WRAP_UP,
    build: (lesson, answer) => old.applyWrapUpToSkeleton(lesson, answer),
    variables: { targetVocabulary: travelWords },
  },
];

const request = stage => TEMPLATE_ONE.request(stage.key, {
  inputs: TEMPLATE_ONE.resolveInputs({ topic, warmUpTopic, grammarTopic }),
  variables: stage.variables || {},
  preamble: old.learnerProfileInstructions(profile),
});

// The same pseudo-random sequence for both builds. Old builders shuffle with Math.random,
// so it is replaced for the duration of a build.
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

const sortedRequired = schema => ({ ...schema, required: [...schema.required].sort() });

test('Template 1 runs every generated stage in the old order', () => {
  assert.deepEqual(TEMPLATE_ONE.steps.map(step => step.key), STAGES.map(stage => stage.key));
});

test('the skeleton is the same', () => {
  const options = { ageGroup: '9-11', level: 'B2', model: 'test/model' };
  assert.deepEqual(createGenerationSkeleton(TEMPLATE_ONE_DEFINITION, topic, options), old.createLessonSkeleton(topic, options));
});

for (const stage of STAGES) {
  test(`${stage.key}: the user message and the answer schema are unchanged`, () => {
    const { messages, schema } = request(stage);
    assert.equal(messages[1].content, stage.messages()[1].content);
    assert.deepEqual(sortedRequired(schema), sortedRequired(stage.newSchema?.(stage.schema) ?? stage.schema));
  });

  test(`${stage.key}: the prompt differs only in the listed lines`, () => {
    const before = stage.messages()[0].content.split('\n');
    const after = request(stage).messages[0].content.split('\n');
    assert.deepEqual({
      removed: before.filter(line => !after.includes(line)),
      added: after.filter(line => !before.includes(line)),
    }, PROMPT_CHANGES[stage.key] || { removed: [], added: [] });
  });

  test(`${stage.key}: the same answer builds the same content`, t => {
    t.mock.method(console, 'warn', () => {});
    const expected = withSeededRandom(t, random => stage.build(old.createLessonSkeleton(topic), structuredClone(stage.answer), random));
    const answer = stage.newAnswer?.(structuredClone(stage.answer)) ?? structuredClone(stage.answer);
    const actual = withSeededRandom(t, random => TEMPLATE_ONE.apply(stage.key, {
      lesson: createGenerationSkeleton(TEMPLATE_ONE_DEFINITION, topic), variables: stage.variables || {},
    }, answer, { random }));
    const expectedContent = shortItemIds(byId(expected.stages, stage.key).content);
    const comparable = stage.comparable ?? (content => content);
    assert.deepEqual(
      comparable(byId(actual.lesson.stages, stage.key).content),
      comparable(stage.expectedChanges?.(expectedContent, stage.answer) ?? expectedContent),
    );
  });
}
