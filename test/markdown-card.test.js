'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeMarkdownCard,
  shouldRenderMarkdownCard,
} = require('../assets/components/markdown-card.js');

const example = {
  type: 'markdownCard',
  id: 'target-vocabulary-card',
  title: ' Vocabulary ',
  text: '  1. **to hang out** — spend free time together  ',
  icon: 'book',
  accentColor: '#20a85b',
  studentVisibility: 'controlled',
};

test('markdown card normalizes its stable JSON contract', () => {
  assert.deepEqual(normalizeMarkdownCard(example), {
    type: 'markdownCard',
    id: 'target-vocabulary-card',
    title: 'Vocabulary',
    text: '1. **to hang out** — spend free time together',
    icon: 'book',
    accentColor: '#20A85B',
    studentVisibility: 'controlled',
  });
  for (const icon of ['book', 'check', 'chat']) {
    assert.equal(normalizeMarkdownCard({ ...example, icon }).icon, icon);
  }
  for (const studentVisibility of ['always', 'controlled', 'teacherOnly']) {
    assert.equal(normalizeMarkdownCard({ ...example, studentVisibility }).studentVisibility, studentVisibility);
  }
});

test('markdown card rejects incomplete and unsupported presentation fields', () => {
  assert.throws(() => normalizeMarkdownCard({ ...example, type: 'suggestedAnswers' }), /type.*kebab-case/);
  assert.throws(() => normalizeMarkdownCard({ ...example, id: 'Wrong ID' }), /kebab-case/);
  assert.throws(() => normalizeMarkdownCard({ ...example, title: ' ' }), /title and text/);
  assert.throws(() => normalizeMarkdownCard({ ...example, text: ' ' }), /title and text/);
  assert.throws(() => normalizeMarkdownCard({ ...example, icon: 'star' }), /supported icon/);
  assert.throws(() => normalizeMarkdownCard({ ...example, accentColor: '#fff' }), /#RRGGBB/);
  assert.throws(() => normalizeMarkdownCard({ ...example, studentVisibility: 'sometimes' }), /studentVisibility/);
});

test('markdown card visibility separates teacher and student views', () => {
  assert.equal(shouldRenderMarkdownCard('always', 'teacher', false), true);
  assert.equal(shouldRenderMarkdownCard('always', 'student', false), true);
  assert.equal(shouldRenderMarkdownCard('controlled', 'student', false), false);
  assert.equal(shouldRenderMarkdownCard('controlled', 'student', true), true);
  assert.equal(shouldRenderMarkdownCard('teacherOnly', 'teacher', false), true);
  assert.equal(shouldRenderMarkdownCard('teacherOnly', 'student', true), false);
  assert.throws(() => shouldRenderMarkdownCard('always', 'admin', false), /viewer role/);
});

test('markdown card renderer exposes configurable visuals, markdown editing, and controlled visibility', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets', 'components', 'markdown-card.css'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'assets', 'components', 'markdown-card.js'), 'utf8');
  assert.match(css, /--markdown-card-accent/);
  assert.match(css, /color-mix/);
  assert.match(css, /\.markdown-card__body li::marker/);
  assert.match(source, /createIcon\(doc, current\.icon\)/);
  assert.match(source, /current\.studentVisibility === 'controlled'/);
  assert.match(source, /onStudentVisibilityChange/);
  assert.match(source, /markdown\.editorToMarkdown/);
  assert.match(source, /insertOrderedList/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
