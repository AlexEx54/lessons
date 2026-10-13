'use strict';

const { findSystemTemplate } = require('../../lib/lesson-templates/system-templates.js');
const { createGenerationPlan, createGenerationSkeleton } = require('../../lib/lesson-generation-plan.js');
const { learnerProfileInstructions } = require('../../lib/ai-lesson-generator.js');

// Template 2 runs from lib/templates/template-2.json; these helpers drive single stages.

const TEMPLATE_TWO = findSystemTemplate('template-2');
const byId = (items, id) => items.find(item => item.id === id);

function statements(texts, firstNumber) {
  return texts.map((text, index) => ({ number: firstNumber + index, text }));
}

// Builds one stage on a fresh skeleton and returns the whole lesson state.
function applyStage(key, generated, { variables = {}, random = Math.random, topic = 'Travel' } = {}) {
  const lesson = createGenerationSkeleton('template-2', topic);
  return TEMPLATE_TWO.apply(key, { lesson, variables }, generated, { random });
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
  return createGenerationPlan('template-2', { topic: 'Summer time', grammarTopic: 'Past Simple', ...context });
}

module.exports = { TEMPLATE_TWO, applyStage, byId, stageContent, stageRequest, statements, templateTwoPlan };
