-- A group class admits several students; each of them picks a name from the class roster,
-- so their answers and messages follow them across devices.
ALTER TABLE classes ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0 CHECK (is_group IN (0, 1));

CREATE TABLE class_students (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (class_id, name)
) STRICT;

-- The device remembers who the student is; in a 1:1 class it stays empty.
ALTER TABLE class_guest_sessions ADD COLUMN student_id TEXT REFERENCES class_students(id) ON DELETE SET NULL;
