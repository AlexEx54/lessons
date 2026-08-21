'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  MAX_SENTENCES,
  MIN_SENTENCES,
  normalizeMiniSituation,
  renderMiniSituation,
} = require('../assets/components/mini-situation.js');

function textNode(value) {
  return { nodeType: 3, textContent: String(value), childNodes: [] };
}

function element(tag, namespace) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    namespaceURI: namespace || '',
    childNodes: [],
    attributes: {},
    dataset: {},
    listeners: {},
    style: { setProperty() {} },
    _className: '',
    _text: '',
    hidden: false,
    disabled: false,
    type: '',
    value: '',
    placeholder: '',
    autocomplete: '',
    spellcheck: false,
    contentEditable: 'false',
    get className() { return this._className; },
    set className(value) { this._className = String(value || ''); },
    classList: {
      add(name) {
        const tokens = new Set(el._className.split(/\s+/).filter(Boolean));
        tokens.add(name);
        el._className = [...tokens].join(' ');
      },
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
    removeAttribute(name) { delete this.attributes[name]; },
    append(...nodes) {
      nodes.forEach((node) => {
        if (node == null) return;
        const child = typeof node === 'string' ? textNode(node) : node;
        child.parentNode = el;
        this.childNodes.push(child);
      });
    },
    replaceChildren(...nodes) {
      this.childNodes.forEach((child) => { delete child.parentNode; });
      this.childNodes = [];
      this.append(...nodes);
    },
    addEventListener(type, handler) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(handler);
    },
    focus() {},
    contains(node) {
      if (node === el) return true;
      return this.childNodes.some(child => child.contains && child.contains(node));
    },
    querySelectorAll(selector) {
      const className = selector.startsWith('.') ? selector.slice(1) : '';
      const found = [];
      function walk(node) {
        (node.childNodes || []).forEach((child) => {
          if (className && child.classList && child.classList.contains(className)) found.push(child);
          walk(child);
        });
      }
      walk(el);
      return found;
    },
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

function createFakeDocument() {
  return {
    createElement: tag => element(tag),
    createElementNS: (namespace, tag) => element(tag, namespace),
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

function component(overrides = {}) {
  return {
    type: 'miniSituation',
    id: 'grammar-focus-mini-situation',
    title: ' Task 3. Free Practice — Mini Situation ',
    instruction: ' Read the situation and write 3–5 sentences. ',
    sentenceCount: 5,
    situation: {
      type: 'illustratedTextPanel',
      id: 'grammar-focus-mini-situation-prompt',
      text: ' You are helping to prepare the stream. ',
      backgroundColor: '#f4f0ff',
      leadingPicture: { imagePrompt: ' Simple tent icon ' },
    },
    ...overrides,
  };
}

test('normalizes Mini Situation copy, sentence count, and leading picture', () => {
  assert.deepEqual(normalizeMiniSituation(component()), {
    type: 'miniSituation',
    id: 'grammar-focus-mini-situation',
    title: 'Task 3. Free Practice — Mini Situation',
    instruction: 'Read the situation and write 3–5 sentences.',
    sentenceCount: 5,
    situation: {
      type: 'illustratedTextPanel',
      id: 'grammar-focus-mini-situation-prompt',
      text: 'You are helping to prepare the stream.',
      backgroundColor: '#F4F0FF',
      leadingPicture: { imagePrompt: 'Simple tent icon' },
      trailingPicture: null,
    },
  });
  assert.equal(MIN_SENTENCES, 3);
  assert.equal(MAX_SENTENCES, 8);
});

test('accepts sentenceCount from 3 to 8 and keeps an uploaded situation image', () => {
  const few = normalizeMiniSituation(component({ sentenceCount: 3 }));
  const many = normalizeMiniSituation(component({ sentenceCount: 8 }));
  assert.equal(few.sentenceCount, 3);
  assert.equal(many.sentenceCount, 8);
  const withImage = normalizeMiniSituation(component({
    situation: {
      type: 'illustratedTextPanel',
      id: 'grammar-focus-mini-situation-prompt',
      text: 'Prompt',
      backgroundColor: '#F4F0FF',
      leadingPicture: { imagePrompt: 'Tent', imageSrc: '/tent.png' },
    },
  }));
  assert.equal(withImage.situation.leadingPicture.imageSrc, '/tent.png');
});

test('rejects invalid Mini Situation data', () => {
  assert.throws(() => normalizeMiniSituation(component({ type: 'freePractice' })), /type.*kebab-case/);
  assert.throws(() => normalizeMiniSituation(component({ id: 'Wrong ID' })), /kebab-case/);
  assert.throws(() => normalizeMiniSituation(component({ title: ' ' })), /title/);
  assert.throws(() => normalizeMiniSituation(component({ instruction: '**Bold**' })), /HTML or Markdown/);
  assert.throws(() => normalizeMiniSituation(component({ sentenceCount: 2 })), /between 3 and 8/);
  assert.throws(() => normalizeMiniSituation(component({ sentenceCount: 9 })), /between 3 and 8/);
  assert.throws(() => normalizeMiniSituation(component({ sentenceCount: 5.5 })), /between 3 and 8/);
  assert.throws(() => normalizeMiniSituation(component({ extra: true })), /unsupported fields/);
  assert.throws(() => normalizeMiniSituation(component({
    writingSupport: { title: 'Writing Support', text: 'Right now, ...' },
  })), /unsupported fields/);
  assert.throws(() => normalizeMiniSituation(component({
    situation: {
      type: 'illustratedTextPanel',
      id: 'grammar-focus-mini-situation-prompt',
      text: 'Prompt',
      backgroundColor: '#F4F0FF',
    },
  })), /leadingPicture/);
});

test('renders empty sentence slots, nested situation, and Manual check without answer checking', () => {
  const tree = renderMiniSituation(component(), {}, createFakeDocument());
  assert.equal(tree.className, 'mini-situation');
  assert.equal(byClass(tree, 'mini-situation__title')[0].textContent, 'Task 3. Free Practice — Mini Situation');
  assert.equal(byClass(tree, 'mini-situation__instruction')[0].textContent, 'Read the situation and write 3–5 sentences.');
  assert.equal(byClass(tree, 'mini-situation__input').length, 5);
  assert.match(byClass(tree, 'mini-situation__input')[0].placeholder, /Type sentence 1/);
  assert.equal(byClass(tree, 'mini-situation__check-icon').length, 1);
  assert.match(byClass(tree, 'mini-situation__check')[0].textContent, /Manual check/);
  assert.equal(byClass(tree, 'text-panel--illustrated').length, 1);
  assert.equal(byClass(tree, 'mini-situation__add')[0].hidden, true);
  assert.equal(byClass(tree, 'mini-situation__remove').length, 0);
  assert.equal(byClass(tree, 'mini-situation__edit').length, 0);
});

test('admin edit can add and remove sentence slots in place', () => {
  const tree = renderMiniSituation(component(), { onSave() {} }, createFakeDocument());
  const edit = byClass(tree, 'mini-situation__edit')[0];
  edit.listeners.click[0]();
  assert.equal(tree.classList.contains('mini-situation--editing'), true);
  assert.equal(byClass(tree, 'mini-situation__remove').length, 5);
  assert.equal(byClass(tree, 'mini-situation__add')[0].hidden, false);
  byClass(tree, 'mini-situation__add')[0].listeners.click[0]();
  assert.equal(byClass(tree, 'mini-situation__input').length, 6);
  byClass(tree, 'mini-situation__remove')[0].listeners.click[0]();
  assert.equal(byClass(tree, 'mini-situation__input').length, 5);
});

test('Mini Situation has a dedicated Manual check icon and does not check answers', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'assets/components/mini-situation.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'assets/components/mini-situation.css'), 'utf8');
  assert.match(script, /Manual check/);
  assert.match(script, /createManualCheckIcon/);
  assert.match(script, /renderIllustratedTextPanel/);
  assert.doesNotMatch(script, /answersMatch|Answer Key/);
  assert.match(styles, /mini-situation__check/);
  assert.match(styles, /mini-situation__index/);
});
