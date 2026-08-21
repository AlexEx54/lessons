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

const sectionedExample = {
  type: 'markdownCard',
  id: 'grammar-quick-rule',
  title: ' Quick Rule ',
  layout: 'columns',
  sections: [
    { id: 'used-to', title: ' USED TO ', text: ' - **past habit** ' },
    { id: 'get-used-to', title: ' GET USED TO ', text: ' - become comfortable ' },
  ],
  icon: 'bulb',
  accentColor: '#6545f5',
  studentVisibility: 'always',
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
  for (const icon of ['book', 'check', 'chat', 'bulb']) {
    assert.equal(normalizeMarkdownCard({ ...example, icon }).icon, icon);
  }
  for (const studentVisibility of ['always', 'controlled', 'teacherOnly']) {
    assert.equal(normalizeMarkdownCard({ ...example, studentVisibility }).studentVisibility, studentVisibility);
  }
});

test('markdown card normalizes sectioned content without changing the legacy contract', () => {
  assert.deepEqual(normalizeMarkdownCard(sectionedExample), {
    type: 'markdownCard',
    id: 'grammar-quick-rule',
    title: 'Quick Rule',
    icon: 'bulb',
    accentColor: '#6545F5',
    studentVisibility: 'always',
    layout: 'columns',
    sections: [
      { id: 'used-to', title: 'USED TO', text: '- **past habit**' },
      { id: 'get-used-to', title: 'GET USED TO', text: '- become comfortable' },
    ],
  });
  assert.equal(normalizeMarkdownCard({ ...sectionedExample, layout: 'stacked' }).layout, 'stacked');
});

test('markdown card rejects incomplete and unsupported presentation fields', () => {
  assert.throws(() => normalizeMarkdownCard({ ...example, type: 'suggestedAnswers' }), /type.*kebab-case/);
  assert.throws(() => normalizeMarkdownCard({ ...example, id: 'Wrong ID' }), /kebab-case/);
  assert.throws(() => normalizeMarkdownCard({ ...example, title: ' ' }), /title and text/);
  assert.throws(() => normalizeMarkdownCard({ ...example, text: ' ' }), /title and text/);
  assert.throws(() => normalizeMarkdownCard({ ...example, icon: 'star' }), /supported icon/);
  assert.throws(() => normalizeMarkdownCard({ ...example, accentColor: '#fff' }), /#RRGGBB/);
  assert.throws(() => normalizeMarkdownCard({ ...example, studentVisibility: 'sometimes' }), /studentVisibility/);
  assert.throws(() => normalizeMarkdownCard({ ...example, sections: sectionedExample.sections, layout: 'columns' }), /exactly one/);
  assert.throws(() => normalizeMarkdownCard({ ...example, text: undefined }), /exactly one/);
  assert.throws(() => normalizeMarkdownCard({ ...example, layout: 'columns' }), /only with sections/);
  assert.throws(() => normalizeMarkdownCard({ ...sectionedExample, layout: 'grid' }), /supported layout/);
  assert.throws(() => normalizeMarkdownCard({ ...sectionedExample, sections: [] }), /between 1 and 3/);
  assert.throws(() => normalizeMarkdownCard({ ...sectionedExample, sections: Array.from({ length: 4 }, (_, index) => ({
    id: `section-${index + 1}`, title: 'Title', text: 'Text',
  })) }), /between 1 and 3/);
  assert.throws(() => normalizeMarkdownCard({ ...sectionedExample, sections: [
    sectionedExample.sections[0], { ...sectionedExample.sections[1], id: 'used-to' },
  ] }), /unique/);
  assert.throws(() => normalizeMarkdownCard({ ...sectionedExample, sections: [
    { ...sectionedExample.sections[0], id: 'Wrong ID' },
  ] }), /kebab-case/);
  assert.throws(() => normalizeMarkdownCard({ ...sectionedExample, sections: [
    { ...sectionedExample.sections[0], title: ' ' },
  ] }), /non-empty title and text/);
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
  assert.match(source, /applyTextSize/);
  assert.match(source, /TEXT_SIZES/);
  assert.match(css, /markdown-card__format--size/);
  assert.match(css, /markdown-card__sections--columns/);
  assert.match(css, /markdown-card__section \+ \.markdown-card__section/);
  assert.match(css, /markdown-card__editor-footer/);
  assert.match(source, /name === 'bulb'/);
  assert.match(source, /freshSectionId/);
  assert.match(source, /Cmd\/Ctrl \+ Enter|event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /sections\.length >= 3/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
