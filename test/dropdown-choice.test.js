'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  DEFAULT_ACCENT_COLOR,
  getSelectionState,
  normalizeDropdownChoice,
  parseAccentMarkdown,
  parseChoiceText,
  renderDropdownChoice,
  stripAccentMarkdown,
} = require('../assets/components/dropdown-choice.js');

function component(overrides = {}) {
  return {
    type: 'dropdownChoice',
    id: 'grammar-check-the-rule',
    title: ' Task 2. Check the Rule ',
    instruction: ' Choose the correct option. ',
    text: '1. I [[past-routine]] finish early.\n2. I could not [[adaptation]] waking up early.',
    choices: [{
      id: 'past-routine', options: ['used to', 'get used to', 'getting used to'], answer: 'used to',
    }, {
      id: 'adaptation', options: ['used to', 'get used to', 'getting used to'], answer: 'get used to',
    }],
    ...overrides,
  };
}

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
      style: { setProperty() {} },
      _className: '',
      _text: '',
      get className() { return this._className; },
      set className(value) { this._className = String(value || ''); },
      append(...nodes) {
        nodes.forEach((node) => {
          if (node != null) this.childNodes.push(node);
        });
      },
      replaceChildren(...nodes) {
        this.childNodes = [];
        this.append(...nodes);
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] || null; },
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
  return descendants(root).filter(node => node.className?.split(/\s+/).includes(name));
}

test('dropdown choice normalizes marked text, choices, line breaks, and repeated answers', () => {
  const normalized = normalizeDropdownChoice(component());
  assert.equal(normalized.title, 'Task 2. Check the Rule');
  assert.equal(normalized.accentColor, DEFAULT_ACCENT_COLOR);
  assert.match(normalized.text, /\n2\. I could not/);
  assert.deepEqual(parseChoiceText(normalized.text).filter(part => part.type === 'gap').map(part => part.token), [
    'past-routine', 'adaptation',
  ]);
  const repeated = component({
    text: 'One [[first]]. Two [[second]].',
    choices: [
      { id: 'first', options: ['used to', 'get used to'], answer: 'used to' },
      { id: 'second', options: ['used to', 'get used to'], answer: 'used to' },
    ],
  });
  assert.deepEqual(normalizeDropdownChoice(repeated).choices.map(choice => choice.answer), ['used to', 'used to']);

  const accented = normalizeDropdownChoice(component({
    title: ' **Task 2. Check the Rule** ',
    text: '**1.** I [[past-routine]] finish early.\n**2.** I could not [[adaptation]] waking up early.',
    accentColor: '#6545f5',
  }));
  assert.equal(accented.title, '**Task 2. Check the Rule**');
  assert.equal(accented.accentColor, '#6545F5');
  assert.deepEqual(parseAccentMarkdown('**1.** Sentence.'), [
    { type: 'strong', value: '1.' }, { type: 'text', value: ' Sentence.' },
  ]);
  assert.equal(stripAccentMarkdown('**Task 2.** Check the Rule'), 'Task 2. Check the Rule');
});

test('dropdown choice rejects the removed segments format and malformed canonical data', () => {
  assert.throws(() => normalizeDropdownChoice({ ...component(), segments: [] }), /unsupported fields/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), type: 'other' }), /type.*kebab-case/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), text: 'No gap.' }), /between 1 and 12 gaps/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), text: '[[Bad Id]]', choices: component().choices }), /kebab-case/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), text: '[[past-routine]] only' }), /must match exactly/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), text: '[[past-routine]] and [[past-routine]]' }), /markers must be unique/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), choices: [
    { id: 'past-routine', options: ['one'], answer: 'one' },
    component().choices[1],
  ] }), /between 2 and 12 options/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), choices: [
    { id: 'past-routine', options: ['one', ' one '], answer: 'one' },
    component().choices[1],
  ] }), /options must be unique/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), choices: [
    { id: 'past-routine', options: ['one', 'two'], answer: 'three' },
    component().choices[1],
  ] }), /answer must match/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), accentColor: '#6545' }), /#RRGGBB/);
  assert.throws(() => normalizeDropdownChoice({ ...component(), instruction: '**Choose.**' }), /HTML or Markdown/);
  assert.throws(() => normalizeDropdownChoice({
    ...component(),
    choices: [
      { id: 'past-routine', options: ['**used to**', 'get used to'], answer: '**used to**' },
      component().choices[1],
    ],
  }), /HTML or Markdown/);
  assert.throws(() => normalizeDropdownChoice({
    ...component(), text: '*Italic* [[past-routine]] and [[adaptation]].',
  }), /only \*\*bold\*\*/);
  assert.throws(() => normalizeDropdownChoice({
    ...component(), text: '**Broken [[past-routine]] and [[adaptation]].',
  }), /unclosed bold/);
  assert.throws(() => normalizeDropdownChoice({
    ...component(), title: '[Task](https:\/\/example.com)',
  }), /only \*\*bold\*\*/);
});

test('dropdown choice selection states allow retries and identify a correct answer', () => {
  assert.equal(getSelectionState('', 'answer'), 'empty');
  assert.equal(getSelectionState('wrong', 'answer'), 'wrong');
  assert.equal(getSelectionState('answer', 'answer'), 'correct');
});

test('dropdown choice numbers each field by its position in the text', () => {
  const reordered = component({
    text: 'First [[adaptation]]. Then [[past-routine]].',
  });
  const section = renderDropdownChoice(reordered, {}, createFakeDocument());
  const numbers = byClass(section, 'dropdown-choice__number');
  const selects = descendants(section).filter(node => node.tagName === 'SELECT');

  assert.deepEqual(numbers.map(number => number.textContent), ['(1)', '(2)']);
  assert.deepEqual(selects.map(select => select.dataset.choiceId), ['adaptation', 'past-routine']);
  assert.equal(selects[0].getAttribute('aria-label'), 'Выбор 1. Выберите вариант для adaptation');
  assert.equal(normalizeDropdownChoice(reordered).text, 'First [[adaptation]]. Then [[past-routine]].');
});

test('dropdown choice is registered with editing, persistence, and responsive states', () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'assets', 'components', 'dropdown-choice.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'dropdown-choice.css'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(source, /dropdown-choice__choices-editor/);
  assert.match(source, /dropdown-choice__number/);
  assert.match(source, /settings\.onSave/);
  assert.match(css, /dropdown-choice__select--correct/);
  assert.match(css, /dropdown-choice__number/);
  assert.match(css, /--dropdown-choice-accent/);
  assert.match(css, /dropdown-choice__accent/);
  assert.match(css, /dropdown-choice--editing/);
  assert.match(source, /parseAccentMarkdown/);
  assert.match(source, /title\.textContent = current\.title/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(editor, /saveDropdownChoice/);
  assert.match(page, /components\/inline-gap-text\.js/);
  assert.match(page, /components\/dropdown-choice\.js/);
});
