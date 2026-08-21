'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { compactParts, parseMarkedText, serializeMarkedText, splitParagraphs } = require('../assets/components/inline-gap-text.js');

test('inline gap text parses, serializes, and preserves line structure', () => {
  const source = 'Line one [[first]].\nLine two.\n\nNext [[second]].';
  const parts = parseMarkedText(source, { label: 'Example', minimum: 1, maximum: 3 });
  assert.deepEqual(parts.filter(part => part.type === 'gap').map(part => part.token), ['first', 'second']);
  assert.equal(serializeMarkedText(parts), source);
  assert.equal(splitParagraphs(parts).length, 2);
  assert.deepEqual(compactParts([{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }, { type: 'gap', token: ' x ' }]), [
    { type: 'text', text: 'AB' }, { type: 'gap', token: 'x' },
  ]);
});

test('inline gap text rejects empty, unmatched, and malformed markers', () => {
  assert.throws(() => parseMarkedText('', { label: 'Example' }), /requires text/);
  assert.throws(() => parseMarkedText('No gaps', { label: 'Example' }), /between 1 and 12 gaps/);
  assert.throws(() => parseMarkedText('A [[]].', { label: 'Example' }), /empty gaps/);
  assert.throws(() => parseMarkedText('A [[broken].', { label: 'Example' }), /unmatched gap markers/);
  assert.throws(() => parseMarkedText('A [[line\nbreak]].', { label: 'Example' }), /line breaks/);
});
