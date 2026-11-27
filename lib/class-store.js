'use strict';
const crypto = require('node:crypto');
const { createInviteToken } = require('./invite-token.js');
const { findLibraryLesson } = require('./library-store.js');
const { grammarTitle } = require('./lesson-program.js');
const { LEVELS, ageLabel, isAgeGroup } = require('./learner-profile.js');
const SESSION_COLUMNS = `s.id, s.class_id, c.name AS class_name, c.invite_token, s.title, s.level, s.duration, s.cover,
  s.scheduled_at, s.time_zone, s.status, s.created_at, s.library_revision`;
const SESSIONS = 'class_sessions s JOIN classes c ON c.id = s.class_id';
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function presentClass({ invite_token, is_group, ...row }) {
  return { ...row, age_label: ageLabel(row.age), isGroup: Boolean(is_group), invitePath: `/join/${invite_token}` };
}
function presentSession(row) {
  if (!row) return null;
  const { invite_token, content_json, ...result } = row;
  return { ...result, path: `/sessions/${row.id}`, sessionInvitePath: `/join/${invite_token}/${row.id}`, classInvitePath: `/join/${invite_token}`,
    ...(content_json ? { content: JSON.parse(content_json) } : {}) };
}
function className(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) fail('Введите название класса (до 80 символов).');
  return value.trim();
}
function learnerProfile({ level, age }) {
  if (!LEVELS.includes(level)) fail('Выберите уровень класса.');
  if (!isAgeGroup(age)) fail('Выберите возраст класса.');
  return { level, age };
}
// A session has been held once its time came and it was not cancelled.
const HELD = "s.status = 'upcoming' AND s.scheduled_at <= :now";
const AHEAD = "s.status = 'upcoming' AND s.scheduled_at > :now";
const CLASS_COLUMNS = 'c.id, c.name, c.invite_token, c.is_group, c.level, c.age, c.created_at';
// Classes the teacher planned for most recently come first.
function listClasses(ownerId, db) {
  return db.prepare(`SELECT ${CLASS_COLUMNS}, COUNT(s.id) FILTER (WHERE ${HELD}) AS held_count,
    MIN(s.scheduled_at) FILTER (WHERE ${AHEAD}) AS next_session_at
    FROM classes c LEFT JOIN class_sessions s ON s.class_id = c.id
    WHERE c.owner_id = :ownerId GROUP BY c.id ORDER BY COALESCE(MAX(s.created_at), c.created_at) DESC, c.id`)
    .all({ ownerId, now: new Date().toISOString() }).map(presentClass);
}
// The name, level and age are edited together, as the class card shows them.
function updateClass(id, input, ownerId, db) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Некорректные данные класса.');
  const name = className(input.name);
  const { level, age } = learnerProfile(input);
  const { changes } = db.prepare('UPDATE classes SET name = ?, level = ?, age = ? WHERE id = ? AND owner_id = ?').run(name, level, age, id, ownerId);
  if (!changes) fail('Класс не найден.', 404);
  return listClasses(ownerId, db).find(item => item.id === id);
}
// What the class went through, newest first. Cancelled sessions never happened, so they are left out.
// The grammar point comes from the library lesson, which the session snapshot does not keep.
function listClassHistory(classId, ownerId, db) {
  if (!db.prepare('SELECT 1 FROM classes WHERE id = ? AND owner_id = ?').get(classId, ownerId)) return null;
  return db.prepare(`SELECT s.id, s.title, s.level, s.scheduled_at, s.library_lesson_id, l.grammar_point, ${HELD} AS held
    FROM class_sessions s LEFT JOIN library_lessons l ON l.id = s.library_lesson_id
    WHERE s.class_id = :classId AND s.status = 'upcoming' ORDER BY s.scheduled_at DESC, s.id`)
    .all({ classId, now: new Date().toISOString() })
    .map(({ held, ...row }) => ({ ...row, grammar_title: grammarTitle(row.grammar_point), held: Boolean(held), path: `/sessions/${row.id}` }));
}
function findClassSession(id, ownerId, db) {
  return presentSession(db.prepare(`SELECT ${SESSION_COLUMNS}, s.content_json FROM ${SESSIONS} WHERE s.id = ? AND c.owner_id = ?`).get(id, ownerId));
}
function listClassSessions(ownerId, db) {
  return db.prepare(`SELECT ${SESSION_COLUMNS} FROM ${SESSIONS} WHERE c.owner_id = ? AND s.status = 'upcoming'
    ORDER BY s.scheduled_at DESC, s.id`).all(ownerId).map(presentSession);
}
function parseScheduledAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value) || !Number.isFinite(Date.parse(value))) fail('Укажите корректное время урока.');
  return new Date(value).toISOString();
}
function assertFuture(scheduledAt) {
  if (Date.parse(scheduledAt) <= Date.now()) fail('Выберите время в будущем.');
}
function hasClassSessionAsset(id, name, ownerId, db) {
  return Boolean(db.prepare(`SELECT 1 FROM class_assets a JOIN class_sessions s ON s.id = a.session_id JOIN classes c ON c.id = s.class_id
    WHERE a.session_id = ? AND a.file_name = ? AND c.owner_id = ?`).get(id, name, ownerId));
}
// A session goes either to an existing class or to a new one created in the same transaction.
function classTarget(input) {
  if (input.classId !== undefined) {
    if (typeof input.classId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.classId)) fail('Выберите класс.');
    return { classId: input.classId };
  }
  const name = className(input.className);
  if (input.isGroup !== undefined && typeof input.isGroup !== 'boolean') fail('Некорректный вид класса.');
  // A class becomes a group only when it is created.
  return { className: name, ...(input.isGroup ? { isGroup: true } : {}) };
}
function insertClass({ className: name, isGroup }, ownerId, db) {
  const id = crypto.randomUUID();
  db.prepare('INSERT INTO classes (id, owner_id, name, invite_token, is_group, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, ownerId, name, createInviteToken(name), isGroup ? 1 : 0, new Date().toISOString());
  return id;
}
// The session keeps its own copy of the lesson and its own references to the media files,
// so later library edits never change it. The files themselves stay single on disk.
function snapshotLesson(lesson, sessionId, db) {
  const media = new Set();
  const snapshot = value => {
    if (typeof value === 'string') return value.replace(/\/api\/library\/([a-z0-9-]+)\/assets\/([a-f0-9]{64}\.(?:jpg|png|webp|mp3|wav|m4a|mp4))/gi, (source, lessonId, fileName) => {
      if (lessonId !== lesson.id) fail('В уроке есть недоступный файл.', 409);
      if (!db.prepare('SELECT 1 FROM library_assets WHERE lesson_id = ? AND file_name = ?').get(lessonId, fileName)) fail('Не найден файл урока.', 409);
      media.add(fileName);
      return `/api/sessions/${sessionId}/assets/${fileName}`;
    });
    if (Array.isArray(value)) return value.map(snapshot);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, snapshot(item)]));
    return value;
  };
  return { content: snapshot(lesson.content), cover: snapshot(lesson.cover), media };
}
function createClassSession(input, ownerId, db) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Некорректные данные занятия.');
  const target = classTarget(input);
  if (typeof input.lessonId !== 'string' || !input.lessonId || !Number.isInteger(input.expectedRevision)) fail('Выберите урок из библиотеки.');
  if (typeof input.requestKey !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestKey)) fail('Некорректный ключ создания занятия.');
  const timeZone = input.timeZone || 'UTC';
  try { if (typeof timeZone !== 'string') throw new Error(); new Intl.DateTimeFormat('ru', { timeZone }); }
  catch { fail('Некорректный часовой пояс.'); }
  const scheduledAt = parseScheduledAt(input.scheduledAt);
  const requestJson = JSON.stringify({ ...target, lessonId: input.lessonId, revision: input.expectedRevision, scheduledAt, timeZone });
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare(`SELECT s.id, s.request_json FROM ${SESSIONS} WHERE s.request_key = ? AND c.owner_id = ?`).get(input.requestKey, ownerId);
    if (existing) {
      if (existing.request_json !== requestJson) fail('Этот запрос уже использован для другого занятия.', 409);
      const result = findClassSession(existing.id, ownerId, db);
      db.exec('COMMIT');
      return result;
    }
    assertFuture(scheduledAt);
    if (target.classId && !db.prepare('SELECT 1 FROM classes WHERE id = ? AND owner_id = ?').get(target.classId, ownerId)) fail('Класс не найден.', 404);
    const lesson = findLibraryLesson(input.lessonId, db);
    if (!lesson) fail('Урок больше недоступен. Выберите другой урок.', 409);
    if (lesson.revision !== input.expectedRevision) fail('Урок обновлён. Выберите его заново.', 409);
    const id = crypto.randomUUID();
    const { content, cover, media } = snapshotLesson(lesson, id, db);
    const classId = target.classId ?? insertClass(target, ownerId, db);
    db.prepare(`INSERT INTO class_sessions (id, class_id, request_key, request_json, library_lesson_id, library_revision,
      title, level, duration, cover, content_json, scheduled_at, time_zone, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, classId, input.requestKey, requestJson, lesson.id, lesson.revision, lesson.title, lesson.level, lesson.duration,
        cover, JSON.stringify(content), scheduledAt, timeZone, new Date().toISOString());
    for (const name of media) db.prepare('INSERT INTO class_assets (session_id, file_name) VALUES (?, ?)').run(id, name);
    const result = findClassSession(id, ownerId, db);
    db.exec('COMMIT');
    return result;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
function updateClassSession(id, input, ownerId, db) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Некорректные данные занятия.');
  const upcoming = "WHERE id = ? AND status = 'upcoming' AND class_id IN (SELECT id FROM classes WHERE owner_id = ?)";
  let changes;
  if (input.status === 'cancelled') changes = db.prepare(`UPDATE class_sessions SET status = 'cancelled' ${upcoming}`).run(id, ownerId).changes;
  else if ('scheduledAt' in input) {
    const scheduledAt = parseScheduledAt(input.scheduledAt);
    assertFuture(scheduledAt);
    changes = db.prepare(`UPDATE class_sessions SET scheduled_at = ? ${upcoming}`).run(scheduledAt, id, ownerId).changes;
  } else fail('Некорректные данные занятия.');
  if (!changes) fail('Занятие не найдено.', 404);
  return presentSession(db.prepare(`SELECT ${SESSION_COLUMNS} FROM ${SESSIONS} WHERE s.id = ?`).get(id));
}
// Classes and their permanent links stay; sessions cascade to media, notes and live state.
function clearClassSessions(ownerId, db) {
  return db.prepare('DELETE FROM class_sessions WHERE class_id IN (SELECT id FROM classes WHERE owner_id = ?)').run(ownerId).changes;
}
module.exports = { listClasses, updateClass, listClassHistory, createClassSession, updateClassSession, clearClassSessions, findClassSession, listClassSessions, hasClassSessionAsset };
