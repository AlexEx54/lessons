'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  childComponentsOf,
  collectComponents,
  findComponentMatches,
  registerChildSlots,
} = require('../assets/components/component-tree.js');

// Регистрация слотов miniSituation происходит при загрузке модуля компонента.
require('../assets/components/mini-situation.js');

function stages(...contents) {
  return contents.map((content, index) => ({ id: `stage-${index + 1}`, content }));
}

function miniSituation(id, situationId) {
  return {
    type: 'miniSituation',
    id,
    title: 'Task',
    instruction: 'Write sentences.',
    sentenceCount: 3,
    situation: {
      type: 'illustratedTextPanel',
      id: situationId,
      text: 'Prompt',
      backgroundColor: '#F4F0FF',
      leadingPicture: { imagePrompt: 'Tent' },
    },
  };
}

test('collectComponents walks top-level components in document order', () => {
  const first = { type: 'textPanel', id: 'panel-a', text: 'A', backgroundColor: '#FFFFFF' };
  const second = { type: 'gapFill', id: 'gap-b', text: 'B', gaps: [] };
  const collected = collectComponents(stages([first], [second], null));
  assert.deepEqual(collected.map(component => component.id), ['panel-a', 'gap-b']);
});

test('miniSituation exposes its nested panel through registered slots', () => {
  const component = miniSituation('free-practice', 'free-practice-prompt');
  assert.deepEqual(childComponentsOf(component).map(child => child.id), ['free-practice-prompt']);

  const collected = collectComponents(stages([component]));
  assert.deepEqual(collected.map(entry => entry.id), ['free-practice', 'free-practice-prompt']);
  assert.equal(collected[1].type, 'illustratedTextPanel');
});

test('findComponentMatches finds nested components by type and id', () => {
  const component = miniSituation('free-practice', 'free-practice-prompt');
  const standalone = {
    type: 'illustratedTextPanel',
    id: 'other-panel',
    text: 'Other',
    backgroundColor: '#FFFFFF',
  };
  const matches = findComponentMatches(stages([component], [standalone]), 'illustratedTextPanel', 'free-practice-prompt');
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, 'free-practice-prompt');
});

test('unknown component types behave as leaves', () => {
  const component = { type: 'mysteryBox', id: 'mystery', contents: [{ type: 'textPanel', id: 'hidden' }] };
  assert.deepEqual(childComponentsOf(component), []);
  assert.deepEqual(collectComponents(stages([component])).map(entry => entry.id), ['mystery']);
});

test('re-registering a type replaces the previous slots getter', () => {
  registerChildSlots('testComposite', component => [component.first]);
  assert.deepEqual(childComponentsOf({ type: 'testComposite', first: { id: 'one' } }).map(c => c.id), ['one']);
  registerChildSlots('testComposite', component => [component.second]);
  assert.deepEqual(childComponentsOf({ type: 'testComposite', first: { id: 'one' }, second: { id: 'two' } })
    .map(c => c.id), ['two']);
});

test('collectComponents rejects damaged draft structure with 409 semantics', () => {
  assert.throws(() => collectComponents(null), (error) => {
    assert.equal(error.message, 'Структура черновика повреждена.');
    assert.equal(error.statusCode, 409);
    return true;
  });
  assert.throws(() => collectComponents([{ id: 'stage-1', content: 'oops' }]), /Структура черновика повреждена/);
  assert.throws(() => collectComponents([{ id: 'stage-1', content: null }, {}]), /Структура черновика повреждена/);
});

test('registerChildSlots validates arguments', () => {
  assert.throws(() => registerChildSlots('', () => []), /non-empty component type/);
  assert.throws(() => registerChildSlots('anotherComposite', 'nope'), /slots getter function/);
});
