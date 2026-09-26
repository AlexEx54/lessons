'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { normalizeGuidedCommunicationCards, renderGuidedCommunicationCards } = require('../assets/components/guided-communication-cards.js');
const { normalizeTaskPrompt } = require('../assets/components/task-prompt.js');
const { studentComponent } = require('../lib/class-component-handlers.js');
const { createDocument } = require('./helpers/lesson-dom.js');
const stage = () => createSyntheticLesson('Superheroes', { template: 'template-2' }).stages[6];
const source = () => stage().content[2];

test('template two provides three communication tasks and private teacher notes; template one keeps role cards', () => {
  const current = stage();
  assert.equal(current.title, 'Guided Communication');
  assert.equal(current.content[2].items.length, 3);
  assert.doesNotThrow(() => normalizeTaskPrompt(current.content[1]));
  assert.equal(studentComponent(current.content[0], {}), null);
  assert.deepEqual(studentComponent(source(), {}), source());
  assert.ok(createSyntheticLesson('Test').stages.find(s => s.id === 'guided-speaking').content.some(c => c.type === 'guidedRoleCards'));
});
test('communication schema rejects incomplete help, invalid colors and duplicate ids', () => {
  assert.deepEqual(normalizeGuidedCommunicationCards(source()), source());
  for (const mutate of [s => { s.items = []; }, s => { s.items[1].id = s.items[0].id; },
    s => { s.items[0].cover.backgroundColor = 'red'; }, s => { s.items[0].task.help.phrases = []; },
    s => { s.items[0].task.questions = ['']; }, s => { delete s.items[0].task.miniTask; }]) {
    const invalid = source(); mutate(invalid); assert.throws(() => normalizeGuidedCommunicationCards(invalid));
  }
});
test('cards flip independently with inert hidden faces and flip back on a second click', () => {
  const node = renderGuidedCommunicationCards(source(), { viewerRole: 'student', onSave: () => assert.fail() }, createDocument());
  assert.equal(node.querySelectorAll('.guided-communication-cards__edit').length, 0);
  const cards = node.querySelectorAll('.communication-card');
  const flippers = node.querySelectorAll('.communication-card__flipper');
  const covers = node.querySelectorAll('.communication-card__cover');
  const backs = node.querySelectorAll('.communication-card__content');
  assert.equal(flippers[0].getAttribute('aria-expanded'), 'false');
  assert.equal(backs[0].getAttribute('inert'), '');
  flippers[0].click(); flippers[1].click();
  assert.ok(cards[0].classList.contains('flip-card--open'));
  assert.ok(cards[1].classList.contains('flip-card--open'));
  assert.equal(cards[2].classList.contains('flip-card--open'), false);
  assert.equal(covers[0].getAttribute('inert'), '');
  assert.equal(backs[0].getAttribute('inert'), null);
  assert.equal(backs[0].querySelector('button'), null);
  flippers[0].click();
  assert.equal(cards[0].classList.contains('flip-card--open'), false);
});
test('editor preserves values on save failure, supports retry and cancel, and saves structured changes', async () => {
  let fail = true, saved;
  const changes = [];
  const node = renderGuidedCommunicationCards(source(), {
    onDirtyChange: value => changes.push(value),
    onSave: async value => { if (fail) throw new Error('offline'); saved = value; },
  }, createDocument());
  node.querySelector('.guided-communication-cards__edit').click();
  assert.equal(node.querySelectorAll('.communication-card__cover').length, 0);
  const editor = node.querySelector('.guided-communication-cards__editor');
  const input = editor.querySelectorAll('input')[3]; input.value = 'Updated title';
  editor.listeners.input[0](); assert.equal(changes.at(-1), true);
  const [cancel, save] = editor.querySelectorAll('button');
  await save.listeners.click[0]();
  assert.equal(editor.querySelector('.guided-communication-cards__error').textContent, 'offline');
  assert.equal(input.value, 'Updated title'); assert.equal(save.disabled, false);
  fail = false; await save.listeners.click[0]();
  assert.equal(saved.items[0].task.title, 'Updated title'); assert.equal(changes.at(-1), false);
  node.querySelector('.guided-communication-cards__edit').click();
  const nextEditor = node.querySelector('.guided-communication-cards__editor');
  nextEditor.querySelectorAll('input')[3].value = 'Discard me';
  nextEditor.querySelector('button').click();
  assert.equal(node.querySelector('.communication-task__title').textContent, 'Updated title');
});
