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
  for (const icon of ['book', 'check', 'chat', 'bulb', 'key', 'pencil', 'lifeRing', 'trophy']) {
    assert.equal(normalizeMarkdownCard({ ...example, icon }).icon, icon);
  }
  for (const studentVisibility of ['always', 'controlled', 'teacherOnly']) {
    assert.equal(normalizeMarkdownCard({ ...example, studentVisibility }).studentVisibility, studentVisibility);
  }
  assert.equal(normalizeMarkdownCard({ ...example, headingSize: 'large' }).headingSize, 'large');
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
  assert.throws(() => normalizeMarkdownCard({ ...example, headingSize: 'huge' }), /headingSize/);
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
  assert.equal(normalizeMarkdownCard({ ...sectionedExample, sections: [
    { ...sectionedExample.sections[0], title: ' ' },
  ] }).sections[0].title, '');
  assert.throws(() => normalizeMarkdownCard({ ...sectionedExample, sections: [
    { ...sectionedExample.sections[0], text: ' ' },
  ] }), /non-empty text/);
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
  assert.match(source, /createIcon\(doc, look\.icon\)/);
  assert.match(source, /studentVisibility !== 'controlled'/);
  assert.match(source, /onStudentVisibilityChange/);
  assert.match(source, /markdown\.editorToMarkdown/);
  assert.match(source, /insertOrderedList/);
  assert.match(source, /applyTextSize/);
  assert.match(source, /TEXT_SIZES/);
  assert.match(css, /markdown-card__format--size/);
  assert.match(css, /markdown-card__sections--columns/);
  assert.match(css, /data-heading-size="large"[^}]*markdown-card__heading[^}]*font-size:\s*16px/);
  assert.match(css, /data-heading-size="large"[^}]*markdown-card__section-title[^}]*font-size:\s*14px/);
  assert.match(css, /markdown-card__section \+ \.markdown-card__section/);
  assert.match(css, /markdown-card__editor-footer/);
  assert.match(source, /name === 'bulb'/);
  assert.match(source, /freshSectionId/);
  assert.match(source, /Cmd\/Ctrl \+ Enter|event\.metaKey \|\| event\.ctrlKey/);
  assert.match(source, /sections\.length >= 3/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test('live visibility updates reuse the same card and button without emitting actions', () => {
  const vm = require('node:vm');
  const { createDocument } = require('./helpers/lesson-dom.js');
  const document = createDocument();
  const createElement = document.createElement;
  document.createElement = tag => {
    const node = createElement(tag);
    node.style.setProperty = () => {};
    node.removeAttribute = key => { delete node.attributes[key]; };
    return node;
  };
  const window = { document, SafeMarkdown: { renderMarkdownInto(node, text) { node.textContent = text; } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/components/markdown-card.js'), 'utf8'), { window });
  const changes = [];
  const card = window.MarkdownCardComponent.renderMarkdownCard(example, {
    onStudentVisibilityChange: value => changes.push(value),
  });
  const button = card.querySelector('.markdown-card__visibility');
  card.updateStudentVisibility(true);
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(changes, []);
  card.setVisibilityInteractive(false);
  button.click();
  assert.deepEqual(changes, []);
  card.setVisibilityInteractive(true);
  button.click();
  assert.deepEqual(changes, [false]);
  assert.equal(card.querySelector('.markdown-card__visibility'), button);
  card.updateStudentVisibility(true);
  assert.deepEqual(changes, [false]);
});

// A card rendered with the minimal DOM; the stub markdown keeps text as it is.
function renderInFakeDom(data, options) {
  const vm = require('node:vm');
  const { createDocument } = require('./helpers/lesson-dom.js');
  const document = createDocument();
  const createElement = document.createElement;
  document.createElement = tag => Object.assign(createElement(tag), { focus() {} });
  const window = {
    document,
    SafeMarkdown: {
      renderMarkdownInto(node, text) { node.textContent = text; },
      editorToMarkdown: node => node.textContent.trim(),
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/components/markdown-card.js'), 'utf8'), { window });
  return window.MarkdownCardComponent.renderMarkdownCard(data, options);
}

const pressed = buttons => buttons.filter(button => button.getAttribute('aria-pressed') === 'true');

test('card editor changes icon, accent color and student visibility', async () => {
  const saved = [];
  const card = renderInFakeDom({ ...example, accentColor: '#1EAD58', studentVisibility: 'always' }, {
    onSave: async changes => { saved.push(changes); return changes; },
  });
  const style = card.querySelector('.markdown-card__style');
  const visibility = card.querySelector('.markdown-card__visibility');
  const colors = card.querySelectorAll('.markdown-card__color-choice');
  assert.equal(style.hidden, true);
  assert.equal(visibility.hidden, true);
  // A color outside the palette stays offered, chosen.
  assert.deepEqual(colors.map(button => button.dataset.color), ['#6545F5', '#20A85B', '#3563D4', '#E5AD16', '#1EAD58']);
  assert.deepEqual(pressed(colors).map(button => button.dataset.color), ['#1EAD58']);

  card.querySelector('.markdown-card__edit').click();
  assert.equal(style.hidden, false);
  card.querySelectorAll('.markdown-card__icon-choice').find(button => button.dataset.icon === 'trophy').click();
  colors[0].click();
  card.querySelectorAll('.markdown-card__visibility-choice').find(button => button.dataset.studentVisibility === 'controlled').click();
  assert.equal(card.dataset.icon, 'trophy');
  assert.equal(card.style['--markdown-card-accent'], '#6545F5');
  assert.equal(visibility.hidden, true, 'visibility applies once the card is saved');
  assert.match(card.className, /markdown-card--dirty/);

  card.querySelector('.markdown-card__edit').click();
  await new Promise(resolve => setImmediate(resolve));
  // The changes come from the card's own realm.
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), [{
    title: 'Vocabulary',
    icon: 'trophy',
    accentColor: '#6545F5',
    studentVisibility: 'controlled',
    text: '1. **to hang out** — spend free time together',
  }]);
  assert.equal(style.hidden, true);
  assert.equal(visibility.hidden, false);
  assert.equal(card.dataset.studentVisibility, 'controlled');
});

test('cancelled card edit restores its look', () => {
  const card = renderInFakeDom(example, { onSave: async changes => changes });
  card.querySelector('.markdown-card__edit').click();
  card.querySelectorAll('.markdown-card__icon-choice').find(button => button.dataset.icon === 'key').click();
  card.querySelector('.markdown-card__cancel').click();
  assert.equal(card.dataset.icon, 'book');
  assert.equal(card.style['--markdown-card-accent'], '#20A85B');
  assert.deepEqual(pressed(card.querySelectorAll('.markdown-card__icon-choice')).map(button => button.dataset.icon), ['book']);
  assert.doesNotMatch(card.className, /markdown-card--dirty/);
});

test('section pointer addresses agree across roles and survive section reordering', () => {
  const { renderMarkdownCard } = require('../assets/components/markdown-card.js');
  const doc = require('./helpers/lesson-dom').createDocument();
  for (const viewerRole of ['teacher', 'student']) {
    for (const sections of [sectionedExample.sections, [...sectionedExample.sections].reverse()]) {
      const node = renderMarkdownCard({ ...sectionedExample, sections }, { viewerRole }, doc);
      assert.deepEqual(node.querySelectorAll('li').map(item => item.dataset.pointerPart).sort(),
        ['section:get-used-to:0', 'section:used-to:0']);
    }
  }
});
