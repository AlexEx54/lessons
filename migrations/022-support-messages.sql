-- One support thread per teacher. author_id is who wrote the message: the teacher, or the admin
-- who answered for support (kept even if that admin's account is later removed).
CREATE TABLE support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('teacher', 'support')),
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (teacher_id, client_id)
) STRICT;
CREATE INDEX support_messages_thread ON support_messages(teacher_id, id);
