'use strict';
const crypto = require('node:crypto');
const { slug } = require('../assets/class-invite.js');
const { findLibraryLesson } = require('./library-store.js');
const COLUMNS = 'id, name, title, level, duration, cover, scheduled_at, time_zone, status, created_at, library_revision, invite_token';
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function present(row) {
  if (!row) return null;
  const { invite_token, content_json, ...result } = row;
  return { ...result, invitePath: `/join/${invite_token}`, lessonPath: `/classes/${row.id}`, ...(content_json ? { content: JSON.parse(content_json) } : {}) };
}
function findClass(id, ownerId, db) {
  return present(db.prepare(`SELECT ${COLUMNS}, content_json FROM classes WHERE id = ? AND owner_id = ?`).get(id, ownerId));
}
function findClassByInvite(token, ownerId, db) {
  return present(db.prepare(`SELECT ${COLUMNS} FROM classes WHERE invite_token = ? AND owner_id = ?`).get(token, ownerId));
}
function listClasses(ownerId, db) {
  return db.prepare(`SELECT ${COLUMNS} FROM classes WHERE owner_id = ? AND status = 'upcoming'
    ORDER BY scheduled_at IS NULL, scheduled_at, created_at DESC, id`).all(ownerId).map(present);
}
function findClassAsset(id, name, ownerId, db) {
  return db.prepare(`SELECT a.data FROM class_assets a JOIN classes c ON c.id = a.class_id
    WHERE a.class_id = ? AND a.file_name = ? AND c.owner_id = ?`).get(id, name, ownerId)?.data;
}
function createClass(input, ownerId, db) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Некорректные данные класса.');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 80) fail('Введите название класса (до 80 символов).');
  if (typeof input.lessonId !== 'string' || !input.lessonId || !Number.isInteger(input.expectedRevision)) fail('Выберите урок из библиотеки.');
  if (typeof input.requestKey !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestKey)) fail('Некорректный ключ создания класса.');
  const timeZone = input.timeZone || 'UTC';
  try { if (typeof timeZone !== 'string') throw new Error(); new Intl.DateTimeFormat('ru', { timeZone }); }
  catch { fail('Некорректный часовой пояс.'); }
  let scheduledAt = null;
  if (input.scheduledAt != null && input.scheduledAt !== '') {
    if (typeof input.scheduledAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(input.scheduledAt) || !Number.isFinite(Date.parse(input.scheduledAt))) fail('Укажите корректное время урока.');
    scheduledAt = new Date(input.scheduledAt).toISOString();
  }
  const requestJson = JSON.stringify({ name: input.name.trim(), lessonId: input.lessonId, revision: input.expectedRevision, scheduledAt, timeZone });
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT id, request_json FROM classes WHERE owner_id = ? AND request_key = ?').get(ownerId, input.requestKey);
    if (existing) {
      if (existing.request_json !== requestJson) fail('Этот запрос уже использован для другого класса.', 409);
      const result = findClass(existing.id, ownerId, db);
      db.exec('COMMIT');
      return result;
    }
    if (scheduledAt && Date.parse(scheduledAt) <= Date.now()) fail('Выберите время в будущем.');
    const lesson = findLibraryLesson(input.lessonId, db);
    if (!lesson) fail('Урок больше недоступен. Выберите другой урок.', 409);
    if (lesson.revision !== input.expectedRevision) fail('Урок обновлён. Выберите его заново.', 409);
    const id = crypto.randomUUID();
    const media = new Map();
    const snapshot = value => {
      if (typeof value === 'string') return value.replace(/\/api\/library\/([a-z0-9-]+)\/assets\/([a-f0-9]{64}\.(?:jpg|png|webp|mp3|wav|m4a|mp4))/gi, (source, lessonId, fileName) => {
        if (lessonId !== lesson.id) fail('В уроке есть недоступный файл.', 409);
        const asset = db.prepare('SELECT data FROM library_assets WHERE lesson_id = ? AND file_name = ?').get(lessonId, fileName);
        if (!asset) fail('Не найден файл урока.', 409);
        media.set(fileName, asset.data);
        return `/api/classes/${id}/assets/${fileName}`;
      });
      if (Array.isArray(value)) return value.map(snapshot);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)]));
      return value;
    };
    const content = snapshot(lesson.content), cover = snapshot(lesson.cover);
    db.prepare(`INSERT INTO classes (id, owner_id, request_key, request_json, invite_token, name, library_lesson_id,
      library_revision, title, level, duration, cover, content_json, scheduled_at, time_zone, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, ownerId, input.requestKey, requestJson, `${slug(input.name)}-${crypto.randomBytes(24).toString('hex')}`, input.name.trim(), lesson.id,
        lesson.revision, lesson.title, lesson.level, lesson.duration, cover, JSON.stringify(content), scheduledAt, timeZone, new Date().toISOString());
    for (const [name, data] of media) db.prepare('INSERT INTO class_assets (class_id, file_name, data) VALUES (?, ?, ?)').run(id, name, data);
    const result = findClass(id, ownerId, db);
    db.exec('COMMIT');
    return result;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
module.exports = { createClass, findClass, findClassByInvite, listClasses, findClassAsset };
