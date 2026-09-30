-- A class (a student or a group) now keeps one permanent invite link and holds
-- scheduled sessions. The old one-off classes are disposable and are dropped,
-- together with the never-used class_live_commands table.
DROP TABLE class_notes;
DROP TABLE class_live_commands;
DROP TABLE class_live_state;
DROP TABLE class_guest_sessions;
DROP TABLE class_guest_sessions_legacy;
DROP TABLE class_assets;
DROP TABLE classes;

CREATE TABLE classes (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  invite_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX classes_owner_idx ON classes(owner_id);

CREATE TABLE class_sessions (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  request_key TEXT NOT NULL UNIQUE,
  request_json TEXT NOT NULL,
  library_lesson_id TEXT REFERENCES library_lessons(id) ON DELETE SET NULL,
  library_revision INTEGER NOT NULL,
  title TEXT NOT NULL,
  level TEXT NOT NULL,
  duration TEXT NOT NULL,
  cover TEXT NOT NULL,
  content_json TEXT NOT NULL,
  scheduled_at TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'cancelled')),
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX class_sessions_class_schedule_idx ON class_sessions(class_id, status, scheduled_at);

CREATE TABLE class_assets (
  session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (session_id, file_name)
) STRICT;
CREATE TABLE class_live_state (
  session_id TEXT PRIMARY KEY REFERENCES class_sessions(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL
) STRICT;
CREATE TABLE class_notes (
  session_id TEXT PRIMARY KEY REFERENCES class_sessions(id) ON DELETE CASCADE,
  state BLOB NOT NULL,
  format_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
) STRICT;

-- A student who opened the class link may enter any of its sessions.
CREATE TABLE class_guest_sessions (
  token_hash TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX class_guest_sessions_expiry ON class_guest_sessions(expires_at);
