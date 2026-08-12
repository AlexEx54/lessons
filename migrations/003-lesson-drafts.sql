CREATE TABLE lesson_drafts (
  id TEXT PRIMARY KEY,
  owner_admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT NOT NULL CHECK (length(topic) BETWEEN 1 AND 120),
  template_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating'
    CHECK (status IN ('generating', 'review', 'published', 'failed')),
  content_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
) STRICT;

CREATE INDEX lesson_drafts_owner_updated_idx
  ON lesson_drafts(owner_admin_id, updated_at DESC);

CREATE INDEX lesson_drafts_owner_status_idx
  ON lesson_drafts(owner_admin_id, status);
