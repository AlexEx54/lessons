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
  assert.match(css, /\.text-panel--plain/);
  assert.match(css, /\.text-panel--illustrated/);
  assert.doesNotMatch(css, /grid-template-columns:\s*[^;}]*1fr[^;}]*1fr/);
});
