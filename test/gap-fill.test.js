'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  DEFAULT_ACCENT_COLOR,
  answersMatch,
  normalizeGapFill,
  parseAccentMarkdown,
  parseGapText,
  renderGapFill,
  stripAccentMarkdown,
} = require('../assets/components/gap-fill.js');

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
  return descendants(root).filter(node => node.classList && node.classList.contains(name));
}

function component(overrides = {}) {
  return {
    type: 'gapFill',
    id: 'grammar-focus-complete-the-gaps',
    title: ' Task 2. Complete the gaps. ',
    instruction: ' Type the correct form. ',
    text: '**Mia:** What [[mia-do]] after school?\n**Leo:** I [[leo-play]] co-op games.',
    gaps: [{
      id: 'mia-do', example: ' do ', answer: ' did you use to do ',
    }, {
      id: 'leo-play', example: 'play', answer: 'used to play',
    }],
    ...overrides,
  };
}

test('gap fill normalizes marked text, optional examples, and accent markdown', () => {
  assert.deepEqual(normalizeGapFill(component()), {
    type: 'gapFill',
    id: 'grammar-focus-complete-the-gaps',
    title: 'Task 2. Complete the gaps.',
    instruction: 'Type the correct form.',
    text: '**Mia:** What [[mia-do]] after school?\n**Leo:** I [[leo-play]] co-op games.',
    gaps: [{
      id: 'mia-do', answer: 'did you use to do', example: 'do',
    }, {
      id: 'leo-play', answer: 'used to play', example: 'play',
    }],
    accentColor: DEFAULT_ACCENT_COLOR,
  });

  const withoutExample = normalizeGapFill(component({
    gaps: [
      { id: 'mia-do', answer: 'Did', example: '   ' },
      { id: 'leo-play', example: 'play', answer: 'used to play' },
    ],
  }));
  assert.deepEqual(withoutExample.gaps[0], { id: 'mia-do', answer: 'Did' });
  assert.equal(withoutExample.gaps[1].example, 'play');

  const accented = normalizeGapFill(component({
    title: ' **Task 2. Complete the gaps.** ',
    accentColor: '#6545f5',
  }));
  assert.equal(accented.title, '**Task 2. Complete the gaps.**');
  assert.equal(accented.accentColor, '#6545F5');
  assert.deepEqual(parseGapText(accented.text).filter(part => part.type === 'gap').map(part => part.token), [
    'mia-do', 'leo-play',
  ]);
  assert.deepEqual(parseAccentMarkdown('**Mia:** Hello.'), [
    { type: 'strong', value: 'Mia:' }, { type: 'text', value: ' Hello.' },
  ]);
  assert.equal(stripAccentMarkdown('**Task 2.** Complete the gaps.'), 'Task 2. Complete the gaps.');
});

test('gap fill rejects malformed counts, ids, markup, and marker mismatches', () => {
  assert.throws(() => normalizeGapFill(component({ type: 'other' })), /type.*kebab-case/);
  assert.throws(() => normalizeGapFill({ ...component(), prompt: 'nope' }), /unsupported fields/);
  assert.throws(() => normalizeGapFill(component({ text: 'No gap.' })), /between 1 and 12 gaps/);
  assert.throws(() => normalizeGapFill(component({ text: '[[Bad Id]]', gaps: component().gaps })), /kebab-case/);
  assert.throws(() => normalizeGapFill(component({ text: '[[mia-do]] only' })), /must match exactly/);
  assert.throws(() => normalizeGapFill(component({ text: '[[mia-do]] and [[mia-do]]' })), /markers must be unique/);
  assert.throws(() => normalizeGapFill(component({
    gaps: [{ id: 'mia-do', answer: 'one', hint: 'do' }, component().gaps[1]],
  })), /unsupported fields/);
  assert.throws(() => normalizeGapFill(component({
    gaps: [{ id: 'mia-do', answer: '**Did**' }, component().gaps[1]],
  })), /HTML or Markdown/);
  assert.throws(() => normalizeGapFill(component({
    gaps: [{ id: 'mia-do', answer: 'Did', example: '**do**' }, component().gaps[1]],
  })), /HTML or Markdown/);
  assert.throws(() => normalizeGapFill(component({ accentColor: '#6545' })), /#RRGGBB/);
  assert.throws(() => normalizeGapFill(component({ instruction: '**Type.**' })), /HTML or Markdown/);
  assert.throws(() => normalizeGapFill(component({
    text: '*Italic* [[mia-do]] and [[leo-play]].',
  })), /only \*\*bold\*\*/);
  assert.throws(() => normalizeGapFill(component({
    text: '**Broken [[mia-do]] and [[leo-play]].',
  })), /unclosed bold/);
  assert.throws(() => normalizeGapFill(component({ title: '[Task](https://example.com)' })), /only \*\*bold\*\*/);
});

test('gap fill answer matching is live-friendly and has no wrong state', () => {
  assert.equal(answersMatch('  DID   you USE to do ', 'did you use to do'), true);
  assert.equal(answersMatch("couldn't get used to", 'couldn’t get used to'), true);
  assert.equal(answersMatch('did you use to', 'did you use to do'), false);
  assert.equal(answersMatch('', 'Did'), false);
});

test('gap fill renders example placeholders and keeps a correct field editable', () => {
  const section = renderGapFill(component({
    title: '**Task 2. Complete the gaps.**',
    accentColor: '#6545F5',
    gaps: [
      { id: 'mia-do', example: 'do', answer: 'did you use to do' },
      { id: 'leo-play', answer: 'Did' },
    ],
  }), createFakeDocument());
  const inputs = byClass(section, 'gap-fill__input');
  const accents = byClass(section, 'gap-fill__accent');
  const fields = byClass(section, 'gap-fill__field');
  assert.equal(section.className, 'gap-fill');
  assert.equal(inputs.length, 2);
  assert.equal(inputs[0].placeholder, 'do');
  assert.equal(inputs[1].placeholder, '');
  assert.equal(accents[0].textContent, 'Task 2. Complete the gaps.');
  assert.equal(accents[1].textContent, 'Mia:');
  assert.equal(inputs[0].disabled, false);

  inputs[0].value = 'DID you use to do';
  (inputs[0].listeners.input || []).forEach(handler => handler());
  assert.equal(fields[0].classList.contains('gap-fill__field--correct'), true);
  assert.equal(byClass(fields[0], 'gap-fill__check')[0].hidden, false);
  assert.equal(inputs[0].disabled, false);

  inputs[0].value = 'wrong';
  (inputs[0].listeners.input || []).forEach(handler => handler());
  assert.equal(fields[0].classList.contains('gap-fill__field--correct'), false);
  assert.equal(fields[0].classList.contains('gap-fill__field--wrong'), false);
});

test('gap fill is registered with editing, example placeholders, and responsive styles', () => {
  const root = path.join(__dirname, '..');
  const source = fs.readFileSync(path.join(root, 'assets', 'components', 'gap-fill.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'gap-fill.css'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'assets', 'lesson-editor.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'lesson-editor.html'), 'utf8');
  assert.match(source, /gap-fill__gaps-editor/);
  assert.match(source, /settings\.onSave/);
  assert.match(source, /input\.placeholder = gap\.example/);
  assert.match(source, /title\.textContent = current\.title/);
  assert.doesNotMatch(source, /input\.disabled/);
  assert.doesNotMatch(css, /field--wrong/);
  assert.match(css, /gap-fill__field--correct/);
  assert.match(css, /--gap-fill-accent/);
  assert.match(css, /gap-fill__input::placeholder/);
  assert.match(css, /text-align:\s*center/);
  assert.match(css, /color-mix\(in srgb, var\(--gap-fill-accent\) 32%, #c5c2d0\)/);
  assert.match(css, /gap-fill--editing/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(editor, /saveGapFill/);
  assert.match(page, /components\/inline-gap-text\.js/);
  assert.match(page, /components\/gap-fill\.js/);
  assert.match(page, /components\/gap-fill\.css/);
});
