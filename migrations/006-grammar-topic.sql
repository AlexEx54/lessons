ALTER TABLE lesson_drafts
  ADD COLUMN grammar_topic TEXT
  CHECK (grammar_topic IS NULL OR length(grammar_topic) BETWEEN 1 AND 120);

UPDATE lesson_drafts
SET grammar_topic = topic
WHERE grammar_topic IS NULL;
