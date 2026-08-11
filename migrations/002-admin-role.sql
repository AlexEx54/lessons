CREATE TABLE users_next (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO users_next (
  id, email, password_hash, display_name, role, status, created_at, updated_at
)
SELECT id, email, password_hash, display_name, role, status, created_at, updated_at
FROM users;

CREATE TABLE sessions_next (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users_next(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
) STRICT;

INSERT INTO sessions_next (token_hash, user_id, created_at, expires_at)
SELECT token_hash, user_id, created_at, expires_at
FROM sessions;

DROP TABLE sessions;
DROP TABLE users;

ALTER TABLE users_next RENAME TO users;
ALTER TABLE sessions_next RENAME TO sessions;

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);
