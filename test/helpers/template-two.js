'use strict';

const { findSystemTemplate } = require('../../lib/lesson-templates/system-templates.js');
const { compileTemplate } = require('../../lib/lesson-templates/template-engine.js');
const { createGenerationPlan, createGenerationSkeleton } = require('../../lib/lesson-generation-plan.js');
const { CONTROL_CATALOG } = require('../../lib/template-controls/index.js');
const { learnerProfileInstructions } = require('../../lib/ai-lesson-generator.js');

// Template 2 runs from lib/templates/template-2.json; these helpers drive single stages.

const TEMPLATE_TWO_DEFINITION = findSystemTemplate('template-2').definition;
const TEMPLATE_TWO = compileTemplate(TEMPLATE_TWO_DEFINITION, CONTROL_CATALOG);
const byId = (items, id) => items.find(item => item.id === id);

function statements(texts, firstNumber) {
  return texts.map((text, index) => ({ number: firstNumber + index, text }));
}

// Builds one stage on a fresh skeleton and returns the whole lesson state.
function applyStage(key, generated, { variables = {}, random = Math.random, topic = 'Travel' } = {}) {
  const lesson = templateTwoSkeleton(topic);
  return TEMPLATE_TWO.apply(key, { lesson, variables }, generated, { random });
}

function templateTwoSkeleton(topic, options) {
  return createGenerationSkeleton(TEMPLATE_TWO_DEFINITION, topic, options);
}

function stageContent(key, generated, options) {
  return byId(applyStage(key, generated, options).lesson.stages, key).content;
}

function stageRequest(key, { topic = 'Travel', warmUpTopic, grammarTopic = 'Past Simple', variables = {}, profile } = {}) {
  return TEMPLATE_TWO.request(key, {
    inputs: TEMPLATE_TWO.resolveInputs({ topic, warmUpTopic, grammarTopic }),
    variables,
    preamble: profile ? learnerProfileInstructions(profile) : '',
  });
}

function templateTwoPlan(context = {}) {
  return createGenerationPlan(TEMPLATE_TWO_DEFINITION, { topic: 'Summer time', grammarTopic: 'Past Simple', ...context });
}

module.exports = {
  TEMPLATE_TWO, TEMPLATE_TWO_DEFINITION, applyStage, byId, stageContent, stageRequest, statements, templateTwoPlan,
  templateTwoSkeleton,
};
