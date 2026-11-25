-- Lesson files move to disk (media/ next to the database), one copy per content.
-- The asset tables keep only which library lesson or class session uses which file.
-- The old tables with the bytes stay until scripts/migrate-media.js moves their files to disk.
ALTER TABLE library_assets RENAME TO legacy_library_assets;
ALTER TABLE class_assets RENAME TO legacy_class_assets;

CREATE TABLE library_assets (
  lesson_id TEXT NOT NULL REFERENCES library_lessons(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  PRIMARY KEY (lesson_id, file_name)
) STRICT;

CREATE TABLE class_assets (
  session_id TEXT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  PRIMARY KEY (session_id, file_name)
) STRICT;
