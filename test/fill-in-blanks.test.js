'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  answersMatch,
  normalizeFillInBlanks,
  renderFillInBlanks,
  shuffleWords,
  shouldShowAnswerKey,
} = require('../assets/components/fill-in-blanks.js');

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
      value: '',
      get className() { return this._className; },
      set className(value) { this._className = String(value || ''); },
      classList: {
        toggle(name, force) {
          const names = new Set(el._className.split(/\s+/).filter(Boolean));
          const enabled = force === undefined ? !names.has(name) : force;
          if (enabled) names.add(name); else names.delete(name);
          el._className = [...names].join(' ');
          return enabled;
        },
        contains(name) { return el._className.split(/\s+/).includes(name); },
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
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
    createElementNS: (_namespace, tag) => element(tag),
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

function byClass(node, className) {
  return descendants(node).filter(child => child.classList?.contains(className));
}

function component(overrides = {}) {
  return {
    type: 'fillInBlanks',
    id: 'target-vocabulary-fill-in-blanks',
    title: ' Task 3 · Fill in the Blanks ',
    instruction: ' Type the correct word or phrase. ',
    items: [{
      id: 'fill-item-one',
      before: ' After a long week, I like to ',
      answer: ' chill out ',
      after: ' and watch a movie. ',
    }],
    ...overrides,
  };
}

test('fill in the blanks normalizes its stable JSON contract', () => {
  assert.deepEqual(normalizeFillInBlanks(component()), {
    type: 'fillInBlanks',
    id: 'target-vocabulary-fill-in-blanks',
    title: 'Task 3 · Fill in the Blanks',
    instruction: 'Type the correct word or phrase.',
    items: [{
      id: 'fill-item-one',
      before: 'After a long week, I like to',
      answer: 'chill out',
      after: 'and watch a movie.',
    }],
  });
  const twelve = Array.from({ length: 12 }, (_, index) => ({
    id: `fill-item-${index + 1}`,
    before: `Sentence ${index + 1}`,
    answer: 'answer',
    after: '',
  }));
  assert.equal(normalizeFillInBlanks(component({ items: twelve })).items.length, 12);
});

test('fill in the blanks rejects malformed counts, ids, markup, and empty content', () => {
  assert.throws(() => normalizeFillInBlanks(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [] })), /between 1 and 12/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [{
    id: 'Bad Id', before: 'Sentence', answer: 'answer', after: '',
  }] })), /unique kebab-case/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [
    { id: 'same-id', before: 'One', answer: 'one', after: '' },
    { id: 'same-id', before: 'Two', answer: 'two', after: '' },
  ] })), /unique kebab-case/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [{
    id: 'empty-sentence', before: '', answer: 'answer', after: '',
  }] })), /sentence text/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [{
    id: 'empty-answer', before: 'Sentence', answer: '', after: '',
  }] })), /item answer/);
  assert.throws(() => normalizeFillInBlanks(component({ items: [{
    id: 'markup', before: '<b>Sentence</b>', answer: 'answer', after: '',
  }] })), /HTML or Markdown/);
  assert.throws(() => normalizeFillInBlanks({ ...component(), answerKey: ['duplicate'] }), /unsupported fields/);
});

test('answer matching is live-friendly and has no wrong state', () => {
  assert.equal(answersMatch('  CHILL   OUT ', 'chill out'), true);
  assert.equal(answersMatch('chill', 'chill out'), false);
  assert.equal(answersMatch('', 'chill out'), false);
  assert.equal(shouldShowAnswerKey('teacher'), true);
  assert.equal(shouldShowAnswerKey('student'), false);
  assert.throws(() => shouldShowAnswerKey('admin'), /viewer role/);
});

test('word bank shuffles a copy without mutating its source', () => {
  const words = ['one', 'two', 'three'];
  const randomValues = [0, 0];
  assert.deepEqual(shuffleWords(words, () => randomValues.shift()), ['two', 'three', 'one']);
  assert.deepEqual(words, ['one', 'two', 'three']);
});

test('fill in the blanks renders the shuffled word bank before the items', () => {
  const studentView = renderFillInBlanks(component({
    items: [
      { id: 'fill-item-one', before: 'We can', answer: 'chill out', after: 'today.' },
      { id: 'fill-item-two', before: 'I might', answer: 'go offline', after: 'later.' },
    ],
  }), { viewerRole: 'student' }, createFakeDocument());
  const bank = byClass(studentView, 'fill-in-blanks__word-bank')[0];
  const view = byClass(studentView, 'fill-in-blanks__view')[0];
  assert.ok(bank);
  assert.equal(view.childNodes[0], bank);
  assert.match(bank.textContent, /Words \/ phrases:/);
  assert.match(bank.textContent, /chill out/);
  assert.match(bank.textContent, /go offline/);
  assert.match(bank.textContent, /•/);
  assert.equal(byClass(studentView, 'fill-in-blanks__answer-key').length, 0);

  const teacherView = renderFillInBlanks(component(), { viewerRole: 'teacher' }, createFakeDocument());
  assert.equal(byClass(teacherView, 'fill-in-blanks__word-bank').length, 1);
  assert.equal(byClass(teacherView, 'fill-in-blanks__answer-key').length, 1);
});

test('fill in the blanks is registered with editing, answer-key, and responsive styles', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'fill-in-blanks.css'), 'utf8');
  const componentSource = fs.readFileSync(path.join(root, 'assets', 'components', 'fill-in-blanks.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(css, /fill-in-blanks__field--correct/);
  assert.match(css, /top:\s*50%/);
  assert.match(css, /transform:\s*translateY\(-50%\)/);
  assert.match(css, /fill-in-blanks__check::before/);
  assert.match(css, /top:\s*3px/);
  assert.match(css, /transform:\s*rotate\(45deg\)/);
  assert.doesNotMatch(css, /field--wrong/);
  assert.match(css, /fill-in-blanks__answer-key/);
  assert.match(css, /fill-in-blanks__word-bank/);
  assert.match(css, /fill-in-blanks__word-bank-separator/);
  assert.match(componentSource, /shuffleWords/);
  assert.match(css, /fill-in-blanks__answer-edit/);
  assert.match(css, /padding:\s*10px 4px 0 56px/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(editor, /fillInBlanks: component/);
  assert.match(editor, /saveFillInBlanks/);
  assert.match(page, /components\/fill-in-blanks\.js/);
  assert.match(page, /components\/fill-in-blanks\.css/);
});
