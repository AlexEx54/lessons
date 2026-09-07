-- Keep the historical session records (including invite_token) for recovery.
-- Live state and command history are left intact.
ALTER TABLE class_guest_sessions RENAME TO class_guest_sessions_legacy;
CREATE TABLE class_guest_sessions (
  token_hash TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
) STRICT;
INSERT INTO class_guest_sessions (token_hash, class_id, expires_at)
SELECT token_hash, class_id, expires_at FROM class_guest_sessions_legacy;
CREATE INDEX class_guest_sessions_expiry ON class_guest_sessions(expires_at);
