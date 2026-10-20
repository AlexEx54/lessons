'use strict';

const { getDatabase } = require('./db.js');

const LIST_LIMIT = 20;

function publicNotification(row) {
  return {
    id: row.id,
    type: row.type,
    subjectKey: row.subject_key,
    payload: JSON.parse(row.payload),
    updatedAt: row.updated_at,
    read: row.read_at !== null,
  };
}

function notify(recipientId, { type, subjectKey, payload }, database = getDatabase()) {
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO notifications (recipient_id, type, subject_key, payload, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (recipient_id, subject_key) DO UPDATE SET
      type = excluded.type, payload = excluded.payload, updated_at = excluded.updated_at, read_at = NULL
  `).run(recipientId, type, subjectKey, JSON.stringify(payload), now, now);
}

function listNotifications(recipientId, database = getDatabase()) {
  const rows = database.prepare(`
    SELECT * FROM notifications WHERE recipient_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?
  `).all(recipientId, LIST_LIMIT);
  const { count } = database.prepare(
    'SELECT COUNT(*) AS count FROM notifications WHERE recipient_id = ? AND read_at IS NULL',
  ).get(recipientId);
  return { notifications: rows.map(publicNotification), unreadCount: count };
}

function markNotificationRead(recipientId, subjectKey, database = getDatabase()) {
  database.prepare(`
    UPDATE notifications SET read_at = ? WHERE recipient_id = ? AND subject_key = ? AND read_at IS NULL
  `).run(new Date().toISOString(), recipientId, subjectKey);
}

// Settles a subject for every recipient, e.g. a question that one of the admins has answered.
function markNotificationsReadForAll(type, subjectKey, database = getDatabase()) {
  database.prepare(`
    UPDATE notifications SET read_at = ? WHERE type = ? AND subject_key = ? AND read_at IS NULL
  `).run(new Date().toISOString(), type, subjectKey);
}

module.exports = { listNotifications, markNotificationRead, markNotificationsReadForAll, notify };
