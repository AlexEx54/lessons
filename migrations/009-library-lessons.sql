CREATE TABLE library_lessons (
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
  is_available INTEGER NOT NULL DEFAULT 0 CHECK (is_available IN (0, 1)),
  is_published INTEGER NOT NULL DEFAULT 1 CHECK (is_published IN (0, 1)),
  content_json TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  CHECK (is_available = 0 OR content_json IS NOT NULL)
) STRICT;

CREATE TABLE library_assets (
  lesson_id TEXT NOT NULL REFERENCES library_lessons(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (lesson_id, file_name)
) STRICT;

INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('superhero', 'My Superhero', '9-11', 'A1', 'General English', 'Говорим о героях и развиваем словарный запас.', '["Vocabulary","Speaking"]', '30–45 мин', '/assets/images/lesson-superhero.png', 'NEW', 0, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('animals', 'Animals and Their Superpowers', '9-11', 'A1', 'General English', 'Изучаем животных и их суперсилы.', '["Vocabulary","Listening"]', '30–45 мин', '/assets/images/lesson-animals.png', NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('weekend', 'My Perfect Weekend', '12-14', 'A2', 'Speaking', 'Рассказываем о выходных и любимых занятиях.', '["Speaking","Writing"]', '30–45 мин', '/assets/images/lesson-weekend.png', NULL, 2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('music', 'Music and Mood', '12-14', 'A2', 'Speaking', 'Музыка, эмоции и выражение своего мнения.', '["Listening","Speaking"]', '30–45 мин', '/assets/images/lesson-music.png', 'Популярное', 3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('travel', 'Travel & Transport', '12-14', 'A2', 'General English', 'Транспорт, путешествия и полезные фразы.', '["Vocabulary","Speaking"]', '30–45 мин', '/assets/images/lesson-travel.png', NULL, 4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('careers', 'Future Careers', '15-18', 'B1', 'Speaking', 'Профессии будущего и планы на жизнь.', '["Vocabulary","Speaking"]', '45 мин', '/assets/images/lesson-careers.png', 'NEW', 5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('tech', 'Working in Tech', '15-18', 'B1', 'Grammar', 'Работа в IT: навыки, команды и проекты.', '["Listening","Speaking"]', '45 мин', '/assets/images/lesson-work-tech.png', NULL, 6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('global', 'Global Issues', '15-18', 'B2', 'ОГЭ / ЕГЭ', 'Обсуждаем важные мировые проблемы.', '["Listening","Speaking"]', '45 мин', '/assets/images/lesson-global.png', 'NEW', 7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('communication', 'Everyday Communication', '12-14', 'B1', 'General English', 'Учимся уверенно общаться каждый день.', '["Speaking","Grammar"]', '30–45 мин', '/assets/images/lesson-communication.png', NULL, 8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover, badge, sort_order, updated_at) VALUES ('discussion', 'Discussion Club', '15-18', 'B2', 'ОГЭ / ЕГЭ', 'Аргументируем мнение и ведём дискуссию.', '["Speaking","Listening"]', '45 мин', '/assets/images/lesson-discussion.png', NULL, 9, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
