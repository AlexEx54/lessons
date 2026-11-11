'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  foregroundForBackground,
  normalizeIllustratedTextPanel,
  normalizeTextPanel,
  pictureRenderMode,
} = require('../assets/components/text-panel.js');

function panel(overrides = {}) {
  return {
    type: 'textPanel',
    id: 'lead-in-message',
    text: '**Alex:** Hello!',
    backgroundColor: '#252A38',
    ...overrides,
  };
}

function illustratedPanel(overrides = {}) {
  return panel({ type: 'illustratedTextPanel', ...overrides });
}

test('plain text panel normalizes text and HEX color without picture fields', () => {
  assert.deepEqual(normalizeTextPanel(panel({ backgroundColor: ' #abcdef ' })), {
    type: 'textPanel',
    id: 'lead-in-message',
    text: '**Alex:** Hello!',
    backgroundColor: '#ABCDEF',
    accentColor: '#171A2B',
    showBorder: true,
  });
  assert.throws(() => normalizeTextPanel(panel({ leadingPicture: { imagePrompt: 'Avatar' } })), /does not support picture/);
});

test('illustrated text panel normalizes independent optional pictures', () => {
  const leading = normalizeIllustratedTextPanel(illustratedPanel({
    leadingPicture: { imagePrompt: ' Avatar ', imageSrc: ' /avatar.png ' },
  }));
  assert.deepEqual(leading.leadingPicture, { imagePrompt: 'Avatar', imageSrc: '/avatar.png' });
  assert.equal(leading.trailingPicture, null);

  const trailing = normalizeIllustratedTextPanel(illustratedPanel({ trailingPicture: { imagePrompt: 'Symbol' } }));
  assert.equal(trailing.leadingPicture, null);
  assert.deepEqual(trailing.trailingPicture, { imagePrompt: 'Symbol' });

  const both = normalizeIllustratedTextPanel(illustratedPanel({
    leadingPicture: { imagePrompt: 'Avatar' },
    trailingPicture: { imagePrompt: 'Symbol' },
  }));
  assert.ok(both.leadingPicture && both.trailingPicture);
});

test('text panel types reject invalid ids, empty content, colors, and incomplete pictures', () => {
  assert.throws(() => normalizeTextPanel(panel({ type: 'other' })), /kebab-case id/);
  assert.throws(() => normalizeTextPanel(panel({ id: 'Wrong ID' })), /kebab-case id/);
  assert.throws(() => normalizeTextPanel(panel({ text: ' ' })), /requires text/);
  assert.throws(() => normalizeTextPanel(panel({ backgroundColor: '#123' })), /#RRGGBB/);
  assert.throws(() => normalizeTextPanel(panel({ accentColor: '#123' })), /accentColor/);
  assert.throws(() => normalizeTextPanel(panel({ showBorder: 'false' })), /boolean/);
  assert.throws(() => normalizeIllustratedTextPanel(illustratedPanel({ type: 'textPanel' })), /kebab-case id/);
  assert.throws(() => normalizeIllustratedTextPanel(illustratedPanel({ leadingPicture: {} })), /imagePrompt/);
  assert.throws(() => normalizeIllustratedTextPanel(illustratedPanel({ trailingPicture: 'image' })), /must be an object/);
});

test('text panel chooses the higher-contrast foreground color', () => {
  assert.equal(foregroundForBackground('#FFFFFF'), '#171a2b');
  assert.equal(foregroundForBackground('#000000'), '#ffffff');
  assert.equal(foregroundForBackground('#252A38'), '#ffffff');
  assert.throws(() => foregroundForBackground('black'), /invalid HEX/);
});

test('empty picture slots appear only while the panel is being edited', () => {
  const emptySlot = { imagePrompt: 'Gaming avatar' };
  const loadedSlot = { ...emptySlot, imageSrc: '/avatar.png' };

  assert.equal(pictureRenderMode(null, false, true), 'hidden');
  assert.equal(pictureRenderMode(emptySlot, false, true), 'hidden');
  assert.equal(pictureRenderMode(emptySlot, true, false), 'hidden');
  assert.equal(pictureRenderMode(emptySlot, true, true), 'placeholder');
  assert.equal(pictureRenderMode(loadedSlot, false, true), 'image');
  assert.equal(pictureRenderMode(loadedSlot, true, true), 'image');
});

test('text panel CSS keeps pictures beside text and defines no phantom slot columns', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'text-panel.css'), 'utf8');
  assert.match(css, /\.text-panel__layout \{[^}]*display: flex;/s);
  assert.match(css, /\.text-panel__picture img \{[^}]*object-fit: contain;/s);
  assert.match(css, /\.text-panel__color-picker \{[^}]*border: 2px solid currentColor;/s);
  assert.match(css, /\.text-panel__color-picker::-webkit-color-swatch/);
  assert.match(css, /@media \(max-width: 620px\)/);
  assert.match(css, /\.text-panel__text ol/);
  assert.match(css, /\.text-panel__text \{[^}]*font-size: 14px;[^}]*line-height: 1\.6;/s);
  assert.match(css, /\.text-panel--plain \.text-panel__text > p:first-child \[data-md-size="l"\] \{[^}]*font-size: 18px;/s);
  assert.doesNotMatch(css, /\[data-md-size="s"\][^{]*\{[^}]*color:/s);
  assert.match(css, /\.text-panel--plain \.text-panel__text li \+ li \{ margin-top: 12px; \}/);
  assert.match(css, /\.text-panel--plain/);
  assert.match(css, /\.text-panel--plain\.text-panel--frameless \{[^}]*padding: 0;[^}]*border-color: transparent;[^}]*border-radius: 0;[^}]*box-shadow: none;/s);
  assert.match(css, /\.text-panel--plain \.text-panel__text strong/);
  assert.match(css, /li::marker \{ color: var\(--text-panel-accent\); \}/);
  assert.match(css, /\.text-panel__border-toggle/);
  assert.match(css, /\.text-panel--illustrated/);
  assert.match(css, /\.text-panel__format--size/);
  assert.doesNotMatch(css, /grid-template-columns:\s*[^;}]*1fr[^;}]*1fr/);
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'text-panel.js'), 'utf8');
  assert.match(source, /applyTextSize/);
  assert.match(source, /text-panel__format--list/);
  assert.match(css, /\.text-panel__format--list \{[^}]*width: 40px;[^}]*white-space: nowrap;/s);
});

test('lesson editor loads text-panel as its own closed script tag', () => {
  const page = fs.readFileSync(path.join(__dirname, '..', 'lesson-editor.html'), 'utf8');
  assert.match(page, /<script src="\/assets\/components\/text-panel\.js" defer><\/script>/);
  assert.match(page, /<link rel="stylesheet" href="\/assets\/components\/text-panel\.css" \/>/);
});

// A panel rendered with the minimal DOM; the stub markdown keeps text as it is.
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
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/components/text-panel.js'), 'utf8'), { window });
  return window.IllustratedTextPanelComponent.renderIllustratedTextPanel(data, options);
}

test('with editImagePrompts the editor edits, removes and adds picture prompts', async () => {
  const saved = [];
  // Like the template editor, the saved panel leaves a removed picture out.
  const withoutRemoved = changes => Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== null));
  const panelNode = renderInFakeDom(illustratedPanel({ leadingPicture: { imagePrompt: '{{senderImagePrompt}}' } }), {
    editImagePrompts: true,
    onSave: async changes => { saved.push(changes); return { ...illustratedPanel(), ...withoutRemoved(changes) }; },
  });
  assert.equal(panelNode.querySelectorAll('.text-panel__prompt-field').length, 0, 'prompts show only while editing');

  panelNode.querySelector('.text-panel__edit').click();
  const sides = () => panelNode.querySelectorAll('.text-panel__picture--prompt');
  const [leading, trailing] = sides();
  const field = leading.querySelector('.text-panel__prompt-field');
  assert.equal(field.value, '{{senderImagePrompt}}');
  assert.equal(trailing.querySelector('.text-panel__prompt-field'), null);
  assert.equal(trailing.querySelector('.text-panel__image-action').textContent, '+ Картинка');

  field.value = ' {{senderImagePrompt}}, smiling ';
  field.listeners.input.forEach(listener => listener({}));
  assert.match(panelNode.className, /text-panel--dirty/);
  trailing.querySelector('.text-panel__image-action').click();
  const added = sides()[1].querySelector('.text-panel__prompt-field');
  added.value = 'Paper plane';
  added.listeners.input.forEach(listener => listener({}));

  panelNode.querySelector('.text-panel__edit').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), [{
    text: '**Alex:** Hello!',
    backgroundColor: '#252A38',
    leadingPicture: { imagePrompt: '{{senderImagePrompt}}, smiling' },
    trailingPicture: { imagePrompt: 'Paper plane' },
  }]);

  panelNode.querySelector('.text-panel__edit').click();
  sides()[0].querySelector('.text-panel__image-action--remove').click();
  panelNode.querySelector('.text-panel__edit').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved[1].leadingPicture, null);
  assert.deepEqual(JSON.parse(JSON.stringify(saved[1].trailingPicture)), { imagePrompt: 'Paper plane' });

  panelNode.querySelector('.text-panel__edit').click();
  assert.equal(sides()[0].querySelector('.text-panel__image-action').textContent, '+ Картинка', 'the removed picture stays removed');
});

test('without editImagePrompts the editor sends no picture fields', async () => {
  const saved = [];
  const panelNode = renderInFakeDom(illustratedPanel({ leadingPicture: { imagePrompt: 'Avatar' } }), {
    onSave: async changes => { saved.push(changes); return { ...illustratedPanel({ leadingPicture: { imagePrompt: 'Avatar' } }), ...changes }; },
  });
  panelNode.querySelector('.text-panel__edit').click();
  assert.equal(panelNode.querySelectorAll('.text-panel__prompt-field').length, 0);
  panelNode.querySelector('.text-panel__edit').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Object.keys(saved[0]), ['text', 'backgroundColor']);
});

test('scene layout keeps one leading picture and rejects other layouts', () => {
  const scene = normalizeIllustratedTextPanel(illustratedPanel({
    layout: 'scene',
    leadingPicture: { imagePrompt: 'Café' },
  }));
  assert.equal(scene.layout, 'scene');
  assert.deepEqual(scene.leadingPicture, { imagePrompt: 'Café' });
  assert.equal('layout' in normalizeIllustratedTextPanel(illustratedPanel()), false, 'the default layout is not stored');
  assert.throws(() => normalizeIllustratedTextPanel(illustratedPanel({ layout: 'poster' })), /layout must be "scene"/);
  assert.throws(() => normalizeIllustratedTextPanel(illustratedPanel({
    layout: 'scene',
    trailingPicture: { imagePrompt: 'Symbol' },
  })), /no trailingPicture/);
});

test('scene label is an explicit optional field of the scene layout', () => {
  assert.equal(normalizeIllustratedTextPanel(illustratedPanel({ layout: 'scene', label: ' The Situation ' })).label, 'The Situation');
  for (const label of [undefined, null, '', '   ']) {
    assert.equal('label' in normalizeIllustratedTextPanel(illustratedPanel({ layout: 'scene', label })), false);
  }
  assert.throws(() => normalizeIllustratedTextPanel(illustratedPanel({ label: 'The Situation' })), /needs the scene layout/);
  assert.throws(() => normalizeIllustratedTextPanel(illustratedPanel({ layout: 'scene', label: 7 })), /must be a string/);
});

// Renders a scene with a stub markdown: every paragraph becomes a <p>.
function renderScene(data, options = {}) {
  const vm = require('node:vm');
  const { createDocument } = require('./helpers/lesson-dom.js');
  const document = createDocument();
  const createElement = document.createElement;
  document.createElement = tag => Object.assign(createElement(tag), { focus() {} });
  const window = {
    document,
    SafeMarkdown: {
      renderMarkdownInto(node, value) {
        node.replaceChildren(...value.split('\n\n').map(line => Object.assign(document.createElement('p'), { textContent: line })));
      },
      editorToMarkdown: () => data.text,
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/components/text-panel.js'), 'utf8'), { window });
  return window.IllustratedTextPanelComponent.renderIllustratedTextPanel(illustratedPanel({
    layout: 'scene',
    leadingPicture: { imagePrompt: '{{sceneImagePrompt}}' },
    ...data,
  }), options);
}

test('scene shows its label above the text and nothing without one', () => {
  const labelled = renderScene({ text: '**Note:** you are in a café.', label: 'The Situation' });
  assert.match(labelled.className, /text-panel--scene/);
  const [label, text] = labelled.querySelector('.text-panel__content').children;
  assert.equal(label.className, 'text-panel__label');
  assert.equal(label.textContent, 'The Situation');
  assert.equal(text.className, 'text-panel__text');
  assert.equal(text.querySelector('.text-panel__label'), null, 'bold text stays text');

  const plain = renderScene({ text: '**The Situation**\n\nYou are in a café.' });
  assert.equal(plain.querySelector('.text-panel__label'), null, 'a bold first line is not a label');
});

test('scene edits its label in a field and an empty one removes it', async () => {
  const saved = [];
  const panelNode = renderScene({ text: 'You are in a café.', label: 'The Situation' }, {
    onSave: async (changes) => { saved.push(changes); return changes; },
  });
  panelNode.querySelector('.text-panel__edit').click();
  const field = panelNode.querySelector('.text-panel__label-field');
  assert.equal(field.value, 'The Situation');
  assert.equal(panelNode.querySelector('.text-panel__label'), null);
  field.value = '  ';
  panelNode.querySelector('.text-panel__edit').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(saved[0].label, null);
  assert.equal(panelNode.querySelector('.text-panel__label'), null);
  assert.equal(panelNode.querySelector('.text-panel__label-field'), null);
});

test('scene layout edits only the leading picture prompt', async () => {
  const saved = [];
  const panelNode = renderScene({ text: 'You are in a café.', label: 'The Situation' }, {
    editImagePrompts: true,
    onSave: async (changes) => { saved.push(changes); return changes; },
  });
  panelNode.querySelector('.text-panel__edit').click();
  assert.equal(panelNode.querySelectorAll('.text-panel__picture--prompt').length, 1);
  panelNode.querySelector('.text-panel__edit').click();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(Object.keys(saved[0]), ['text', 'backgroundColor', 'label', 'leadingPicture']);
  assert.equal(saved[0].label, 'The Situation');
});

test('scene layout CSS keeps the picture within the generated 512 px', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'text-panel.css'), 'utf8');
  assert.match(css, /\.text-panel--scene \.text-panel__picture \{[^}]*flex: 0 0 clamp\(220px, 40%, 340px\);/s);
  assert.match(css, /\.text-panel--scene \{[^}]*container-type: inline-size;/s);
  assert.match(css, /@container \(max-width: 560px\)/);
  assert.match(css, /\.text-panel--scene \.text-panel__label::before \{/);
});
