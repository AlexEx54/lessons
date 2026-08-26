ALTER TABLE lesson_drafts
  ADD COLUMN warm_up_topic TEXT
  CHECK (warm_up_topic IS NULL OR length(warm_up_topic) BETWEEN 1 AND 120);

UPDATE lesson_drafts
SET warm_up_topic = topic
WHERE warm_up_topic IS NULL;

CREATE TABLE lesson_draft_image_generations (
  draft_id TEXT PRIMARY KEY REFERENCES lesson_drafts(id) ON DELETE CASCADE,
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'running', 'completed', 'stopped', 'unavailable', 'failed')),
  completed_count INTEGER NOT NULL DEFAULT 0 CHECK (completed_count >= 0),
  total_count INTEGER NOT NULL DEFAULT 0 CHECK (total_count >= 0),
  error_message TEXT,
  started_at TEXT,
  updated_at TEXT NOT NULL,
  completed_at TEXT
) STRICT;

CREATE INDEX lesson_draft_image_generations_status_idx
  ON lesson_draft_image_generations(status, updated_at);
