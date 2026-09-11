ALTER TABLE lesson_drafts ADD COLUMN notes_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}';
ALTER TABLE lesson_drafts ADD COLUMN notes_version INTEGER NOT NULL DEFAULT 0;
CREATE TABLE class_notes (
  class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  state BLOB NOT NULL,
  format_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
) STRICT;
