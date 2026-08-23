'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeSpeakingSupport,
  renderSpeakingSupport,
} = require('../assets/components/speaking-support.js');

function component(overrides = {}) {
  return {
    type: 'speakingSupport',
    id: 'guided-speaking-support',
    title: ' Speaking   Support ',
    sections: {
      reacting: { title: ' Reacting ', text: ' - Really? ' },
      followUpQuestions: { title: 'Follow-up questions', text: '- Why?' },
      clarification: { title: 'Clarification', text: '- What do you mean?' },
      suggestions: { title: 'Suggestions', text: '- How about...?' },
      agreeingDisagreeing: { title: 'Agreeing / Disagreeing', text: '- I agree.' },
      decision: { title: 'Decision', text: '- Let’s choose...' },
    },
    ...overrides,
  };
}

test('normalizes all titles and preserves the fixed section order', () => {
  const normalized = normalizeSpeakingSupport(component());
  assert.equal(normalized.title, 'Speaking Support');
  assert.equal(normalized.sections.reacting.title, 'Reacting');
  assert.equal(normalized.sections.reacting.text, '- Really?');
  assert.deepEqual(Object.keys(normalized.sections), [
    'reacting', 'followUpQuestions', 'clarification',
    'suggestions', 'agreeingDisagreeing', 'decision',
  ]);
});

test('rejects changes to the fixed schema and empty editable fields', () => {
  const missing = component();
  delete missing.sections.decision;
  assert.throws(() => normalizeSpeakingSupport(missing), /fixed section set/);

  const extra = component();
  extra.sections.extra = { title: 'Extra', text: '- Extra' };
  assert.throws(() => normalizeSpeakingSupport(extra), /fixed section set/);

  const invalidSection = component();
  invalidSection.sections.reacting.title = ' ';
  assert.throws(() => normalizeSpeakingSupport(invalidSection), /requires a title and text/);

  assert.throws(() => normalizeSpeakingSupport(component({ extra: true })), /unsupported fields/);
  assert.throws(() => normalizeSpeakingSupport(component({ id: 'Bad id' })), /kebab-case/);
});

function fakeDocument() {
  const textNode = value => ({ nodeType: 3, nodeValue: String(value), textContent: String(value), childNodes: [] });
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
      get className() { return this._className; },
      set className(value) { this._className = String(value || ''); },
      classList: {
        contains(name) { return node._className.split(/\s+/).includes(name); },
        add(name) {
          const names = new Set(node._className.split(/\s+/).filter(Boolean));
          names.add(name); node._className = [...names].join(' ');
        },
        remove(name) {
          const names = new Set(node._className.split(/\s+/).filter(Boolean));
          names.delete(name); node._className = [...names].join(' ');
        },
        toggle(name, force) {
          const enabled = force === undefined ? !this.contains(name) : force;
          if (enabled) this.add(name); else this.remove(name);
          return enabled;
        },
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; },
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
        return this.childNodes.length ? this.childNodes.map(child => child.textContent || '').join('') : this._text;
      },
      set textContent(value) { this.childNodes = []; this._text = String(value); },
    };
    return node;
  }
  return { createElement: element, createElementNS: (_namespace, tag) => element(tag), createTextNode: textNode };
}

function descendants(node, result = []) {
  (node.childNodes || []).forEach((child) => { result.push(child); descendants(child, result); });
  return result;
}

test('renders the icon and sections in their fixed order', () => {
  const rendered = renderSpeakingSupport(component(), {}, fakeDocument());
  const nodes = descendants(rendered);
  const sections = nodes.filter(node => node.classList?.contains('speaking-support__section'));
  assert.deepEqual(sections.map(section => section.dataset.section), [
    'reacting', 'followUpQuestions', 'clarification',
    'suggestions', 'agreeingDisagreeing', 'decision',
  ]);
  assert.ok(nodes.some(node => node.tagName === 'SVG' && node.classList.contains('speaking-support__icon')));
  assert.equal(nodes.some(node => node.classList?.contains('speaking-support__edit')), false);
});

test('review render edits all seven headings and six markdown bodies', () => {
  const rendered = renderSpeakingSupport(component(), { onSave: async () => component() }, fakeDocument());
  const edit = descendants(rendered).find(node => node.classList?.contains('speaking-support__edit'));
  assert.ok(edit);
  edit.click();
  assert.equal(rendered.classList.contains('speaking-support--editing'), true);
  assert.equal(descendants(rendered).filter(node => node.contentEditable === 'true').length, 13);
  assert.ok(descendants(rendered).some(node => node.classList?.contains('speaking-support__toolbar')));
});
