'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeCheckboxChoice,
  optionLetter,
  renderCheckboxChoice,
  shouldHintCorrect,
} = require('../assets/components/checkbox-choice.js');

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

function component(overrides = {}) {
  return {
    type: 'checkboxChoice',
    id: 'listening-gist-quiz',
    title: ' Task 1. Listening for Gist ',
    instruction: ' Choose the correct options. ',
    items: [{
      id: 'conversation-place',
      question: ' Where does the conversation take place? ',
      options: [
        ' At home ',
        ' At the AFK Summer camp office ',
        ' On a school bus ',
      ],
      answers: [' At the AFK Summer camp office '],
    }],
    ...overrides,
  };
}

test('checkbox choice normalizes its stable JSON contract and orders answers like options', () => {
  assert.deepEqual(normalizeCheckboxChoice(component()), {
    type: 'checkboxChoice',
    id: 'listening-gist-quiz',
    title: 'Task 1. Listening for Gist',
    instruction: 'Choose the correct options.',
    items: [{
      id: 'conversation-place',
      question: 'Where does the conversation take place?',
      options: [
        'At home',
        'At the AFK Summer camp office',
        'On a school bus',
      ],
      answers: ['At the AFK Summer camp office'],
    }],
  });
  const reordered = normalizeCheckboxChoice(component({
    items: [{
      id: 'pack-list',
      question: 'What should they bring?',
      options: ['A guitar', 'Sunscreen', 'A laptop'],
      answers: ['Sunscreen', 'A guitar'],
    }],
  }));
  assert.deepEqual(reordered.items[0].answers, ['A guitar', 'Sunscreen']);
  assert.deepEqual(Object.keys(reordered.items[0]), ['id', 'question', 'options', 'answers']);
  const twelve = Array.from({ length: 12 }, (_, index) => ({
    id: `checkbox-item-${index + 1}`,
    question: `Question ${index + 1}?`,
    options: ['One', 'Two'],
    answers: ['One'],
  }));
  assert.equal(normalizeCheckboxChoice(component({ items: twelve })).items.length, 12);
});

test('checkbox choice rejects malformed counts, ids, markup, and unsupported fields', () => {
  assert.throws(() => normalizeCheckboxChoice(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizeCheckboxChoice(component({ items: [] })), /between 1 and 12/);
  assert.throws(() => normalizeCheckboxChoice({ ...component(), extra: true }), /unsupported fields/);
  assert.throws(() => normalizeCheckboxChoice(component({ items: [
    { id: 'same-id', question: 'One?', options: ['A', 'B'], answers: ['A'] },
    { id: 'same-id', question: 'Two?', options: ['A', 'B'], answers: ['B'] },
  ] })), /unique kebab-case/);
  assert.throws(() => normalizeCheckboxChoice(component({ items: [{
    id: 'one-option', question: 'Question?', options: ['Only'], answers: ['Only'],
  }] })), /between 2 and 8/);
  assert.throws(() => normalizeCheckboxChoice(component({ items: [{
    id: 'duplicate-options', question: 'Question?', options: ['Same', 'Same'], answers: ['Same'],
  }] })), /unique within each item/);
  assert.throws(() => normalizeCheckboxChoice(component({ items: [{
    id: 'missing-answer', question: 'Question?', options: ['One', 'Two'], answers: ['Three'],
  }] })), /must match the item options/);
  assert.throws(() => normalizeCheckboxChoice(component({ items: [{
    id: 'empty-answers', question: 'Question?', options: ['One', 'Two'], answers: [],
  }] })), /at least one answer/);
  assert.throws(() => normalizeCheckboxChoice(component({ items: [{
    id: 'duplicate-answers', question: 'Question?', options: ['One', 'Two'], answers: ['One', 'One'],
  }] })), /answers must be unique/);
  assert.throws(() => normalizeCheckboxChoice(component({ items: [{
    id: 'markup', question: '**Question?**', options: ['One', 'Two'], answers: ['One'],
  }] })), /HTML or Markdown/);
  assert.throws(() => normalizeCheckboxChoice(component({ items: [{
    id: 'explanation', question: 'Question?', options: ['One', 'Two'], answers: ['One'],
    explanation: 'No.',
  }] })), /only support id, question, options, and answers/);
});

test('option letters and teacher hint follow the viewer role', () => {
  assert.equal(optionLetter(0), 'A');
  assert.equal(optionLetter(1), 'B');
  assert.equal(optionLetter(7), 'H');
  assert.equal(shouldHintCorrect('teacher'), true);
  assert.equal(shouldHintCorrect('student'), false);
  assert.throws(() => shouldHintCorrect('admin'), /viewer role/);
});

test('teacher view hints answers, locks a wrong pick, and keeps other options open', () => {
  const section = renderCheckboxChoice(component(), { viewerRole: 'teacher' }, createFakeDocument());
  const options = byClass(section, 'checkbox-choice__option');
  const ticks = byClass(section, 'checkbox-choice__tick');
  assert.equal(options.length, 3);
  assert.equal(options[1].classList.contains('checkbox-choice__option--hint'), true);
  assert.equal(options[0].classList.contains('checkbox-choice__option--hint'), false);
  assert.equal(ticks[1].hidden, true);

  options[0].click();
  assert.equal(options[0].classList.contains('checkbox-choice__option--wrong'), true);
  assert.equal(options[0].disabled, true);
  assert.equal(options[0].getAttribute('aria-checked'), 'false');
  assert.equal(options[1].classList.contains('checkbox-choice__option--hint'), true);
  assert.equal(options[1].disabled, false);
  assert.equal(options[2].disabled, false);

  options[1].click();
  assert.equal(options[0].classList.contains('checkbox-choice__option--wrong'), true);
  assert.equal(options[1].classList.contains('checkbox-choice__option--correct'), true);
  assert.equal(options[1].classList.contains('checkbox-choice__option--hint'), false);
  assert.equal(options[1].disabled, true);
  assert.equal(options[1].getAttribute('aria-checked'), 'true');
  assert.equal(ticks[1].hidden, false);

  options[2].click();
  assert.equal(options[2].classList.contains('checkbox-choice__option--wrong'), true);
  assert.equal(options[1].classList.contains('checkbox-choice__option--correct'), true);
});

test('student view does not hint answers, and several correct options stay independently lockable', () => {
  const section = renderCheckboxChoice(component({
    items: [{
      id: 'pack-list',
      question: 'What should they bring?',
      options: ['A guitar', 'A laptop', 'Sunscreen'],
      answers: ['A guitar', 'Sunscreen'],
    }],
  }), { viewerRole: 'student' }, createFakeDocument());
  const options = byClass(section, 'checkbox-choice__option');
  assert.equal(options.some(option => option.classList.contains('checkbox-choice__option--hint')), false);

  options[0].click();
  assert.equal(options[0].classList.contains('checkbox-choice__option--correct'), true);
  assert.equal(options[2].disabled, false);
  assert.equal(options[2].classList.contains('checkbox-choice__option--hint'), false);

  options[1].click();
  assert.equal(options[1].classList.contains('checkbox-choice__option--wrong'), true);
  assert.equal(options[2].disabled, false);

  options[2].click();
  assert.equal(options[0].classList.contains('checkbox-choice__option--correct'), true);
  assert.equal(options[2].classList.contains('checkbox-choice__option--correct'), true);
  assert.equal(options[2].disabled, true);

  const finished = renderCheckboxChoice(component({
    items: [{
      id: 'pack-list',
      question: 'What should they bring?',
      options: ['A guitar', 'A laptop', 'Sunscreen'],
      answers: ['A guitar', 'Sunscreen'],
    }],
  }), { viewerRole: 'student' }, createFakeDocument());
  const finishedOptions = byClass(finished, 'checkbox-choice__option');
  finishedOptions[0].click();
  finishedOptions[2].click();
  assert.equal(finishedOptions[1].disabled, true);
  assert.equal(finishedOptions[1].classList.contains('checkbox-choice__option--wrong'), false);
});

test('several questions render numbered items, and a single question does not', () => {
  const single = renderCheckboxChoice(component(), { viewerRole: 'teacher' }, createFakeDocument());
  assert.equal(byClass(single, 'checkbox-choice__items').length, 0);
  assert.match(byClass(single, 'checkbox-choice__question')[0].textContent, /^Where does the conversation take place\?$/);
  const many = renderCheckboxChoice(component({
    items: [{
      id: 'one', question: 'First?', options: ['A1', 'B1'], answers: ['A1'],
    }, {
      id: 'two', question: 'Second?', options: ['A2', 'B2'], answers: ['B2'],
    }],
  }), { viewerRole: 'teacher' }, createFakeDocument());
  assert.equal(byClass(many, 'checkbox-choice__items').length, 1);
  assert.match(byClass(many, 'checkbox-choice__question')[0].textContent, /^1\. First\?$/);
});

test('checkbox choice is registered with editing, teacher hint, and responsive styles', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'checkbox-choice.css'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'assets', 'components', 'checkbox-choice.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(css, /checkbox-choice__option--hint/);
  assert.match(css, /checkbox-choice__option--correct/);
  assert.match(css, /checkbox-choice__option--wrong/);
  assert.match(css, /checkbox-choice__box/);
  assert.match(css, /checkbox-choice__editor-option/);
  assert.match(css, /button:disabled:not\(\.checkbox-choice__option\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(source, /hintCorrect && isCorrect && !isSeen/);
  assert.match(source, /isSeen \|\| complete/);
  assert.match(source, /current\.items\.length === 1/);
  assert.match(source, /settings\.viewerRole \|\| 'teacher'/);
  assert.match(source, /type = 'checkbox'/);
  assert.match(editor, /checkboxChoice: component/);
  assert.match(editor, /viewerRole: 'teacher'/);
  assert.match(editor, /saveCheckboxChoice/);
  assert.match(page, /components\/checkbox-choice\.js/);
  assert.match(page, /components\/checkbox-choice\.css/);
});
