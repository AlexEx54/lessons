'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/lesson-dom.js');
const { normalizeCategorySort, renderCategorySort } = require('../assets/components/category-sort.js');
const model = require('../assets/components/exercise-state.js');
const rules = require('../assets/class-rules.js');

function component(overrides = {}) {
  return {
    type: 'categorySort', id: 'cafe-sort', title: 'At the café: who says it?',
    instruction: 'Tap a phrase, then tap the right basket.',
    categories: [{ id: 'customer', title: 'Customer' }, { id: 'waiter', title: 'Waiter' }],
    items: [
      { id: 'menu', text: 'Can I have the menu, please?', categoryId: 'customer' },
      { id: 'ready', text: 'Are you ready to order?', categoryId: 'waiter' },
      { id: 'bill', text: 'Could we have the bill, please?', categoryId: 'customer' },
      { id: 'drink', text: 'Anything to drink?', categoryId: 'waiter' },
    ],
    ...overrides,
  };
}
const source = component();
const layout = { order: [3, 1, 0, 2] };
const projected = model.presentation(source, layout);
const select = itemId => ({ type: 'select-word', componentId: source.id, itemId });
const place = (itemId, targetId, attemptId) => ({ type: 'match-word', componentId: source.id, itemId, targetId, ...(attemptId ? { attemptId } : {}) });
const find = (node, name, id) => node.querySelectorAll(`.category-sort__${name}`)
  .find(item => (item.dataset.itemId || item.dataset.categoryId) === id);
const basket = (node, id) => find(node, 'group', id).querySelector('.category-sort__basket');
const text = (node, name) => node.querySelector(`.category-sort__${name}`).textContent;

test('normalization trims plain text and keeps only the authored fields', () => {
  const normalized = normalizeCategorySort(component({ title: '  At the   café ', categories: [
    { id: 'customer', title: ' Customer ' }, { id: 'waiter', title: 'Waiter' }] }));
  assert.equal(normalized.title, 'At the café');
  assert.deepEqual(normalized.categories[0], { id: 'customer', title: 'Customer' });
  assert.deepEqual(normalized.items[0], source.items[0]);
  const four = Array.from({ length: 4 }, (_, i) => ({ id: `group-${i}`, title: `Group ${i}` }));
  const sixteen = Array.from({ length: 16 }, (_, i) => ({ id: `card-${i}`, text: `card ${i}`, categoryId: `group-${i % 4}` }));
  assert.equal(normalizeCategorySort(component({ categories: four, items: sixteen })).items.length, 16);
});

test('normalization rejects counts, limits, duplicates, orphans, markup and extra fields', () => {
  const items = source.items, categories = source.categories;
  for (const patch of [
    { type: 'sentenceMatching' }, { id: 'Cafe Sort' }, { extra: true }, { title: '' }, { instruction: '<b>Sort</b>' },
    { categories: categories.slice(0, 1), items: items.map(item => ({ ...item, categoryId: 'customer' })) },
    { categories: [...categories, ...['a', 'b', 'c'].map(id => ({ id, title: id }))] },
    { items: items.slice(0, 3) },
    { items: Array.from({ length: 17 }, (_, i) => ({ id: `card-${i}`, text: `card ${i}`, categoryId: categories[i % 2].id })) },
    { categories: [categories[0], { id: 'waiter', title: 'x'.repeat(41) }] },
    { categories: [categories[0], { id: 'waiter', title: 'customer' }] },
    { categories: [categories[0], { ...categories[1], colour: 'red' }] },
    { categories: [...categories, { id: 'cook', title: 'Cook' }] },
    { items: items.map((item, i) => (i ? item : { ...item, text: 'x'.repeat(81) })) },
    { items: items.map((item, i) => (i ? item : { ...item, text: items[1].text.toUpperCase() })) },
    { items: items.map((item, i) => (i ? item : { ...item, id: items[1].id })) },
    { items: items.map((item, i) => (i ? item : { ...item, categoryId: 'cook' })) },
    { items: items.map((item, i) => (i ? item : { ...item, text: '<i>menu</i>' })) },
  ]) assert.throws(() => normalizeCategorySort(component(patch)), undefined, JSON.stringify(patch).slice(0, 80));
});

test('the reducer places correct cards in order, keeps wrong ones and rejects unavailable cards and groups', () => {
  let state = model.apply(projected, {}, select('menu'));
  assert.equal(state.selectedId, 'menu');
  state = model.apply(projected, state, place('menu', 'waiter', 'a1'));
  assert.deepEqual(state, { selectedId: null, placed: [], attempt: { id: 'a1', sequence: 1, itemId: 'menu', targetId: 'waiter', correct: false } });
  for (const [itemId, targetId] of [['drink', 'waiter'], ['menu', 'customer'], ['ready', 'waiter']]) {
    state = model.apply(projected, state, place(itemId, targetId));
  }
  assert.deepEqual(state.placed, ['drink', 'menu', 'ready']);
  assert.deepEqual(state.attempt, { sequence: 4, itemId: 'ready', targetId: 'waiter', correct: true });
  assert.equal(model.apply(projected, state, select(null)).selectedId, null);
  for (const action of [select('menu'), select('missing'), select('constructor'), place('menu', 'customer'),
    place('missing', 'customer'), place('bill', 'cook'), place('bill', undefined), { ...place('bill', 'customer'), type: 'choose-option' }]) {
    assert.throws(() => model.apply(projected, state, action), { statusCode: 400 }, JSON.stringify(action));
  }
  // The server applies the same rules to the author data, without a presentation.
  assert.deepEqual(model.apply(source, state, place('bill', 'customer')), model.apply(projected, state, place('bill', 'customer')));
});

test('a live class fixes the card order once and shares the same task and state with both roles', () => {
  const content = { stages: [{ id: 'warm-up', content: [source] }] };
  const state = rules.initialState(content);
  assert.equal(rules.addLayouts(content, state, () => 'unused'), true);
  const fixed = state._layouts[source.id];
  assert.deepEqual([...fixed.order].sort(), [0, 1, 2, 3]);
  assert.equal(rules.addLayouts(content, state, () => 'unused'), false);
  const student = rules.studentComponent(source, state), teacher = rules.teacherComponent(source, state);
  assert.deepEqual(Object.keys(student), ['type', 'id', 'presentation']);
  assert.deepEqual(student.presentation, teacher.presentation);
  assert.deepEqual(student.presentation.items.map(item => item.id), fixed.order.map(i => source.items[i].id));
  assert.deepEqual(student.presentation.items[0], { id: source.items[fixed.order[0]].id, text: source.items[fixed.order[0]].text });
  assert.deepEqual(student.presentation.categories, source.categories);
  assert.deepEqual(student.presentation.answerKey, { menu: 'customer', ready: 'waiter', bill: 'customer', drink: 'waiter' });

  rules.applyComponentAction({ role: 'student', component: source, state, action: place('bill', 'customer', 'a1') });
  rules.applyComponentAction({ role: 'teacher', component: source, state, action: place('ready', 'waiter', 'a2') });
  assert.deepEqual(state.exercises[source.id].placed, ['bill', 'ready']);
  assert.throws(() => rules.applyComponentAction({ role: 'guest', component: source, state, action: place('menu', 'customer') }), { statusCode: 403 });
  assert.throws(() => rules.applyComponentAction({ role: 'student', component: source, state, action: place('bill', 'customer') }), { statusCode: 400 });
  rules.clearComponentState({ component: source, state });
  assert.equal(state.exercises[source.id], undefined);
  assert.equal(state._layouts[source.id], fixed);
});

test('class adapter replays queued attempts with the shared reducer and passes the exercise state', () => {
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const adapters = window.ClassComponentAdapters, live = { ...source, presentation: projected };
  const session = { role: 'student', connected: true, state: {}, send() {} };
  for (const action of [select('menu'), place('menu', 'customer', 'a1'), place('ready', 'customer', 'a2')]) adapters.preview(live, session.state, action);
  assert.deepEqual(session.state.exercises[source.id].placed, ['menu']);
  assert.equal(session.state.exercises[source.id].attempt.id, 'a2');
  const options = adapters.options(live, session);
  assert.equal(options.presentation, projected);
  assert.equal(options.exerciseState, session.state.exercises[source.id]);
  assert.equal(adapters.options(live, { ...session, connected: false }).interactive, false);
});

test('on its own the exercise sorts cards, explains mistakes, shows what is inside and finishes', () => {
  const doc = createDocument(), node = renderCategorySort(source, {}, doc);
  assert.equal(node.querySelectorAll('.category-sort__chip').length, 4);
  assert.equal(node.querySelectorAll('.category-sort__group').length, 2);
  assert.equal(text(node, 'progress'), '0 / 4');
  assert.ok(node.querySelector('.category-sort__hint').classList.contains('category-sort__hint--off'));

  find(node, 'chip', 'menu').click();
  assert.ok(find(node, 'chip', 'menu').classList.contains('category-sort__chip--selected'));
  assert.ok(find(node, 'group', 'waiter').classList.contains('category-sort__group--ready'));
  basket(node, 'waiter').click();
  assert.ok(find(node, 'group', 'waiter').classList.contains('category-sort__group--wrong'));
  assert.ok(find(node, 'chip', 'menu').classList.contains('category-sort__chip--wrong'));
  assert.equal(find(node, 'chip', 'menu').hidden, false);
  assert.equal(text(node, 'status'), 'Not “Waiter”. Try again.');

  find(node, 'chip', 'menu').click(); basket(node, 'customer').click();
  assert.equal(find(node, 'chip', 'menu').hidden, true);
  assert.ok(find(node, 'group', 'customer').classList.contains('category-sort__group--landed'));
  assert.equal(find(node, 'group', 'customer').querySelector('.category-sort__count').textContent, '1');
  assert.equal(text(node, 'progress'), '1 / 4');
  assert.ok(!node.querySelector('.category-sort__hint').classList.contains('category-sort__hint--off'));

  // Without a selected card a basket opens its contents, in the order the cards were put in.
  find(node, 'chip', 'bill').click(); basket(node, 'customer').click();
  basket(node, 'customer').click();
  const peek = node.querySelector('.category-sort__peek');
  assert.equal(peek.hidden, false);
  assert.equal(basket(node, 'customer').getAttribute('aria-expanded'), 'true');
  assert.deepEqual(peek.querySelector('.category-sort__words').children.map(word => word.textContent), [source.items[0].text, source.items[2].text]);
  assert.equal(text(node, 'peek-count'), '2 words');
  basket(node, 'waiter').click();
  assert.equal(text(node, 'peek-title'), 'Waiter');
  assert.equal(peek.querySelector('.category-sort__peek-empty').hidden, false);
  node.listeners.keydown[0]({ key: 'Escape' });
  assert.equal(peek.hidden, true);
  basket(node, 'waiter').click();
  doc.listeners.click[0]({ target: node.querySelector('.category-sort__instruction') });
  assert.equal(peek.hidden, true);
  assert.equal(doc.listeners.click.length, 0);
  basket(node, 'waiter').click(); find(node, 'chip', 'ready').click();
  assert.equal(peek.hidden, true);

  basket(node, 'waiter').click(); find(node, 'chip', 'drink').click(); basket(node, 'waiter').click();
  assert.ok(node.classList.contains('category-sort--done'));
  assert.equal(node.querySelector('.category-sort__done').hidden, false);
  assert.equal(node.querySelector('.category-sort__pool').hidden, true);
  assert.equal(text(node, 'status'), 'All cards are sorted.');
  const contents = find(node, 'group', 'waiter').querySelector('.category-sort__contents');
  assert.equal(contents.hidden, false);
  assert.deepEqual(contents.children.map(word => word.textContent), [source.items[1].text, source.items[3].text]);
  assert.equal(basket(node, 'waiter').disabled, true);
  node.dispose();
});

test('in a class both participants see each attempt once, and an observer can still look inside', () => {
  const actions = [];
  const student = renderCategorySort(source, { presentation: projected, onAction: action => actions.push(action) }, createDocument());
  const teacher = renderCategorySort(source, { presentation: projected, interactive: false, onAction: action => actions.push(action) }, createDocument());
  assert.deepEqual(student.querySelectorAll('.category-sort__chip').map(chip => chip.dataset.itemId), ['drink', 'ready', 'menu', 'bill']);
  find(student, 'chip', 'drink').click(); basket(student, 'customer').click();
  assert.deepEqual(actions.map(action => action.type), ['select-word', 'match-word']);
  assert.equal(typeof actions[1].attemptId, 'string');
  let shared = actions.reduce((state, action) => model.apply(projected, state, action), {});
  teacher.updateState(shared, { feedback: true });
  assert.ok(find(teacher, 'group', 'customer').classList.contains('category-sort__group--wrong'));
  find(teacher, 'group', 'customer').classList.remove('category-sort__group--wrong');
  teacher.updateState(shared, { feedback: true });
  assert.ok(!find(teacher, 'group', 'customer').classList.contains('category-sort__group--wrong'));

  find(teacher, 'chip', 'ready').click(); basket(teacher, 'waiter').click();
  assert.equal(actions.length, 2);
  assert.equal(teacher.querySelector('.category-sort__peek').hidden, false);
  assert.ok(find(teacher, 'chip', 'ready').disabled);

  shared = model.apply(projected, shared, place('ready', 'waiter', 'a2'));
  student.updateState(shared, { feedback: false });
  assert.equal(find(student, 'chip', 'ready').hidden, true);
  assert.ok(!find(student, 'group', 'waiter').classList.contains('category-sort__group--landed'));
  const restored = renderCategorySort(source, { presentation: projected, exerciseState: JSON.parse(JSON.stringify(shared)) }, createDocument());
  assert.equal(find(restored, 'group', 'waiter').querySelector('.category-sort__count').textContent, '1');
  restored.updateState(shared);
  assert.ok(!find(restored, 'group', 'waiter').classList.contains('category-sort__group--landed'));

  student.updateState({});
  assert.equal(find(student, 'chip', 'ready').hidden, false);
  student.setInteractive(false);
  find(student, 'chip', 'menu').click();
  assert.equal(actions.length, 2);
  for (const node of [student, teacher, restored]) node.dispose();
});

test('the lesson view renders the exercise and both lesson pages load it after the shared reducer', () => {
  const document = createDocument(), calls = [];
  const window = { scrollTo() {}, matchMedia: () => ({ matches: false }), CategorySortComponent: {
    renderCategorySort(data, options) { calls.push({ data, options }); return document.createElement('section'); } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/lesson-view.js'), 'utf8'), { window, document });
  const options = { viewerRole: 'student' };
  window.LessonView.renderComponent(source, options);
  assert.deepEqual(calls, [{ data: source, options }]);
  for (const page of ['lesson-editor.html', 'lesson-template-editor.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    assert.match(html, /href="\/assets\/components\/category-sort\.css"/);
    assert.ok(html.indexOf('/assets/components/exercise-state.js') < html.indexOf('/assets/components/category-sort.js'), page);
  }
});
