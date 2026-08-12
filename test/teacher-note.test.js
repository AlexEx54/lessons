'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  parseInlineMarkdown,
  parseTeacherNoteMarkdown,
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
