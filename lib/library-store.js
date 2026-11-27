'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { ageLabel } = require('./learner-profile.js');
const { grammarTitle, isGrammarPoint, isSeason, seasonLabel } = require('./lesson-program.js');
const { pendingImageSlots } = require('./lesson-image-slots.js');
const { saveMedia, storeMedia } = require('./media-store.js');
const { toWebp } = require('./webp.js');

const CATEGORIES = ['General English', 'Speaking', 'Grammar', 'ОГЭ / ЕГЭ'];
const SKILLS = ['Vocabulary', 'Speaking', 'Listening', 'Watching', 'Writing', 'Grammar'];
const BADGES = ['new', 'popular'];
const DRAFT_ASSET_URL = /\/api\/lesson-draft-assets\/[^\s"'<>\)]+/g;
const CARD_COLUMNS = 'id, title, age, level, category, grammar_point, topic, season, description, skills_json, duration, cover, badge, is_published, revision, published_at, updated_at';

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function card(row) {
  if (!row) return null;
  const { skills_json, is_published, ...rest } = row;
  return {
    ...rest, age_label: ageLabel(rest.age), grammar_title: grammarTitle(rest.grammar_point), season_label: seasonLabel(rest.season),
    skills: JSON.parse(skills_json), is_published: Boolean(is_published),
  };
}

function listLibraryLessons(database, adminId = null) {
  return database.prepare(`SELECT ${CARD_COLUMNS}, (published_by = ?) AS can_unpublish FROM library_lessons WHERE is_published = 1 ORDER BY sort_order, published_at DESC, id`).all(adminId).map(row => ({ ...card(row), can_unpublish: Boolean(row.can_unpublish) }));
}

function listNewLibraryLessons(database) {
  return database.prepare(`SELECT ${CARD_COLUMNS} FROM library_lessons
    WHERE badge = 'new' AND is_published = 1
    ORDER BY published_at DESC, id LIMIT 12`).all().map(card);
}

function findLibraryLesson(id, database) {
  const row = database.prepare(`SELECT ${CARD_COLUMNS}, content_json FROM library_lessons WHERE id = ? AND is_published = 1`).get(id);
  if (!row) return null;
  const { content_json, ...metadata } = row;
  return { ...card(metadata), content: JSON.parse(content_json) };
}

function publicationForDraft(draftId, database) {
  return card(database.prepare(`SELECT ${CARD_COLUMNS} FROM library_lessons WHERE source_draft_id = ?`).get(draftId));
}

function requireOwnedDraft(id, adminId, database) {
  if (database.prepare('SELECT role FROM users WHERE id = ?').get(adminId)?.role !== 'admin') fail('Доступно только администратору.', 403);
  const draft = database.prepare('SELECT * FROM lesson_drafts WHERE id = ? AND owner_admin_id = ?').get(id, adminId);
  if (!draft) fail('Черновик не найден.', 404);
  return draft;
}

function textField(value, label, max = 120) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(`Заполните поле «${label}» (до ${max} символов).`);
  return value.trim();
}

// Grammar from the program (null for a lesson without grammar), a topic and an optional season.
function programFields(input) {
  if (input.grammarPoint !== null && !isGrammarPoint(input.grammarPoint)) fail('Выберите грамматику из программы.');
  const topic = textField(input.topic, 'Тема', 60);
  if (input.season !== null && !isSeason(input.season)) fail('Выберите сезон из списка.');
  return { grammarPoint: input.grammarPoint, topic, season: input.season };
}

// The checks run again inside the transaction, as the draft may change while its files are prepared.
function checkPublication(draftId, adminId, input, database) {
  const draft = requireOwnedDraft(draftId, adminId, database);
  if (draft.status !== 'review') fail('Дождитесь завершения генерации урока.', 409);
  if (input.expectedUpdatedAt !== draft.updated_at) fail('Черновик изменился. Закройте окно публикации и откройте его снова.', 409);
  const previous = publicationForDraft(draftId, database);
  if (input.expectedRevision !== (previous?.revision || 0)) fail('Публикация изменилась. Закройте окно и откройте его снова.', 409);
  const content = JSON.parse(draft.content_json || 'null');
  // ВРЕМЕННО ДЛЯ ТЕСТИРОВАНИЯ: разрешаем публикацию с пустыми стадиями (null или []).
  // Перед выкладкой на сервер вернуть обязательное заполнение всех стадий:
  // в проверке ниже использовать !Array.isArray(stage.content) || !stage.content.length.
  if (!content || !Array.isArray(content.stages) || !content.stages.length
    || content.stages.some(stage => !stage || typeof stage.id !== 'string'
      || (stage.content != null && !Array.isArray(stage.content)))) {
    fail('Некорректная структура урока.', 409);
  }
  const generation = database.prepare('SELECT status FROM lesson_draft_image_generations WHERE draft_id = ?').get(draftId);
  if (generation && ['pending', 'running'].includes(generation.status)) fail('Дождитесь завершения генерации изображений или остановите её.', 409);
  if (pendingImageSlots(content).length > 0 && input.allowIncompleteImages !== true) fail('Подтвердите публикацию без всех иллюстраций.', 409);
  return { draft, previous, content };
}

function mapStrings(value, map) {
  if (typeof value === 'string') return map(value);
  if (Array.isArray(value)) return value.map(item => mapStrings(item, map));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapStrings(item, map)]));
  return value;
}

async function saveCover(upload, mediaDirectory) {
  if (!upload || typeof upload.data !== 'string' || upload.data.length > 6990508
    || upload.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.data)) fail('Некорректный файл обложки.');
  const data = Buffer.from(upload.data, 'base64');
  if (!data.length || data.length > 5 * 1024 * 1024) fail('Обложка должна быть не больше 5 МБ.');
  const formats = {
    'image/png': data.length > 24 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')),
    'image/jpeg': data.length > 3 && data[0] === 255 && data[1] === 216 && data[2] === 255,
    'image/webp': data.length > 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP',
  };
  if (!formats[upload.type]) fail('Загрузите изображение в формате PNG, JPEG или WebP.');
  return saveMedia(mediaDirectory, await toWebp(data), 'webp');
}

// Copies a draft file into the media store and returns its name there.
// PNG and JPEG from older drafts become WebP; newer drafts already save pictures as WebP.
async function saveDraftFile(source, draftId, draftAssetsDirectory, mediaDirectory) {
  const match = source.match(/^\/api\/lesson-draft-assets\/([a-f0-9-]{36})\/([a-f0-9-]{36}\.(jpg|png|webp|mp3|wav|m4a|mp4))$/i);
  if (!match || match[1] !== draftId) fail('В уроке есть недоступный файл черновика.');
  const file = path.join(draftAssetsDirectory, draftId, match[2]);
  const extension = match[3].toLowerCase();
  try {
    // A video is too large to read for a hash; its draft file never changes, so its address names it.
    if (extension === 'mp4') return await storeMedia(mediaDirectory, `${crypto.createHash('sha256').update(source).digest('hex')}.mp4`, file);
    const data = await fs.promises.readFile(file);
    if (extension === 'png' || extension === 'jpg') return await saveMedia(mediaDirectory, await toWebp(data), 'webp');
    return await saveMedia(mediaDirectory, data, extension);
  } catch (error) {
    if (error.code === 'ENOENT') fail('Не найден файл урока. Восстановите его перед публикацией.', 409);
    throw error;
  }
}

// Files are written to the media store first; the lesson and its file references are saved in one transaction.
// Files of a failed publication stay unreferenced until the startup sweep removes them.
async function publishLesson(draftId, adminId, input, database, draftAssetsDirectory, mediaDirectory) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Некорректные данные публикации.');
  const { previous, content } = checkPublication(draftId, adminId, input, database);
  const title = textField(input.title, 'Название');
  const description = textField(input.description, 'Описание', 500);
  if (!CATEGORIES.includes(input.category)) fail('Выберите категорию.');
  const { grammarPoint, topic, season } = programFields(input);
  if (!Array.isArray(input.skills) || !input.skills.length || input.skills.some(skill => !SKILLS.includes(skill))) fail('Выберите навыки урока.');
  const duration = textField(input.duration, 'Длительность', 40);
  if (input.coverUpload == null && (!previous || input.cover !== previous.cover)) fail('Загрузите обложку урока.');
  const coverName = input.coverUpload != null
    ? await saveCover(input.coverUpload, mediaDirectory)
    : previous.cover.match(/\/assets\/([^/]+)$/)?.[1];
  const files = new Map();
  mapStrings(content, value => { for (const [source] of value.matchAll(DRAFT_ASSET_URL)) files.set(source, null); });
  for (const source of files.keys()) files.set(source, await saveDraftFile(source, draftId, draftAssetsDirectory, mediaDirectory));

  database.exec('BEGIN IMMEDIATE');
  try {
    const { draft, content: current } = checkPublication(draftId, adminId, input, database);
    const id = previous?.id || crypto.randomUUID();
    const libraryUrl = name => `/api/library/${id}/assets/${name}`;
    const snapshot = mapStrings(current, value => value.replace(DRAFT_ASSET_URL, source => {
      if (!files.has(source)) fail('Черновик изменился. Закройте окно публикации и откройте его снова.', 409);
      return libraryUrl(files.get(source));
    }));
    snapshot.notes = JSON.parse(draft.notes_json);
    snapshot.meta = { ...snapshot.meta, title, level: draft.student_level };
    const cover = input.coverUpload != null ? libraryUrl(coverName) : previous.cover;
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO library_lessons
      (id, source_draft_id, published_by, title, age, level, category, grammar_point, topic, season, description, skills_json, duration, cover, is_published, content_json, revision, published_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 1, ?, ?)
      ON CONFLICT(source_draft_id) DO UPDATE SET
      title = excluded.title, category = excluded.category, grammar_point = excluded.grammar_point,
      topic = excluded.topic, season = excluded.season, description = excluded.description,
      skills_json = excluded.skills_json, duration = excluded.duration, cover = excluded.cover,
      age = excluded.age, level = excluded.level, content_json = excluded.content_json,
      is_published = 1, revision = library_lessons.revision + 1, updated_at = excluded.updated_at
    `).run(id, draftId, adminId, title, draft.student_age_group, draft.student_level, input.category,
      grammarPoint, topic, season, description,
      JSON.stringify([...new Set(input.skills)]), duration, cover, JSON.stringify(snapshot), now, now);
    // Files the new version no longer uses are dropped; class sessions keep their own references.
    database.prepare('DELETE FROM library_assets WHERE lesson_id = ?').run(id);
    const insertAsset = database.prepare('INSERT OR IGNORE INTO library_assets (lesson_id, file_name) VALUES (?, ?)');
    for (const name of new Set([...files.values(), coverName].filter(Boolean))) insertAsset.run(id, name);
    database.exec('COMMIT');
    return publicationForDraft(draftId, database);
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function unpublishLesson(draftId, adminId, expectedRevision, database) {
  requireOwnedDraft(draftId, adminId, database);
  const result = database.prepare(`UPDATE library_lessons SET is_published = 0, revision = revision + 1, updated_at = ?
    WHERE source_draft_id = ? AND revision = ? AND is_published = 1`).run(new Date().toISOString(), draftId, expectedRevision);
  if (!result.changes) fail('Публикация изменилась или уже скрыта. Обновите страницу.', 409);
  return publicationForDraft(draftId, database);
}

function unpublishLibraryLesson(id, adminId, expectedRevision, database) {
  if (database.prepare('SELECT role FROM users WHERE id = ?').get(adminId)?.role !== 'admin') fail('Доступно только администратору.', 403);
  const owned = database.prepare('SELECT id FROM library_lessons WHERE id = ? AND published_by = ?').get(id, adminId);
  if (!owned) fail('Публикация не найдена.', 404);
  const result = database.prepare(`UPDATE library_lessons SET is_published = 0, revision = revision + 1, updated_at = ?
    WHERE id = ? AND revision = ? AND is_published = 1`).run(new Date().toISOString(), id, expectedRevision);
  if (!result.changes) fail('Публикация изменилась или уже скрыта. Обновите страницу.', 409);
}

function setLibraryLessonBadge(id, adminId, badge, database) {
  if (database.prepare('SELECT role FROM users WHERE id = ?').get(adminId)?.role !== 'admin') fail('Доступно только администратору.', 403);
  if (badge !== null && !BADGES.includes(badge)) fail('Некорректная отметка урока.');
  const result = database.prepare('UPDATE library_lessons SET badge = ?, updated_at = ? WHERE id = ? AND is_published = 1')
    .run(badge, new Date().toISOString(), id);
  if (!result.changes) fail('Урок не найден.', 404);
}

// Program fields describe the lesson and do not change its content, so the revision that classes rely on stays.
function setLibraryLessonProgram(id, adminId, input, database) {
  if (database.prepare('SELECT role FROM users WHERE id = ?').get(adminId)?.role !== 'admin') fail('Доступно только администратору.', 403);
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Некорректные данные урока.');
  const { grammarPoint, topic, season } = programFields(input);
  const result = database.prepare('UPDATE library_lessons SET grammar_point = ?, topic = ?, season = ?, updated_at = ? WHERE id = ? AND is_published = 1')
    .run(grammarPoint, topic, season, new Date().toISOString(), id);
  if (!result.changes) fail('Урок не найден.', 404);
  return card(database.prepare(`SELECT ${CARD_COLUMNS} FROM library_lessons WHERE id = ?`).get(id));
}

function hasLibraryAsset(id, fileName, database, ownerId = null) {
  return Boolean(database.prepare(`SELECT 1 FROM library_assets a JOIN library_lessons l ON l.id = a.lesson_id
    WHERE a.lesson_id = ? AND a.file_name = ? AND (l.is_published = 1 OR l.published_by = ?)`).get(id, fileName, ownerId));
}

module.exports = { listLibraryLessons, listNewLibraryLessons, findLibraryLesson, publicationForDraft, publishLesson, unpublishLesson, unpublishLibraryLesson, setLibraryLessonBadge, setLibraryLessonProgram, hasLibraryAsset };
