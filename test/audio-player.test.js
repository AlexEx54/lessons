'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  canUseBlobSource,
  formatPlaybackRate,
  formatPlayerTime,
  nextPlaybackRate,
  normalizeAudioPlayer,
  previewScript,
  renderAudioPlayer,
  slotRenderMode,
} = require('../assets/components/audio-player.js');

function createFakeDocument() {
  function textNode(value) {
    return { nodeType: 3, textContent: String(value), childNodes: [] };
  }
  function element(tag) {
    const el = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      childNodes: [],
      attributes: {},
      dataset: {},
      listeners: {},
      style: { setProperty() {} },
      _className: '',
      _text: '',
      hidden: false,
      disabled: false,
      type: '',
      value: '',
      get className() { return this._className; },
      set className(value) { this._className = String(value || ''); },
      classList: {
        add(name) {
          const tokens = new Set(el._className.split(/\s+/).filter(Boolean));
          tokens.add(name);
          el._className = [...tokens].join(' ');
        },
        remove(name) {
          const tokens = new Set(el._className.split(/\s+/).filter(Boolean));
          tokens.delete(name);
          el._className = [...tokens].join(' ');
        },
        toggle(name, on) {
          const tokens = new Set(el._className.split(/\s+/).filter(Boolean));
          if (on === undefined) on = !tokens.has(name);
          if (on) tokens.add(name);
          else tokens.delete(name);
          el._className = [...tokens].join(' ');
        },
        contains(name) { return el._className.split(/\s+/).includes(name); },
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; },
      removeAttribute(name) { delete this.attributes[name]; },
      append(...nodes) {
        nodes.forEach((node) => {
          if (node == null) return;
          this.childNodes.push(typeof node === 'string' ? textNode(node) : node);
        });
      },
      replaceChildren(...nodes) {
        this.childNodes = [];
        this.append(...nodes);
      },
      addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
      },
      click() { (this.listeners.click || []).forEach(handler => handler()); },
      focus() {},
      get textContent() {
        if (this.childNodes.length === 0) return this._text;
        return this.childNodes.map(node => node.textContent || '').join('');
      },
      set textContent(value) {
        this.childNodes = [];
        this._text = String(value);
      },
    };
    return el;
  }
  return {
    createElement: tag => element(tag),
    createElementNS: (_ns, tag) => element(tag),
    createTextNode: value => textNode(value),
  };
}

function descendants(node, found = []) {
  for (const child of node.childNodes || []) {
    found.push(child);
    descendants(child, found);
  }
  return found;
}

function byClass(root, name) {
  return descendants(root).filter(node => node.classList && node.classList.contains(name));
}

function player(overrides = {}) {
  return {
    type: 'audioPlayer',
    id: 'listening-audio',
    title: ' Listen to the audio ',
    script: '  Alex: Hello.\nMia: Hi.  \n',
    ...overrides,
  };
}

test('audioPlayer normalizes title and script and keeps optional audioSrc', () => {
  assert.deepEqual(normalizeAudioPlayer(player()), {
    type: 'audioPlayer',
    id: 'listening-audio',
    title: 'Listen to the audio',
    script: 'Alex: Hello.\nMia: Hi.',
  });
  assert.deepEqual(normalizeAudioPlayer(player({ audioSrc: ' /api/lesson-draft-assets/a/b.mp3 ' })), {
    type: 'audioPlayer',
    id: 'listening-audio',
    title: 'Listen to the audio',
    script: 'Alex: Hello.\nMia: Hi.',
    audioSrc: '/api/lesson-draft-assets/a/b.mp3',
  });
});

test('audioPlayer rejects invalid fields, markup, and extra keys', () => {
  assert.throws(() => normalizeAudioPlayer(player({ type: 'textReading' })), /kebab-case id/);
  assert.throws(() => normalizeAudioPlayer(player({ id: 'Listening Audio' })), /kebab-case id/);
  assert.throws(() => normalizeAudioPlayer(player({ title: '  ' })), /requires title/);
  assert.throws(() => normalizeAudioPlayer(player({ script: '   \n  ' })), /requires script/);
  assert.throws(() => normalizeAudioPlayer(player({ title: '**Listen**' })), /HTML or Markdown in title/);
  assert.throws(() => normalizeAudioPlayer(player({ script: '- Hello' })), /HTML or Markdown in script/);
  assert.throws(() => normalizeAudioPlayer(player({ audioSrc: '   ' })), /non-empty audioSrc/);
  assert.throws(() => normalizeAudioPlayer({ ...player(), extra: true }), /unsupported fields/);
});

test('audioPlayer shows the script until an audio file is uploaded', () => {
  const empty = { script: 'Alex: Hello.' };
  const loaded = { script: 'Alex: Hello.', audioSrc: '/audio.mp3' };
  assert.equal(slotRenderMode(empty, false, true), 'script');
  assert.equal(slotRenderMode(empty, true, false), 'script');
  assert.equal(slotRenderMode(empty, true, true), 'script');
  assert.equal(slotRenderMode(loaded, false, true), 'player');
  assert.equal(slotRenderMode(loaded, true, true), 'player');
});

test('audioPlayer uses blob loading only in a real browser window', () => {
  assert.equal(canUseBlobSource(globalThis), false);
  assert.equal(canUseBlobSource({ window: {}, fetch() {}, URL: { createObjectURL() {} } }), false);
});

test('audioPlayer formats time and cycles playback speed', () => {
  assert.equal(formatPlayerTime(0), '00:00');
  assert.equal(formatPlayerTime(Number.NaN), '00:00');
  assert.equal(formatPlayerTime(68.9), '01:08');
  assert.equal(formatPlaybackRate(1), '1x');
  assert.equal(formatPlaybackRate(1.25), '1.25x');
  assert.equal(nextPlaybackRate(1), 1.25);
  assert.equal(nextPlaybackRate(2), 1);
});

test('audioPlayer preview shows two script lines, an audio icon, and copies the full text', () => {
  assert.equal(previewScript('Alex: Hello.\nMia: Hi.\nAlex: Ready?'), 'Alex: Hello.\nMia: Hi.…');
  assert.equal(previewScript('Alex: Hello.\nMia: Hi.'), 'Alex: Hello.\nMia: Hi.');

  const longScript = player({ script: 'Alex: Hello.\nMia: Hi.\nAlex: Ready?' });
  const preview = renderAudioPlayer(longScript, {}, createFakeDocument());
  assert.equal(byClass(preview, 'audio-player__title')[0].textContent, 'Listen to the audio');
  assert.equal(byClass(preview, 'audio-player__slot')[0].hidden, false);
  assert.ok(byClass(preview, 'audio-player__script')[0].className.includes('audio-player__script--preview'));
  assert.equal(byClass(preview, 'audio-player__script-icon').length, 1);
  assert.equal(byClass(preview, 'audio-player__script-text')[0].textContent, 'Alex: Hello.\nMia: Hi.…');
  assert.equal(byClass(preview, 'audio-player__copy').length, 1);
  assert.equal(byClass(preview, 'audio-player__file-action').length, 0);
  assert.equal(byClass(preview, 'audio-player__controls').length, 0);

  const editor = renderAudioPlayer(longScript, { onSave() {}, onUpload() {} }, createFakeDocument());
  assert.equal(byClass(editor, 'audio-player__script-text')[0].textContent, 'Alex: Hello.\nMia: Hi.…');
  byClass(editor, 'audio-player__edit')[0].click();
  assert.ok(byClass(editor, 'audio-player__script')[0].className.includes('audio-player__script--full'));
  assert.equal(byClass(editor, 'audio-player__script-text')[0].textContent, 'Alex: Hello.\nMia: Hi.\nAlex: Ready?');
  assert.equal(byClass(editor, 'audio-player__file-action')[0].textContent, 'Загрузить');
});

test('audioPlayer shows a player when audioSrc is present', () => {
  const section = renderAudioPlayer(player({ audioSrc: '/audio.mp3' }), {}, createFakeDocument());
  assert.equal(byClass(section, 'audio-player__slot')[0].hidden, false);
  assert.equal(byClass(section, 'audio-player__controls').length, 1);
  assert.equal(byClass(section, 'audio-player__ticks').length, 1);
  assert.equal(byClass(section, 'audio-player__time')[0].textContent, '00:00');
  assert.equal(byClass(section, 'audio-player__speed')[0].textContent, '1x');
  assert.equal(byClass(section, 'audio-player__script-text').length, 0);
});

test('audioPlayer CSS draws a card background and tick marks instead of a solid seek line', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'components', 'audio-player.css'), 'utf8');
  assert.match(css, /\.audio-player__controls[^{]*\{[^}]*background:\s*#f3f2f7/);
  assert.match(css, /\.audio-player__ticks/);
  assert.match(css, /repeating-linear-gradient\(to right/);
  assert.match(css, /-webkit-line-clamp:\s*2/);
  assert.doesNotMatch(css, /\.audio-player__slider[^{]*\{[^}]*height:\s*4px/);
});
