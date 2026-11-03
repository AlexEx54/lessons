'use strict';

// Template 3 runs from lib/templates/template-3.json. Its synthetic lesson is built from
// the template's own examples on one topic, so it must not fall back to control examples.

const assert = require('node:assert/strict');
const test = require('node:test');
const { createExampleLesson } = require('../lib/lesson-generation-plan.js');
const { findSystemTemplate } = require('../lib/lesson-templates/system-templates.js');
const { compileTemplate } = require('../lib/lesson-templates/template-engine.js');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');

const DEFINITION = findSystemTemplate('template-3').definition;
const TEMPLATE = compileTemplate(DEFINITION, CONTROL_CATALOG);
const blocks = () => DEFINITION.stages.flatMap(stage => stage.blocks);
const byId = (items, id) => items.find(item => item.id === id);

function exampleRun() {
  let state = { lesson: TEMPLATE.createSkeleton(), variables: {} };
  for (const step of TEMPLATE.steps) state = TEMPLATE.applyExample(step.key, state, { random: () => 0.5 });
  return state;
}

test('every generated block and model-written slot of Template 3 has its own example', () => {
  const generated = blocks().filter(block => block.kind === 'generated');
  assert.deepEqual(generated.filter(block => !block.example).map(block => block.id), []);
  const slots = blocks().flatMap(block => Object.entries(block.slots || {}));
  assert.deepEqual(slots.filter(([, slot]) => !slot.example).map(([name]) => name), []);
  assert.equal(DEFINITION.stages.reduce((sum, stage) => sum + stage.durationMinutes, 0), DEFINITION.lesson.durationMinutes);
});

test('Template 3 builds its synthetic lesson from its examples without warnings', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const lesson = createExampleLesson(DEFINITION, 'Phones at School');
  assert.deepEqual(warn.mock.calls.map(call => call.arguments[0]), []);
  assert.deepEqual(lesson.stages.map(stage => stage.id), DEFINITION.stages.map(stage => stage.id));

  const [, post] = byId(lesson.stages, 'warm-up').content;
  assert.match(post.text, /^\*\*@maxi_talks\*\* 🔥 Hot take/);
  const spotIt = byId(byId(lesson.stages, 'grammar-presentation').content, 'grammar-presentation-spot-it');
  assert.match(spotIt.text, /1\. We \*\*shouldn’t check\*\* messages every five minutes\. — \*Leo\*/);
  const builder = byId(byId(lesson.stages, 'grammar-focus').content, 'grammar-focus-build-the-message');
  assert.equal(builder.items.length, 6);
  assert.equal(builder.completionText, 'Message sent! Well done!');
  const task = byId(byId(lesson.stages, 'create').content, 'create-reply-task');
  assert.match(task.text, /- Give one piece of advice with \*\*should\*\* or \*\*shouldn’t\*\*\./);
});

test('Grammar Presentation takes its examples from the group chat of the earlier stage', () => {
  const keys = TEMPLATE.steps.map(step => step.key);
  assert.ok(keys.indexOf('group-chat') < keys.indexOf('grammar-presentation'));

  const { variables } = exampleRun();
  assert.deepEqual(Object.keys(variables), ['targetVocabulary', 'groupChat']);
  assert.match(variables.groupChat, /^\*\*Mia:\*\* Did you see the news\?/);

  const inputs = TEMPLATE.resolveInputs({ topic: 'Phones at School', grammarTopic: 'should / shouldn’t' });
  const [system, user] = TEMPLATE.request('grammar-presentation', { inputs, variables }).messages;
  assert.match(system.content, /^chatExamples: Exactly five sentences from the supplied Group chat/m);
  assert.equal(user.content, [
    'Lesson topic: Phones at School',
    'Grammar topic: should / shouldn’t',
    `Group chat:\n${variables.groupChat.trim()}`,
  ].join('\n'));
});
