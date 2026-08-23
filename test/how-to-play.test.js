'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { normalizeHowToPlay, renderHowToPlay } = require('../assets/components/how-to-play.js');

function component(overrides = {}) {
  return {
    type: 'howToPlay',
    id: 'guided-speaking-how-to-play',
    title: ' How to Play ',
    steps: [' Read your role. ', ' Talk to your partner. '],
    tip: ' Keep your card secret. ',
    ...overrides,
  };
}

test('normalizes editable How to Play copy, steps, and tip', () => {
  assert.deepEqual(normalizeHowToPlay(component()), {
    type: 'howToPlay',
    id: 'guided-speaking-how-to-play',
    title: 'How to Play',
    steps: ['Read your role.', 'Talk to your partner.'],
    tip: 'Keep your card secret.',
  });
});

test('tip is optional and omitted from the normalized result when absent', () => {
  assert.deepEqual(normalizeHowToPlay(component({ tip: undefined })), {
    type: 'howToPlay',
    id: 'guided-speaking-how-to-play',
    title: 'How to Play',
    steps: ['Read your role.', 'Talk to your partner.'],
  });
  assert.deepEqual(normalizeHowToPlay(component({ tip: null })), {
    type: 'howToPlay',
    id: 'guided-speaking-how-to-play',
    title: 'How to Play',
    steps: ['Read your role.', 'Talk to your partner.'],
  });
});

test('accepts up to eight steps', () => {
  const steps = Array.from({ length: 8 }, (_, index) => `Step ${index + 1}`);
  const normalized = normalizeHowToPlay(component({ steps, tip: 'Tip' }));
  assert.equal(normalized.steps.length, 8);
});

test('rejects invalid How to Play data', () => {
  assert.throws(() => normalizeHowToPlay(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizeHowToPlay(component({ steps: [] })), /between 1 and 8/);
  assert.throws(() => normalizeHowToPlay(component({ steps: Array.from({ length: 9 }, (_, index) => `S${index}`) })), /between 1 and 8/);
  assert.throws(() => normalizeHowToPlay(component({ extra: true })), /unsupported fields/);
  assert.throws(() => normalizeHowToPlay(component({ title: '**Title**' })), /HTML or Markdown/);
  assert.throws(() => normalizeHowToPlay(component({ steps: ['Step', '<b>Step</b>'] })), /HTML or Markdown/);
  assert.throws(() => normalizeHowToPlay(component({ tip: 'Line\nbreak' })), /HTML or Markdown/);
});

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
        add(name) {
          const tokens = new Set(el._className.split(/\s+/).filter(Boolean));
          tokens.add(name);
          el._className = [...tokens].join(' ');
        },
        remove(name) {
          const tokens = new Set(el._className.split(/\s+/).filter(Boolean));
          tokens.delete(name);
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

test('renders the green guide card with title, numbered steps, and optional tip', () => {
  const section = renderHowToPlay(component(), {}, createFakeDocument());
  assert.equal(byClass(section, 'how-to-play__guide').length, 1);
  assert.equal(byClass(section, 'how-to-play__gamepad').length, 1);
  assert.equal(byClass(section, 'how-to-play__dialogue').length, 1);
  const steps = byClass(section, 'how-to-play__steps')[0];
  assert.equal(steps.childNodes.length, 2);
  assert.equal(steps.childNodes[0].textContent, 'Read your role.');
  assert.match(byClass(section, 'how-to-play__guide-heading')[0].textContent, /How to Play/);
  assert.equal(byClass(section, 'how-to-play__tip').length, 1);
  assert.match(byClass(section, 'how-to-play__tip')[0].textContent, /Keep your card secret/);
  assert.equal(byClass(section, 'how-to-play__edit').length, 0);

  const withoutTip = renderHowToPlay(component({ tip: undefined }), {}, createFakeDocument());
  assert.equal(byClass(withoutTip, 'how-to-play__tip').length, 0);
});

test('teacher mode edits title, steps, and tip and saves the normalized copy', async () => {
  let saved = null;
  const section = renderHowToPlay(component(), {
    onSave: async changes => { saved = changes; return changes; },
    onDirtyChange: () => {},
  }, createFakeDocument());
  assert.equal(byClass(section, 'how-to-play__edit').length, 1);
  byClass(section, 'how-to-play__edit')[0].click();
  assert.equal(byClass(section, 'how-to-play__editor').length, 1);

  const inputs = descendants(section).filter(node => node.tagName === 'INPUT');
  inputs[0].value = 'Game rules';
  inputs[0].listeners.input[0]();
  inputs[1].value = 'Explain it.';
  inputs[1].listeners.input[0]();
  const textareas = descendants(section).filter(node => node.tagName === 'TEXTAREA');
  textareas[0].value = 'Use examples.';
  textareas[0].listeners.input[0]();
  byClass(section, 'how-to-play__save')[0].click();
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(saved, {
    title: 'Game rules',
    steps: ['Explain it.', 'Talk to your partner.'],
    tip: 'Use examples.',
  });
  assert.equal(byClass(section, 'how-to-play__editor').length, 0);
  assert.equal(byClass(section, 'how-to-play__guide').length, 1);
  assert.match(byClass(section, 'how-to-play__guide-heading')[0].textContent, /Game rules/);
});

test('component renders the guide card with gamepad, steps, and dialogue imagery', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'how-to-play.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'how-to-play.css'), 'utf8');
  assert.match(script, /how-to-play__steps/);
  assert.match(script, /describe-and-guess-gamepad-v2\.png/);
  assert.match(script, /describe-and-guess-dialogue\.png/);
  assert.match(script, /normalized\.tip/);
  assert.match(styles, /background:\s*#39aa5e/);
  assert.match(styles, /border:\s*1px solid #a9d6b5/);
});
