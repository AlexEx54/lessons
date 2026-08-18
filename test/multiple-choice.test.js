'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeMultipleChoice,
  optionLetter,
  renderMultipleChoice,
  shouldHintCorrect,
} = require('../assets/components/multiple-choice.js');

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
    type: 'multipleChoice',
    id: 'reading-gist-quiz',
    title: ' Task 1. Reading for Gist ',
    instruction: ' Choose the best answer. ',
    items: [{
      id: 'main-idea',
      question: ' What is the main idea of the text? ',
      options: [
        ' The writer had a terrible trip and wants to forget it. ',
        ' The writer discovered that an exchange week was challenging but rewarding. ',
        ' The writer mostly wanted to talk about famous places in Bristol. ',
      ],
      answer: ' The writer discovered that an exchange week was challenging but rewarding. ',
      explanation: ' The text is about expectations, challenges, and positive results. ',
    }],
    ...overrides,
  };
}

test('multiple choice normalizes its stable JSON contract and drops empty explanations', () => {
  assert.deepEqual(normalizeMultipleChoice(component()), {
    type: 'multipleChoice',
    id: 'reading-gist-quiz',
    title: 'Task 1. Reading for Gist',
    instruction: 'Choose the best answer.',
    items: [{
      id: 'main-idea',
      question: 'What is the main idea of the text?',
      options: [
        'The writer had a terrible trip and wants to forget it.',
        'The writer discovered that an exchange week was challenging but rewarding.',
        'The writer mostly wanted to talk about famous places in Bristol.',
      ],
      answer: 'The writer discovered that an exchange week was challenging but rewarding.',
      explanation: 'The text is about expectations, challenges, and positive results.',
    }],
  });
  const withoutExplanation = normalizeMultipleChoice(component({
    items: [{
      id: 'main-idea',
      question: 'What is the main idea of the text?',
      options: ['One', 'Two'],
      answer: 'Two',
      explanation: '   ',
    }],
  }));
  assert.equal(withoutExplanation.items[0].explanation, undefined);
  assert.deepEqual(Object.keys(withoutExplanation.items[0]), ['id', 'question', 'options', 'answer']);
  const twelve = Array.from({ length: 12 }, (_, index) => ({
    id: `choice-item-${index + 1}`,
    question: `Question ${index + 1}?`,
    options: ['One', 'Two'],
    answer: 'One',
  }));
  assert.equal(normalizeMultipleChoice(component({ items: twelve })).items.length, 12);
});

test('multiple choice rejects malformed counts, ids, markup, and unsupported fields', () => {
  assert.throws(() => normalizeMultipleChoice(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizeMultipleChoice(component({ items: [] })), /between 1 and 12/);
  assert.throws(() => normalizeMultipleChoice({ ...component(), extra: true }), /unsupported fields/);
  assert.throws(() => normalizeMultipleChoice(component({ items: [
    { id: 'same-id', question: 'One?', options: ['A', 'B'], answer: 'A' },
    { id: 'same-id', question: 'Two?', options: ['A', 'B'], answer: 'B' },
  ] })), /unique kebab-case/);
  assert.throws(() => normalizeMultipleChoice(component({ items: [{
    id: 'one-option', question: 'Question?', options: ['Only'], answer: 'Only',
  }] })), /between 2 and 8/);
  assert.throws(() => normalizeMultipleChoice(component({ items: [{
    id: 'duplicate-options', question: 'Question?', options: ['Same', 'Same'], answer: 'Same',
  }] })), /unique within each item/);
  assert.throws(() => normalizeMultipleChoice(component({ items: [{
    id: 'missing-answer', question: 'Question?', options: ['One', 'Two'], answer: 'Three',
  }] })), /must match one of its options/);
  assert.throws(() => normalizeMultipleChoice(component({ items: [{
    id: 'markup', question: '**Question?**', options: ['One', 'Two'], answer: 'One',
  }] })), /HTML or Markdown/);
  assert.throws(() => normalizeMultipleChoice(component({ items: [{
    id: 'bad-explanation', question: 'Question?', options: ['One', 'Two'], answer: 'One',
    explanation: 42,
  }] })), /explanation must be a string/);
});

test('option letters and teacher hint follow the viewer role', () => {
  assert.equal(optionLetter(0), 'A');
  assert.equal(optionLetter(1), 'B');
  assert.equal(optionLetter(7), 'H');
  assert.equal(shouldHintCorrect('teacher'), true);
  assert.equal(shouldHintCorrect('student'), false);
  assert.throws(() => shouldHintCorrect('admin'), /viewer role/);
});

test('teacher view hints the answer, retries a wrong pick, then locks and explains the correct one', () => {
  const section = renderMultipleChoice(component(), { viewerRole: 'teacher' }, createFakeDocument());
  const options = byClass(section, 'multiple-choice__option');
  const feedback = byClass(section, 'multiple-choice__feedback')[0];
  assert.equal(options.length, 3);
  assert.equal(options[1].classList.contains('multiple-choice__option--hint'), true);
  assert.equal(options[0].classList.contains('multiple-choice__option--hint'), false);
  assert.equal(feedback.hidden, true);

  options[0].click();
  assert.equal(options[0].classList.contains('multiple-choice__option--wrong'), true);
  assert.equal(options[1].classList.contains('multiple-choice__option--hint'), true);
  assert.equal(options[1].disabled, false);
  assert.equal(feedback.hidden, true);

  options[1].click();
  assert.equal(options[0].classList.contains('multiple-choice__option--wrong'), false);
  assert.equal(options[1].classList.contains('multiple-choice__option--correct'), true);
  assert.equal(options[1].classList.contains('multiple-choice__option--hint'), false);
  assert.equal(options[1].disabled, true);
  assert.equal(feedback.hidden, false);
  assert.match(feedback.textContent, /^Correct! The text is about/);

  options[2].click();
  assert.equal(options[2].classList.contains('multiple-choice__option--wrong'), false);
  assert.equal(options[1].classList.contains('multiple-choice__option--correct'), true);
});

test('student view does not hint the answer, and a missing explanation hides the feedback bar', () => {
  const section = renderMultipleChoice(component({
    items: [{
      id: 'exchange-taught',
      question: 'What did the exchange teach the writer?',
      options: ['How to cook new food.', 'To adapt, speak up, and enjoy small moments.', 'That school exchanges are always easy.'],
      answer: 'To adapt, speak up, and enjoy small moments.',
    }],
  }), { viewerRole: 'student' }, createFakeDocument());
  const options = byClass(section, 'multiple-choice__option');
  assert.equal(options.some(option => option.classList.contains('multiple-choice__option--hint')), false);
  assert.equal(byClass(section, 'multiple-choice__feedback').length, 0);
  options[1].click();
  assert.equal(options[1].classList.contains('multiple-choice__option--correct'), true);
  assert.equal(byClass(section, 'multiple-choice__feedback').length, 0);
});

test('several questions render numbered cards, and a single question does not', () => {
  const single = renderMultipleChoice(component(), { viewerRole: 'teacher' }, createFakeDocument());
  assert.equal(byClass(single, 'multiple-choice__items').length, 0);
  assert.equal(byClass(single, 'multiple-choice__item--card').length, 0);
  const many = renderMultipleChoice(component({
    items: [{
      id: 'one', question: 'First?', options: ['A1', 'B1'], answer: 'A1',
    }, {
      id: 'two', question: 'Second?', options: ['A2', 'B2'], answer: 'B2',
    }],
  }), { viewerRole: 'teacher' }, createFakeDocument());
  assert.equal(byClass(many, 'multiple-choice__item--card').length, 2);
  assert.match(byClass(many, 'multiple-choice__question')[0].textContent, /^1\. First\?/);
});

test('multiple choice is registered with editing, teacher hint, and responsive styles', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'multiple-choice.css'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'assets', 'components', 'multiple-choice.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(css, /multiple-choice__option--hint/);
  assert.match(css, /multiple-choice__option--correct/);
  assert.match(css, /multiple-choice__option--wrong/);
  assert.match(css, /multiple-choice__feedback/);
  assert.match(css, /multiple-choice__editor-option/);
  assert.match(css, /button:disabled:not\(\.multiple-choice__option\)/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(source, /Correct! \$\{item\.explanation\}/);
  assert.match(source, /hintCorrect && isCorrect && !locked/);
  assert.match(source, /current\.items\.length === 1/);
  assert.match(source, /settings\.viewerRole \|\| 'teacher'/);
  assert.match(editor, /multipleChoice: component/);
  assert.match(editor, /viewerRole: 'teacher'/);
  assert.match(editor, /saveMultipleChoice/);
  assert.match(page, /components\/multiple-choice\.js/);
  assert.match(page, /components\/multiple-choice\.css/);
});
