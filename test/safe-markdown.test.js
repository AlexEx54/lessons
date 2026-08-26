'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TEXT_SIZES,
  editorToMarkdown,
  parseInlineMarkdown,
  parseMarkdown,
  serializeMarkdownBlocks,
} = require('../assets/components/safe-markdown.js');

test('safe markdown exposes the text size presets', () => {
  assert.deepEqual(TEXT_SIZES, ['s', 'm', 'l', 'xl']);
});

test('safe markdown parses nested size markers with bold', () => {
  assert.deepEqual(parseInlineMarkdown('{l}big **bold**{/l}'), [{
    type: 'size',
    size: 'l',
    children: [
      { type: 'text', value: 'big ' },
      { type: 'strong', children: [{ type: 'text', value: 'bold' }] },
    ],
  }]);
  assert.deepEqual(parseInlineMarkdown('**{xl}huge{/xl}**'), [{
    type: 'strong',
    children: [{
      type: 'size',
      size: 'xl',
      children: [{ type: 'text', value: 'huge' }],
    }],
  }]);
});

test('safe markdown parses muted tone with nested size and bold markers', () => {
  assert.deepEqual(parseInlineMarkdown('{muted}{s}Quiet **hint**{/s}{/muted}'), [{
    type: 'tone',
    tone: 'muted',
    children: [{
      type: 'size',
      size: 's',
      children: [
        { type: 'text', value: 'Quiet ' },
        { type: 'strong', children: [{ type: 'text', value: 'hint' }] },
      ],
    }],
  }]);
});

test('safe markdown leaves unclosed size markers as plain text', () => {
  assert.deepEqual(parseInlineMarkdown('{l}open and {s}small{/s}'), [
    { type: 'text', value: '{l}open and ' },
    { type: 'size', size: 's', children: [{ type: 'text', value: 'small' }] },
  ]);
});

test('safe markdown leaves unclosed and unknown tone markers as plain text', () => {
  assert.deepEqual(parseInlineMarkdown('{muted}open'), [
    { type: 'text', value: '{muted}open' },
  ]);
  assert.deepEqual(parseInlineMarkdown('{unknown}plain{/unknown}'), [
    { type: 'text', value: '{unknown}plain{/unknown}' },
  ]);
});

test('safe markdown treats spaced asterisks as unordered list markers', () => {
  const markdown = [
    '* Первый пункт',
    '* Второй с *курсивом*',
    '- Третий пункт',
    '',
    '*курсивный абзац*',
    '',
    '**Say:** Short instruction.',
  ].join('\n');
  const blocks = parseMarkdown(markdown);

  assert.equal(blocks[0].type, 'list');
  assert.equal(blocks[0].ordered, false);
  assert.equal(blocks[0].items.length, 3);
  assert.deepEqual(blocks[0].items[1], [
    { type: 'text', value: 'Второй с ' },
    { type: 'emphasis', children: [{ type: 'text', value: 'курсивом' }] },
  ]);
  assert.deepEqual(blocks[1], {
    type: 'paragraph',
    children: [{ type: 'emphasis', children: [{ type: 'text', value: 'курсивный абзац' }] }],
  });
  assert.deepEqual(blocks[2], {
    type: 'paragraph',
    children: [
      { type: 'strong', children: [{ type: 'text', value: 'Say:' }] },
      { type: 'text', value: ' Short instruction.' },
    ],
  });
  assert.equal(serializeMarkdownBlocks(blocks), [
    '- Первый пункт',
    '- Второй с *курсивом*',
    '- Третий пункт',
    '',
    '*курсивный абзац*',
    '',
    '**Say:** Short instruction.',
  ].join('\n'));
});

test('safe markdown round-trips size markers through blocks', () => {
  const markdown = [
    'Start {s}small{/s} and {muted}{xl}**quiet**{/xl}{/muted}.',
    '',
    '- {m}medium{/m} item',
    '- {l}large{/l} item',
  ].join('\n');
  assert.equal(serializeMarkdownBlocks(parseMarkdown(markdown)), markdown);
});

test('editor serialization preserves data-md-size and data-md-tone spans', () => {
  const text = value => ({ nodeType: 3, nodeValue: value });
  const element = (tagName, childNodes = [], attributes = {}) => ({
    nodeType: 1,
    tagName: tagName.toUpperCase(),
    childNodes,
    children: childNodes.filter(child => child.nodeType === 1),
    getAttribute: (name) => (attributes[name] == null ? null : String(attributes[name])),
  });
  const editor = element('div', [
    element('p', [
      text('Say '),
      element('span', [
        element('span', [text('quiet')], { 'data-md-size': 'l' }),
      ], { 'data-md-tone': 'muted' }),
      text(' please'),
    ]),
    element('ul', [
      element('li', [
        element('span', [element('strong', [text('Big')])], { 'data-md-size': 'xl' }),
      ]),
    ]),
  ]);

  assert.equal(editorToMarkdown(editor), [
    'Say {muted}{l}quiet{/l}{/muted} please',
    '',
    '- {xl}**Big**{/xl}',
  ].join('\n'));
});

test('safe markdown CSS defines relative size presets', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'safe-markdown.css'), 'utf8');
  assert.match(css, /\[data-md-size="s"\]/);
  assert.match(css, /\[data-md-size="m"\]/);
  assert.match(css, /\[data-md-size="l"\]/);
  assert.match(css, /\[data-md-size="xl"\]/);
  assert.match(css, /\[data-md-tone="muted"\] \{ color: #656a80; \}/);
  assert.doesNotMatch(css, /\[data-md-size="s"\][^{]*\{[^}]*color:/s);
});

test('renderMarkdownInto emits whitelist data-md-size and data-md-tone spans', () => {
  const { renderMarkdownInto } = require('../assets/components/safe-markdown.js');
  function createNode(tagName) {
    const node = {
      nodeType: tagName ? 1 : 3,
      tagName: tagName ? tagName.toUpperCase() : undefined,
      childNodes: [],
      attributes: {},
      append(...children) {
        children.forEach((child) => {
          this.childNodes.push(child);
          child.parentNode = this;
        });
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return this.attributes[name] || null; },
      replaceChildren(...children) {
        this.childNodes = [];
        this.append(...children);
      },
    };
    return node;
  }
  const documentRef = {
    createElement: tag => createNode(tag),
    createTextNode: value => ({ nodeType: 3, nodeValue: value }),
  };
  const container = createNode('div');
  renderMarkdownInto(container, 'Hello {muted}{l}quiet{/l}{/muted} world', documentRef);
  assert.equal(container.childNodes.length, 1);
  const paragraph = container.childNodes[0];
  assert.equal(paragraph.tagName, 'P');
  const toneSpan = paragraph.childNodes.find(child => child.tagName === 'SPAN');
  assert.ok(toneSpan);
  assert.equal(toneSpan.getAttribute('data-md-tone'), 'muted');
  const sizeSpan = toneSpan.childNodes.find(child => child.tagName === 'SPAN');
  assert.ok(sizeSpan);
  assert.equal(sizeSpan.getAttribute('data-md-size'), 'l');
  assert.equal(sizeSpan.childNodes[0].nodeValue, 'quiet');
});

test('renderMarkdownInto renders asterisk bullets as an unordered list', () => {
  const { renderMarkdownInto } = require('../assets/components/safe-markdown.js');
  function createNode(tagName) {
    return {
      nodeType: tagName ? 1 : 3,
      tagName: tagName ? tagName.toUpperCase() : undefined,
      childNodes: [],
      append(...children) { this.childNodes.push(...children); },
      setAttribute() {},
      replaceChildren(...children) { this.childNodes = children; },
    };
  }
  const documentRef = {
    createElement: tag => createNode(tag),
    createTextNode: value => ({ nodeType: 3, nodeValue: value }),
  };
  const container = createNode('div');

  renderMarkdownInto(container, '* Первый\n* Второй', documentRef);

  assert.equal(container.childNodes.length, 1);
  assert.equal(container.childNodes[0].tagName, 'UL');
  assert.deepEqual(container.childNodes[0].childNodes.map(item => item.tagName), ['LI', 'LI']);
});

test('lesson editor loads shared safe-markdown styles', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'lesson-editor.html'), 'utf8');
  assert.match(html, /href="\/assets\/components\/safe-markdown\.css"/);
});
