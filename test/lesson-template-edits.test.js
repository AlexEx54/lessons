'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Edits = require('../assets/lesson-template-edits.js');
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
