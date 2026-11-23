'use strict';
const path = require('node:path');
const { DEFAULT_DB_PATH } = require('./db.js');
const { createChat, fail, MAX_FILE } = require('./chat.js');
const { authorizeSession } = require('./class-live-store.js');
const { findUserById } = require('./user-store.js');
const MAX_SESSION = 100 * 1024 * 1024;
// The chat of a class session. Both sides enter it as they enter the lesson, the student with the class cookie;
// the names are the ones the session call shows, a group student's is the picked name. New messages reach the open lesson pages over the lesson socket.
// A group student uses the chat only while they have a place in the lesson (`present`), not while waiting for one.
function createSessionChat({ database, broadcast, present, directory = process.env.SESSION_CHAT_FILES_DIR || path.join(path.dirname(process.env.APP_DB_PATH || DEFAULT_DB_PATH), 'session-chat-files') }) {
  return createChat({
    database, directory, broadcast, quota: MAX_SESSION,
    tables: { messages: 'class_session_messages', attachments: 'class_session_attachments', parent: 'class_sessions', key: 'session_id' },
    route: /^\/api\/sessions\/(?<session>[a-f0-9-]{36})\/chat(?:\/(?<attachments>attachments)(?:\/(?<file>[^/]+))?)?$/i,
    authorize(req, match, url) {
      const role = url.searchParams.get('role');
      const access = ['teacher', 'student'].includes(role) && authorizeSession(req, match.groups.session, database, role);
      if (!access) fail(403, 'Откройте действующую ссылку на класс.');
      if (role === 'teacher') return { thread: access.sessionId, role, key: access.identity,
        name: findUserById(access.ownerId, database)?.display_name || 'Преподаватель' };
      if (access.isGroup && !present(access.sessionId, access.identity)) fail(403, 'Чат откроется, когда вы войдёте в занятие.');
      // A group student writes under their name; the one student of an individual class is the student on any device.
      return { thread: access.sessionId, role, key: access.studentId ?? 'student',
        name: access.name ?? database.prepare('SELECT c.name FROM class_sessions s JOIN classes c ON c.id = s.class_id WHERE s.id = ?').get(access.sessionId).name };
    },
  });
}
module.exports = { createSessionChat, MAX_FILE, MAX_SESSION };
