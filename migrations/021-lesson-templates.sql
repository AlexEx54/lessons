-- Copies of lesson templates. System templates live in lib/templates/ and are not stored here.
CREATE TABLE lesson_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  description TEXT NOT NULL DEFAULT '',
  -- 'template-2' or the id of another copy; kept as text after the source is deleted.
  source_template_id TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  definition_json TEXT NOT NULL,
  -- Optimistic locking: every update names the revision it was based on.
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

-- The template definition a draft was generated from. NULL for drafts created before
-- snapshots and for Template 1, which has no definition yet.
ALTER TABLE lesson_drafts ADD COLUMN template_snapshot_json TEXT;
