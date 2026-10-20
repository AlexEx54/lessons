'use strict';

const { getDatabase } = require('./db.js');
const { notify } = require('./notification-store.js');

const MAX_MESSAGE_LENGTH = 2000;
const PREVIEW_LENGTH = 140;
const HISTORY_LIMIT = 200;
const CLIENT_ID_PATTERN = /^[a-f0-9-]{36}$/i;

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

// A teacher's thread and each admin's notification about it share this key.
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
function postTeacherMessage(teacher, { clientId, text }, database = getDatabase()) {
  if (typeof clientId !== 'string' || !CLIENT_ID_PATTERN.test(clientId)) throw invalid('Некорректный идентификатор отправки.');
  const previous = database.prepare('SELECT * FROM support_messages WHERE teacher_id = ? AND client_id = ?').get(teacher.id, clientId);
  if (previous) return { message: publicMessage(previous), created: false };

  const body = typeof text === 'string' ? text.trim() : '';
  if (!body) throw invalid('Напишите сообщение.');
  if (body.length > MAX_MESSAGE_LENGTH) throw invalid(`Сообщение должно быть не длиннее ${MAX_MESSAGE_LENGTH} символов.`);

  database.exec('BEGIN IMMEDIATE');
  try {
    const { lastInsertRowid } = database.prepare(`
      INSERT INTO support_messages (teacher_id, sender, author_id, client_id, body, created_at)
      VALUES (?, 'teacher', ?, ?, ?, ?)
    `).run(teacher.id, teacher.id, clientId, body, new Date().toISOString());
    const admins = database.prepare(`SELECT id FROM users WHERE role = 'admin' AND status = 'active' AND id != ?`).all(teacher.id);
    const question = {
      type: 'support_question',
      subjectKey: threadKey(teacher.id),
      payload: { teacherId: teacher.id, teacherName: teacher.displayName || teacher.email, preview: preview(body) },
    };
    for (const admin of admins) notify(admin.id, question, database);
    const row = database.prepare('SELECT * FROM support_messages WHERE id = ?').get(lastInsertRowid);
    database.exec('COMMIT');
    return { message: publicMessage(row), created: true };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

module.exports = { MAX_MESSAGE_LENGTH, listSupportMessages, postTeacherMessage, threadKey };
