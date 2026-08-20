'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  normalizeTextReading,
  pictureRenderMode,
} = require('../assets/components/text-reading.js');

function reading(overrides = {}) {
  return {
    type: 'textReading',
    id: 'reading-text',
    title: 'My Exchange Week Surprise',
    subtitle: 'by Student · Posted Aug 20',
    headerImage: { imagePrompt: 'Student avatar' },
    text: 'First paragraph.\n\nSecond **paragraph**.',
    textImage: { imagePrompt: 'School hallway' },
    ...overrides,
  };
}

test('textReading normalizes title, optional subtitle, Markdown text, and independent image slots', () => {
  assert.deepEqual(normalizeTextReading(reading({
    title: '  My   Exchange Week Surprise  ',
    subtitle: '  by Student   ·   Posted Aug 20  ',
    headerImage: { imagePrompt: ' Avatar ', imageSrc: ' /avatar.png ' },
    textImage: { imagePrompt: ' Hallway ', imageSrc: ' /hallway.png ' },
  })), {
    type: 'textReading',
    id: 'reading-text',
    title: 'My Exchange Week Surprise',
    subtitle: 'by Student · Posted Aug 20',
    headerImage: { imagePrompt: 'Avatar', imageSrc: '/avatar.png' },
    text: 'First paragraph.\n\nSecond **paragraph**.',
    textImage: { imagePrompt: 'Hallway', imageSrc: '/hallway.png' },
  });
});

test('textReading allows optional subtitle and either image slot', () => {
  const withoutOptionalFields = normalizeTextReading(reading({
    subtitle: '   ',
    headerImage: null,
    textImage: null,
  }));
  assert.equal(withoutOptionalFields.subtitle, undefined);
  assert.equal(withoutOptionalFields.headerImage, undefined);
  assert.equal(withoutOptionalFields.textImage, undefined);

  const headerOnly = normalizeTextReading(reading({ textImage: undefined }));
  assert.ok(headerOnly.headerImage);
  assert.equal(headerOnly.textImage, undefined);
  const textOnly = normalizeTextReading(reading({ headerImage: undefined }));
  assert.equal(textOnly.headerImage, undefined);
  assert.ok(textOnly.textImage);
});

test('textReading rejects invalid required fields, subtitle, and image slots', () => {
  assert.throws(() => normalizeTextReading(reading({ type: 'textPanel' })), /kebab-case id/);
  assert.throws(() => normalizeTextReading(reading({ id: 'Reading Text' })), /kebab-case id/);
  assert.throws(() => normalizeTextReading(reading({ title: ' ' })), /requires title/);
  assert.throws(() => normalizeTextReading(reading({ text: ' ' })), /requires text/);
  assert.throws(() => normalizeTextReading(reading({ subtitle: 42 })), /subtitle must be a string/);
  assert.throws(() => normalizeTextReading(reading({ headerImage: {} })), /headerImage.imagePrompt/);
  assert.throws(() => normalizeTextReading(reading({ textImage: 'image' })), /textImage must be an object/);
  assert.throws(() => normalizeTextReading(reading({ textImage: { imagePrompt: 'Prompt', imageSrc: ' ' } })), /textImage.imageSrc/);
});

test('textReading hides empty picture slots outside edit mode', () => {
  const emptySlot = { imagePrompt: 'School hallway' };
  const loadedSlot = { ...emptySlot, imageSrc: '/hallway.png' };
  assert.equal(pictureRenderMode(null, false, true), 'hidden');
  assert.equal(pictureRenderMode(emptySlot, false, true), 'hidden');
  assert.equal(pictureRenderMode(emptySlot, true, false), 'hidden');
  assert.equal(pictureRenderMode(emptySlot, true, true), 'placeholder');
  assert.equal(pictureRenderMode(loadedSlot, false, true), 'image');
});

test('textReading CSS keeps the header image compact and the text image beside the article', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'text-reading.css'), 'utf8');
  assert.match(css, /\.text-reading__body-layout \{[^}]*display: flex;/s);
  assert.match(css, /\.text-reading__text-media \{[^}]*flex: 0 0 min\(37\.4%/s);
  assert.doesNotMatch(css, /\.text-reading__text-media \{[^}]*flex: 0 1/s);
  assert.match(css, /\.text-reading__picture--header img[^}]*border-radius: 50%/s);
  assert.match(css, /\.text-reading__picture--text img \{[^}]*height: auto;[^}]*max-height: none;[^}]*object-fit: contain;/s);
  assert.match(css, /\.text-reading__image-actions/);
  assert.match(css, /\.text-reading__read-label/);
  assert.match(css, /@media \(max-width: 700px\)/);
  assert.match(css, /flex-direction: column/);
  assert.match(css, /\.text-reading__format--size/);
  const source = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'text-reading.js'), 'utf8');
  assert.match(source, /applyTextSize/);
});
