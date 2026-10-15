'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { createDocument } = require('./helpers/lesson-dom');
function fixture({ send, reducedMotion = false } = {}) {
  const document = createDocument(), animations = [];
  const layer = document.getElementById('lesson-reaction-layer');
  Object.defineProperty(layer, 'firstElementChild', { get() { return this.children[0] || null; } });
  layer.clientHeight = 400;
  // Mirrors the initial markup in lesson-editor.html.
  document.getElementById('lesson-reactions').hidden = true;
  document.getElementById('lesson-reaction-picker').hidden = true;
  const createElement = document.createElement;
  document.createElement = tag => {
    const node = createElement(tag);
    node.animate = (frames, options) => {
      let finish;
      animations.push({ node, frames, options, finish: () => finish() });
      return { finished: new Promise(resolve => { finish = resolve; }) };
    };
    return node;
  };
  let now = 1000;
  const window = { matchMedia: () => ({ matches: reducedMotion }) };
  const context = { window, document, Date: { now: () => now } };
  vm.runInNewContext(fs.readFileSync('assets/class-reactions.js', 'utf8'), context);
  const reactions = window.ClassReactions.create({ send });
  const picker = document.getElementById('lesson-reaction-picker');
  const button = kind => picker.children.find(node => node.attributes['aria-label'] && node.children[0].src.endsWith(`/${kind}.svg`));
  return { document, reactions, layer, picker, animations, button, tick: ms => { now += ms; } };
}
test('reaction kinds are shared with the server', () => {
  assert.deepEqual(require('../assets/class-reactions.js').kinds, ['heart', 'like', 'clap', 'laugh', 'fire', 'confused']);
});
test('picker stays open while tapping and every tap flies locally, but sending is throttled', async () => {
  const sent = [], f = fixture({ send: message => sent.push({ ...message }) });
  const toggle = f.document.getElementById('lesson-reactions-toggle');
  toggle.focus = () => {};
  assert.equal(f.document.getElementById('lesson-reactions').hidden, false);
  assert.equal(f.picker.children.length, 6);
  toggle.click();
  assert.equal(f.picker.hidden, false);
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  f.button('heart').click(); f.button('heart').click(); f.tick(150); f.button('fire').click();
  assert.equal(f.picker.hidden, false);
  assert.equal(f.layer.children.length, 3);
  assert.deepEqual(sent, [{ type: 'reaction', kind: 'heart' }, { type: 'reaction', kind: 'fire' }]);
  f.animations[0].finish();
  await new Promise(setImmediate);
  assert.equal(f.layer.children.length, 2);
  f.document.listeners.keydown[0]({ key: 'Escape' });
  assert.equal(f.picker.hidden, true);
});
test('received reactions fly, unknown kinds are ignored and the layer is capped', () => {
  const f = fixture();
  f.reactions.receive({ type: 'reaction', kind: 'unknown' });
  assert.equal(f.layer.children.length, 0);
  for (let i = 0; i < 35; i++) f.reactions.receive({ type: 'reaction', kind: 'laugh' });
  assert.equal(f.layer.children.length, 30);
  assert.ok(f.animations[0].frames.some(frame => frame.transform));
});
test('reduced motion fades reactions in place and drafts work without a socket', () => {
  const f = fixture({ reducedMotion: true });
  f.button('clap').click();
  assert.equal(f.layer.children.length, 1);
  assert.ok(f.animations[0].frames.every(frame => !frame.transform));
});
