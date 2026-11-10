'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createDocument } = require('./helpers/lesson-dom.js');
const { normalizeLineOrder, renderLineOrder } = require('../assets/components/line-order.js');
const model = require('../assets/components/exercise-state.js');
const rules = require('../assets/class-rules.js');

function dialogue(overrides = {}) {
  return {
    type: 'lineOrder', id: 'cafe-order', title: 'At the café: put the dialogue in order',
    instruction: 'Drag a line by the handle or use the arrows, then press Check.', look: 'dialogue',
    speakers: [{ id: 'waiter', name: 'Waiter' }, { id: 'customer', name: 'Customer' }],
    lines: [
      { id: 'd1', text: 'Good evening! Are you ready to order?', speakerId: 'waiter' },
      { id: 'd2', text: 'Yes, I’d like the chicken soup, please.', speakerId: 'customer' },
      { id: 'd3', text: 'Would you like anything to drink?', speakerId: 'waiter' },
      { id: 'd4', text: 'Just a glass of water, please.', speakerId: 'customer' },
    ],
    ...overrides,
  };
}
function story(overrides = {}) {
  return {
    type: 'lineOrder', id: 'trip-order', title: 'Tom’s trip', instruction: 'Put the events in order.', look: 'story',
    lines: [{ id: 's1', text: 'Tom woke up late.' }, { id: 's2', text: 'He packed in a hurry.' }, { id: 's3', text: 'He missed the plane.' }],
    ...overrides,
  };
}
const source = dialogue();
const layout = { order: [2, 0, 3, 1] };
const projected = model.presentation(source, layout);
const move = (itemId, toIndex) => ({ type: 'move-line', componentId: source.id, itemId, toIndex });
const check = checkId => ({ type: 'check-order', componentId: source.id, ...(checkId ? { checkId } : {}) });
const rowIds = node => node.querySelector('.line-order__list').children.map(row => row.dataset.lineId);
const row = (node, id) => node.querySelectorAll('.line-order__row').find(item => item.dataset.lineId === id);
const has = (node, id, name) => row(node, id).classList.contains(`line-order__row--${name}`);
const arrow = (node, id, direction) => row(node, id).querySelectorAll('.line-order__move')[direction === 'up' ? 0 : 1];
const text = (node, name) => node.querySelector(`.line-order__${name}`).textContent;

test('normalization trims plain text and keeps only the fields of each look', () => {
  const normalized = normalizeLineOrder(dialogue({ title: '  At the   café ', speakers: [{ id: 'waiter', name: ' Waiter ' }, source.speakers[1]] }));
  assert.equal(normalized.title, 'At the café');
  assert.deepEqual(normalized.speakers, source.speakers);
  assert.deepEqual(normalized.lines, source.lines);
  assert.deepEqual(Object.keys(normalizeLineOrder(story())), ['type', 'id', 'title', 'instruction', 'look', 'lines']);
  const eight = Array.from({ length: 8 }, (_, i) => ({ id: `line-${i}`, text: `Line ${i}`, speakerId: source.speakers[i % 2].id }));
  assert.equal(normalizeLineOrder(dialogue({ lines: eight })).lines.length, 8);
  assert.equal(normalizeLineOrder(story({ lines: [{ id: 's1', text: 'x'.repeat(160) }, ...story().lines.slice(1)] })).lines[0].text.length, 160);
});

test('normalization rejects counts, limits, duplicates, speakers out of place, markup and extra fields', () => {
  const lines = source.lines, speakers = source.speakers;
  const line = (index, patch) => lines.map((item, i) => (i === index ? { ...item, ...patch } : item));
  for (const patch of [
    { type: 'categorySort' }, { id: 'Cafe Order' }, { extra: true }, { title: '' }, { instruction: '<b>Order</b>' },
    { look: 'chat' }, { look: undefined },
    { lines: lines.slice(0, 2) },
    { lines: Array.from({ length: 9 }, (_, i) => ({ id: `line-${i}`, text: `Line ${i}`, speakerId: speakers[i % 2].id })) },
    { lines: line(0, { text: 'x'.repeat(161) }) }, { lines: line(0, { text: lines[1].text.toUpperCase() }) },
    { lines: line(0, { id: lines[1].id }) }, { lines: line(0, { id: 'D1' }) }, { lines: line(0, { text: '<i>Hi</i>' }) },
    { lines: line(0, { speakerId: 'cook' }) }, { lines: line(0, { speakerId: undefined }) }, { lines: line(0, { note: 'x' }) },
    { lines: lines.map(item => ({ ...item, speakerId: 'waiter' })) },
    { speakers: undefined }, { speakers: speakers.slice(0, 1) }, { speakers: [...speakers, { id: 'cook', name: 'Cook' }] },
    { speakers: [speakers[0], { id: 'customer', name: 'x'.repeat(25) }] },
    { speakers: [speakers[0], { id: 'customer', name: 'waiter' }] },
    { speakers: [speakers[0], { id: 'waiter', name: 'Customer' }] },
    { speakers: [speakers[0], { ...speakers[1], side: 'right' }] },
  ]) assert.throws(() => normalizeLineOrder(dialogue(patch)), undefined, JSON.stringify(patch).slice(0, 80));
  assert.throws(() => normalizeLineOrder(story({ speakers })), /Неподдерживаемые поля/);
  assert.throws(() => normalizeLineOrder(story({ lines: story().lines.map(item => ({ ...item, speakerId: 'waiter' })) })), /Неподдерживаемые поля/);
  assert.throws(() => normalizeLineOrder(dialogue({ lines: line(0, { text: 'x'.repeat(161) }) })), { message: 'Строка 1: не больше 160 символов.' });
  assert.throws(() => normalizeLineOrder(dialogue({ lines: lines.map(item => ({ ...item, speakerId: 'waiter' })) })),
    { message: 'У собеседника «Customer» нет реплик.' });
});

test('the layout never deals the lines already in order, and the presentation carries the answer key', t => {
  // A random source that deals the identity first: the layout shuffles again.
  const values = [.9999, .9999, .9999, 0, 0, 0];
  const random = t.mock.method(Math, 'random', () => values.shift() ?? 0);
  const { order } = model.createLayout(source);
  assert.notDeepEqual(order, [0, 1, 2, 3]);
  assert.equal(random.mock.callCount(), 6);
  random.mock.restore();
  for (let i = 0; i < 50; i++) assert.notDeepEqual(model.createLayout(story()).order, [0, 1, 2]);

  assert.deepEqual(projected, { type: 'lineOrder', id: source.id, title: source.title, instruction: source.instruction, look: 'dialogue',
    speakers: source.speakers, lines: [source.lines[2], source.lines[0], source.lines[3], source.lines[1]], answerKey: ['d1', 'd2', 'd3', 'd4'] });
  const told = model.presentation(story(), { order: [2, 1, 0] });
  assert.equal(told.speakers, undefined);
  assert.deepEqual(told.lines.map(line => line.id), ['s3', 's2', 's1']);
});

test('the rules move lines around the locked ones, lock lines on check and finish when all are locked', () => {
  // Dealt order: d3 d1 d4 d2.
  let state = model.apply(projected, {}, move('d1', 0));
  assert.deepEqual(state, { order: ['d1', 'd3', 'd4', 'd2'] });
  state = model.apply(projected, state, check('c1'));
  assert.deepEqual(state, { order: ['d1', 'd3', 'd4', 'd2'], locked: ['d1'], check: { id: 'c1', sequence: 1, correct: 1, total: 4 } });
  // Unlocked lines take the free places 1–3: d4 goes to the front of them.
  state = model.apply(projected, state, move('d4', 0));
  assert.deepEqual(state.order, ['d1', 'd4', 'd3', 'd2']);
  assert.equal(state.check.stale, true);
  state = model.apply(projected, state, check());
  assert.deepEqual(state.locked, ['d1', 'd3']);
  assert.deepEqual(state.check, { sequence: 2, correct: 2, total: 4 });
  // With d1 and d3 locked, d2 moving up jumps over d3.
  state = model.apply(projected, state, move('d2', 0));
  assert.deepEqual(state.order, ['d1', 'd2', 'd3', 'd4']);
  assert.deepEqual(state.locked, ['d1', 'd3']);
  for (const action of [move('d1', 0), move('d3', 1), move('missing', 0), move('d2', 2), move('d2', -1), move('d2', 0.5),
    move('d2', '1'), { ...move('d2', 1), type: 'match-word' }]) {
    assert.throws(() => model.apply(projected, state, action), { statusCode: 400 }, JSON.stringify(action));
  }
  state = model.apply(projected, state, check('c3'));
  assert.deepEqual(state.locked, ['d1', 'd2', 'd3', 'd4']);
  assert.deepEqual(state.check, { id: 'c3', sequence: 3, correct: 4, total: 4 });
  for (const action of [check(), move('d4', 0)]) assert.throws(() => model.apply(projected, state, action), { statusCode: 400 });
  // The server applies the same rules to the author data and the layout.
  const steps = [move('d1', 0), check('c1'), move('d4', 0)];
  assert.deepEqual(steps.reduce((next, action) => model.apply(source, next, action, layout), {}),
    steps.reduce((next, action) => model.apply(projected, next, action), {}));
});

test('a live class fixes the line order once and shares the same task and state with both roles', () => {
  const content = { stages: [{ id: 'warm-up', content: [source] }] };
  const state = rules.initialState(content);
  assert.equal(rules.addLayouts(content, state, () => 'unused'), true);
  const fixed = state._layouts[source.id];
  assert.deepEqual([...fixed.order].sort(), [0, 1, 2, 3]);
  assert.notDeepEqual(fixed.order, [0, 1, 2, 3]);
  assert.equal(rules.addLayouts(content, state, () => 'unused'), false);
  const student = rules.studentComponent(source, state), teacher = rules.teacherComponent(source, state);
  assert.deepEqual(Object.keys(student), ['type', 'id', 'presentation']);
  assert.deepEqual(student.presentation, teacher.presentation);
  assert.deepEqual(student.presentation.lines.map(line => line.id), fixed.order.map(i => source.lines[i].id));
  assert.deepEqual(student.presentation.answerKey, ['d1', 'd2', 'd3', 'd4']);

  const dealt = student.presentation.lines.map(line => line.id);
  rules.applyComponentAction({ role: 'student', component: source, state, action: move(dealt[0], 3) });
  rules.applyComponentAction({ role: 'teacher', component: source, state, action: check('c1') });
  assert.deepEqual(state.exercises[source.id].order, [...dealt.slice(1), dealt[0]]);
  assert.equal(state.exercises[source.id].check.sequence, 1);
  assert.throws(() => rules.applyComponentAction({ role: 'guest', component: source, state, action: check() }), { statusCode: 403 });
  assert.throws(() => rules.applyComponentAction({ role: 'student', component: source, state, action: move('d1', 9) }), { statusCode: 400 });
  rules.clearComponentState({ component: source, state });
  assert.equal(state.exercises[source.id], undefined);
  assert.equal(state._layouts[source.id], fixed);
});

test('class adapter replays queued moves and checks with the shared rules and passes the exercise state', () => {
  const window = { ExerciseState: model };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const adapters = window.ClassComponentAdapters, live = { ...source, presentation: projected };
  const session = { role: 'student', connected: true, state: {}, send() {} };
  for (const action of [move('d1', 0), check('c1'), move('d2', 0)]) adapters.preview(live, session.state, action);
  assert.deepEqual(session.state.exercises[source.id].order, ['d1', 'd2', 'd3', 'd4']);
  assert.deepEqual(session.state.exercises[source.id].locked, ['d1']);
  const options = adapters.options(live, session);
  assert.equal(options.presentation, projected);
  assert.equal(options.exerciseState, session.state.exercises[source.id]);
  assert.equal(adapters.options(live, { ...session, connected: false }).interactive, false);
});

test('on its own the exercise moves lines with the arrows, locks the right ones on Check and finishes', t => {
  t.mock.method(Math, 'random', () => 0);
  const doc = createDocument(), node = renderLineOrder(story(), {}, doc);
  assert.deepEqual(rowIds(node), ['s2', 's3', 's1']);
  assert.equal(node.querySelector('.line-order__list').getAttribute('aria-label'), 'Story events');
  assert.deepEqual(node.querySelectorAll('.line-order__num').map(number => number.textContent), ['1', '2', '3']);
  assert.equal(arrow(node, 's2', 'up').disabled, true);
  assert.equal(arrow(node, 's1', 'down').disabled, true);
  assert.equal(arrow(node, 's3', 'up').getAttribute('aria-label'), 'Move line 2 up');

  arrow(node, 's1', 'up').click();
  assert.deepEqual(rowIds(node), ['s2', 's1', 's3']);
  assert.equal(text(node, 'status'), 'Moved to position 2 of 3.');
  node.querySelector('.line-order__check').click();
  assert.ok(has(node, 's3', 'locked') && !has(node, 's3', 'not-yet'));
  assert.ok(['s1', 's2'].every(id => has(node, id, 'not-yet') && !has(node, id, 'locked')));
  assert.equal(text(node, 'note'), '1 of 3 in place. Move the other lines and check again.');
  assert.equal(text(node, 'status'), text(node, 'note'));
  // The locked last line is out of reach: s1 is already at the bottom of the free places.
  assert.ok(arrow(node, 's3', 'up').disabled && arrow(node, 's3', 'down').disabled);
  assert.equal(arrow(node, 's1', 'down').disabled, true);

  // At the top the pressed arrow turns off and the focus moves to the other one.
  arrow(node, 's1', 'up').click();
  assert.deepEqual(rowIds(node), ['s1', 's2', 's3']);
  assert.equal(doc.activeElement, arrow(node, 's1', 'down'));
  assert.ok(['s1', 's2'].every(id => !has(node, id, 'not-yet')));
  assert.equal(text(node, 'note'), '');
  node.querySelector('.line-order__check').click();
  assert.ok(node.classList.contains('line-order--done'));
  assert.ok(['s1', 's2', 's3'].every(id => has(node, id, 'locked')));
  assert.equal(node.querySelector('.line-order__footer').hidden, true);
  assert.equal(node.querySelector('.line-order__done').hidden, false);
  assert.equal(doc.activeElement, node.querySelector('.line-order__done'));
  assert.equal(text(node, 'status'), 'All 3 lines are in order.');
  assert.equal(text(node, 'done-detail'), 'The whole story is in the right order.');
  node.dispose();
});

test('in a class both participants see moves and each check once, and a drag gives way to the other side', () => {
  const actions = [], doc = createDocument();
  const student = renderLineOrder(source, { presentation: projected, onAction: action => actions.push(action) }, doc);
  const teacher = renderLineOrder(source, { presentation: projected, onAction: action => actions.push(action) }, createDocument());
  assert.deepEqual(rowIds(student), ['d3', 'd1', 'd4', 'd2']);
  assert.ok(row(student, 'd3').classList.contains('line-order__row--left'));
  assert.ok(row(student, 'd4').classList.contains('line-order__row--right'));
  assert.equal(row(student, 'd4').querySelector('.line-order__speaker').textContent, 'Customer');
  assert.equal(row(student, 'd4').querySelector('.line-order__bubble').textContent, source.lines[3].text);

  arrow(student, 'd1', 'up').click();
  student.querySelector('.line-order__check').click();
  assert.deepEqual(actions.map(action => action.type), ['move-line', 'check-order']);
  assert.equal(typeof actions[1].checkId, 'string');
  let shared = actions.reduce((state, action) => model.apply(projected, state, action), {});
  teacher.updateState(shared, { feedback: true });
  assert.deepEqual(rowIds(teacher), ['d1', 'd3', 'd4', 'd2']);
  assert.ok(has(teacher, 'd1', 'locked') && has(teacher, 'd1', 'landed'));
  assert.ok(has(teacher, 'd3', 'not-yet') && has(teacher, 'd3', 'nudge'));
  row(teacher, 'd1').classList.remove('line-order__row--landed');
  teacher.updateState(shared, { feedback: true });
  assert.ok(!has(teacher, 'd1', 'landed'));
  assert.equal(student.querySelector('.line-order__done').hidden, true);

  // The student drags d2 to the bottom of the free places and drops it: one move goes out.
  const list = student.querySelector('.line-order__list');
  for (const item of list.children) Object.defineProperties(item, { offsetTop: { get: () => list.children.indexOf(item) * 50 }, offsetHeight: { value: 40 } });
  const handle = id => row(student, id).querySelector('.line-order__handle');
  const pointer = (name, clientY) => doc.listeners[name][0]({ type: name, pointerId: 1, clientY, preventDefault() {} });
  handle('d1').listeners.pointerdown[0]({ pointerId: 1, pointerType: 'touch', clientY: 0, preventDefault() {} });
  assert.equal(doc.listeners.pointermove, undefined);
  handle('d3').listeners.pointerdown[0]({ pointerId: 1, pointerType: 'touch', clientY: 0, preventDefault() {} });
  assert.ok(has(student, 'd3', 'lifted'));
  assert.equal(student.querySelector('.line-order__check').disabled, true);
  pointer('pointermove', 200);
  assert.deepEqual(rowIds(student), ['d1', 'd4', 'd2', 'd3']);
  assert.equal(actions.length, 2);
  pointer('pointerup', 200);
  assert.deepEqual(actions.at(-1), { type: 'move-line', itemId: 'd3', toIndex: 2, componentId: source.id });
  assert.ok(!has(student, 'd3', 'lifted') && !has(student, 'd3', 'not-yet'));
  assert.equal(row(student, 'd3').style.transform, '');
  assert.deepEqual(doc.listeners.pointermove, []);

  // The teacher moves a line while the student drags: the drag is called off.
  shared = model.apply(projected, shared, actions.at(-1));
  handle('d4').listeners.pointerdown[0]({ pointerId: 2, pointerType: 'mouse', button: 0, clientY: 0, preventDefault() {} });
  doc.listeners.pointermove[0]({ type: 'pointermove', pointerId: 2, clientY: 200, preventDefault() {} });
  assert.deepEqual(rowIds(student), ['d1', 'd2', 'd3', 'd4']);
  shared = model.apply(projected, shared, move('d2', 0));
  student.updateState(shared, { feedback: true });
  assert.deepEqual(rowIds(student), ['d1', 'd2', 'd4', 'd3']);
  assert.ok(!has(student, 'd4', 'lifted'));
  assert.equal(row(student, 'd4').style.transform, '');
  assert.deepEqual(doc.listeners.pointermove, []);
  assert.equal(student.querySelector('.line-order__check').disabled, false);

  // A restored state shows the old check without replaying it.
  shared = model.apply(projected, shared, check('c2'));
  const restored = renderLineOrder(source, { presentation: projected, exerciseState: JSON.parse(JSON.stringify(shared)) }, createDocument());
  assert.ok(has(restored, 'd1', 'locked') && has(restored, 'd2', 'locked'));
  restored.updateState(shared);
  assert.ok(!has(restored, 'd2', 'landed'));
  student.updateState(shared, { feedback: false });
  assert.ok(!has(student, 'd2', 'landed'));

  student.setInteractive(false);
  assert.ok(student.querySelectorAll('.line-order__move').every(button => button.disabled));
  assert.equal(student.querySelector('.line-order__check').disabled, true);
  handle('d4').listeners.pointerdown[0]({ pointerId: 3, pointerType: 'touch', clientY: 0, preventDefault() {} });
  assert.deepEqual(doc.listeners.pointermove, []);
  const count = actions.length;
  student.querySelector('.line-order__check').click();
  assert.equal(actions.length, count);
  for (const node of [student, teacher, restored]) node.dispose();
});

test('the lesson view renders the exercise and both lesson pages load it after the shared rules', () => {
  const document = createDocument(), calls = [];
  const window = { scrollTo() {}, matchMedia: () => ({ matches: false }), LineOrderComponent: {
    renderLineOrder(data, options) { calls.push({ data, options }); return document.createElement('section'); } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/lesson-view.js'), 'utf8'), { window, document });
  const options = { viewerRole: 'student' };
  window.LessonView.renderComponent(source, options);
  assert.deepEqual(calls, [{ data: source, options }]);
  for (const page of ['lesson-editor.html', 'lesson-template-editor.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    assert.match(html, /href="\/assets\/components\/line-order\.css"/);
    assert.ok(html.indexOf('/assets/components/exercise-state.js') < html.indexOf('/assets/components/line-order.js'), page);
  }
});
