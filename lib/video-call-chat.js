'use strict';
const path = require('node:path');
const { DEFAULT_DB_PATH } = require('./db.js');
const { getAuthenticatedUser } = require('./auth.js');
const { createChat, fail, MAX_FILE } = require('./chat.js');
const { findOwnedVideoCall, findVideoCallByInviteToken } = require('./video-call-store.js');
const MAX_CALL = 250 * 1024 * 1024;
// The chat of a permanent video call room, kept between calls.
function createVideoCallChat({ database, broadcast, directory = process.env.VIDEO_CALL_FILES_DIR || path.join(path.dirname(process.env.APP_DB_PATH || DEFAULT_DB_PATH), 'video-call-files') }) {
  return createChat({
    database, directory, broadcast, quota: MAX_CALL,
    tables: { messages: 'video_call_messages', attachments: 'video_call_attachments', parent: 'video_calls', key: 'call_id' },
    route: /^\/api\/(?<guest>public\/)?video-calls\/(?<reference>[^/]+)\/chat(?:\/(?<attachments>attachments)(?:\/(?<file>[^/]+))?)?$/,
    authorize(req, match) {
      const reference = decodeURIComponent(match.groups.reference);
      if (match.groups.guest) {
        const call = findVideoCallByInviteToken(reference, database);
        if (!call) fail(404, 'Чат не найден или ссылка недействительна.');
        // A room has exactly one student, whose link never changes.
        return { thread: call.id, role: 'guest', key: 'guest' };
      }
      const user = getAuthenticatedUser(req, database);
      if (!user) fail(403, 'Требуется вход преподавателя.');
      const call = findOwnedVideoCall(reference, user.id, database);
      if (!call) fail(404, 'Чат не найден.');
      return { thread: call.id, role: 'teacher', key: user.id, name: user.displayName || 'Преподаватель' };
    },
  });
}
module.exports = { createVideoCallChat, MAX_FILE, MAX_CALL };
