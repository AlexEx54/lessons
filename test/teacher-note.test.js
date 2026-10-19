'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  editorToMarkdown,
  normalizeTeacherNote,
  parseInlineMarkdown,
  parseTeacherNoteMarkdown,
  renderTeacherNote,
  serializeTeacherNoteBlocks,
} = require('../assets/components/teacher-note.js');
const { normalizeTeacherNoteBlock, renderTeacherNoteBlock } = require('../assets/components/teacher-note-block.js');

// Just enough DOM for the editors: events bubble, text nodes read back through nodeValue.
function createDocument() {
  const textNode = value => ({ nodeType: 3, nodeValue: String(value), childNodes: [] });
  function element(tag) {
    const node = {
      nodeType: 1,
      tagName: tag.toUpperCase(),
      childNodes: [],
      attributes: {},
      dataset: {},
      listeners: {},
      style: { setProperty() {} },
      className: '',
      title: '',
      value: '',
      hidden: false,
      disabled: false,
      get children() { return this.childNodes.filter(child => child.nodeType === 1); },
      get textContent() {
        return this.childNodes.map(child => (child.nodeType === 3 ? child.nodeValue : child.textContent)).join('');
      },
      set textContent(value) { this.replaceChildren(...(value ? [textNode(value)] : [])); },
      append(...nodes) {
        nodes.forEach((child) => { child.parentNode = this; });
        this.childNodes.push(...nodes);
      },
      replaceChildren(...nodes) {
        this.childNodes = [];
        this.append(...nodes);
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] ?? null; },
      removeAttribute(name) { delete this.attributes[name]; },
      addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
      dispatch(type, init = {}) {
        const event = { type, ...init, preventDefault() {} };
        for (let target = this; target; target = target.parentNode) {
          (target.listeners[type] || []).forEach(listener => listener(event));
        }
      },
      click() { if (!this.disabled) this.dispatch('click'); },
      focus() {},
      querySelector(selector) { return byClass(this, selector.slice(1))[0] || null; },
    };
    node.classList = {
      tokens: () => new Set(node.className.split(/\s+/).filter(Boolean)),
      toggle(name, on = !this.contains(name)) {
        const tokens = this.tokens();
        if (on) tokens.add(name);
        else tokens.delete(name);
        node.className = [...tokens].join(' ');
      },
      add(name) { this.toggle(name, true); },
      remove(name) { this.toggle(name, false); },
      contains(name) { return this.tokens().has(name); },
    };
    return node;
  }
  return {
    createElement: element,
    createElementNS: (_namespace, tag) => element(tag),
    createTextNode: textNode,
  };
}

function byClass(node, className) {
  return node.childNodes.flatMap(child => [
    ...(child.classList?.contains(className) ? [child] : []),
    ...(child.nodeType === 1 ? byClass(child, className) : []),
  ]);
}

// What the admin types: a new value of the title input, or the text of an editable body.
function type(field, value, doc) {
  if (field.tagName === 'INPUT') {
    field.value = value;
  } else {
    const paragraph = doc.createElement('p');
    paragraph.textContent = value;
    field.replaceChildren(paragraph);
  }
  field.dispatch('input');
}

const subBlock = (id, overrides = {}) => ({
  type: 'teacherNoteBlock', id, title: 'Check', titleColor: '#6545F5', icon: 'chat', text: 'Listen.', ...overrides,
});

test('teacher note accepts legacy text and composite notes with optional custom text', () => {
  assert.deepEqual(normalizeTeacherNote({ text: ' Legacy ' }), { text: 'Legacy', blocks: [] });
  const composite = normalizeTeacherNote({
    blocks: [{
      type: 'teacherNoteBlock',
      id: 'pronunciation-check',
      title: ' Pronunciation Check ',
      titleColor: '#6545f5',
      icon: 'audio',
      text: ' Listen. ',
      tip: { text: ' Repeat. ' },
    }],
  });
  assert.equal(composite.text, '');
  assert.deepEqual(composite.blocks[0], {
    type: 'teacherNoteBlock',
    id: 'pronunciation-check',
    title: 'Pronunciation Check',
    titleColor: '#6545F5',
    icon: 'audio',
    text: 'Listen.',
    tip: { text: 'Repeat.' },
  });
});

test('teacher note rejects empty content, duplicate blocks, and malformed nested blocks', () => {
  assert.throws(() => normalizeTeacherNote({}), /text or at least one block/);
  const valid = {
    type: 'teacherNoteBlock', id: 'same-block', title: 'Title', titleColor: '#6545F5', icon: 'chat', text: 'Text',
  };
  assert.throws(() => normalizeTeacherNote({ blocks: [valid, valid] }), /unique/);
  assert.throws(() => normalizeTeacherNoteBlock({ ...valid, titleColor: 'purple' }), /#RRGGBB/);
  assert.throws(() => normalizeTeacherNoteBlock({ ...valid, icon: 'bell' }), /supported icon/);
  assert.throws(() => normalizeTeacherNoteBlock({ ...valid, tip: {} }), /tip/);
  assert.throws(() => normalizeTeacherNoteBlock({ ...valid, type: 'textPanel' }), /type/);
});

test('teacher note parser supports bold, italic, paragraphs, and bullet lists', () => {
  assert.deepEqual(parseTeacherNoteMarkdown([
    '- Первый пункт',
    '- Второй с *курсивом*',
    '',
    '**Say:** Short instruction.',
  ].join('\n')), [
    {
      type: 'list',
      ordered: false,
      items: [
        [{ type: 'text', value: 'Первый пункт' }],
        [
          { type: 'text', value: 'Второй с ' },
          { type: 'emphasis', children: [{ type: 'text', value: 'курсивом' }] },
        ],
      ],
    },
    {
      type: 'paragraph',
      children: [
        { type: 'strong', children: [{ type: 'text', value: 'Say:' }] },
        { type: 'text', value: ' Short instruction.' },
      ],
    },
  ]);
});

test('teacher note parser leaves HTML and unclosed markers as plain text', () => {
  assert.deepEqual(parseInlineMarkdown('<script>alert(1)</script> **open'), [
    { type: 'text', value: '<script>alert(1)</script> **open' },
  ]);
});

test('teacher note markdown round-trips supported formatting', () => {
  const markdown = [
    'Plain with <tag> & symbols.',
    '',
    '- **Bold** item',
    '- *Italic* and ***both***',
  ].join('\n');
  assert.equal(serializeTeacherNoteBlocks(parseTeacherNoteMarkdown(markdown)), markdown);
});

test('safe markdown parses and canonically serializes numbered lists', () => {
  const markdown = '8. First\n3. **Second**\n12. Third';
  const blocks = parseTeacherNoteMarkdown(markdown);
  assert.equal(blocks[0].type, 'list');
  assert.equal(blocks[0].ordered, true);
  assert.equal(serializeTeacherNoteBlocks(blocks), '1. First\n2. **Second**\n3. Third');
});

test('teacher note markdown preserves intentional extra blank lines between blocks', () => {
  const markdown = 'Say this.\n\n\n- First\n- Second';
  const blocks = parseTeacherNoteMarkdown(markdown);
  assert.equal(blocks[1].type, 'spacer');
  assert.equal(serializeTeacherNoteBlocks(blocks), markdown);
});

test('editor serialization keeps supported formatting and strips pasted HTML structure', () => {
  const text = value => ({ nodeType: 3, nodeValue: value });
  const element = (tagName, childNodes = []) => ({
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes,
    children: childNodes.filter(child => child.nodeType === 1),
  });
  const editor = element('div', [
    element('p', [text('Say '), element('strong', [text('hello')]), text(' & '), element('em', [text('listen')])]),
    element('ul', [
      element('li', [text('First')]),
      element('li', [element('strong', [element('em', [text('Important')])])]),
    ]),
    element('div', [element('script', [text('alert(1)')]), element('img')]),
  ]);

  assert.equal(editorToMarkdown(editor), [
    'Say **hello** & *listen*',
    '',
    '- First',
    '- ***Important***',
    '',
    'alert(1)',
  ].join('\n'));
});

test('editor serialization preserves a Safari list wrapped in a div', () => {
  const text = value => ({ nodeType: 3, nodeValue: value });
  const element = (tagName, childNodes = []) => ({
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes,
    children: childNodes.filter(child => child.nodeType === 1),
  });
  const editor = element('div', [
    element('p', [text('Intro')]),
    element('div', [
      element('ul', [
        element('li', [text('1')]),
        element('li', [text('2')]),
      ]),
    ]),
  ]);

  assert.equal(editorToMarkdown(editor), 'Intro\n\n- 1\n- 2');
});

test('editor serialization preserves an ordered Safari list wrapped in a div', () => {
  const text = value => ({ nodeType: 3, nodeValue: value });
  const element = (tagName, childNodes = []) => ({
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes,
    children: childNodes.filter(child => child.nodeType === 1),
  });
  const editor = element('div', [
    element('div', [element('ol', [
      element('li', [text('First')]),
      element('li', [text('Second')]),
    ])]),
  ]);

  assert.equal(editorToMarkdown(editor), '1. First\n2. Second');
});

test('editor serialization preserves empty Safari blocks used for spacing', () => {
  const text = value => ({ nodeType: 3, nodeValue: value });
  const element = (tagName, childNodes = []) => ({
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes,
    children: childNodes.filter(child => child.nodeType === 1),
  });
  const editor = element('div', [
    element('p', [text('Say this.')]),
    element('div', [element('br')]),
    element('div', [element('ul', [element('li', [text('First')])])]),
  ]);

  assert.equal(editorToMarkdown(editor), 'Say this.\n\n\n- First');
});

test('teacher note styles separate paragraph and list blocks and color Safari bold text', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'teacher-note.css'), 'utf8');
  assert.match(css, /\.teacher-note__text p \+ ul,[\s\S]*\.teacher-note__text p \+ ol \{ margin-top: 13px; \}/);
  assert.match(css, /\.teacher-note__spacer \{ height: 13px; \}/);
  assert.match(css, /\.teacher-note__text strong,\s*\.teacher-note__text b \{ color: #173b7a;/);
  assert.match(css, /\.teacher-note__blocks \{[\s\S]*display: grid;/);
  assert.match(css, /\.teacher-note__format--size/);
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'teacher-note.js'), 'utf8');
  assert.match(source, /applyTextSize/);
  const blockCss = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'teacher-note-block.css'), 'utf8');
  assert.match(blockCss, /--teacher-note-block-accent/);
  assert.match(blockCss, /\.teacher-note-block__tip/);
});

test('a sub-block tells of unsaved edits of its title, text and tip until it is saved or cancelled', async () => {
  const doc = createDocument();
  const changes = [];
  let saved = null;
  const card = renderTeacherNoteBlock(subBlock('pronunciation-check', { tip: { text: 'Repeat.' } }), {
    editable: true,
    onSave: async (next) => { saved = next; return { ...subBlock(next.id), ...next }; },
    onDirtyChange: (dirty, id) => changes.push([dirty, id]),
  }, doc);
  const edit = byClass(card, 'teacher-note-block__edit')[0];
  const body = byClass(card, 'teacher-note-block__body')[0];

  edit.click();
  const title = byClass(card, 'teacher-note-block__title-input')[0];
  type(title, 'Sound check', doc);
  assert.deepEqual(changes.at(-1), [true, 'pronunciation-check']);
  type(title, 'Check', doc);
  assert.deepEqual(changes.at(-1), [false, 'pronunciation-check'], 'typed back, the edit holds nothing');
  type(body, 'Listen twice.', doc);
  assert.deepEqual(changes.at(-1), [true, 'pronunciation-check']);
  card.dispatch('keydown', { key: 'Escape' });
  assert.deepEqual(changes.at(-1), [false, 'pronunciation-check']);
  assert.equal(editorToMarkdown(body), 'Listen.');

  edit.click();
  type(byClass(card, 'teacher-note-block__tip-text')[0], 'Repeat it.', doc);
  assert.deepEqual(changes.at(-1), [true, 'pronunciation-check']);
  edit.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, {
    id: 'pronunciation-check', title: 'Check', titleColor: '#6545F5', icon: 'chat', text: 'Listen.', tip: { text: 'Repeat it.' },
  });
  assert.deepEqual(changes.at(-1), [false, 'pronunciation-check']);
});

test('a sub-block changes its icon and color, takes its tip away and gets a new one back', async () => {
  const doc = createDocument();
  const changes = [];
  const errors = [];
  const saved = [];
  const card = renderTeacherNoteBlock(subBlock('pronunciation-check', { tip: { text: 'Repeat.' } }), {
    editable: true,
    onSave: async (next) => { saved.push(next); return { type: 'teacherNoteBlock', ...next }; },
    onDirtyChange: dirty => changes.push(dirty),
    onError: message => errors.push(message),
  }, doc);
  const edit = byClass(card, 'teacher-note-block__edit')[0];
  edit.click();
  byClass(card, 'teacher-note-block__icon-choice').find(choice => choice.dataset.icon === 'trophy').click();
  assert.equal(changes.at(-1), true);
  byClass(card, 'teacher-note-block__color-choice').find(choice => choice.dataset.color === '#E0812D').click();
  byClass(card, 'teacher-note-block__remove-tip')[0].click();
  assert.equal(byClass(card, 'teacher-note-block__tip').length, 0);
  edit.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved.at(-1), {
    id: 'pronunciation-check', title: 'Check', titleColor: '#E0812D', icon: 'trophy', text: 'Listen.', tip: null,
  });
  assert.equal(byClass(card, 'teacher-note-block__icon')[0].childNodes[0].attributes['data-icon'], 'trophy');
  assert.equal(byClass(card, 'teacher-note-block__add-tip')[0].hidden, true, 'no + Tip outside the editor');

  edit.click();
  byClass(card, 'teacher-note-block__add-tip')[0].click();
  edit.click();
  assert.deepEqual(errors, ['Заполните Tip или уберите его.']);
  type(byClass(card, 'teacher-note-block__tip-text')[0], 'Say it twice.', doc);
  edit.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved.at(-1).tip, { text: 'Say it twice.' });
});

test('a cancelled sub-block edit brings back its icon, color and tip', () => {
  const doc = createDocument();
  const card = renderTeacherNoteBlock(subBlock('pronunciation-check', { tip: { text: 'Repeat.' } }), {
    editable: true, onSave: async () => {},
  }, doc);
  byClass(card, 'teacher-note-block__edit')[0].click();
  byClass(card, 'teacher-note-block__icon-choice').find(choice => choice.dataset.icon === 'book').click();
  byClass(card, 'teacher-note-block__remove-tip')[0].click();
  card.dispatch('keydown', { key: 'Escape' });
  assert.equal(byClass(card, 'teacher-note-block__icon')[0].childNodes[0].attributes['data-icon'], 'chat');
  assert.equal(editorToMarkdown(byClass(card, 'teacher-note-block__tip-text')[0]), 'Repeat.');
});

test('a sub-block added in the note editor is saved with the note after the kept ones', async () => {
  const doc = createDocument();
  const errors = [];
  let sent = null;
  const note = renderTeacherNote({ id: 'warm-up-note', blocks: [subBlock('first-check'), subBlock('second-check')] }, {
    onSave: async (changes) => { sent = changes; return null; },
    onError: message => errors.push(message),
  }, doc);
  const noteEdit = byClass(note, 'teacher-note__edit')[0];
  noteEdit.click();
  const add = byClass(note, 'teacher-note__add-block')[0];
  assert.equal(add.hidden, false);
  add.click();
  add.click();
  let fresh = byClass(note, 'teacher-note-block').slice(2);
  assert.deepEqual(fresh.map(card => card.dataset.blockId), ['warm-up-note-block-3', 'warm-up-note-block-4']);
  assert.equal(byClass(fresh[0], 'teacher-note-block__edit').length, 0, 'the note saves it');

  type(byClass(fresh[0], 'teacher-note-block__title-input')[0], 'Timing', doc);
  byClass(fresh[0], 'teacher-note-block__remove')[0].click();
  assert.equal(byClass(note, 'teacher-note-block').length, 3);
  byClass(byClass(note, 'teacher-note-block')[0], 'teacher-note-block__remove')[0].click();
  fresh = byClass(note, 'teacher-note-block').at(-1);
  noteEdit.click();
  assert.deepEqual(errors, ['Заполните заголовок и текст подблока.']);

  type(byClass(fresh, 'teacher-note-block__title-input')[0], 'Timing', doc);
  type(byClass(fresh, 'teacher-note-block__body')[0], 'Keep it short.', doc);
  byClass(fresh, 'teacher-note-block__icon-choice').find(choice => choice.dataset.icon === 'key').click();
  noteEdit.click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(sent, {
    text: null,
    retainedBlockIds: ['second-check'],
    addedBlocks: [{ id: 'warm-up-note-block-4', title: 'Timing', titleColor: '#6545F5', icon: 'key', text: 'Keep it short.', tip: null }],
  });
  assert.deepEqual(byClass(note, 'teacher-note-block').map(card => card.dataset.blockId), ['second-check', 'warm-up-note-block-4']);
  assert.equal(add.hidden, true);
});

test('a cancelled note editor drops the sub-blocks added in it', () => {
  const doc = createDocument();
  const changes = [];
  const note = renderTeacherNote({ id: 'warm-up-note', text: 'Own text.' }, {
    onSave: async () => {},
    onDirtyChange: dirty => changes.push(dirty),
  }, doc);
  byClass(note, 'teacher-note__edit')[0].click();
  byClass(note, 'teacher-note__add-block')[0].click();
  assert.equal(changes.at(-1), true);
  note.dispatch('keydown', { key: 'Escape' });
  assert.equal(changes.at(-1), false);
  assert.equal(byClass(note, 'teacher-note-block').length, 0);
});

test('teacher note stays dirty while any sub-block edit is open and keeps its own editor shut', () => {
  const doc = createDocument();
  const changes = [];
  const note = renderTeacherNote({ id: 'warm-up-note', blocks: [subBlock('first-check'), subBlock('second-check')] }, {
    onSave: async () => {},
    onDirtyChange: (dirty, id) => changes.push([dirty, id]),
  }, doc);
  const noteEdit = byClass(note, 'teacher-note__edit')[0];
  const [first, second] = byClass(note, 'teacher-note-block');

  byClass(first, 'teacher-note-block__edit')[0].click();
  type(byClass(first, 'teacher-note-block__body')[0], 'First change.', doc);
  byClass(second, 'teacher-note-block__edit')[0].click();
  type(byClass(second, 'teacher-note-block__body')[0], 'Second change.', doc);
  assert.deepEqual(changes.at(-1), [true, 'warm-up-note']);
  assert.equal(noteEdit.disabled, true, 'the note would paint the open sub-blocks away');

  first.dispatch('keydown', { key: 'Escape' });
  assert.deepEqual(changes.at(-1), [true, 'warm-up-note'], 'the second sub-block is still open');
  assert.equal(noteEdit.disabled, true);
  second.dispatch('keydown', { key: 'Escape' });
  assert.deepEqual(changes.at(-1), [false, 'warm-up-note']);
  assert.equal(noteEdit.disabled, false);
});

test('a saved sub-block keeps its text when the own edit of the note is cancelled', async () => {
  const doc = createDocument();
  let stored = { id: 'warm-up-note', text: 'Own text.', blocks: [subBlock('first-check')] };
  const note = renderTeacherNote(stored, {
    onSave: async ({ blocks: [update] }) => {
      stored = { ...stored, blocks: stored.blocks.map(block => (block.id === update.id ? { ...block, ...update } : block)) };
      return stored;
    },
  }, doc);
  const block = byClass(note, 'teacher-note-block')[0];
  byClass(block, 'teacher-note-block__edit')[0].click();
  type(byClass(block, 'teacher-note-block__body')[0], 'Listen twice.', doc);
  byClass(block, 'teacher-note-block__edit')[0].click();
  await new Promise(resolve => setImmediate(resolve));

  byClass(note, 'teacher-note__edit')[0].click();
  note.dispatch('keydown', { key: 'Escape' });
  assert.equal(editorToMarkdown(byClass(note, 'teacher-note-block__body')[0]), 'Listen twice.');
});
