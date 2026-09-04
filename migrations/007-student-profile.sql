ALTER TABLE lesson_drafts
  ADD COLUMN student_age_group TEXT NOT NULL DEFAULT '12-14'
  CHECK (student_age_group IN ('9-11', '12-14', '15-18'));

ALTER TABLE lesson_drafts
  ADD COLUMN student_level TEXT NOT NULL DEFAULT 'A2'
  CHECK (student_level IN ('A1', 'A2', 'B1', 'B2'));
