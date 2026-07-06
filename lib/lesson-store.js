'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_LESSONS_DIR = path.join(__dirname, '..', 'data', 'lessons');

function getLessonsDir() {
  return path.resolve(process.env.LESSONS_DIR || DEFAULT_LESSONS_DIR);
}

function isSafeLessonId(id) {
  return typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,120}$/.test(id);
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 44) || 'lesson';
}

function createLessonId(topic) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const random = crypto.randomBytes(4).toString('hex');
  return `${slugify(topic)}-${date}-${random}`;
}

function getLessonPaths(id) {
  if (!isSafeLessonId(id)) {
    const error = new Error('Invalid lesson id');
    error.statusCode = 400;
    throw error;
  }
  const root = getLessonsDir();
  const dir = path.join(root, id);
  if (!dir.startsWith(root)) {
    const error = new Error('Invalid lesson path');
    error.statusCode = 400;
    throw error;
  }
  return {
    dir,
    html: path.join(dir, 'lesson.html'),
    json: path.join(dir, 'lesson.json'),
    meta: path.join(dir, 'meta.json'),
  };
}

async function ensureLessonsDir() {
  await fs.mkdir(getLessonsDir(), { recursive: true });
}

async function readJsonFile(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function listLessons() {
  await ensureLessonsDir();
  const entries = await fs.readdir(getLessonsDir(), { withFileTypes: true });
  const lessons = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !isSafeLessonId(entry.name)) continue;
    try {
      const { meta } = getLessonPaths(entry.name);
      const item = await readJsonFile(meta);
      lessons.push(item);
    } catch (error) {
      lessons.push({
        id: entry.name,
        title: entry.name,
        topic: '',
        createdAt: null,
        status: 'unreadable',
      });
    }
  }

  lessons.sort((a, b) => {
    const at = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
    return bt - at;
  });
  return lessons;
}

async function saveLesson({ lesson, html, metadata }) {
  await ensureLessonsDir();
  const id = metadata.id || createLessonId(metadata.topic || (lesson.meta && lesson.meta.topic));
  const paths = getLessonPaths(id);
  await fs.mkdir(paths.dir, { recursive: true });

  const meta = {
    ...metadata,
    id,
    lessonUrl: `/lesson/${id}`,
    jsonUrl: `/api/lessons/${id}/json`,
    createdAt: metadata.createdAt || new Date().toISOString(),
  };

  await fs.writeFile(paths.json, JSON.stringify(lesson, null, 2), 'utf8');
  await fs.writeFile(paths.html, html, 'utf8');
  await fs.writeFile(paths.meta, JSON.stringify(meta, null, 2), 'utf8');

  return meta;
}

async function readLessonHtml(id) {
  const { html } = getLessonPaths(id);
  return fs.readFile(html, 'utf8');
}

async function readLessonJson(id) {
  const { json } = getLessonPaths(id);
  return readJsonFile(json);
}

async function deleteLesson(id) {
  const { dir } = getLessonPaths(id);
  await fs.rm(dir, { recursive: true, force: true });
}

module.exports = {
  createLessonId,
  deleteLesson,
  getLessonsDir,
  getLessonPaths,
  isSafeLessonId,
  listLessons,
  readLessonHtml,
  readLessonJson,
  saveLesson,
};
