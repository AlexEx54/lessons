'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeOddOneOut, createOddOneOutAnswerKey, renderOddOneOut } = require('../assets/components/odd-one-out.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { studentComponent, applyComponentAction, clearComponentState } = require('../lib/class-component-handlers.js');
const component = () => createSyntheticLesson('Test', { template: 'template-2' }).stages[0].content[1];
function createFakeDocument() {
  function textNode(value) {
    return { nodeType: 3, textContent: String(value), childNodes: [] };
  }
  function element(tag) {
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      childNodes: [],
      attributes: {},
      dataset: {},
      listeners: {},
      _className: '',
      _text: '',
      hidden: false,
      disabled: false,
      type: '',
      name: '',
      checked: false,
      value: '',
      get className() { return this._className; },
      set className(value) { this._className = String(value || ''); },
      classList: {
        toggle(name, on) {
          const tokens = new Set(el._className.split(/\s+/).filter(Boolean));
          if (on === undefined) on = !tokens.has(name);
          if (on) tokens.add(name);
          else tokens.delete(name);
          el._className = [...tokens].join(' ');
        },
        contains(name) { return el._className.split(/\s+/).includes(name); },
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; },
      append(...nodes) {
        nodes.forEach((node) => {
          if (node == null) return;
          this.childNodes.push(typeof node === 'string' ? textNode(node) : node);
        });
      },
      replaceChildren(...nodes) {
        this.childNodes = [];
        this.append(...nodes);
      },
      addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
      },
      focus() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      click() { (this.listeners.click || []).forEach(handler => handler()); },
      get textContent() {
        if (this.childNodes.length === 0) return this._text;
        return this.childNodes.map(node => node.textContent || '').join('');
      },
      set textContent(value) {
        this.childNodes = [];
        this._text = String(value);
      },
    };
    return el;
  }
  return {
    createElement: tag => element(tag),
    createElementNS: (_ns, tag) => element(tag),
    createTextNode: value => textNode(value),
  };
}

function descendants(node, found = []) {
  for (const child of node.childNodes || []) {
    found.push(child);
    descendants(child, found);
  }
  return found;
}

function byClass(root, name) {
  return descendants(root).filter(node => node.classList && node.classList.contains(name));
}


test('template two has Warm Up and Lead In and shares unchanged teacher notes', () => {
  const one = createSyntheticLesson('Test');
  const two = createSyntheticLesson('Test', { template: 'template-2' });
  assert.deepEqual(two.stages[0].content[0], one.stages[0].content[0]);
  assert.deepEqual(two.stages[0].content.map(c => c.type), ['teacherNote', 'oddOneOut', 'markdownCard']);
  assert.ok(two.stages.slice(2).every(stage => stage.content === null));
  assert.equal(two.stages[0].content[1].items.length, 4);
  assert.deepEqual(two.stages[0].content[2], createOddOneOutAnswerKey(component()));
  assert.equal(studentComponent(two.stages[0].content[2], {}), null);
  assert.throws(() => createSyntheticLesson('Test', { template: 'unknown' }));
});

test('odd one out validates four unique words, answers, ids and explanations', () => {
  for (const mutate of [
    c => { c.items[0].options.pop(); },
    c => { c.items[0].options[1] = 'FLY'; },
    c => { c.items[0].answer = 'missing'; },
    c => { c.items[0].explanation = ''; },
    c => { c.items[1].id = c.items[0].id; },
    c => { c.items = []; },
    c => { c.items[0].options[0] = '<script>alert(1)</script>'; },
  ]) {
    const c = component(); mutate(c); assert.throws(() => normalizeOddOneOut(c));
  }
});

test('odd one out retries wrong choices, locks success and resets on both clients', () => {
  const c = component(), state = {}, item = c.items[0];
  const act = value => ({ type: 'choose-option', componentId: c.id, itemId: item.id, value });
  const fs = require('node:fs'), vm = require('node:vm');
  const window = { ExerciseState: require('../assets/components/exercise-state.js') };
  vm.runInNewContext(fs.readFileSync(require.resolve('../assets/class-component-adapters.js'), 'utf8'), { window });
  const preview = {}, projected = studentComponent(c, state);
  for (const value of [item.options[0], item.answer]) {
    window.ClassComponentAdapters.preview(projected, preview, act(value));
    applyComponentAction({ component: c, state, role: 'student', action: act(value) });
    assert.equal(JSON.stringify(preview), JSON.stringify(state));
  }
  assert.equal(state.exercises[c.id].answers[item.id].status, 'correct');
  assert.throws(() => applyComponentAction({ component: c, state, role: 'student', action: act(item.options[0]) }));
  clearComponentState({ component: c, state });
  assert.equal(state.exercises[c.id], undefined);
  assert.throws(() => applyComponentAction({ component: c, state, role: 'student', action: act('missing') }));
});

test('renderer crosses correct word, permits retries and respects offline state', () => {
  const c = component();
  const node = renderOddOneOut(c, {}, createFakeDocument());
  const buttons = byClass(node, 'odd-one-out__word');
  buttons[0].click();
  assert.ok(buttons[0].classList.contains('odd-one-out__word--wrong'));
  buttons[3].click();
  assert.ok(buttons[3].classList.contains('odd-one-out__word--correct'));
  assert.ok(buttons.slice(0,4).every(b => b.disabled));
  node.updateState({});
  assert.ok(buttons.slice(0,4).every(b => !b.disabled));
  node.setInteractive(false);
  buttons[0].click();
  assert.ok(!buttons[0].classList.contains('odd-one-out__word--wrong'));
});

test('editor tracks answer by position when words change and retains edits after save failure', async () => {
  let saved, fail = true;
  const dirty = [];
  const node = renderOddOneOut(component(), {
    onDirtyChange: value => dirty.push(value),
    onSave: async changes => { if (fail) throw new Error('Offline'); saved = changes; },
  }, createFakeDocument());
  byClass(node, 'odd-one-out__edit')[0].click();
  const input = byClass(node, 'odd-one-out__word-input')[3];
  input.value = 'powerful'; input.listeners.input[0]();
  assert.equal(dirty.at(-1), true);
  const save = () => byClass(node, 'odd-one-out__save')[0].listeners.click[0]();
  await save();
  assert.equal(byClass(node, 'odd-one-out__error')[0].textContent, 'Offline');
  assert.equal(byClass(node, 'odd-one-out__word-input')[3].value, 'powerful');
  fail = false;
  await save();
  assert.equal(saved.items[0].answer, 'powerful');
  assert.equal(dirty.at(-1), false);
  assert.equal(byClass(node, 'odd-one-out__editor')[0].hidden, true);
});
