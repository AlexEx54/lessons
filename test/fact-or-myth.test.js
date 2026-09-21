 'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeFactOrMyth, createFactOrMythAnswerKey, renderFactOrMyth } = require('../assets/components/fact-or-myth.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { studentComponent, applyComponentAction, clearComponentState } = require('../lib/class-component-handlers.js');
const component = () => createSyntheticLesson('Test', { template: 'template-2' }).stages[1].content[1];
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



test('lead in has reusable support and teacher-only notes and derived key', () => {
  const content = createSyntheticLesson('Test', { template: 'template-2' }).stages[1].content;
  assert.deepEqual(content.map(c => c.type), ['teacherNote', 'factOrMyth', 'markdownCard', 'markdownCard']);
  assert.equal(content[1].items.length, 5);
  assert.equal(studentComponent(content[0], {}), null);
  assert.equal(studentComponent(content[3], {}), null);
  assert.equal(studentComponent(content[2], {}).id, 'lead-in-speaking-support');
  assert.deepEqual(content[3], createFactOrMythAnswerKey(content[1]));
  assert.match(content[3].text, /GUESS/);
});
test('validation rejects malformed answers, modes, ids and empty text', () => {
  for (const mutate of [
    c => { c.items[0].answer = null; }, c => { c.items[3].answer = 'myth'; },
    c => { c.items[0].mode = 'invalid'; }, c => { c.items[0].text = ''; },
    c => { c.items[0].explanation = ''; }, c => { c.items[1].id = c.items[0].id; },
    c => { c.items = []; }, c => { c.items[0].unexpected = true; },
  ]) { const c = component(); mutate(c); assert.throws(() => normalizeFactOrMyth(c)); }
});
test('shared actions check answers, preserve changeable guesses and clear state', () => {
  const c = component(), state = {};
  const choose = (role, itemId, value) => applyComponentAction({ role, component: c, state,
    action: { type: 'choose-option', componentId: c.id, itemId, value } });
  choose('student', 'statement-one', 'myth');
  assert.equal(state.exercises[c.id].answers['statement-one'].status, 'wrong');
  choose('teacher', 'statement-one', 'fact');
  assert.equal(state.exercises[c.id].answers['statement-one'].status, 'correct');
  assert.throws(() => choose('student', 'statement-one', 'myth'));
  choose('student', 'statement-four', 'fact');
  choose('teacher', 'statement-four', 'myth');
  assert.deepEqual(state.exercises[c.id].answers['statement-four'], { value: 'myth', status: 'pending' });
  assert.throws(() => choose('student', 'statement-five', 'guess'));
  assert.throws(() => choose('student', 'missing', 'fact'));
  assert.throws(() => choose('guest', 'statement-five', 'fact'));
  clearComponentState({ component: c, state });
  assert.equal(state.exercises[c.id], undefined);
});
test('buttons provide feedback, change guesses and restore synchronized state', () => {
  const actions = [], c = component();
  const view = renderFactOrMyth(c, { onAction: action => actions.push(action) }, createFakeDocument());
  const buttons = byClass(view, 'fact-or-myth__word');
  assert.equal(buttons.length, 10);
  buttons[1].click();
  assert.equal(buttons[1].classList.contains('fact-or-myth__word--wrong'), true);
  buttons[0].click();
  assert.equal(buttons[0].disabled, true);
  buttons[6].click(); buttons[7].click();
  assert.equal(buttons[7].attributes['aria-pressed'], 'true');
  assert.equal(buttons[7].classList.contains('fact-or-myth__word--wrong'), false);
  assert.equal(buttons[7].disabled, false);
  view.updateState({ answers: { 'statement-five': { value: 'fact', status: 'pending' } } });
  assert.equal(buttons[8].attributes['aria-pressed'], 'true');
  view.setInteractive(false);
  const count = actions.length; buttons[9].click(); assert.equal(actions.length, count);
  assert.equal(buttons.every(b => b.disabled), true);
});
