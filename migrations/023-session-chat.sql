-- The chat of a class session, between its teacher and student; it goes with the session.
CREATE TABLE class_session_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('teacher', 'student')),
  sender_key TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  client_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(session_id, sender_key, client_id)
) STRICT;
CREATE INDEX class_session_messages_history ON class_session_messages(session_id, id);
CREATE TABLE class_session_attachments (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES class_session_messages(id) ON DELETE CASCADE,
  sender_key TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX class_session_attachments_session ON class_session_attachments(session_id, message_id);
