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

test('safe markdown leaves unclosed size markers as plain text', () => {
  assert.deepEqual(parseInlineMarkdown('{l}open and {s}small{/s}'), [
    { type: 'text', value: '{l}open and ' },
    { type: 'size', size: 's', children: [{ type: 'text', value: 'small' }] },
  ]);
});

test('safe markdown round-trips size markers through blocks', () => {
  const markdown = [
    'Start {s}small{/s} and {xl}**huge**{/xl}.',
    '',
    '- {m}medium{/m} item',
    '- {l}large{/l} item',
  ].join('\n');
  assert.equal(serializeMarkdownBlocks(parseMarkdown(markdown)), markdown);
});

test('editor serialization preserves data-md-size spans', () => {
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
      element('span', [text('loud')], { 'data-md-size': 'l' }),
      text(' please'),
    ]),
    element('ul', [
      element('li', [
        element('span', [element('strong', [text('Big')])], { 'data-md-size': 'xl' }),
      ]),
    ]),
  ]);

  assert.equal(editorToMarkdown(editor), [
    'Say {l}loud{/l} please',
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
});

test('renderMarkdownInto emits whitelist data-md-size spans', () => {
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
  renderMarkdownInto(container, 'Hello {l}large{/l} world', documentRef);
  assert.equal(container.childNodes.length, 1);
  const paragraph = container.childNodes[0];
  assert.equal(paragraph.tagName, 'P');
  const sizeSpan = paragraph.childNodes.find(child => child.tagName === 'SPAN');
  assert.ok(sizeSpan);
  assert.equal(sizeSpan.getAttribute('data-md-size'), 'l');
  assert.equal(sizeSpan.childNodes[0].nodeValue, 'large');
});

test('lesson editor loads shared safe-markdown styles', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'lesson-editor.html'), 'utf8');
  assert.match(html, /href="\/assets\/components\/safe-markdown\.css"/);
});
