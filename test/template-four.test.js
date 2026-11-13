'use strict';

// Template 4 runs from lib/templates/template-4.json. Its synthetic lesson is built from
// the template's own examples on one situation, so it must not fall back to control examples.

const assert = require('node:assert/strict');
const test = require('node:test');
const { createExampleLesson } = require('../lib/lesson-generation-plan.js');
const { findSystemTemplate } = require('../lib/lesson-templates/system-templates.js');
const { compileTemplate } = require('../lib/lesson-templates/template-engine.js');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');

const DEFINITION = findSystemTemplate('template-4').definition;
const TEMPLATE = compileTemplate(DEFINITION, CONTROL_CATALOG);
const SITUATION = 'Ordering food in a café';
const blocks = () => DEFINITION.stages.flatMap(stage => stage.blocks);
const byId = (items, id) => items.find(item => item.id === id);

function exampleRun() {
  let state = { lesson: TEMPLATE.createSkeleton(), variables: {} };
  for (const step of TEMPLATE.steps) state = TEMPLATE.applyExample(step.key, state, { random: () => 0.5 });
  return state;
}

test('every generated block and model-written slot of Template 4 has its own example', () => {
  const generated = blocks().filter(block => block.kind === 'generated');
  assert.deepEqual(generated.filter(block => !block.example).map(block => block.id), []);
  const slots = blocks().flatMap(block => Object.entries(block.slots || {}));
  assert.deepEqual(slots.filter(([, slot]) => !slot.example).map(([name]) => name), []);
  // Homework is done after the lesson, so it takes none of the lesson time.
  assert.equal(DEFINITION.stages.reduce((sum, stage) => sum + (stage.durationMinutes ?? 0), 0), DEFINITION.lesson.durationMinutes);
  assert.equal(DEFINITION.stages.at(-1).id, 'homework');
  assert.equal(DEFINITION.stages.at(-1).durationMinutes, undefined);
});

test('Template 4 builds its synthetic lesson from its examples without warnings', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const lesson = createExampleLesson(DEFINITION, SITUATION);
  assert.deepEqual(warn.mock.calls.map(call => call.arguments[0]), []);
  assert.deepEqual(lesson.stages.map(stage => stage.id), DEFINITION.stages.map(stage => stage.id));

  const scene = byId(byId(lesson.stages, 'warm-up').content, 'warm-up-situation');
  assert.match(scene.text, /You are in a small café in London\./);
  const dialogue = byId(byId(lesson.stages, 'model-dialogue').content, 'model-dialogue-text');
  assert.match(dialogue.text, /^\*\*Waiter:\*\* Hi there!/);

  const practice = byId(lesson.stages, 'practice').content;
  const order = byId(practice, 'practice-order');
  assert.equal(order.type, 'lineOrder');
  assert.equal(order.look, 'dialogue');
  assert.deepEqual(order.speakers.map(speaker => speaker.name), ['Waiter', 'Customer']);
  assert.equal(order.lines.length, 6);
  assert.equal(byId(practice, 'practice-order-answer-key').type, 'markdownCard');
  assert.equal(byId(practice, 'practice-build').items.length, 5);

  const sort = byId(byId(lesson.stages, 'useful-phrases').content, 'useful-phrases-sort');
  assert.equal(sort.type, 'categorySort');
  assert.deepEqual(sort.categories.map(category => category.title), ['Arriving', 'Ordering', 'Paying']);
  assert.equal(sort.items.length, 9);

  const mission = byId(byId(lesson.stages, 'mission').content, 'mission-goal');
  assert.match(mission.text, /\*\*Your Mission\*\*\{\/l\}\n\nYou are a customer at Rosie’s Café/);
});

test('later stages work from the opening scene, the model dialogue, the useful phrases and the fix-it phrases', () => {
  const { variables } = exampleRun();
  assert.deepEqual(Object.keys(variables), ['openingScene', 'modelDialogue', 'usefulPhrases', 'fixItPhrases']);
  assert.match(variables.openingScene, /^You are in a small café in London\./);
  assert.equal(variables.usefulPhrases.length, 8);

  // The scene of Warm Up keeps the place and the people the same until the Mission.
  const readers = DEFINITION.stages.filter(stage => Object.values(stage.context).includes('$var.openingScene'));
  assert.deepEqual(readers.map(stage => stage.id), ['first-try', 'model-dialogue', 'something-goes-wrong', 'mission']);

  const inputs = TEMPLATE.resolveInputs({ topic: SITUATION });
  const [, user] = TEMPLATE.request('mission', { inputs, variables }).messages;
  assert.equal(user.content, [
    `Situation: ${SITUATION}`,
    `Opening scene: ${variables.openingScene}`,
    `Useful Phrases: ${JSON.stringify(variables.usefulPhrases.map(item => item.term))}`,
    `Fix-It Phrases: ${JSON.stringify(variables.fixItPhrases.map(item => item.term))}`,
  ].join('\n'));
});

test('the language focus is optional: without it the stage tells the model to choose the language itself', () => {
  assert.deepEqual(TEMPLATE.resolveInputs({ topic: SITUATION }), { topic: SITUATION, languageFocus: '' });
  assert.throws(() => TEMPLATE.resolveInputs({ languageFocus: 'polite requests' }), error => error.statusCode === 400 && /«Ситуация»/.test(error.message));

  const variables = { openingScene: 'You are in a small café in London.' };
  const scene = `Opening scene: ${variables.openingScene}`;
  const without = TEMPLATE.request('model-dialogue', { inputs: TEMPLATE.resolveInputs({ topic: SITUATION }), variables });
  assert.equal(without.messages[1].content, `Situation: ${SITUATION}\n${scene}`);
  assert.match(without.messages[0].content, /If no Language focus is supplied, choose yourself the functional language/);

  const focus = 'polite requests: Could I…? / I’d like…';
  const withFocus = TEMPLATE.request('model-dialogue', { inputs: TEMPLATE.resolveInputs({ topic: SITUATION, languageFocus: focus }), variables });
  assert.equal(withFocus.messages[1].content, `Situation: ${SITUATION}\n${scene}\nLanguage focus: ${focus}`);
});
