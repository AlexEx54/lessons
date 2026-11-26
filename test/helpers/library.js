'use strict';

// Adds a published library lesson with the given content, as publication leaves it.
function addLibraryLesson(db, content, id = 'superhero') {
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO library_lessons
    (id, title, age, level, category, description, skills_json, duration, cover, content_json, revision, published_at, updated_at)
    VALUES (?, 'My Superhero', '9-11', 'A1', 'General English', 'Test lesson.', '["Vocabulary"]', '45 мин',
      '/assets/images/lesson-superhero.png', ?, 1, ?, ?)`).run(id, JSON.stringify(content), now, now);
}

module.exports = { addLibraryLesson };
