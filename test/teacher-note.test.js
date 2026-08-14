'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  editorToMarkdown,
  parseInlineMarkdown,
  parseTeacherNoteMarkdown,
  serializeTeacherNoteBlocks,
} = require('../assets/components/teacher-note.js');

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
  assert.match(css, /\.teacher-note__body p \+ ul,[\s\S]*\.teacher-note__body p \+ ol \{ margin-top: 13px; \}/);
  assert.match(css, /\.teacher-note__spacer \{ height: 13px; \}/);
  assert.match(css, /\.teacher-note__body strong,\s*\.teacher-note__body b \{ color: #173b7a;/);
});
