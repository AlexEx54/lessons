'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { describeControls, previewLessonTemplate } = require('../lib/lesson-template-editor.js');
const { findSystemTemplate } = require('../lib/lesson-templates/system-templates.js');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');

const templateTwo = () => structuredClone(findSystemTemplate('template-2').definition);
const stage = (definition, id) => definition.stages.find(candidate => candidate.id === id);

test('the preview builds the sample lesson and describes every block', () => {
  const preview = previewLessonTemplate({ definition: templateTwo(), systemTemplateId: 'template-2' });
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.lesson.stages.length, 8);
  assert.deepEqual(previewLessonTemplate({ definition: templateTwo(), systemTemplateId: 'template-2' }), preview);

  const guesses = preview.blocks['lead-in-fact-or-myth'];
  assert.deepEqual(guesses.exports.guessStatements, {
    variable: 'leadInGuesses',
    type: 'statements',
    readers: {
      blocks: [
        { block: 'target-vocabulary-stories', stage: 'target-vocabulary', port: 'guesses' },
        { block: 'target-vocabulary-guess-answers', stage: 'target-vocabulary', port: 'guesses' },
      ],
      stages: ['target-vocabulary'],
    },
  });
  const stories = preview.blocks['target-vocabulary-stories'];
  assert.deepEqual(stories.inputs.guesses, {
    variable: 'leadInGuesses', type: 'statements', from: { block: 'lead-in-fact-or-myth', stage: 'lead-in' },
  });
  assert.match(stories.rules[0], /exactly four short first-person stories \(40–60 words each\)/);
  assert.ok(stories.rules.every(rule => !rule.includes('Four different people')), 'rules leave out the instructions');
  assert.equal(Object.hasOwn(preview.blocks['target-vocabulary-guess-answers'], 'rules'), false);
});

test('the preview tells which stages reach the model and their default instructions', () => {
  const definition = templateTwo();
  const system = templateTwo();
  stage(definition, 'wrap-up').instructions = 'Keep it short.';

  const { stages } = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.deepEqual(Object.keys(stages), definition.stages.map(item => item.id));
  assert.deepEqual(stages['watch-and-interact'], { usesModel: false, defaultInstructions: '' });
  assert.equal(stages['wrap-up'].usesModel, true);
  assert.equal(stages['wrap-up'].defaultInstructions, stage(system, 'wrap-up').instructions);

  const orphan = previewLessonTemplate({ definition, systemTemplateId: null });
  assert.equal(orphan.stages['wrap-up'].defaultInstructions, '');
});

test('a stage icon must be one the lesson page draws; older names stay valid', () => {
  const definition = templateTwo();
  assert.equal(stage(definition, 'lead-in').icon, 'compass');
  stage(definition, 'wrap-up').icon = 'rocket';
  const { errors } = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.deepEqual(errors, [{ message: 'У этапа wrap-up неизвестная иконка rocket.', stage: 'wrap-up' }]);
});

test('default instructions come from the system template, then from the control', () => {
  const definition = templateTwo();
  const original = stage(definition, 'target-vocabulary').blocks.find(block => block.id === 'target-vocabulary-stories');
  original.instructions = 'Only two people.';
  stage(definition, 'wrap-up').blocks.push({ id: 'wrap-up-questions', kind: 'generated', control: 'personalizedQuestions' });

  const { blocks } = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.match(blocks['target-vocabulary-stories'].defaultInstructions, /^Four different people/);
  assert.equal(blocks['wrap-up-questions'].defaultInstructions, CONTROL_CATALOG.get('personalizedQuestions').defaultInstructions);

  const orphan = previewLessonTemplate({ definition, systemTemplateId: null });
  assert.equal(orphan.blocks['target-vocabulary-stories'].defaultInstructions, CONTROL_CATALOG.get('storyCards').defaultInstructions);
});

test('a broken template previews as its problems only', () => {
  const definition = templateTwo();
  stage(definition, 'lead-in').blocks = stage(definition, 'lead-in').blocks.filter(block => block.id !== 'lead-in-fact-or-myth');
  const preview = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.equal(preview.lesson, null);
  assert.equal(preview.blocks, null);
  assert.equal(preview.stages, null);
  assert.ok(preview.errors.some(error => error.block === 'target-vocabulary-stories' && /leadInGuesses/.test(error.message)));
  assert.deepEqual(previewLessonTemplate({ definition: 'nope' }).errors, [{ message: 'Определение шаблона должно быть объектом.' }]);
});

test('controls are described for the editor with labelled parameters and chrome', () => {
  const { controls, variableTypes, stageIcons } = describeControls();
  assert.equal(controls.length, CONTROL_CATALOG.size);
  assert.deepEqual(JSON.parse(JSON.stringify(controls)), controls, 'plain data only');
  assert.equal(variableTypes.vocabulary, 'словарь');
  assert.equal(Object.keys(stageIcons.icons).length, 9);
  assert.equal(stageIcons.icons.cap, 'Шапочка');
  assert.deepEqual(stageIcons.aliases, { compass: 'pencil', check: 'question' });

  const stories = controls.find(control => control.type === 'storyCards');
  assert.deepEqual(stories.params.minWords, {
    type: 'integer', label: 'Слов в истории: от', min: 10, max: 150, default: 40, atMost: 'maxWords',
  });
  assert.deepEqual(stories.chrome.map(field => field.label), ['Заголовок', 'Цвета карточек']);
  assert.deepEqual(stories.inputs, { highlight: { type: 'vocabulary', required: false }, guesses: { type: 'statements', required: false } });
  assert.equal(controls.find(control => control.type === 'teacherNoteSections').params.sections.type, 'custom');
});
