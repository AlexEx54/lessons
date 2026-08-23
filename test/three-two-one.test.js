'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  STEP_DEFINITIONS,
  normalizeThreeTwoOne,
  renderThreeTwoOne,
} = require('../assets/components/three-two-one.js');

function component(overrides = {}) {
  return {
    type: 'threeTwoOne',
    id: 'wrap-up-three-two-one',
    steps: {
      three: { prompt: ' Name three words. ' },
      two: {
        prompt: ' Create two sentences. ',
        text: ' 1. I *used to* think...\n2. Get used to... ',
      },
      one: {
        label: ' Can-do question ',
        prompt: ' Would you recommend it? ',
      },
    },
    ...overrides,
  };
}

test('normalizes the fixed 3-2-1 steps and omits empty optional fields', () => {
  assert.deepEqual(STEP_DEFINITIONS.map(step => step.key), ['three', 'two', 'one']);
  const normalized = normalizeThreeTwoOne(component());
  assert.deepEqual(normalized, {
    type: 'threeTwoOne',
    id: 'wrap-up-three-two-one',
    steps: {
      three: { prompt: 'Name three words.' },
      two: {
        prompt: 'Create two sentences.',
        text: '1. I *used to* think...\n2. Get used to...',
      },
      one: { label: 'Can-do question', prompt: 'Would you recommend it?' },
    },
  });
  assert.equal(normalized.steps.three.text, undefined);
  assert.equal(normalized.steps.three.label, undefined);
  assert.equal(normalized.steps.two.label, undefined);
});

test('rejects schema drift, empty copy, and markup in labels', () => {
  assert.throws(() => normalizeThreeTwoOne(component({ type: 'markdownCard' })), /type.*kebab-case/);
  assert.throws(() => normalizeThreeTwoOne(component({ extra: true })), /unsupported fields/);
  const missing = component();
  delete missing.steps.one;
  assert.throws(() => normalizeThreeTwoOne(missing), /fixed 3-2-1/);
  const extraStep = component();
  extraStep.steps.zero = { prompt: 'Extra' };
  assert.throws(() => normalizeThreeTwoOne(extraStep), /fixed 3-2-1/);
  const emptyPrompt = component();
  emptyPrompt.steps.three.prompt = ' ';
  assert.throws(() => normalizeThreeTwoOne(emptyPrompt), /requires a prompt/);
  const emptyText = component();
  emptyText.steps.two.text = ' ';
  assert.throws(() => normalizeThreeTwoOne(emptyText), /non-empty text/);
  const emptyLabel = component();
  emptyLabel.steps.one.label = ' ';
  assert.throws(() => normalizeThreeTwoOne(emptyLabel), /non-empty label/);
  const markupLabel = component();
  markupLabel.steps.one.label = '**Can-do**';
  assert.throws(() => normalizeThreeTwoOne(markupLabel), /HTML or Markdown/);
});

function fakeDocument() {
  const textNode = value => ({
    nodeType: 3,
    nodeValue: String(value),
    textContent: String(value),
    childNodes: [],
  });
  function element(tag) {
    const node = {
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
      contentEditable: 'false',
      get className() { return this._className; },
      set className(value) { this._className = String(value || ''); },
      classList: {
        contains(name) { return node._className.split(/\s+/).includes(name); },
        add(name) {
          const names = new Set(node._className.split(/\s+/).filter(Boolean));
          names.add(name);
          node._className = [...names].join(' ');
        },
        remove(name) {
          const names = new Set(node._className.split(/\s+/).filter(Boolean));
          names.delete(name);
          node._className = [...names].join(' ');
        },
        toggle(name, force) {
          const enabled = force === undefined ? !this.contains(name) : force;
          if (enabled) this.add(name);
          else this.remove(name);
          return enabled;
        },
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; },
      get children() { return this.childNodes.filter(child => child.nodeType === 1); },
      append(...children) {
        children.forEach((child) => {
          if (child == null) return;
          this.childNodes.push(typeof child === 'string' ? textNode(child) : child);
        });
      },
      replaceChildren(...children) { this.childNodes = []; this.append(...children); },
      addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
      },
      click() { (this.listeners.click || []).forEach(handler => handler({ preventDefault() {} })); },
      focus() {},
      get textContent() {
        if (this.childNodes.length) return this.childNodes.map(child => child.textContent || '').join('');
        return this._text;
      },
      set textContent(value) {
        this.childNodes = value ? [textNode(value)] : [];
        this._text = String(value);
      },
    };
    return node;
  }
  return {
    createElement: element,
    createElementNS: (_namespace, tag) => element(tag),
    createTextNode: textNode,
  };
}

function descendants(node, result = []) {
  (node.childNodes || []).forEach((child) => { result.push(child); descendants(child, result); });
  return result;
}

test('renders three numbered cards and only the supplied optional copy', () => {
  const rendered = renderThreeTwoOne(component(), {}, fakeDocument());
  const cards = descendants(rendered).filter(node => node.classList?.contains('three-two-one__card'));
  assert.deepEqual(cards.map(card => card.dataset.step), ['three', 'two', 'one']);
  assert.deepEqual(
    descendants(rendered).filter(node => node.classList?.contains('three-two-one__count')).map(node => node.textContent),
    ['3', '2', '1'],
  );
  const labels = descendants(rendered).filter(node => node.classList?.contains('three-two-one__label'));
  assert.equal(labels.length, 1);
  assert.equal(labels[0].textContent, 'Can-do question');
  assert.match(cards[0].textContent, /Name three words/);
  assert.match(cards[1].textContent, /used to/);
  assert.equal(descendants(rendered).some(node => node.classList?.contains('three-two-one__edit')), false);
});

test('review mode edits prompts and optional copy, then saves the normalized steps', async () => {
  let saved = null;
  const rendered = renderThreeTwoOne(component(), {
    onSave: async (changes) => {
      saved = changes;
      return { type: 'threeTwoOne', id: 'wrap-up-three-two-one', steps: changes.steps };
    },
    onDirtyChange: () => {},
  }, fakeDocument());
  const edit = descendants(rendered).find(node => node.classList?.contains('three-two-one__edit'));
  assert.ok(edit);
  edit.click();
  assert.equal(rendered.classList.contains('three-two-one--editing'), true);
  assert.ok(descendants(rendered).some(node => node.classList?.contains('three-two-one__toolbar')));
  const cards = descendants(rendered).filter(node => node.classList?.contains('three-two-one__card'));
  const firstPrompt = descendants(cards[0]).find(node => node.classList?.contains('three-two-one__prompt'));
  firstPrompt.textContent = 'Name three phrases from today.';
  firstPrompt.listeners.input[0]();
  descendants(rendered).find(node => node.classList?.contains('three-two-one__save')).click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved.steps.three.prompt, 'Name three phrases from today.');
  assert.equal(saved.steps.one.label, 'Can-do question');
  assert.equal(rendered.classList.contains('three-two-one--editing'), false);
});

test('component is registered in the lesson editor with numbered colors', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'three-two-one.css'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'assets', 'components', 'three-two-one.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(css, /data-step="three"[^}]+#6545f5/);
  assert.match(css, /data-step="two"[^}]+#2f80ed/);
  assert.match(css, /data-step="one"[^}]+#20a85b/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(source, /fixed 3-2-1 step set/);
  assert.match(editor, /threeTwoOne: component/);
  assert.match(editor, /saveThreeTwoOne/);
  assert.match(page, /<script src="\/assets\/components\/three-two-one\.js" defer><\/script>/);
  assert.match(page, /<link rel="stylesheet" href="\/assets\/components\/three-two-one\.css" \/>/);
});
