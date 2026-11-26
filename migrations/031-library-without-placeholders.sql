-- foreign_keys: off
-- The ten preview cards seeded by migration 009 never had content. Without them every library
-- lesson is a real publication, so the availability flag goes away. SQLite cannot drop a column
-- used in a CHECK, so the table is rebuilt; the runner keeps foreign keys off for this migration.
CREATE TEMP TABLE placeholders AS SELECT id FROM library_lessons WHERE is_available = 0 AND id IN
  ('superhero', 'animals', 'weekend', 'music', 'travel', 'careers', 'tech', 'global', 'communication', 'discussion');
-- What the foreign keys would do on delete.
UPDATE class_sessions SET library_lesson_id = NULL WHERE library_lesson_id IN (SELECT id FROM placeholders);
DELETE FROM library_assets WHERE lesson_id IN (SELECT id FROM placeholders);
DELETE FROM library_lessons WHERE id IN (SELECT id FROM placeholders);
DROP TABLE placeholders;

CREATE TABLE library_lessons_next (
  id TEXT PRIMARY KEY,
  source_draft_id TEXT UNIQUE REFERENCES lesson_drafts(id) ON DELETE SET NULL,
  published_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  age TEXT NOT NULL,
  level TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  skills_json TEXT NOT NULL,
  duration TEXT NOT NULL,
  cover TEXT NOT NULL,
  badge TEXT,
  sort_order INTEGER NOT NULL DEFAULT -1,
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  content_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at TEXT NOT NULL
) STRICT;

INSERT INTO library_lessons_next
  (id, source_draft_id, published_by, title, age, level, category, description, skills_json, duration, cover,
    badge, sort_order, is_published, content_json, revision, published_at, updated_at)
SELECT id, source_draft_id, published_by, title, age, level, category, description, skills_json, duration, cover,
  badge, sort_order, is_published, content_json, revision, published_at, updated_at
FROM library_lessons;

DROP TABLE library_lessons;
ALTER TABLE library_lessons_next RENAME TO library_lessons;
