'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  OPTIONS,
  normalizeSelfAssessment,
  renderSelfAssessment,
} = require('../assets/components/self-assessment.js');

function component(overrides = {}) {
  return {
    type: 'selfAssessment',
    id: 'wrap-up-self-assessment',
    title: ' Self-assessment: How do you feel about today’s lesson? ',
    ...overrides,
  };
}

test('normalizes the title and keeps the three-option scale out of JSON', () => {
  assert.deepEqual(OPTIONS.map(option => option.id), ['independent', 'withHelp', 'needPractice']);
  assert.deepEqual(normalizeSelfAssessment(component()), {
    type: 'selfAssessment',
    id: 'wrap-up-self-assessment',
    title: 'Self-assessment: How do you feel about today’s lesson?',
  });
});

test('rejects schema drift and an empty title', () => {
  assert.throws(() => normalizeSelfAssessment(component({ type: 'markdownCard' })), /type.*kebab-case/);
  assert.throws(() => normalizeSelfAssessment(component({ extra: true })), /unsupported fields/);
  assert.throws(() => normalizeSelfAssessment(component({ title: ' ' })), /requires a title/);
  assert.throws(() => normalizeSelfAssessment(component({
    options: [{ id: 'independent', text: 'I can do it independently.' }],
  })), /unsupported fields/);
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
      type: '',
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

test('renders the fixed scale, keeps selection local, and allows changing the title', async () => {
  let saved = null;
  const rendered = renderSelfAssessment(component(), {
    onSave: async (changes) => {
      saved = changes;
      return { type: 'selfAssessment', id: 'wrap-up-self-assessment', title: changes.title };
    },
    onDirtyChange: () => {},
  }, fakeDocument());
  const options = descendants(rendered).filter(node => node.classList?.contains('self-assessment__option'));
  assert.equal(options.length, 3);
  assert.deepEqual(options.map(option => option.dataset.option), ['independent', 'withHelp', 'needPractice']);
  assert.match(options[0].textContent, /independently/);
  assert.equal(options[0].getAttribute('aria-checked'), 'false');
  options[0].click();
  const selected = descendants(rendered).filter(node => node.classList?.contains('self-assessment__option'));
  assert.equal(selected[0].getAttribute('aria-checked'), 'true');
  assert.ok(descendants(selected[0]).some(node => node.classList?.contains('self-assessment__check')));
  selected[1].click();
  const switched = descendants(rendered).filter(node => node.classList?.contains('self-assessment__option'));
  assert.equal(switched[0].getAttribute('aria-checked'), 'false');
  assert.equal(switched[1].getAttribute('aria-checked'), 'true');

  descendants(rendered).find(node => node.classList?.contains('self-assessment__edit')).click();
  assert.equal(rendered.classList.contains('self-assessment--editing'), true);
  const heading = descendants(rendered).find(node => node.tagName === 'H3');
  heading.textContent = 'Self-assessment: How did today’s grammar go?';
  heading.listeners.input[0]();
  descendants(rendered).find(node => node.classList?.contains('self-assessment__save')).click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, { title: 'Self-assessment: How did today’s grammar go?' });
  assert.match(descendants(rendered).find(node => node.tagName === 'H3').textContent, /grammar go/);
});

test('component is registered in the lesson editor with a three-column scale', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'self-assessment.css'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'assets', 'components', 'self-assessment.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(css, /\.self-assessment \{[^}]*border: 1px solid #e6e7ee/);
  assert.match(css, /grid-template-columns:\s*repeat\(3/);
  assert.match(css, /self-assessment__option--selected/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(source, /I can do it independently/);
  assert.match(source, /I need more practice/);
  assert.match(editor, /selfAssessment: component/);
  assert.match(editor, /saveSelfAssessment/);
  assert.match(page, /<script src="\/assets\/components\/self-assessment\.js" defer><\/script>/);
  assert.match(page, /<link rel="stylesheet" href="\/assets\/components\/self-assessment\.css" \/>/);
});

test('lesson editor script tags close before the next script starts', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'lesson-editor.html'), 'utf8');
  const opens = page.match(/<script\b/g) || [];
  const complete = page.match(/<script\b[\s\S]*?<\/script>/g) || [];
  assert.equal(complete.length, opens.length);
  complete.forEach((block) => {
    assert.equal((block.match(/<script\b/g) || []).length, 1);
  });
});
