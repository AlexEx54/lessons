'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createDocument } = require('./helpers/lesson-dom');
function fixture(role) {
  const document = createDocument(), sent = [], scrolls = [];
  const root = document.getElementById('stage-components');
  const component = document.createElement('section'), part = document.createElement('p');
  component.dataset.componentId = 'card'; part.dataset.pointerPart = 'paragraph:0';
  root.append(component); component.append(part);
  component.closest = selector => selector === '[data-component-id]' ? component : null;
  part.closest = selector => selector === '[data-component-id]' ? component : selector === '[data-pointer-part]' ? part : null;
  root.querySelectorAll = selector => selector === '[data-component-id]' ? [component] : [];
  component.querySelectorAll = selector => selector === '[data-pointer-part]' ? [part] : [];
  let rect = { top: 900, bottom: 950, height: 50 };
  part.getBoundingClientRect = () => rect;
  part.scrollIntoView = options => scrolls.push(options);
  document.querySelector = () => null;
  const timers = new Map();
  let timerId = 0;
  const window = { innerHeight: 800, matchMedia: () => ({ matches: false }),
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(fs.readFileSync('assets/class-pointer.js', 'utf8'), { window, document });
  const pointer = window.ClassPointer.create({ role, send: msg => sent.push(msg), notify() {} });
  const state = { connected: true, stageId: 'reading', componentIds: ['card'] };
  pointer.update(state);
  return { pointer, state, root, part, document, window, sent, scrolls, timers, setRect: value => { rect = value; } };
}
test('pointer expires after two pulses, stays cleared on updates and restarts for a new selection', () => {
  const f = fixture('teacher');
  const event = { stageId: 'reading', target: { componentId: 'card', part: 'paragraph:0' }, revision: 1 };
  f.pointer.receive(event);
  const firstTimer = [...f.timers.keys()][0];
  f.pointer.update(f.state);
  assert.equal([...f.timers.keys()][0], firstTimer);
  f.pointer.receive({ ...event, revision: 2 });
  assert.equal(f.timers.has(firstTimer), false);
  const timer = [...f.timers.values()][0];
  assert.equal(timer.delay, 2200);
  timer.callback();
  assert.equal(f.part.classList.contains('lesson-pointer-target'), false);
  f.pointer.update(f.state);
  assert.equal(f.part.classList.contains('lesson-pointer-target'), false);
  f.pointer.receive({ ...event, revision: 3 });
  assert.ok(f.part.classList.contains('lesson-pointer-target'));
  f.pointer.disconnect();
  assert.equal(f.part.classList.contains('lesson-pointer-target'), false);
});
test('pointer intercepts teacher clicks, disarms, and excludes unavailable components', () => {
  const f = fixture('teacher'), button = f.document.getElementById('lesson-pointer');
  button.click();
  let prevented = false, stopped = false;
  f.root.listeners.click[0]({ target: f.part, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.ok(prevented && stopped);
  assert.equal(f.sent[0].target.part, 'paragraph:0');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  f.pointer.update({ ...f.state, componentIds: [] }); button.click();
  f.root.listeners.click[0]({ target: f.part, preventDefault() {}, stopImmediatePropagation() {} });
  assert.equal(f.sent.length, 1);
});
test('student scrolls once per event, restores outline on repaint and clears on stage change', () => {
  const f = fixture('student');
  const event = { stageId: 'reading', target: { componentId: 'card', part: 'paragraph:0' }, revision: 1 };
  f.pointer.receive(event);
  assert.ok(f.part.classList.contains('lesson-pointer-target'));
  assert.equal(f.scrolls.length, 1);
  f.pointer.update(f.state); f.pointer.receive(event);
  assert.equal(f.scrolls.length, 1);
  f.setRect({ top: 100, bottom: 150, height: 50 });
  f.pointer.receive({ ...event, revision: 2 });
  assert.equal(f.scrolls.length, 1);
  f.pointer.update({ ...f.state, stageId: 'listening' });
  assert.equal(f.part.classList.contains('lesson-pointer-target'), false);
  assert.equal(f.document.getElementById('lesson-pointer').hidden, true);
});
test('teacher never scrolls and reconnect accepts a restarted revision', () => {
  const f = fixture('teacher');
  const event = { stageId: 'reading', target: { componentId: 'card', part: 'paragraph:0' }, revision: 5 };
  f.pointer.receive(event); assert.equal(f.scrolls.length, 0);
  f.pointer.disconnect();
  assert.equal(f.part.classList.contains('lesson-pointer-target'), false);
  f.pointer.update(f.state); f.pointer.receive({ ...event, revision: 1 });
  assert.ok(f.part.classList.contains('lesson-pointer-target'));
});

for (const [name, rect] of [
  ['below the viewport', { top: 900, bottom: 950, height: 50 }],
  ['above the viewport', { top: -200, bottom: -150, height: 50 }],
  ['behind the sticky header', { top: 40, bottom: 90, height: 50 }],
  ['taller than the viewport', { top: 150, bottom: 1150, height: 1000 }],
]) test(`student aligns target ${name} below the header`, () => {
  const f = fixture('student');
  f.document.querySelector = () => ({ getBoundingClientRect: () => ({ bottom: 88 }) });
  f.setRect(rect);
  f.pointer.receive({ stageId: 'reading', target: { componentId: 'card', part: 'paragraph:0' }, revision: 1 });
  assert.equal(f.scrolls.length, 1);
  assert.equal(f.scrolls[0].block, 'start');
  assert.equal(f.part.style.scrollMarginTop, '108px');
});
test('student uses the visible viewport when zoomed', () => {
  const f = fixture('student');
  f.window.visualViewport = { offsetTop: 0, height: 400 };
  f.setRect({ top: 500, bottom: 550, height: 50 });
  f.pointer.receive({ stageId: 'reading', target: { componentId: 'card', part: 'paragraph:0' }, revision: 1 });
  assert.equal(f.scrolls.length, 1);
});
