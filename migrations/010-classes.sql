CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL,
  request_json TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  library_lesson_id TEXT REFERENCES library_lessons(id) ON DELETE SET NULL,
  library_revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  level TEXT NOT NULL,
  duration TEXT NOT NULL,
  cover TEXT NOT NULL,
  content_json TEXT NOT NULL,
  scheduled_at TEXT,
  time_zone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled')),
  created_at TEXT NOT NULL,
  UNIQUE (owner_id, request_key)
) STRICT;
CREATE INDEX classes_owner_schedule_idx ON classes(owner_id, status, scheduled_at);
CREATE TABLE class_assets (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (class_id, file_name)
) STRICT;
