'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');
const { compileTemplate } = require('../lib/lesson-templates/template-engine.js');
const { validateTemplate } = require('../lib/lesson-templates/validate-template.js');
const { TEMPLATE_TWO, templateTwoSkeleton } = require('./helpers/template-two.js');

// A two-stage template around one generated block: the first stage provides a vocabulary
// and guesses, the second binds every input of the block to them. A task gets its key.
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
          ...(typeof control.answerKey === 'function' ? { answerKey: {} } : {}),
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

// Synthetic lessons are made of these examples, so they must pass the controls' own checks.
const silentWarnings = t => t.mock.method(console, 'warn', () => {});
const warnings = mock => mock.mock.calls.map(call => call.arguments[0]);

test('Template 2 builds a whole lesson from control examples without warnings', t => {
  const warn = silentWarnings(t);
  const state = exampleRun(TEMPLATE_TWO);
  assert.deepEqual(warnings(warn), []);
  const skeleton = templateTwoSkeleton('Topic');
  assert.deepEqual(state.lesson.stages.map(stage => stage.id), skeleton.stages.map(stage => stage.id));
  assert.ok(state.lesson.stages.every(stage => stage.content.length > 0));
  assert.deepEqual(Object.keys(state.variables).sort(), ['leadInGuesses', 'targetVocabulary']);
});

test('Template 1 builds a whole lesson from control examples without warnings', t => {
  const warn = silentWarnings(t);
  const definition = require('../lib/templates/template-1.json');
  const state = exampleRun(compileTemplate(definition, CONTROL_CATALOG));
  assert.deepEqual(warnings(warn), []);
  assert.deepEqual(state.lesson.stages.map(stage => stage.id), definition.stages.map(stage => stage.id));
  assert.ok(state.lesson.stages.every(stage => stage.content.length > 0));
  assert.deepEqual(Object.keys(state.variables), ['targetVocabulary']);
});

// The key of the block in a single-block template, built from the control's example.
function exampleKey(type, answerKey) {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get(type), {});
  definition.stages[1].blocks[0].answerKey = answerKey;
  const [, checked] = exampleRun(compileTemplate(definition, CONTROL_CATALOG)).lesson.stages;
  assert.deepEqual(checked.content.map(component => component.id), ['checked-block', 'checked-block-answer-key']);
  return checked.content[1];
}

test('an answer key follows its task: a list, two columns, or a section per part', () => {
  const list = exampleKey('oddOneOut', {});
  assert.deepEqual([list.title, list.studentVisibility, list.sections], ['Answer key', 'teacherOnly', undefined]);
  assert.match(list.text, /^1\. \*\*/);
  const columns = exampleKey('choiceQuestions', { title: 'Answer Key' });
  assert.deepEqual([columns.title, columns.layout, columns.sections.map(section => section.id)], ['Answer Key', 'columns', ['answers-left', 'answers-right']]);

  const parts = exampleKey('correctSentences', { layout: 'stacked', partTitles: { answers: 'Task 2' } });
  assert.equal(parts.layout, 'stacked');
  assert.deepEqual(parts.sections.map(section => [section.id, section.title]), [['answers', 'Task 2'], ['explanations', 'Short explanations']]);
  assert.match(parts.sections[0].text, /^Correct sentences: /);
  const text = exampleKey('correctSentences', { format: 'paragraphs' });
  assert.match(text.text, /^\*\*Answers\*\*\n\nCorrect sentences: .+\n\n\*\*Short explanations\*\*\n\n- /);
});


test('a key in several parts takes titles only for its own parts', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('correctSentences'), {});
  definition.stages[1].blocks[0].answerKey = { partTitles: { hints: 'Hints', explanations: ' ' } };
  const problems = validateTemplate(definition, CONTROL_CATALOG).errors.map(({ answerKey, part, detail }) => [answerKey, part, detail]);
  assert.deepEqual(problems, [
    ['partTitles', 'hints', 'у ключа нет части hints'],
    ['partTitles', 'explanations', 'Пояснения: нужен непустой текст'],
  ]);
});

// The rules carry only the shape of the answer; what the pairs are about is in the
// instructions, so the same block serves a topic warm-up and a vocabulary drill.
test('two This or That blocks in one stage keep their own rules and instructions', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('thisOrThat'), { pairs: 3 });
  definition.stages[1].blocks.push({
    id: 'checked-words', kind: 'generated', control: 'thisOrThat', fields: { choices: 'wordChoices' },
    instructions: 'Make each pair from two words of the Target Vocabulary.',
  });
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages, schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const topicPairs = lines.indexOf('Create exactly three This or That pairs in choices: in each pair the learner picks one of exactly two options.');
  const wordPairs = lines.indexOf('Create exactly four This or That pairs in wordChoices: in each pair the learner picks one of exactly two options.');
  assert.ok(topicPairs >= 0 && wordPairs > topicPairs);
  assert.equal(lines[topicPairs + 2], 'Make the two options in each pair clearly contrasting and engaging: things the learner can easily have an opinion about.');
  assert.equal(lines[wordPairs + 1], 'Make each pair from two words of the Target Vocabulary.');
  assert.deepEqual(Object.keys(schema.properties), ['choices', 'wordChoices']);
});

// Where the words of a matching task come from is up to its instructions: the lesson
// vocabulary or a list the teacher typed in.
test('two Match the Words blocks in one stage take their words from their own instructions', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('matchPictures'), { items: 4 });
  definition.stages[1].blocks[0].instructions = 'Use four terms of the Target Vocabulary, copied exactly.';
  definition.stages[1].blocks.push({
    id: 'own-words', kind: 'generated', control: 'matchPictures', params: { items: 5 }, fields: { items: 'ownWords' },
    instructions: 'Use these words: kite, tent, compass, ladder, camera.',
  });
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages, schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const vocabularyPictures = lines.indexOf('items: exactly four items for a word-to-picture matching task. term is the word or short phrase the learner sees; imagePrompt describes the picture that shows it.');
  const ownPictures = lines.indexOf('ownWords: exactly five items for a word-to-picture matching task. term is the word or short phrase the learner sees; imagePrompt describes the picture that shows it.');
  assert.ok(vocabularyPictures >= 0 && ownPictures > vocabularyPictures);
  assert.equal(lines[vocabularyPictures + 2], 'Use four terms of the Target Vocabulary, copied exactly.');
  assert.equal(lines[ownPictures + 1], 'Use these words: kite, tent, compass, ladder, camera.');
  assert.deepEqual(Object.keys(schema.properties), ['items', 'ownWords']);
});

// The words of the gaps come from the instructions too: the lesson vocabulary or any
// other words the teacher names.
test('a Vocabulary in Context block takes the words of its gaps from its instructions', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('contextDropdown'), { gaps: 4, options: 3 });
  definition.stages[1].blocks[0].instructions = 'Every answer and every option is a term of the Target Vocabulary.';
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const gaps = lines.indexOf('choices: one choice per gap, in the same order. options are three different words or short phrases, each in the form that fits the gap; answer is one of them, copied exactly. Use four different answers.');
  assert.ok(gaps >= 0);
  assert.equal(lines[gaps + 1], 'Every answer and every option is a term of the Target Vocabulary.');
});
