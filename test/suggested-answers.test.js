'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeSuggestedAnswers,
  shouldRenderSuggestedAnswers,
} = require('../assets/components/suggested-answers.js');

test('suggested answers normalizes its stable JSON contract', () => {
  assert.deepEqual(normalizeSuggestedAnswers({
    type: 'suggestedAnswers',
    id: 'lead-in-suggested-answers',
    text: '  1. First\n2. **Second**  ',
  }), {
    type: 'suggestedAnswers',
    id: 'lead-in-suggested-answers',
    text: '1. First\n2. **Second**',
  });
  assert.throws(() => normalizeSuggestedAnswers({
    type: 'textPanel', id: 'lead-in-suggested-answers', text: 'Answer',
  }), /type.*kebab-case/);
  assert.throws(() => normalizeSuggestedAnswers({
    type: 'suggestedAnswers', id: 'Wrong ID', text: 'Answer',
  }), /kebab-case/);
  assert.throws(() => normalizeSuggestedAnswers({
    type: 'suggestedAnswers', id: 'answers', text: '   ',
  }), /non-empty/);
});

test('suggested answers visibility contract separates teacher and student views', () => {
  assert.equal(shouldRenderSuggestedAnswers('teacher', false), true);
  assert.equal(shouldRenderSuggestedAnswers('teacher', true), true);
  assert.equal(shouldRenderSuggestedAnswers('student', false), false);
  assert.equal(shouldRenderSuggestedAnswers('student', true), true);
  assert.throws(() => shouldRenderSuggestedAnswers('admin', true), /supported viewer role/);
});

test('suggested answers styles and renderer expose teacher controls without student persistence', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'assets/components/suggested-answers.css'), 'utf8');
  const source = fs.readFileSync(path.join(root, 'assets/components/suggested-answers.js'), 'utf8');
  assert.match(css, /--suggested-accent: #1ead58/);
  assert.match(css, /\.suggested-answers__body li::marker/);
  assert.match(source, /viewerRole === 'teacher'/);
  assert.match(source, /onStudentVisibilityChange/);
  assert.match(source, /markdown\.editorToMarkdown/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
