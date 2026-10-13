'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');
const { compileTemplate } = require('../lib/lesson-templates/template-engine.js');
const { createGenerationSkeleton } = require('../lib/lesson-generation-plan.js');
const { TEMPLATE_TWO } = require('./helpers/template-two.js');

// A two-stage template around one generated block: the first stage provides a vocabulary
// and guesses, the second binds every input of the block to them.
function singleBlockTemplate(control, params) {
  const sources = { vocabulary: 'words', statements: 'guesses' };
  return {
    schemaVersion: 'lesson-template-v1',
    id: 'catalog-check',
    title: 'Catalog check',
    inputs: { topic: { label: 'Тема' } },
    stages: [
      {
        id: 'sources',
        title: 'Sources',
        blocks: [
          { id: 'source-words', kind: 'generated', control: 'vocabularyList', params: { items: 12 }, exports: { vocabulary: 'words' } },
          { id: 'source-guesses', kind: 'generated', control: 'factOrMyth', exports: { guessStatements: 'guesses' } },
        ],
      },
      {
        id: 'checked',
        title: 'Checked',
        context: { 'Target Vocabulary': '$var.words', Guesses: '$var.guesses' },
        blocks: [{
          id: 'checked-block',
          kind: 'generated',
          control: control.type,
          params,
          inputs: Object.fromEntries(Object.entries(control.inputs).map(([port, spec]) => [port, sources[spec.type]])),
        }],
      },
    ],
  };
}

function exampleRun(template) {
  let state = { lesson: template.createSkeleton(), variables: {} };
  for (const step of template.steps) state = template.applyExample(step.key, state, { random: () => 0.5 });
  return state;
}

const extremes = (control, side) => Object.fromEntries(Object.entries(control.params)
  .filter(([, spec]) => spec[side] !== undefined)
  .map(([name, spec]) => [name, spec[side]]));

test('every generated control builds its example with default, smallest and largest parameters', t => {
  t.mock.method(console, 'warn', () => {});
  const generated = [...CONTROL_CATALOG.values()].filter(control => control.kind === 'generated');
  assert.ok(generated.length > 20);
  for (const control of generated) {
    for (const params of [{}, extremes(control, 'min'), extremes(control, 'max')]) {
      const template = compileTemplate(singleBlockTemplate(control, params), CONTROL_CATALOG);
      assert.doesNotThrow(() => exampleRun(template), `${control.type} ${JSON.stringify(params)}`);
      const { schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
      assert.ok(Object.keys(schema.properties).length > 0, control.type);
    }
  }
});

test('Template 2 builds a whole lesson from control examples', () => {
  const state = exampleRun(TEMPLATE_TWO);
  const skeleton = createGenerationSkeleton('template-2', 'Topic');
  assert.deepEqual(state.lesson.stages.map(stage => stage.id), skeleton.stages.map(stage => stage.id));
  assert.ok(state.lesson.stages.every(stage => stage.content.length > 0));
  assert.deepEqual(Object.keys(state.variables).sort(), ['leadInGuesses', 'targetVocabulary']);
});

test('the answer key takes only tasks that have one, and only their parts', () => {
  const answerKey = CONTROL_CATALOG.get('answerKey');
  assert.equal(answerKey.acceptsSource(CONTROL_CATALOG.get('oddOneOut'), {}), null);
  assert.match(answerKey.acceptsSource(CONTROL_CATALOG.get('listCard'), {}), /не даёт ключ ответов/);
  assert.equal(answerKey.acceptsSource(CONTROL_CATALOG.get('correctSentences'), { part: 'explanations' }), null);
  assert.match(answerKey.acceptsSource(CONTROL_CATALOG.get('correctSentences'), { part: 'hints' }), /нет части ключа hints/);
});

test('teacher note sections are checked as a parameter', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('teacherNoteSections'), {
    sections: [{ key: 'tips', title: 'Tips' }, { key: 'tips', title: 'Again' }],
  });
  assert.throws(() => compileTemplate(definition, CONTROL_CATALOG), /sections: раздел tips повторяется/);
});
