'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Edits = require('../assets/lesson-template-edits.js');
const { describeControls } = require('../lib/lesson-template-editor.js');
const { validateTemplate } = require('../lib/lesson-templates/validate-template.js');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');
const { findSystemTemplate } = require('../lib/lesson-templates/system-templates.js');

const templateTwo = () => structuredClone(findSystemTemplate('template-2').definition);
const stage = (definition, id) => definition.stages.find(candidate => candidate.id === id);

test('context lines keep their prompt order and read their references', () => {
  const vocabulary = stage(templateTwo(), 'target-vocabulary');
  assert.deepEqual(Edits.contextLines(vocabulary), [
    { label: 'Lesson topic', reference: '$input.topic', source: 'input', name: 'topic' },
    { label: 'Grammar topic', reference: '$input.grammarTopic', source: 'input', name: 'grammarTopic' },
    { label: 'Guess statements from the Lead-In', reference: '$var.leadInGuesses', source: 'var', name: 'leadInGuesses' },
  ]);
  assert.deepEqual(Edits.contextLines({ context: { Odd: 'topic' } }), [{ label: 'Odd', reference: 'topic', source: null, name: null }]);
  assert.deepEqual(Edits.contextLines({}), []);
});

test('variables are traced to the blocks that give them away', () => {
  const definition = templateTwo();
  const producers = Edits.variableProducers(definition);
  assert.deepEqual([...producers.keys()].sort(), ['leadInGuesses', 'targetVocabulary']);
  const guesses = producers.get('leadInGuesses');
  assert.equal(guesses.stage.id, 'lead-in');
  assert.equal(guesses.block.id, 'lead-in-fact-or-myth');
  assert.equal(guesses.port, 'guessStatements');

  assert.deepEqual([...Edits.contextVariablesInUse(definition, stage(definition, 'target-vocabulary'))], ['leadInGuesses']);
  assert.deepEqual([...Edits.contextVariablesInUse(definition, stage(definition, 'grammar-focus'))], ['targetVocabulary']);
  // Wrap-up passes the vocabulary to the model, but none of its blocks reads it.
  assert.deepEqual([...Edits.contextVariablesInUse(definition, stage(definition, 'wrap-up'))], []);
});

test('a context line is renamed in place unless its label is empty or taken', () => {
  const vocabulary = stage(templateTwo(), 'target-vocabulary');
  assert.equal(Edits.renameContextLine(vocabulary, 1, '  Grammar  '), null);
  assert.deepEqual(Object.entries(vocabulary.context), [
    ['Lesson topic', '$input.topic'],
    ['Grammar', '$input.grammarTopic'],
    ['Guess statements from the Lead-In', '$var.leadInGuesses'],
  ]);
  assert.equal(Edits.renameContextLine(vocabulary, 1, ' '), 'Подпись не может быть пустой.');
  assert.equal(Edits.renameContextLine(vocabulary, 1, 'Lesson topic'), 'Такая подпись уже есть.');
  assert.equal(Object.keys(vocabulary.context)[1], 'Grammar');
});

test('added lines get an English label of their own; the last removed line drops the context', () => {
  assert.equal(Edits.defaultContextLabel('grammarTopic'), 'Grammar topic');
  assert.equal(Edits.defaultContextLabel('topic'), 'Topic');

  const wrapUp = stage(templateTwo(), 'wrap-up');
  wrapUp.context = { 'Grammar topic': '$input.grammarTopic' };
  assert.equal(Edits.addContextLine(wrapUp, 'var', 'leadInGuesses'), 'Lead in guesses');
  assert.equal(Edits.addContextLine(wrapUp, 'input', 'grammarTopic'), 'Grammar topic 2');
  assert.deepEqual(wrapUp.context, {
    'Grammar topic': '$input.grammarTopic',
    'Lead in guesses': '$var.leadInGuesses',
    'Grammar topic 2': '$input.grammarTopic',
  });

  Edits.removeContextLine(wrapUp, 1);
  assert.deepEqual(Object.keys(wrapUp.context), ['Grammar topic', 'Grammar topic 2']);
  Edits.removeContextLine(wrapUp, 0);
  Edits.removeContextLine(wrapUp, 0);
  assert.equal(Object.hasOwn(wrapUp, 'context'), false);
  assert.equal(Edits.addContextLine(wrapUp, 'input', 'topic'), 'Topic');
});

test('a new field is named from its English title, and its context line reads the title back', () => {
  const definition = templateTwo();
  assert.equal(Edits.inputNameFromTitle('  Main   CHARACTER '), 'mainCharacter');
  assert.equal(Edits.defaultContextLabel(Edits.inputNameFromTitle('Main character')), 'Main character');

  assert.equal(Edits.newInputProblem(definition, 'Main character'), null);
  assert.equal(Edits.newInputProblem(definition, ' '), 'Напишите название по-английски.');
  assert.equal(Edits.newInputProblem(definition, 'Главный герой'), 'Только латинские буквы и пробелы.');
  assert.equal(Edits.newInputProblem(definition, 'Hero 2'), 'Только латинские буквы и пробелы.');
  assert.equal(Edits.newInputProblem(definition, 'x'.repeat(41)), 'Не длиннее 40 символов.');
  assert.equal(Edits.newInputProblem(definition, 'grammar Topic'), 'Поле «Грамматика» уже так называется.');

  assert.equal(Edits.addInput(definition, 'Main character', ' Главный герой '), 'mainCharacter');
  assert.deepEqual(Object.keys(definition.inputs), ['topic', 'warmUpTopic', 'grammarTopic', 'mainCharacter']);
  assert.deepEqual(definition.inputs.mainCharacter, { label: 'Главный герой' });
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);
});

test('a field is kept by the stages that pass it and the fields that fall back to it', () => {
  const definition = templateTwo();
  assert.deepEqual(Edits.inputReaders(definition, 'topic'), {
    stages: ['lead-in', 'target-vocabulary', 'grammar-presentation', 'grammar-focus', 'guided-speaking', 'wrap-up'],
    fallbacks: ['warmUpTopic'],
  });
  assert.deepEqual(Edits.inputReaders(definition, 'warmUpTopic'), { stages: ['warm-up'], fallbacks: [] });

  Edits.addInput(definition, 'Main character', 'Главный герой');
  assert.deepEqual(Edits.inputReaders(definition, 'mainCharacter'), { stages: [], fallbacks: [] });
  Edits.removeInput(definition, 'mainCharacter');
  assert.deepEqual(Object.keys(definition.inputs), ['topic', 'warmUpTopic', 'grammarTopic']);
});

test('an optional field may take another field’s value; a required one has no fallback', () => {
  const input = { label: 'Тема Warm-Up', optional: true, fallback: 'topic' };
  Edits.setInputOptional(input, true, '');
  assert.deepEqual(input, { label: 'Тема Warm-Up', optional: true });
  Edits.setInputOptional(input, true, 'topic');
  assert.deepEqual(input, { label: 'Тема Warm-Up', optional: true, fallback: 'topic' });
  Edits.setInputOptional(input, false, 'topic');
  assert.deepEqual(input, { label: 'Тема Warm-Up' });
});

test('stages and blocks move to a new index, the rest keep their order', () => {
  const definition = templateTwo();
  const ids = list => list.map(item => item.id);
  const stages = ids(definition.stages);
  Edits.moveStage(definition, 0, 2);
  assert.deepEqual(ids(definition.stages), [stages[1], stages[2], stages[0], ...stages.slice(3)]);
  Edits.moveStage(definition, 2, 0);
  assert.deepEqual(ids(definition.stages), stages);
  Edits.moveStage(definition, stages.length - 1, 0);
  assert.deepEqual(ids(definition.stages), [stages.at(-1), ...stages.slice(0, -1)]);

  const vocabulary = stage(definition, 'target-vocabulary');
  const blocks = ids(vocabulary.blocks);
  Edits.moveBlock(vocabulary, 1, blocks.length - 1);
  assert.deepEqual(ids(vocabulary.blocks), [blocks[0], ...blocks.slice(2), blocks[1]]);
});

const controls = new Map(describeControls().controls.map(control => [control.type, control]));

test('a new stage goes after the given one and is the only problem until it gets a block', () => {
  const definition = templateTwo();
  const second = definition.stages[1].id;
  const added = Edits.addStage(definition, 1);
  assert.equal(definition.stages[2], added);
  assert.deepEqual(added, {
    id: 'new-stage',
    title: 'New Stage',
    durationMinutes: 5,
    icon: 'sparkles',
    context: { Topic: '$input.topic' },
    blocks: [],
  });
  assert.equal(Edits.addStage(definition, 2).id, 'new-stage-2');
  assert.equal(definition.stages[1].id, second);

  const { errors } = validateTemplate(definition, CONTROL_CATALOG);
  assert.deepEqual(errors, [
    { message: 'Этап 3 «New Stage» пуст: добавьте блок или удалите этап.', stage: 'new-stage' },
    { message: 'Этап 4 «New Stage» пуст: добавьте блок или удалите этап.', stage: 'new-stage-2' },
  ]);

  const plan = Edits.deletionPlan(definition, { stage: 'new-stage' }, controls);
  assert.deepEqual([plan.blocks, plan.stages, plan.unbound, plan.context], [[], ['new-stage'], [], []]);
});

const { STATIC_BLOCKS } = require('../assets/lesson-template-statics.js');

const addBlock = (definition, stageId, type) => Edits.addBlock(definition, stage(definition, stageId), controls.get(type), controls);
const problems = definition => validateTemplate(definition, CONTROL_CATALOG).errors.map(error => error.message);

test('a block from the catalog goes to the end of the stage with an id and variables of its own', () => {
  const definition = templateTwo();
  const { block, addedLines } = Edits.addBlock(definition, stage(definition, 'wrap-up'), { kind: 'static', type: 'teacherNote', sample: STATIC_BLOCKS.teacherNote.sample }, controls);
  assert.deepEqual(block, { id: 'wrap-up-teacher-note-2', kind: 'static', component: STATIC_BLOCKS.teacherNote.sample });
  assert.notEqual(block.component, STATIC_BLOCKS.teacherNote.sample);
  assert.deepEqual(addedLines, []);
  assert.equal(stage(definition, 'wrap-up').blocks.at(-1), block);

  const first = addBlock(definition, 'watch-and-interact', 'vocabularyList').block;
  const second = addBlock(definition, 'watch-and-interact', 'vocabularyList').block;
  assert.deepEqual([first.id, first.exports], ['watch-and-interact-vocabulary-list', { vocabulary: 'vocabulary' }]);
  assert.deepEqual([second.id, second.exports], ['watch-and-interact-vocabulary-list-2', { vocabulary: 'vocabulary2' }]);
  // Both write `items` in one answer: the second takes another name.
  assert.equal(first.fields, undefined);
  assert.deepEqual(second.fields, { items: 'items2' });
  assert.deepEqual(problems(definition), []);
});

test('an input takes the nearest source of its type; a source of another stage joins the context', () => {
  const definition = templateTwo();
  // Grammar Focus passes the target vocabulary already.
  let added = addBlock(definition, 'grammar-focus', 'fillInBlanks');
  assert.deepEqual([added.block.inputs, added.addedLines], [{ vocabulary: 'targetVocabulary' }, []]);
  // Watch & Interact has no context at all.
  added = addBlock(definition, 'watch-and-interact', 'dragSentences');
  assert.deepEqual([added.block.inputs, added.addedLines], [{ vocabulary: 'targetVocabulary' }, ['Target vocabulary']]);
  assert.deepEqual(stage(definition, 'watch-and-interact').context, { 'Target vocabulary': '$var.targetVocabulary' });
  assert.deepEqual(problems(definition), []);

  // Words of the stage itself come first; a generated block reads them only from a generated one.
  const own = addBlock(definition, 'grammar-focus', 'vocabularyList').block;
  assert.deepEqual(addBlock(definition, 'grammar-focus', 'fillInBlanks').block.inputs, { vocabulary: own.exports.vocabulary });
  assert.deepEqual(addBlock(definition, 'grammar-focus', 'vocabularyMeanings').block.inputs, { vocabulary: own.exports.vocabulary });
  assert.deepEqual(problems(definition), []);
  const sources = (kind, input) => Edits.inputSources(definition, stage(definition, 'grammar-focus'), kind, input, controls)
    .map(source => [source.variable, source.sameStage]);
  const both = [['vocabulary', true], ['targetVocabulary', false]];
  assert.deepEqual(sources('generated', controls.get('fillInBlanks').inputs.vocabulary), both);
  assert.deepEqual(sources('generated', { type: 'vocabulary' }), [['targetVocabulary', false]]);
  assert.deepEqual(sources('derived', { type: 'vocabulary' }), both);
  assert.deepEqual(sources('derived', { type: 'statements' }), [['leadInGuesses', false]]);
});

test('without a source an input stays unbound; a source without a required feature is linked and reported', () => {
  const definition = templateTwo();
  const early = addBlock(definition, 'lead-in', 'vocabularyMeanings').block;
  assert.equal(early.inputs, undefined);

  stage(definition, 'target-vocabulary').blocks.find(block => block.id === 'target-vocabulary-card').params.distractors = false;
  const links = Edits.plannedLinks(definition, stage(definition, 'wrap-up'), controls.get('vocabularyMeanings'), controls);
  assert.deepEqual(links.inputs.vocabulary.missing, ['distractor']);
  const meanings = addBlock(definition, 'wrap-up', 'vocabularyMeanings').block;
  assert.deepEqual(meanings.inputs, { vocabulary: 'targetVocabulary' });

  assert.deepEqual(problems(definition), [
    'Блоку lead-in-vocabulary-meanings нужен вход vocabulary (словарь).',
    'Вход vocabulary блока target-vocabulary-meanings требует у targetVocabulary: distractor.',
    'Вход vocabulary блока wrap-up-vocabulary-meanings требует у targetVocabulary: distractor.',
  ]);
});

test('a repeated audio takes the nearest audio of its stage', () => {
  const definition = templateTwo();
  addBlock(definition, 'wrap-up', 'audioScript');
  const audio = addBlock(definition, 'wrap-up', 'audioScript').block;
  const again = addBlock(definition, 'wrap-up', 'repeatAudio').block;
  assert.equal(again.from, audio.id);
  assert.deepEqual(Edits.blockLinks(definition, again, controls).source, { block: audio.id, inStage: true });
  assert.deepEqual(problems(definition), []);

  const lonely = addBlock(definition, 'watch-and-interact', 'repeatAudio').block;
  assert.equal(lonely.from, undefined);
  assert.equal(Edits.blockLinks(definition, lonely, controls).source, null);
  assert.deepEqual(problems(definition), ['Блок watch-and-interact-repeat-audio не собирается ни из одного блока этапа.']);
});

const block = (definition, id) => definition.stages.flatMap(item => Edits.flattenBlocks(item.blocks)).find(item => item.id === id);

test('a block’s links come from the definition, unbound inputs included', () => {
  const definition = templateTwo();
  const links = id => Edits.blockLinks(definition, block(definition, id), controls);
  assert.deepEqual(links('lead-in-fact-or-myth'), {
    inputs: {},
    exports: {
      guessStatements: {
        variable: 'leadInGuesses',
        type: 'statements',
        readers: {
          blocks: [
            { block: 'target-vocabulary-stories', stage: 'target-vocabulary', port: 'guesses' },
            { block: 'target-vocabulary-guess-answers', stage: 'target-vocabulary', port: 'guesses' },
          ],
          stages: ['target-vocabulary'],
        },
      },
    },
  });
  assert.deepEqual(links('target-vocabulary-stories').inputs.guesses, {
    type: 'statements', required: false, variable: 'leadInGuesses', from: { block: 'lead-in-fact-or-myth', stage: 'lead-in' },
  });

  delete block(definition, 'target-vocabulary-meanings').inputs;
  assert.deepEqual(links('target-vocabulary-meanings').inputs.vocabulary, { type: 'vocabulary', required: true, variable: null, from: null });
  block(definition, 'target-vocabulary-meanings').inputs = { vocabulary: 'gone' };
  assert.equal(links('target-vocabulary-meanings').inputs.vocabulary.from, null);
});

test('a block never lists itself among the sources of its input', () => {
  const definition = templateTwo();
  const card = block(definition, 'target-vocabulary-card');
  const sources = except => Edits.inputSources(definition, stage(definition, 'target-vocabulary'), 'derived', { type: 'vocabulary' }, controls, except)
    .map(source => source.variable);
  assert.deepEqual(sources(null), ['targetVocabulary']);
  assert.deepEqual(sources(card), []);
});

test('another source of an earlier stage joins the context; the line read before goes once no block reads it', () => {
  const definition = templateTwo();
  const words = addBlock(definition, 'lead-in', 'vocabularyList').block.exports.vocabulary;
  const focus = stage(definition, 'grammar-focus');
  const support = block(definition, 'grammar-focus-support');

  assert.deepEqual(Edits.setInputSource(definition, focus, support, 'vocabulary', words), {
    addedLines: ['Vocabulary'],
    removedLines: ['Target Vocabulary'],
  });
  assert.deepEqual(support.inputs, { vocabulary: words });
  assert.deepEqual(focus.context, { 'Lesson topic': '$input.topic', 'Grammar topic': '$input.grammarTopic', Vocabulary: '$var.vocabulary' });
  assert.deepEqual(problems(definition), []);

  // Back again; then a line another block of the stage reads stays.
  assert.deepEqual(addBlock(definition, 'grammar-focus', 'fillInBlanks').addedLines, ['Target vocabulary']);
  assert.deepEqual(Edits.setInputSource(definition, focus, support, 'vocabulary', 'targetVocabulary'), {
    addedLines: [],
    removedLines: ['Vocabulary'],
  });
  assert.deepEqual(Edits.setInputSource(definition, focus, support, 'vocabulary', words), {
    addedLines: ['Vocabulary'],
    removedLines: [],
  });
  assert.deepEqual(problems(definition), []);
});

test('a source of the stage itself needs no line; an optional input may be left unbound', () => {
  const definition = templateTwo();
  const vocabulary = stage(definition, 'target-vocabulary');
  const context = structuredClone(vocabulary.context);
  const questions = block(definition, 'target-vocabulary-personalized-questions');
  assert.deepEqual(Edits.setInputSource(definition, vocabulary, questions, 'highlight', null), { addedLines: [], removedLines: [] });
  assert.equal(Object.hasOwn(questions, 'inputs'), false);
  assert.deepEqual(Edits.setInputSource(definition, vocabulary, questions, 'highlight', 'targetVocabulary'), { addedLines: [], removedLines: [] });
  assert.deepEqual(questions.inputs, { highlight: 'targetVocabulary' });
  assert.deepEqual(vocabulary.context, context);

  // A required one left unbound is the server's problem.
  Edits.setInputSource(definition, vocabulary, block(definition, 'target-vocabulary-meanings'), 'vocabulary', null);
  assert.deepEqual(problems(definition), ['Блоку target-vocabulary-meanings нужен вход vocabulary (словарь).']);
});

const templateOne = () => structuredClone(findSystemTemplate('template-1').definition);
const blockIds = plan => plan.blocks.map(entry => entry.block);

test('a block built from one block takes another source of its stage instead', () => {
  const definition = templateOne();
  const listening = stage(definition, 'listening');
  const again = block(definition, 'listening-audio-again');
  const audio = addBlock(definition, 'listening', 'audioScript').block;
  assert.deepEqual(Edits.sourceOptions(listening, again, controls), [
    { block: 'listening-audio', chosen: true },
    { block: audio.id, chosen: false },
  ]);
  Edits.setSource(again, audio.id);
  assert.equal(again.from, audio.id);
  assert.deepEqual(problems(definition), []);

  // A source the stage lacks stays among the options, after the stage's own.
  again.from = 'reading-text';
  assert.deepEqual(Edits.sourceOptions(listening, again, controls).map(option => [option.block, option.chosen]), [
    ['listening-audio', false], [audio.id, false], ['reading-text', true],
  ]);
});

test('a task comes from the catalog with its answer key, which is set up and turned off in its block', () => {
  const definition = templateTwo();
  const task = addBlock(definition, 'grammar-focus', 'correctSentences').block;
  assert.deepEqual(task.answerKey, {});
  assert.equal(Object.hasOwn(addBlock(definition, 'grammar-focus', 'quickRule').block, 'answerKey'), false);

  Edits.setAnswerKeySetting(task, 'title', 'Answers');
  Edits.setAnswerKeySetting(task, 'layout', 'stacked');
  Edits.setAnswerKeyPartTitle(task, 'answers', '  Task 2  ');
  Edits.setAnswerKeyPartTitle(task, 'explanations', 'Why');
  assert.deepEqual(task.answerKey, { title: 'Answers', layout: 'stacked', partTitles: { answers: 'Task 2', explanations: 'Why' } });
  assert.deepEqual(problems(definition), []);
  // Back to the defaults, the settings leave the definition.
  Edits.setAnswerKeySetting(task, 'layout', undefined);
  Edits.setAnswerKeyPartTitle(task, 'answers', ' ');
  Edits.setAnswerKeyPartTitle(task, 'explanations', '');
  assert.deepEqual(task.answerKey, { title: 'Answers' });

  // Off and on again, the key starts over.
  Edits.setAnswerKey(task, false);
  assert.equal(Object.hasOwn(task, 'answerKey'), false);
  Edits.setAnswerKey(task, true);
  assert.deepEqual(task.answerKey, {});
});

test('a deleted block takes required readers, sources and slots with it; optional inputs are unbound', () => {
  const definition = templateTwo();
  const plan = Edits.deletionPlan(definition, { block: 'target-vocabulary-card' }, controls);
  assert.deepEqual(blockIds(plan), [
    'target-vocabulary-card',
    'target-vocabulary-meanings',
    'target-vocabulary-drag-words',
    'target-vocabulary-type-words',
    'grammar-focus-support',
    'guided-communication-cards',
  ]);
  assert.deepEqual(plan.unbound.map(entry => `${entry.block}.${entry.port}`), [
    'target-vocabulary-stories.highlight',
    'target-vocabulary-personalized-questions.highlight',
  ]);
  assert.deepEqual(plan.context.map(line => line.stage), ['grammar-presentation', 'grammar-focus', 'guided-speaking', 'wrap-up']);
  assert.deepEqual(plan.stages, []);

  Edits.applyDeletion(definition, plan);
  const vocabulary = stage(definition, 'target-vocabulary');
  assert.deepEqual(vocabulary.blocks.find(block => block.id === 'target-vocabulary-stories').inputs, { guesses: 'leadInGuesses' });
  assert.equal(Object.hasOwn(vocabulary.blocks.find(block => block.id === 'target-vocabulary-personalized-questions'), 'inputs'), false);
  assert.deepEqual(Object.keys(stage(definition, 'wrap-up').context), ['Lesson topic', 'Grammar topic']);

  // A block built from a deleted one has nothing to be built from and goes too.
  const one = templateOne();
  const audio = Edits.deletionPlan(one, { block: 'listening-audio' }, controls);
  assert.deepEqual(blockIds(audio), ['listening-audio', 'listening-audio-again']);
});

test('a stage emptied by the cascade goes too; nothing is changed before applyDeletion', () => {
  const definition = templateTwo();
  const before = JSON.stringify(definition);
  const plan = Edits.deletionPlan(definition, { block: 'warm-up-odd-one-out' }, controls);
  // The teacher note reads its example word from the exercise through a slot.
  assert.deepEqual(blockIds(plan), ['warm-up-teacher-note', 'warm-up-odd-one-out']);
  assert.deepEqual(plan.stages, ['warm-up']);
  assert.equal(JSON.stringify(definition), before);
  Edits.applyDeletion(definition, plan);
  assert.equal(definition.stages[0].id, 'lead-in');
});

test('a deleted stage clears what other stages read from it', () => {
  const definition = templateTwo();
  const plan = Edits.deletionPlan(definition, { stage: 'lead-in' }, controls);
  assert.deepEqual(plan.stages, ['lead-in']);
  assert.deepEqual(blockIds(plan).filter(id => !id.startsWith('lead-in-')), ['target-vocabulary-guess-answers']);
  assert.deepEqual(plan.unbound.map(entry => `${entry.block}.${entry.port}`), ['target-vocabulary-stories.guesses']);
  assert.deepEqual(plan.context, [{ stage: 'target-vocabulary', label: 'Guess statements from the Lead-In' }]);
});

test('a row keeps two parts, turns into its last part and goes as a whole', () => {
  const rowId = 'grammar-focus-practice-support-row';
  const row = definition => stage(definition, 'grammar-focus').blocks.find(block => block.id === rowId);

  const definition = templateOne();
  Edits.applyDeletion(definition, Edits.deletionPlan(definition, { block: 'grammar-focus-support' }, controls));
  assert.deepEqual(row(definition).blocks.map(part => part.id), ['grammar-focus-writing-support', 'grammar-focus-challenge']);
  Edits.applyDeletion(definition, Edits.deletionPlan(definition, { block: 'grammar-focus-challenge' }, controls));
  assert.equal(row(definition), undefined);
  assert.equal(stage(definition, 'grammar-focus').blocks.filter(block => block.id === 'grammar-focus-writing-support').length, 1);

  const whole = templateOne();
  const plan = Edits.deletionPlan(whole, { block: rowId }, controls);
  assert.deepEqual(blockIds(plan), ['grammar-focus-writing-support', 'grammar-focus-support', 'grammar-focus-challenge']);
});

test('the last stage cannot go, by itself or by a cascade', () => {
  const definition = templateTwo();
  definition.stages = [stage(definition, 'warm-up')];
  assert.equal(Edits.deletionPlan(definition, { stage: 'warm-up' }, controls).emptiesTemplate, true);
  assert.equal(Edits.deletionPlan(definition, { block: 'warm-up-odd-one-out' }, controls).emptiesTemplate, true);
  assert.equal(Edits.deletionPlan(definition, { block: 'warm-up-teacher-note' }, controls).emptiesTemplate, false);
});

test('deleting any block or stage of a system template leaves a valid template', () => {
  for (const id of ['template-1', 'template-2']) {
    const base = findSystemTemplate(id).definition;
    const targets = [
      ...base.stages.map(item => ({ stage: item.id })),
      ...base.stages.flatMap(item => item.blocks.flatMap(block => [block, ...(block.blocks || [])]))
        .map(block => ({ block: block.id })),
    ];
    for (const target of targets) {
      const definition = structuredClone(base);
      const plan = Edits.deletionPlan(definition, target, controls);
      assert.equal(plan.emptiesTemplate, false);
      Edits.applyDeletion(definition, plan);
      const { errors } = validateTemplate(definition, CONTROL_CATALOG);
      assert.deepEqual(errors.map(error => error.message), [], `${id}: ${JSON.stringify(target)}`);
    }
  }
});

const blockersOf = (definition, id, target) => Edits.moveBlockers(definition, id, target, controls)
  .map(({ kind, block, stage: stageId }) => [kind, block ?? null, stageId ?? null].filter(Boolean).join(' '));
const stageBlockIds = (definition, id) => stage(definition, id).blocks.map(block => block.id);

test('a block built from blocks of its stage, or a source of one, stays in its stage', () => {
  const definition = templateTwo();
  assert.deepEqual(Edits.moveBlockers(definition, 'target-vocabulary-guess-answers', 'wrap-up', controls), [
    { kind: 'builtFrom', blocks: ['target-vocabulary-stories'] },
  ]);
  // The teacher note reads its example word from the exercise through a slot.
  assert.deepEqual(Edits.moveBlockers(definition, 'warm-up-odd-one-out', 'wrap-up', controls), [
    { kind: 'usedBy', blocks: ['warm-up-teacher-note'] },
  ]);
  assert.deepEqual(blockersOf(definition, 'warm-up-teacher-note', 'lead-in'), ['builtFrom']);
});

test('a block goes no higher than its sources and no lower than its readers', () => {
  const definition = templateTwo();
  // The vocabulary may go up: its readers below then take it through the context.
  assert.deepEqual(blockersOf(definition, 'target-vocabulary-card', 'lead-in'), []);
  assert.deepEqual(blockersOf(definition, 'target-vocabulary-card', 'grammar-presentation'), [
    'reader target-vocabulary-stories target-vocabulary',
    'reader target-vocabulary-meanings target-vocabulary',
    'reader target-vocabulary-drag-words target-vocabulary',
    'reader target-vocabulary-type-words target-vocabulary',
    'reader target-vocabulary-personalized-questions target-vocabulary',
  ]);
  assert.deepEqual(blockersOf(definition, 'target-vocabulary-drag-words', 'lead-in'), [
    'input target-vocabulary-card target-vocabulary',
  ]);
  assert.deepEqual(blockersOf(definition, 'target-vocabulary-drag-words', 'wrap-up'), []);

  // The reading text cannot be written in one answer with the vocabulary it takes.
  const one = templateOne();
  assert.deepEqual(Edits.moveBlockers(one, 'reading-text', 'target-vocabulary', controls), [
    { kind: 'input', block: 'target-vocabulary-card', stage: 'target-vocabulary', inStage: false, type: 'vocabulary' },
  ]);
  assert.deepEqual(blockersOf(one, 'target-vocabulary-card', 'reading').slice(-1), ['reader reading-text reading']);
  // Listening passes the vocabulary to the model, though none of its blocks reads it.
  assert.deepEqual(blockersOf(one, 'target-vocabulary-card', 'grammar-presentation').filter(text => !text.endsWith(' target-vocabulary')), [
    'reader reading-text reading',
    'reader listening',
  ]);
});

test('a moved block goes to the end of the stage; context lines follow its links', () => {
  const definition = templateTwo();
  const moved = Edits.moveToStage(definition, 'target-vocabulary-card', 'lead-in', controls);
  assert.equal(stageBlockIds(definition, 'lead-in').at(-1), 'target-vocabulary-card');
  assert.deepEqual(moved, {
    addedLines: [{ stage: 'target-vocabulary', label: 'Target vocabulary' }],
    removedLines: [],
  });
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);

  // Back home: a line on the stage's own variable goes.
  assert.deepEqual(Edits.moveToStage(definition, 'target-vocabulary-card', 'target-vocabulary', controls), {
    addedLines: [],
    removedLines: [{ stage: 'target-vocabulary', label: 'Target vocabulary' }],
  });
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);

  const watch = Edits.moveToStage(definition, 'target-vocabulary-drag-words', 'watch-and-interact', controls);
  assert.deepEqual(watch.addedLines, [{ stage: 'watch-and-interact', label: 'Target vocabulary' }]);
});

test('the old stage loses a line only the moved block read; a row moves whole', () => {
  const one = templateOne();
  assert.deepEqual(Edits.moveToStage(one, 'reading-text', 'listening', controls), {
    addedLines: [],
    removedLines: [{ stage: 'reading', label: 'Target Vocabulary' }],
  });

  const definition = templateTwo();
  const rowId = 'grammar-focus-practice-support-row';
  assert.deepEqual(blockersOf(definition, rowId, 'wrap-up'), []);
  const moved = Edits.moveToStage(definition, rowId, 'wrap-up', controls);
  assert.equal(stageBlockIds(definition, 'wrap-up').at(-1), rowId);
  assert.equal(stageBlockIds(definition, 'grammar-focus').includes(rowId), false);
  assert.deepEqual(moved.removedLines, [{ stage: 'grammar-focus', label: 'Target Vocabulary' }]);
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);
});

test('answer names the target stage holds are renamed, fields for the AI in their text too', () => {
  const one = templateOne();
  Edits.moveToStage(one, 'lead-in-teacher-note', 'warm-up', controls);
  Edits.moveToStage(one, 'wrap-up-possible-language', 'warm-up', controls);
  const [note, language] = stage(one, 'warm-up').blocks.slice(-2);
  assert.deepEqual(Object.keys(note.slots), ['aiField1']);
  assert.equal(note.component.text, '{{aiField1}}');
  assert.deepEqual(Object.keys(language.slots), ['aiField2']);
  assert.equal(language.component.text, '{{aiField2}}');
  Edits.moveToStage(one, 'listening-gist-quiz', 'reading', controls);
  assert.deepEqual(stage(one, 'reading').blocks.at(-1).fields, { questions: 'gistQuestions2' });
  assert.deepEqual(validateTemplate(one, CONTROL_CATALOG).errors, []);

  const definition = templateTwo();
  Edits.appendNoteField(staticBlock(definition, 'lead-in', 'lead-in-teacher-note'), 'aiField1', 'Say hello.');
  Edits.appendNoteField(staticBlock(definition, 'target-vocabulary', 'target-vocabulary-teacher-note'), 'aiField1', 'Say bye.');
  Edits.moveToStage(definition, 'lead-in-teacher-note', 'target-vocabulary', controls);
  const moved = stage(definition, 'target-vocabulary').blocks.at(-1);
  assert.deepEqual(moved.slots, { aiField2: { rule: 'Say hello.' } });
  assert.match(moved.component.text, /\{\{aiField2\}\}$/);
  assert.doesNotMatch(moved.component.text, /aiField1/);
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);
});

test('every move a system template allows leaves a valid template', () => {
  for (const id of ['template-1', 'template-2']) {
    const base = findSystemTemplate(id).definition;
    for (const home of base.stages) {
      for (const block of home.blocks) {
        for (const target of base.stages) {
          if (target === home) continue;
          const definition = structuredClone(base);
          if (Edits.moveBlockers(definition, block.id, target.id, controls).length > 0) continue;
          Edits.moveToStage(definition, block.id, target.id, controls);
          const errors = validateTemplate(definition, CONTROL_CATALOG).errors
            .map(error => error.message)
            .filter(message => !message.endsWith('пуст: добавьте блок или удалите этап.'));
          assert.deepEqual(errors, [], `${id}: ${block.id} → ${target.id}`);
        }
      }
    }
  }
});

const staticBlock = (definition, stageId, id) => stage(definition, stageId).blocks.find(block => block.id === id);

test('a static block takes the fields its editor saves; null drops a field', () => {
  const definition = templateTwo();
  const instruction = staticBlock(definition, 'guided-speaking', 'guided-communication-instruction');
  const saved = Edits.applyStaticChanges(instruction, { title: 'Pick a card', text: 'Pick one.', support: null });
  assert.equal(saved, instruction.component);
  assert.deepEqual(instruction.component, { type: 'taskPrompt', variant: 'followUp', title: 'Pick a card', text: 'Pick one.' });

  const discussion = staticBlock(definition, 'watch-and-interact', 'watch-discussion');
  const sections = [{ id: 'discussion', title: 'Talk', text: 'Why?' }];
  Edits.applyStaticChanges(discussion, { title: 'After', sections });
  assert.equal(discussion.component.title, 'After');
  assert.deepEqual(discussion.component.sections, sections);
  assert.equal(discussion.component.accentColor, '#8257E5');
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);
});

test('Teacher’s Notes keeps, drops and rewrites its sub-blocks apart from its text', () => {
  const definition = templateTwo();
  const note = staticBlock(definition, 'target-vocabulary', 'target-vocabulary-teacher-note');
  const [first, second] = note.component.blocks;
  Edits.applyStaticChanges(note, { blocks: [{ id: first.id, title: 'Check', text: 'New text', tip: { text: 'New tip' } }] });
  assert.deepEqual(note.component.blocks[0], { ...first, title: 'Check', text: 'New text', tip: { text: 'New tip' } });
  assert.equal(note.component.blocks[1], second);

  Edits.applyStaticChanges(note, { text: 'Own words', retainedBlockIds: [second.id] });
  assert.equal(note.component.text, 'Own words');
  assert.deepEqual(note.component.blocks.map(block => block.id), [second.id]);
  Edits.applyStaticChanges(note, { text: null, retainedBlockIds: [second.id] });
  assert.equal(Object.hasOwn(note.component, 'text'), false);
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);
});

test('Teacher’s Notes sub-blocks change icon, color and tip, and new ones join the end', () => {
  const definition = templateTwo();
  const note = staticBlock(definition, 'target-vocabulary', 'target-vocabulary-teacher-note');
  const [first, second, third] = note.component.blocks;
  Edits.applyStaticChanges(note, { blocks: [{ ...first, icon: 'bulb', titleColor: '#2F80ED', tip: null }] });
  assert.deepEqual(note.component.blocks[0], (({ tip, ...rest }) => ({ ...rest, icon: 'bulb', titleColor: '#2F80ED' }))(first));
  Edits.applyStaticChanges(note, { blocks: [{ ...second, tip: { text: 'Smile.' } }] });
  assert.deepEqual(note.component.blocks[1].tip, { text: 'Smile.' });

  const added = { id: 'target-vocabulary-teacher-note-block-4', title: 'Timing', titleColor: '#E0812D', icon: 'trophy', text: 'Keep it short.', tip: null };
  Edits.applyStaticChanges(note, { text: null, retainedBlockIds: [first.id, third.id], addedBlocks: [added] });
  assert.deepEqual(note.component.blocks.map(block => block.id), [first.id, third.id, added.id]);
  assert.deepEqual(note.component.blocks[2], { type: 'teacherNoteBlock', id: added.id, title: 'Timing', titleColor: '#E0812D', icon: 'trophy', text: 'Keep it short.' });
  assert.throws(() => Edits.applyStaticChanges(note, { addedBlocks: [{ ...added, id: 'other', title: '' }] }), /title/);
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);
});

test('a broken component leaves the block as it was', () => {
  const definition = templateTwo();
  const note = staticBlock(definition, 'watch-and-interact', 'watch-teacher-note');
  const before = structuredClone(note);
  assert.throws(() => Edits.applyStaticChanges(note, { text: null }), /TeacherNote requires text/);
  assert.deepEqual(note, before);
  const quiz = staticBlock(definition, 'watch-and-interact', 'watch-prediction');
  assert.throws(() => Edits.applyStaticChanges(quiz, { items: [] }));
  assert.equal(quiz.component.items.length, 1);
});

test('a slot whose name is gone from the text goes with it', () => {
  const definition = templateTwo();
  const note = staticBlock(definition, 'warm-up', 'warm-up-teacher-note');
  const text = note.component.text;
  Edits.applyStaticChanges(note, { text: `${text}\n\nMore.` });
  assert.deepEqual(Object.keys(note.slots), ['exampleWord']);
  Edits.applyStaticChanges(note, { text: text.replaceAll('{{exampleWord}}', 'Apple') });
  assert.equal(Object.hasOwn(note, 'slots'), false);
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);
});

test('a field for the AI inserted into the open editor joins the block when its text is saved', () => {
  const definition = templateTwo();
  const note = staticBlock(definition, 'warm-up', 'warm-up-teacher-note');
  const { text } = note.component;
  const newSlots = { aiField1: { rule: 'One short question.' }, aiField2: { rule: 'Erased before saving.' } };
  Edits.applyStaticChanges(note, { text: `${text}\n\nAsk: {{aiField1}}` }, newSlots);
  assert.deepEqual(note.slots, {
    exampleWord: { from: 'warm-up-odd-one-out.items[0].answer', capitalize: true },
    aiField1: { rule: 'One short question.' },
  });
  assert.deepEqual(validateTemplate(definition, CONTROL_CATALOG).errors, []);
});

// What instructions may refer to: the fields of the stage's answer in display order. A
// slot copied from another block is not the model's to write.
test('the answer fields of a stage come with the blocks that own them', () => {
  const definition = templateTwo();
  assert.deepEqual(Edits.answerFields(stage(definition, 'lead-in'), controls), [
    { name: 'checkStatements', block: 'lead-in-fact-or-myth' },
    { name: 'guessStatements', block: 'lead-in-fact-or-myth' },
    { name: 'speakingSupport', block: 'lead-in-speaking-support' },
  ]);
  assert.deepEqual(Edits.answerFields(stage(definition, 'warm-up'), controls), [{ name: 'rows', block: 'warm-up-odd-one-out' }]);
  assert.deepEqual(Edits.answerFields(stage(definition, 'watch-and-interact'), controls), []);
});

test('a new field takes the first aiField name free among the stage answer names', () => {
  const definition = templateTwo();
  const speaking = stage(definition, 'guided-speaking');
  assert.equal(Edits.newFieldName(speaking, controls), 'aiField1');
  assert.equal(Edits.newFieldName(speaking, controls, ['aiField1']), 'aiField2');

  const note = staticBlock(definition, 'guided-speaking', 'guided-communication-teacher-note');
  Edits.appendNoteField(note, 'aiField1');
  assert.match(note.component.text, /\n\n\{\{aiField1\}\}$/);
  assert.deepEqual(note.slots.aiField1, { rule: '' });
  assert.equal(Edits.newFieldName(speaking, controls), 'aiField2');

  // A generated block's answer field renamed to aiField2 takes that name too.
  const generated = Edits.flattenBlocks(speaking.blocks).find(block => block.kind === 'generated');
  const [field] = controls.get(generated.control).fields;
  generated.fields = { ...generated.fields, [field]: 'aiField2' };
  assert.equal(Edits.newFieldName(speaking, controls), 'aiField3');
});
