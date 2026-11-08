-- One row per recipient and subject: a new event on the same subject (e.g. another
-- message in a support thread) refreshes the row and makes it unread again.
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipient_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  read_at TEXT,
  UNIQUE (recipient_id, subject_key)
) STRICT;

CREATE INDEX notifications_recipient_recent ON notifications(recipient_id, updated_at);
