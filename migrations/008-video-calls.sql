CREATE TABLE video_calls (
  id TEXT PRIMARY KEY,
  owner_admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guest_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'active', 'ended', 'expired')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  started_at TEXT,
  ended_at TEXT
) STRICT;

CREATE INDEX video_calls_owner_created_idx
  ON video_calls(owner_admin_id, created_at DESC);

CREATE INDEX video_calls_expiry_idx
  ON video_calls(status, expires_at);
