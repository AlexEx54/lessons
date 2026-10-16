'use strict';

const {
  OPENROUTER_MODEL,
  applyLessonMetadataToSkeleton,
  generateLessonMetadata,
  generateStructuredSection,
  learnerProfileInstructions,
} = require('./ai-lesson-generator.js');
const { compileTemplate } = require('./lesson-templates/template-engine.js');
const { CONTROL_CATALOG } = require('./template-controls/index.js');

// A compiled template as steps for the generation runner and for recovery after a failure:
//
//   steps                        [{ key, name, needsModel }] in generation order
//   start(lesson)                → state
//   generate(key, state, model)  → model call result with `generated`
//   apply(key, state, generated) → next state; the lesson is `state.lesson`
//
// `model` carries the OpenRouter connection: apiKey, baseUrl, model, signal, onDelta.
// Steps without a model call are applied with an empty answer.

const METADATA_STEP = Object.freeze({ key: 'lessonMetadata', name: 'Lesson Metadata', needsModel: true });

function templatePlan(template, context) {
  const inputs = template.resolveInputs(context);
  const preamble = learnerProfileInstructions(context);
  const names = new Map(template.steps.map(step => [step.key, step.name]));
  return {
    steps: [METADATA_STEP, ...template.steps],
    start: lesson => ({ lesson, variables: {} }),
    generate(key, state, model) {
      if (key === METADATA_STEP.key) {
        return generateLessonMetadata({ ...model, topic: context.topic, ageGroup: context.ageGroup, level: context.level });
      }
      return generateStructuredSection({
        ...model,
        ...template.request(key, { inputs, variables: state.variables, preamble }),
        sectionName: names.get(key),
        validate: generated => template.apply(key, state, generated),
      });
    },
    apply(key, state, generated) {
      if (key === METADATA_STEP.key) return { ...state, lesson: applyLessonMetadataToSkeleton(state.lesson, generated) };
      return template.apply(key, state, generated);
    },
  };
}

// `definition` is the template JSON: a draft's snapshot or a system template.
// `context`: topic, warmUpTopic, grammarTopic, ageGroup, level.
function createGenerationPlan(definition, context) {
  return templatePlan(compileTemplate(definition, CONTROL_CATALOG), context);
}

function createGenerationSkeleton(definition, topic, { ageGroup = '12-14', level = 'A2', model = OPENROUTER_MODEL } = {}) {
  const title = String(topic || '').trim();
  return compileTemplate(definition, CONTROL_CATALOG)
    .createSkeleton({ topic: title, title, level, ageGroup, generatedBy: `openrouter:${model}` });
}

// Synthetic mode and the template editor: every stage is built from the controls' sample data.
function createExampleLesson(definition, topic, { ageGroup = '12-14', level = 'A2', random = Math.random } = {}) {
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const title = String(topic || '').trim();
  let state = {
    lesson: template.createSkeleton({ topic: title, title, level, ageGroup, generatedBy: 'synthetic' }),
    variables: {},
  };
  for (const step of template.steps) state = template.applyExample(step.key, state, { random });
  return state.lesson;
}

module.exports = { createExampleLesson, createGenerationPlan, createGenerationSkeleton };
