-- A class names the level and the age group its students study at, so the library can suggest
-- lessons for it. Existing classes stay without them until the teacher fills them in.
ALTER TABLE classes ADD COLUMN level TEXT;
ALTER TABLE classes ADD COLUMN age TEXT;
