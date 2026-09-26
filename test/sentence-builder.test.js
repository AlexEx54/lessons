'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../assets/components/sentence-builder-model.js');
const exercises = require('../assets/components/exercise-state.js');
const { renderSentenceBuilder } = require('../assets/components/sentence-builder.js');
const { createDocument } = require('./helpers/lesson-dom.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { studentComponent, applyComponentAction } = require('../lib/class-component-handlers.js');
const { createSentenceBuilderExample } = require('../lib/sentence-builder-example.js');
const source = createSentenceBuilderExample();
const task = (...sentences) => model.normalizeSentenceBuilder({ ...source, items: sentences.map((text, i) => model.itemFromText(text, `sentence-${i + 1}`)) });
const fire = async (node, name = 'click', event = {}) => { for (const fn of node.listeners[name] || []) await fn({ preventDefault() {}, ...event }); };
function place(component, ids, previous = {}) {
  return ids.reduce((state, tokenId, toIndex) => model.apply(component, state, {
    type: 'move-token', itemId: component.items[0].id, tokenId, toIndex,
  }), previous);
}
const command = (component, type, extra = {}) => ({ type, itemId: component.items[0].id, ...extra });

test('template two omits the reusable game; chunks and alternative orders round-trip', () => {
  const content = createSyntheticLesson('Heroes', { template: 'template-2' }).stages[7].content;
  assert.deepEqual(content.map(item => item.type), ['teacherNote', 'threeTwoOne', 'selfAssessment', 'markdownCard']);
  assert.equal(model.normalizeSentenceBuilder(source).items.length, 4);
  const text = 'Today we can [help people].\nwe can [help people]. Today';
  const item = model.itemFromText(text, 'sample');
  assert.equal(item.tokens[3].text, 'help people.');
  assert.equal(item.tokens.length, 4);
  assert.deepEqual(model.itemFromText(model.itemToText(item), item.id), item);
  assert.throws(() => task('hello [broken'), /скобки/);
  assert.throws(() => task('one two\none three'), /те же карточки/);
  for (const patch of [{ items: [] }, { hintsEnabled: 'yes' }, { title: '<img>' },
    { items: [{ ...source.items[0], acceptedOrders: [['missing']] }] },
    { items: [source.items[0], source.items[0]] }, { unexpected: true }]) {
    assert.throws(() => model.normalizeSentenceBuilder({ ...source, ...patch }));
  }
});

test('check accepts repeated identical cards interchangeably and every configured order', () => {
  const component = task('go go home');
  const [a, b, c] = component.items[0].tokens.map(token => token.id);
  let state = place(component, [b, a, c]);
  state = model.apply(component, state, command(component, 'check-sentence'));
  assert.equal(state.items['sentence-1'].solved, true);
  assert.equal(state.items['sentence-1'].attempts, 1);
  assert.throws(() => model.apply(component, state, command(component, 'return-token', { tokenId: a })), /уже собрано/);
  const alternate = task('Today we play\nwe play Today');
  const order = alternate.items[0].acceptedOrders[1];
  assert.equal(model.apply(alternate, place(alternate, order), command(alternate, 'check-sentence')).items['sentence-1'].solved, true);
});

test('wrong answers remain editable; hints keep the longest valid prefix including duplicate words', () => {
  const component = task('go go home');
  const [a, b, c] = component.items[0].tokens.map(token => token.id);
  let state = place(component, [b, c, a]);
  state = model.apply(component, state, command(component, 'check-sentence'));
  assert.equal(state.items['sentence-1'].feedback, 'wrong');
  state = model.apply(component, state, command(component, 'request-hint'));
  assert.deepEqual(state.items['sentence-1'].placedIds, [b, a, c]);
  assert.equal(state.items['sentence-1'].hintsUsed, 1);
  assert.equal(state.items['sentence-1'].solved, false);
  state = model.apply(component, state, command(component, 'request-hint'));
  assert.equal(state.items['sentence-1'].feedback, 'ready');
  assert.equal(state.items['sentence-1'].hintsUsed, 1);
  const alternate = task('Today we play\nwe play Today');
  const prefix = alternate.items[0].acceptedOrders[1].slice(0, 2);
  const hinted = model.apply(alternate, place(alternate, prefix), command(alternate, 'request-hint'));
  assert.deepEqual(hinted.items['sentence-1'].placedIds, alternate.items[0].acceptedOrders[1]);
});

test('reorder/return preserve uniqueness and reject forged positions, disabled hints, stale items and early completion', () => {
  const component = task('one two three', 'four five');
  const [a, b, c] = component.items[0].tokens.map(token => token.id);
  let state = place(component, [a, b, c]);
  state = model.apply(component, state, command(component, 'move-token', { tokenId: a, toIndex: 2 }));
  assert.deepEqual(state.items['sentence-1'].placedIds, [b, c, a]);
  state = model.apply(component, state, command(component, 'return-token', { tokenId: c }));
  assert.deepEqual(state.items['sentence-1'].placedIds, [b, a]);
  for (const action of [command(component, 'move-token', { tokenId: a, toIndex: -1 }),
    command(component, 'move-token', { tokenId: 'unknown', toIndex: 0 }),
    command(component, 'move-token', { tokenId: a, toIndex: 9 }),
    command(component, 'move-token', { tokenId: a, toIndex: .1 }),
    command(component, 'return-token', { tokenId: c }), command(component, 'next-sentence'),
    command(component, 'check-sentence'), command(component, 'unknown'), { type: 'request-hint', itemId: 'sentence-2' }]) {
    assert.throws(() => model.apply(component, state, action), { statusCode: 400 });
  }
  assert.throws(() => model.apply({ ...component, hintsEnabled: false }, state, command(component, 'request-hint')));
  state = model.apply(component, place(component, [a, b, c]), command(component, 'check-sentence'));
  state = model.apply(component, state, command(component, 'next-sentence'));
  assert.equal(state.currentItemId, 'sentence-2');
  assert.equal(state.items['sentence-1'].solved, true);
});

test('student payload hides answers and canonical identifiers; server alone checks and hints', () => {
  const component = task('one two three');
  const layout = { items: { 'sentence-1': { tokenIds: ['opaque-a', 'opaque-b', 'opaque-c'], order: [2, 0, 1] } } };
  const session = { _layouts: { [component.id]: layout } };
  const publicTask = studentComponent(component, session).presentation;
  assert.equal(JSON.stringify(publicTask).includes('acceptedOrders'), false);
  assert.equal(JSON.stringify(publicTask).includes('token-1'), false);
  assert.deepEqual(publicTask.items[0].tokens.map(token => token.text), ['three', 'one', 'two']);
  assert.throws(() => model.apply(publicTask, {}, command(component, 'request-hint')), /сервером/);
  applyComponentAction({ component, state: session, role: 'student', action: command(component, 'request-hint') });
  assert.deepEqual(session.exercises[component.id].items['sentence-1'].placedIds, ['opaque-a']);
  assert.throws(() => applyComponentAction({ component, state: session, role: 'guest', action: command(component, 'request-hint') }), { statusCode: 403 });
});

test('renderer supports click, keyboard reorder, hint, checking, explicit next and celebration', async () => {
  const component = task('one two');
  const node = renderSentenceBuilder(component, {}, createDocument());
  const bank = () => node.querySelector('.sentence-builder__bank');
  await fire(bank().children[0]); await fire(bank().children[0]);
  const answer = node.querySelector('.sentence-builder__answer');
  const card = answer.children[0];
  await fire(card, 'keydown', { altKey: true, key: 'ArrowRight' });
  assert.equal(answer.children[1].dataset.tokenId, card.dataset.tokenId);
  await fire(node.querySelector('.sentence-builder__hint'));
  await fire(node.querySelector('.sentence-builder__check'));
  assert.equal(node.querySelector('.sentence-builder__next').hidden, false);
  assert.equal(node.querySelector('.sentence-builder__completion').hidden, true);
  await fire(node.querySelector('.sentence-builder__next'));
  assert.equal(node.querySelector('.sentence-builder__completion').hidden, false);
  assert.equal(node.querySelector('.sentence-builder__cat').src, '/assets/sentence-builder/happy-cat.png');
  node.dispose();
});

test('live renderer waits for authoritative hints; adapters retain pending state and disable disconnected actions', async () => {
  const component = task('one two');
  const layout = exercises.createLayout(component), presentation = exercises.presentation(component, layout);
  const sent = [];
  const node = renderSentenceBuilder(component, { presentation, onAction: action => sent.push(action) }, createDocument());
  await fire(node.querySelector('.sentence-builder__hint'));
  assert.equal(node.querySelector('.sentence-builder__bank').children.length, 2);
  assert.equal(node.querySelector('.sentence-builder__hint').disabled, true);
  await fire(node.querySelector('.sentence-builder__hint')); assert.equal(sent.length, 1);
  const accepted = exercises.apply(component, {}, sent[0], layout);
  node.updateState(accepted, { pending: false });
  assert.equal(node.querySelector('.sentence-builder__bank').children.length, 1);
  node.setInteractive(false);
  await fire(node.querySelector('.sentence-builder__hint')); assert.equal(sent.length, 1);
  const window = { ExerciseState: exercises };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const state = {}, projected = { ...component, presentation };
  window.ClassComponentAdapters.preview(projected, state, sent[0]); assert.deepEqual(state, {});
  window.ClassComponentAdapters.preview(projected, state, command(component, 'move-token', { componentId: component.id, tokenId: presentation.items[0].tokens[0].id, toIndex: 0 }));
  assert.equal(state.exercises[component.id].items['sentence-1'].placedIds.length, 1);
  node.dispose();
});

test('editor validates variants, keeps failed edits, saves new sentences and cancels without changes', async () => {
  const component = task('one two');
  let fail = true, saved;
  const node = renderSentenceBuilder(component, { onSave: async changes => {
    if (fail) throw new Error('offline'); saved = changes; return { ...component, ...changes };
  } }, createDocument());
  const edit = node.querySelector('.sentence-builder__edit'); await fire(edit);
  const field = node.querySelector('textarea'); field.value = 'The cat [is happy.]'; await fire(field, 'input');
  await fire(edit); assert.equal(node.querySelector('.sentence-builder__editor').hidden, false);
  assert.equal(node.querySelector('textarea').value, field.value);
  fail = false; await fire(edit);
  assert.equal(saved.items[0].tokens.length, 3);
  assert.equal(node.querySelector('.sentence-builder__editor').hidden, true);
  await fire(edit); await fire(node.querySelector('.sentence-builder__cancel'));
  assert.equal(node.querySelector('.sentence-builder__editor').hidden, true); node.dispose();
});

test('paw animates each fresh transfer, ignores acknowledgements/restoration and cancels on dispose', () => {
  const component = task('one two');
  const doc = createDocument(), create = doc.createElement;
  const played = [], cancelled = [];
  doc.createElement = tag => {
    const node = create(tag);
    node.animate = (frames, options) => {
      played.push({ node, frames, options });
      return { cancel() { cancelled.push(node); } };
    };
    return node;
  };
  const node = renderSentenceBuilder(component, {}, doc);
  // Use rendered opaque identifiers, as live clients do.
  const firstId = node.querySelector('.sentence-builder__bank').children[0].dataset.tokenId;
  const state = { currentItemId: 'sentence-1', items: { 'sentence-1': { placedIds: [firstId], solved: false } },
    motion: { id: 'transfer-one', tokenId: firstId, sequence: 1 } };
  node.updateState(state);
  assert.equal(played.length, 2);
  assert.equal(node.querySelector('.sentence-builder__paw').hidden, false);
  node.updateState(structuredClone(state), { pending: false });
  assert.equal(played.length, 2);
  node.updateState({ ...state, motion: { ...state.motion, id: 'transfer-two', sequence: 2 } });
  assert.equal(played.length, 4);
  doc.hidden = true;
  node.updateState({ ...state, motion: { ...state.motion, id: 'transfer-three', sequence: 3 } });
  assert.equal(played.length, 4);
  assert.equal(node.querySelector('.sentence-builder__paw').hidden, true);
  node.dispose();
  assert.equal(cancelled.length, 4);
  assert.equal(doc.listeners.pointermove.length, 0);
  const presentation = { ...component, items: [{ id: 'sentence-1', tokens: [
    { id: firstId, text: 'one' }, { id: 'another-id', text: 'two' },
  ] }] };
  const restored = renderSentenceBuilder(component, { presentation, exerciseState: state }, doc);
  restored.updateState(state, { feedback: false });
  assert.equal(played.length, 4);
  restored.dispose();
});

test('pointer drag drops into an empty slot, reorders and returns cards without losing tokens', async () => {
  const doc = createDocument(), node = renderSentenceBuilder(task('one two'), {}, doc);
  const bank = node.querySelector('.sentence-builder__bank'), answer = node.querySelector('.sentence-builder__answer');
  const drop = async (card, target, x = 20) => {
    await fire(card, 'pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    await fire(doc, 'pointermove', { pointerId: 1, clientX: 25, clientY: 50 });
    doc.elementFromPoint = () => target;
    await fire(doc, 'pointerup', { pointerId: 1, clientX: x, clientY: 50 });
  };
  const first = bank.children[0].dataset.tokenId;
  await drop(bank.children[0], answer.children[0]);
  assert.equal(answer.children[0].dataset.tokenId, first);
  await drop(bank.children[0], answer);
  assert.equal(bank.children.length, 0);
  await drop(answer.children[0], answer.children[1], 90);
  assert.equal(answer.children[1].dataset.tokenId, first);
  await drop(answer.children[1], bank);
  assert.equal(bank.children[0].dataset.tokenId, first);
  assert.equal(doc.body.children.length, 0);
  node.dispose();
});
