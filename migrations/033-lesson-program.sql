-- A library lesson names its grammar point (a key of assets/lesson-program.json), its topic in Russian
-- and, for holiday lessons, a season. Lessons published earlier get them from the markup script.
ALTER TABLE library_lessons ADD COLUMN grammar_point TEXT;
ALTER TABLE library_lessons ADD COLUMN topic TEXT;
ALTER TABLE library_lessons ADD COLUMN season TEXT;
