'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { studentComponent, applyComponentAction } = require('../lib/class-component-handlers.js');

test('component policies exclude unknown and private content regardless of visibility state', () => {
  const state = { visibleCards: { secret: true } };
  for (const component of [
    { id: 'secret', type: 'teacherNote' },
    { id: 'secret', type: 'unknown' },
    { id: 'secret', type: 'markdownCard', studentVisibility: 'teacherOnly' },
  ]) assert.equal(studentComponent(component, state), null);
  const card = { id: 'secret', type: 'markdownCard', studentVisibility: 'controlled' };
  assert.equal(studentComponent(card, {}), null);
  assert.equal(studentComponent(card, state), card);
});

test('visibility actions cannot reveal teacher-only cards or change static components', () => {
  const state = { selections: {} };
  const context = { role: 'teacher', state, action: { type: 'set-visibility', visible: true } };
  for (const studentVisibility of ['always', 'teacherOnly']) {
    assert.throws(() => applyComponentAction({ ...context, component: { id: 'secret', type: 'markdownCard', studentVisibility } }));
  }
  assert.throws(() => applyComponentAction({ ...context, component: { id: 'text', type: 'textPanel' } }));
  assert.throws(() => applyComponentAction({ ...context, action: { type: 'set-visibility', visible: 'true' }, component: { id: 'card', type: 'markdownCard', studentVisibility: 'controlled' } }));
  assert.deepEqual(state, { selections: {} });
});
