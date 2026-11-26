-- foreign_keys: off
-- Lessons are now also made for adults and for levels C1–C2. Migration 007 limited the learner
-- profile of a draft with CHECKs, which SQLite cannot alter, so the table is rebuilt.
CREATE TABLE lesson_drafts_next (
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
  published_at TEXT,
  student_age_group TEXT NOT NULL DEFAULT '12-14'
    CHECK (student_age_group IN ('9-11', '12-14', '15-18', 'adults')),
  student_level TEXT NOT NULL DEFAULT 'A2'
    CHECK (student_level IN ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  notes_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
  notes_version INTEGER NOT NULL DEFAULT 0,
  template_snapshot_json TEXT,
  inputs_json TEXT NOT NULL DEFAULT '{}'
) STRICT;

INSERT INTO lesson_drafts_next
  (id, owner_admin_id, topic, template_id, status, content_json, error_message, created_at, updated_at, published_at,
    student_age_group, student_level, notes_json, notes_version, template_snapshot_json, inputs_json)
SELECT id, owner_admin_id, topic, template_id, status, content_json, error_message, created_at, updated_at, published_at,
  student_age_group, student_level, notes_json, notes_version, template_snapshot_json, inputs_json
FROM lesson_drafts;

DROP TABLE lesson_drafts;
ALTER TABLE lesson_drafts_next RENAME TO lesson_drafts;

CREATE INDEX lesson_drafts_owner_updated_idx ON lesson_drafts(owner_admin_id, updated_at DESC);
CREATE INDEX lesson_drafts_owner_status_idx ON lesson_drafts(owner_admin_id, status);
