-- Historical schema already applied to existing installations.
CREATE TABLE class_guest_sessions (
  token_hash TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  invite_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX class_guest_sessions_class_idx ON class_guest_sessions(class_id);
CREATE TABLE class_live_state (
  class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL
) STRICT;
CREATE TABLE class_live_commands (
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  command_id TEXT NOT NULL,
  PRIMARY KEY (class_id, command_id)
) STRICT;
