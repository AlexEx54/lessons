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
