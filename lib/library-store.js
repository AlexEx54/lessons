'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pendingImageSlots } = require('./lesson-image-slots.js');

const CATEGORIES = ['General English', 'Speaking', 'Grammar', 'ОГЭ / ЕГЭ'];
const SKILLS = ['Vocabulary', 'Speaking', 'Listening', 'Writing', 'Grammar'];
const CARD_COLUMNS = 'id, title, age, level, category, description, skills_json, duration, cover, badge, is_available, is_published, revision, published_at, updated_at';

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function card(row) {
  if (!row) return null;
  const { skills_json, is_available, is_published, ...rest } = row;
  return { ...rest, skills: JSON.parse(skills_json), is_available: Boolean(is_available), is_published: Boolean(is_published) };
}

function listLibraryLessons(database, adminId = null) {
  return database.prepare(`SELECT ${CARD_COLUMNS}, (published_by = ? AND is_available = 1) AS can_unpublish FROM library_lessons WHERE is_published = 1 ORDER BY sort_order, published_at DESC, id`).all(adminId).map(row => ({ ...card(row), can_unpublish: Boolean(row.can_unpublish) }));
}

function findLibraryLesson(id, database) {
  const row = database.prepare(`SELECT ${CARD_COLUMNS}, content_json FROM library_lessons WHERE id = ? AND is_published = 1 AND is_available = 1`).get(id);
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

function publishLesson(draftId, adminId, input, database, assetsDirectory) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Некорректные данные публикации.');
  database.exec('BEGIN IMMEDIATE');
  try {
    const draft = requireOwnedDraft(draftId, adminId, database);
    if (draft.status !== 'review') fail('Дождитесь завершения генерации урока.', 409);
    if (input.expectedUpdatedAt !== draft.updated_at) fail('Черновик изменился. Закройте окно публикации и откройте его снова.', 409);
    const previous = publicationForDraft(draftId, database);
    if (input.expectedRevision !== (previous?.revision || 0)) fail('Публикация изменилась. Закройте окно и откройте его снова.', 409);
    const content = JSON.parse(draft.content_json || 'null');
    if (!content || !Array.isArray(content.stages) || !content.stages.length
      || content.stages.some(stage => !stage || typeof stage.id !== 'string' || !Array.isArray(stage.content) || !stage.content.length)) {
      fail('Заполните все стадии урока перед публикацией.', 409);
    }
    const generation = database.prepare('SELECT status FROM lesson_draft_image_generations WHERE draft_id = ?').get(draftId);
    if (generation && ['pending', 'running'].includes(generation.status)) fail('Дождитесь завершения генерации изображений или остановите её.', 409);
    if (pendingImageSlots(content).length > 0 && input.allowIncompleteImages !== true) fail('Подтвердите публикацию без всех иллюстраций.', 409);
    const title = textField(input.title, 'Название');
    const description = textField(input.description, 'Описание', 500);
    if (!CATEGORIES.includes(input.category)) fail('Выберите категорию.');
    if (!Array.isArray(input.skills) || !input.skills.length || input.skills.some(skill => !SKILLS.includes(skill))) fail('Выберите навыки урока.');
    const duration = textField(input.duration, 'Длительность', 40);
    const id = previous?.id || crypto.randomUUID();
    const media = new Map();
    let cover;
    if (input.coverUpload != null) {
      const upload = input.coverUpload;
      if (!upload || typeof upload.data !== 'string' || upload.data.length > 6990508
        || upload.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(upload.data)) fail('Некорректный файл обложки.');
      const data = Buffer.from(upload.data, 'base64');
      if (!data.length || data.length > 5 * 1024 * 1024) fail('Обложка должна быть не больше 5 МБ.');
      const formats = {
        'image/png': ['png', data.length > 24 && data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))],
        'image/jpeg': ['jpg', data.length > 3 && data[0] === 255 && data[1] === 216 && data[2] === 255],
        'image/webp': ['webp', data.length > 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'],
      };
      const format = formats[upload.type];
      if (!format?.[1]) fail('Загрузите изображение в формате PNG, JPEG или WebP.');
      const name = `${crypto.createHash('sha256').update(data).digest('hex')}.${format[0]}`;
      media.set(name, data);
      cover = `/api/library/${id}/assets/${name}`;
    } else {
      if (!previous || input.cover !== previous.cover) fail('Загрузите обложку урока.');
      cover = previous.cover;
    }
    const snapshotValue = value => {
      if (typeof value === 'string') {
        return value.replace(/\/api\/lesson-draft-assets\/[^\s"'<>\)]+/g, source => {
          const match = source.match(/^\/api\/lesson-draft-assets\/([a-f0-9-]{36})\/([a-f0-9-]{36}\.(jpg|png|webp|mp3|wav|m4a))$/i);
          if (!match || match[1] !== draftId) fail('В уроке есть недоступный файл черновика.');
          let data;
          try { data = fs.readFileSync(path.join(assetsDirectory, draftId, match[2])); }
          catch { fail('Не найден файл урока. Восстановите его перед публикацией.', 409); }
          const name = `${crypto.createHash('sha256').update(data).digest('hex')}.${match[3].toLowerCase()}`;
          media.set(name, data);
          return `/api/library/${id}/assets/${name}`;
        });
      }
      if (Array.isArray(value)) return value.map(snapshotValue);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshotValue(item)]));
      return value;
    };
    const snapshot = snapshotValue(content);
    snapshot.meta = { ...snapshot.meta, title, level: draft.student_level };
    const now = new Date().toISOString();
    database.prepare(`INSERT INTO library_lessons
      (id, source_draft_id, published_by, title, age, level, category, description, skills_json, duration, cover, is_available, is_published, content_json, revision, published_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, 1, ?, ?)
      ON CONFLICT(source_draft_id) DO UPDATE SET
      title = excluded.title, category = excluded.category, description = excluded.description,
      skills_json = excluded.skills_json, duration = excluded.duration, cover = excluded.cover,
      age = excluded.age, level = excluded.level, content_json = excluded.content_json,
      is_available = 1, is_published = 1, revision = library_lessons.revision + 1, updated_at = excluded.updated_at
    `).run(id, draftId, adminId, title, draft.student_age_group, draft.student_level, input.category, description,
      JSON.stringify([...new Set(input.skills)]), duration, cover, JSON.stringify(snapshot), now, now);
    for (const [name, data] of media) {
      database.prepare('INSERT OR IGNORE INTO library_assets (lesson_id, file_name, data) VALUES (?, ?, ?)').run(id, name, data);
    }
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

function findLibraryAsset(id, fileName, database, ownerId = null) {
  return database.prepare(`SELECT a.data FROM library_assets a JOIN library_lessons l ON l.id = a.lesson_id
    WHERE a.lesson_id = ? AND a.file_name = ? AND (l.is_published = 1 OR l.published_by = ?) AND l.is_available = 1`).get(id, fileName, ownerId)?.data;
}

module.exports = { listLibraryLessons, findLibraryLesson, publicationForDraft, publishLesson, unpublishLesson, unpublishLibraryLesson, findLibraryAsset };
