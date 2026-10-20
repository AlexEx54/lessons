'use strict';

const { getDatabase } = require('./db.js');
const { markNotificationsReadForAll, notify } = require('./notification-store.js');

const MAX_MESSAGE_LENGTH = 2000;
const PREVIEW_LENGTH = 140;
const HISTORY_LIMIT = 200;
const THREAD_LIST_LIMIT = 100;
const CLIENT_ID_PATTERN = /^[a-f0-9-]{36}$/i;

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// A teacher's thread and the notifications about it, questions to admins and replies to the teacher, share this key.
function threadKey(teacherId) {
  return `support:${teacherId}`;
}

function publicMessage(row) {
  return { id: row.id, clientId: row.client_id, sender: row.sender, text: row.body, createdAt: row.created_at };
}

function preview(text) {
  const line = text.replace(/\s+/g, ' ');
  return line.length > PREVIEW_LENGTH ? `${line.slice(0, PREVIEW_LENGTH - 1)}…` : line;
}

// The first load shows the latest messages. Later reads continue right after the client's
// cursor, so a long gap is caught up page by page instead of being skipped.
function listSupportMessages(teacherId, { after = 0 } = {}, database = getDatabase()) {
  if (!after) {
    const rows = database.prepare(`
      SELECT * FROM support_messages WHERE teacher_id = ? ORDER BY id DESC LIMIT ?
    `).all(teacherId, HISTORY_LIMIT);
    return rows.reverse().map(publicMessage);
  }
  return database.prepare(`
    SELECT * FROM support_messages WHERE teacher_id = ? AND id > ? ORDER BY id LIMIT ?
  `).all(teacherId, after, HISTORY_LIMIT).map(publicMessage);
}

// Repeating a send with the same clientId returns the stored message instead of a duplicate.
// `onCreated` runs inside the insert's transaction, so a message and its notifications land together.
function postMessage(teacherId, sender, authorId, { clientId, text }, onCreated, database) {
  if (typeof clientId !== 'string' || !CLIENT_ID_PATTERN.test(clientId)) throw invalid('Некорректный идентификатор отправки.');
  const previous = database.prepare('SELECT * FROM support_messages WHERE teacher_id = ? AND client_id = ?').get(teacherId, clientId);
  if (previous) return { message: publicMessage(previous), created: false };

  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) throw invalid('Напишите сообщение.');
  if (body.length > MAX_MESSAGE_LENGTH) throw invalid(`Сообщение должно быть не длиннее ${MAX_MESSAGE_LENGTH} символов.`);

  database.exec('BEGIN IMMEDIATE');
  try {
    const { lastInsertRowid } = database.prepare(`
      INSERT INTO support_messages (teacher_id, sender, author_id, client_id, body, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(teacherId, sender, authorId, clientId, body, new Date().toISOString());
    onCreated(body);
    const row = database.prepare('SELECT * FROM support_messages WHERE id = ?').get(lastInsertRowid);
    database.exec('COMMIT');
    return { message: publicMessage(row), created: true };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function postTeacherMessage(teacher, input, database = getDatabase()) {
  return postMessage(teacher.id, 'teacher', teacher.id, input, body => {
    const admins = database.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id != ?`).all(teacher.id);
    const question = {
      type: 'support_question',
      subjectKey: threadKey(teacher.id),
      payload: { teacherId: teacher.id, teacherName: teacher.displayName || teacher.email, preview: preview(body) },
    };
    for (const admin of admins) notify(admin.id, question, database);
  }, database);
}

// Replies are signed by support as a whole; author_id only records which admin wrote one.
function postSupportReply(admin, teacherId, input, database = getDatabase()) {
  if (!database.prepare('SELECT 1 FROM users WHERE id = ?').get(teacherId)) {
    throw Object.assign(new Error('Преподаватель не найден.'), { statusCode: 404 });
  }
  return postMessage(teacherId, 'support', admin.id, input, body => {
    notify(teacherId, { type: 'support_reply', subjectKey: threadKey(teacherId), payload: { preview: preview(body) } }, database);
    // Once one admin has answered, the question stops waiting in every admin's bell.
    markNotificationsReadForAll('support_question', threadKey(teacherId), database);
  }, database);
}

// One row per teacher who has written: those waiting for an answer first, then the most recent.
function listSupportThreads(database = getDatabase()) {
  return database.prepare(`
    SELECT m.sender, m.body, m.created_at, u.id AS teacher_id, u.display_name, u.email
    FROM support_messages m JOIN users u ON u.id = m.teacher_id
    WHERE m.id IN (SELECT MAX(id) FROM support_messages GROUP BY teacher_id)
    ORDER BY m.sender = 'teacher' DESC, m.id DESC
    LIMIT ?
  `).all(THREAD_LIST_LIMIT).map(row => ({
    teacherId: row.teacher_id,
    teacherName: row.display_name || row.email,
    teacherEmail: row.email,
    preview: preview(row.body),
    waiting: row.sender === 'teacher',
    lastAt: row.created_at,
  }));
}

module.exports = { MAX_MESSAGE_LENGTH, listSupportMessages, listSupportThreads, postSupportReply, postTeacherMessage, threadKey };
