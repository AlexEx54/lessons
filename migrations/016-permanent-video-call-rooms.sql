-- A video call is now a permanent personal room with one invite link per student.
-- The old one-off calls are dropped with their chats; the chat cleanup removes
-- their files from disk on the next start.
DROP TABLE video_call_attachments;
DROP TABLE video_call_messages;
DROP TABLE video_calls;

CREATE TABLE video_calls (
  id TEXT PRIMARY KEY,
  owner_admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_call_at TEXT
) STRICT;
CREATE INDEX video_calls_owner_idx ON video_calls(owner_admin_id);

CREATE TABLE video_call_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_id TEXT NOT NULL REFERENCES video_calls(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL CHECK(sender_role IN ('teacher', 'guest')),
  sender_key TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  client_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(call_id, sender_key, client_id)
) STRICT;
CREATE INDEX video_call_messages_history ON video_call_messages(call_id, id);

CREATE TABLE video_call_attachments (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL REFERENCES video_calls(id) ON DELETE CASCADE,
  message_id INTEGER REFERENCES video_call_messages(id) ON DELETE CASCADE,
  sender_key TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL DEFAULT 'application/octet-stream',
  ready INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX video_call_attachments_call ON video_call_attachments(call_id, message_id);
