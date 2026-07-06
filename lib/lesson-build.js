'use strict';

const fs = require('fs');
const path = require('path');

const LIB_DIR = __dirname;

function escapeHtmlTitle(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function encodeLessonJson(data) {
  const json = JSON.stringify(data);
  return json.replace(/</g, '\\u003c');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cloneLessonData(data) {
  return JSON.parse(JSON.stringify(data));
}

function shuffleWordBanks(data) {
  if (!data || !Array.isArray(data.sections)) return;
  data.sections.forEach(section => {
    if (!section || !Array.isArray(section.controls)) return;
    section.controls.forEach(control => {
      if (control && Array.isArray(control.wordBank) && control.wordBank.length) {
        control.wordBank = shuffle(control.wordBank);
      }
    });
  });
}

function readLib(name) {
  return fs.readFileSync(path.join(LIB_DIR, name), 'utf8');
}

function getLessonTitle(data) {
  return (data.hero && data.hero.title) || (data.meta && data.meta.topic) || 'English Lesson';
}

function buildLessonHtml(data, options = {}) {
  const lesson = options.clone === false ? data : cloneLessonData(data);
  if (options.shuffleWordBanks !== false) shuffleWordBanks(lesson);

  const title = getLessonTitle(lesson);
  const shell = readLib('lesson-shell.html');
  const css = readLib('lesson.css');
  const renderer = readLib('lesson-renderer.js');
  const sync = readLib('lesson-sync.js');
  const jsonPayload = encodeLessonJson(lesson);

  return shell
    .replace('__LESSON_TITLE__', () => escapeHtmlTitle(title))
    .replace('__LESSON_CSS__', () => css)
    .replace('__LESSON_JSON__', () => jsonPayload)
    .replace('__LESSON_RENDERER__', () => renderer)
    .replace('__LESSON_SYNC__', () => sync);
}

function defaultOutputPath(inputPath) {
  const ext = path.extname(inputPath);
  const base = ext ? inputPath.slice(0, -ext.length) : inputPath;
  return `${base}.html`;
}

module.exports = {
  buildLessonHtml,
  cloneLessonData,
  defaultOutputPath,
  encodeLessonJson,
  escapeHtmlTitle,
  getLessonTitle,
  shuffleWordBanks,
};
