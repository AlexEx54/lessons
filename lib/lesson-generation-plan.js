'use strict';

const {
  OPENROUTER_MODEL,
  applyLessonMetadataToSkeleton,
  createLessonSkeleton,
  generateLessonMetadata,
  generateStructuredSection,
  learnerProfileInstructions,
} = require('./ai-lesson-generator.js');
const { getLessonGenerationSections } = require('./lesson-generation-sections.js');
const { findSystemTemplate } = require('./lesson-templates/system-templates.js');

// One interface over the hand-written Template 1 sections and data-driven templates,
// shared by the generation runner and by recovery after a failure:
//
//   steps                        [{ key, name, needsModel }] in generation order
//   start(lesson)                → state
//   generate(key, state, model)  → model call result with `generated`
//   apply(key, state, generated) → next state; the lesson is `state.lesson`
//
// `model` carries the OpenRouter connection: apiKey, baseUrl, model, signal, onDelta.
// Steps without a model call are applied with an empty answer.

const METADATA_STEP = Object.freeze({ key: 'lessonMetadata', name: 'Lesson Metadata', needsModel: true });

function sectionPlan(template, context) {
  const sections = new Map(getLessonGenerationSections(template).map(section => [section.key, section]));
  return {
    steps: [...sections.values()].map(({ key, name }) => ({ key, name, needsModel: true })),
    start: lesson => ({ lesson, completed: {} }),
    generate(key, state, model) {
      const section = sections.get(key);
      const options = section.options?.(context, state.completed) || {};
      return section.generate({ ...model, topic: context.topic, ageGroup: context.ageGroup, level: context.level, ...options });
    },
    apply(key, state, generated) {
      return {
        lesson: sections.get(key).apply(state.lesson, generated, state.completed),
        completed: { ...state.completed, [key]: generated },
      };
    },
  };
}

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

// `context`: topic, warmUpTopic, grammarTopic, ageGroup, level.
function createGenerationPlan(templateId, context) {
  const template = findSystemTemplate(templateId);
  return template ? templatePlan(template, context) : sectionPlan(templateId, context);
}

function createGenerationSkeleton(templateId, topic, { ageGroup = '12-14', level = 'A2', model = OPENROUTER_MODEL } = {}) {
  const template = findSystemTemplate(templateId);
  if (!template) return createLessonSkeleton(topic, { ageGroup, level, model });
  const title = String(topic || '').trim();
  return template.createSkeleton({ topic: title, title, level, ageGroup, generatedBy: `openrouter:${model}` });
}

module.exports = { createGenerationPlan, createGenerationSkeleton };
