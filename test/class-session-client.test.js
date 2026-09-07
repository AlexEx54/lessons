'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const { createDocument } = require('./helpers/lesson-dom.js');
const source = fs.readFileSync(path.join(__dirname, '../assets/class-session.js'), 'utf8');
async function fixture(role = 'student') {
  const document = createDocument(), sockets = [], timers = new Map(), frames = [];
  const id = '11111111-1111-4111-8111-111111111111';
  let settings, interactive;
  const status = document.getElementById('teacher-screen');
  status.append(document.createElement('span'));
  const selectors = {};
  for (const selector of ['.teacher-version', '.end-lesson', '.lesson-brand']) selectors[selector] = document.createElement('div');
  selectors['.end-lesson'].append(document.createElement('span'));
  document.querySelector = selector => selectors[selector];
  class Socket {
    static OPEN = 1;
    constructor() { this.readyState = 1; this.listeners = {}; this.sent = []; sockets.push(this); }
    addEventListener(name, listener) { this.listeners[name] = listener; }
    send(raw) { this.sent.push(JSON.parse(raw)); }
    receive(payload) { this.listeners.message({ data: JSON.stringify(payload) }); }
    close(code = 1006, reason = '') { this.readyState = 3; this.listeners.close({ code, reason }); }
  }
  const mounted = new Map([['choice', { updateState(selections) { frames.push(selections); }, setInteractive(value) { interactive = value; } }]]);
  let timerId = 0;
  const window = {
    location: { pathname: `/classes/${id}${role === 'student' ? '/student' : ''}`, protocol: 'http:', host: 'localhost' },
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; },
    clearTimeout(id) { timers.delete(id); }, addEventListener() {},
    LessonView: { create(value) { settings = value; return { mounted, render() {} }; } },
  };
  const initial = { activeStageId: 'warm-up', version: 0, selections: {} };
  vm.runInNewContext(source, { window, document, WebSocket: Socket, structuredClone, fetch: async () => ({ ok: true, json: async () => ({ state: initial, lesson: { content: {} } }) }) });
  await new Promise(resolve => setImmediate(resolve));
  return { settings, sockets, timers, frames, initial, isInteractive: () => interactive, status };
}
test('rapid selections are sent in order with acknowledged versions and remote updates do not echo', async () => {
  const f = await fixture(), socket = f.sockets[0];
  socket.receive({ type: 'snapshot', state: f.initial });
  assert.equal(f.isInteractive(), true);
  const { onAction } = f.settings.componentOptions({ id: 'choice' });
  const a = { type: 'select-option', componentId: 'choice', itemId: 'pair', optionId: 'a' };
  onAction(a);
  onAction({ ...a, optionId: 'b' });
  assert.equal(socket.sent.length, 1);
  assert.equal(socket.sent[0].expectedVersion, 0);
  socket.receive({ type: 'action', state: { ...f.initial, version: 1, selections: { choice: { pair: 'a' } } } });
  assert.equal(socket.sent.length, 2);
  assert.equal(socket.sent[1].expectedVersion, 1);
  assert.equal(socket.sent[1].optionId, 'b');
  assert.equal(f.frames.at(-1).pair, 'b');
  socket.receive({ type: 'action', state: { ...f.initial, version: 2, selections: { choice: { pair: 'b' } } } });
  assert.equal(socket.sent.length, 2);
  assert.equal(f.frames.at(-1).pair, 'b');
});
test('disconnect drops unconfirmed clicks, restores server state and replacement does not reconnect', async () => {
  const f = await fixture(), socket = f.sockets[0];
  socket.receive({ type: 'snapshot', state: f.initial });
  const { onAction } = f.settings.componentOptions({ id: 'choice' });
  onAction({ type: 'select-option', componentId: 'choice', itemId: 'pair', optionId: 'a' });
  socket.close();
  assert.equal(f.isInteractive(), false);
  for (const timer of [...f.timers.values()]) timer();
  assert.equal(f.sockets.length, 2);
  const restored = f.sockets[1];
  restored.receive({ type: 'snapshot', state: { ...f.initial, version: 3, selections: { choice: { pair: 'b' } } } });
  assert.equal(restored.sent.length, 0);
  assert.equal(f.frames.at(-1).pair, 'b');
  f.timers.clear();
  restored.close(4001, 'Класс открыт в другой вкладке.');
  for (const timer of [...f.timers.values()]) timer();
  assert.equal(f.sockets.length, 2);
  assert.equal(f.isInteractive(), false);
});
test('teacher applies the same selection state as an observer', async () => {
  const f = await fixture('teacher'), socket = f.sockets[0];
  socket.receive({ type: 'snapshot', state: f.initial });
  socket.receive({ type: 'action', state: { ...f.initial, version: 1, selections: { choice: { pair: 'a' } } } });
  assert.equal(f.isInteractive(), false);
  assert.equal(f.frames.at(-1).pair, 'a');
  assert.equal(socket.sent.length, 0);
});
