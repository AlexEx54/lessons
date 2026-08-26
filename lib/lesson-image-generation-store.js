'use strict';

const IMAGE_GENERATION_STATUSES = Object.freeze([
  'pending', 'running', 'completed', 'stopped', 'unavailable', 'failed',
]);

function imageGenerationFromRow(row) {
  if (!row) return null;
  return {
    status: row.status,
    completed: row.completed_count,
    total: row.total_count,
    errorMessage: row.error_message,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  };
}

function findLessonImageGeneration(draftId, database) {
  return imageGenerationFromRow(database.prepare(`
    SELECT * FROM lesson_draft_image_generations WHERE draft_id = ?
  `).get(draftId));
}

function createLessonImageGeneration({ draftId, completed = 0, total = 0 }, database) {
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO lesson_draft_image_generations (
      draft_id, status, completed_count, total_count, updated_at
    ) VALUES (?, 'pending', ?, ?, ?)
    ON CONFLICT(draft_id) DO UPDATE SET
      status = 'pending', completed_count = excluded.completed_count,
      total_count = excluded.total_count, error_message = NULL,
      started_at = NULL, updated_at = excluded.updated_at, completed_at = NULL
  `).run(draftId, completed, total, now);
  return findLessonImageGeneration(draftId, database);
}

function startLessonImageGeneration(draftId, database) {
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_draft_image_generations
    SET status = 'running', error_message = NULL,
        started_at = COALESCE(started_at, ?), updated_at = ?, completed_at = NULL
    WHERE draft_id = ? AND status = 'pending'
  `).run(now, now, draftId);
  if (result.changes === 0) {
    const error = new Error('Генерация изображений уже запущена или завершена.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonImageGeneration(draftId, database);
}

function updateLessonImageGenerationProgress({ draftId, completed, total }, database) {
  database.prepare(`
    UPDATE lesson_draft_image_generations
    SET completed_count = ?, total_count = ?, updated_at = ?
    WHERE draft_id = ? AND status = 'running'
  `).run(completed, total, new Date().toISOString(), draftId);
  return findLessonImageGeneration(draftId, database);
}

function finishLessonImageGeneration(draftId, database) {
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE lesson_draft_image_generations
    SET status = 'completed', completed_count = total_count,
        error_message = NULL, updated_at = ?, completed_at = ?
    WHERE draft_id = ? AND status = 'running'
  `).run(now, now, draftId);
  return findLessonImageGeneration(draftId, database);
}

function setLessonImageGenerationStatus(draftId, status, errorMessage, database) {
  if (!['stopped', 'unavailable', 'failed'].includes(status)) {
    throw new Error(`Неподдерживаемый итоговый статус изображений: ${status}`);
  }
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE lesson_draft_image_generations
    SET status = ?, error_message = ?, updated_at = ?, completed_at = ?
    WHERE draft_id = ? AND status IN ('pending', 'running')
  `).run(status, errorMessage || null, now, now, draftId);
  return findLessonImageGeneration(draftId, database);
}

function stopInterruptedLessonImageGenerations(database) {
  const now = new Date().toISOString();
  const message = 'Генерация изображений остановлена перезапуском сервера.';
  const rows = database.prepare(`
    SELECT draft_id FROM lesson_draft_image_generations
    WHERE status IN ('pending', 'running')
  `).all();
  database.prepare(`
    UPDATE lesson_draft_image_generations
    SET status = 'stopped', error_message = ?, updated_at = ?, completed_at = ?
    WHERE status IN ('pending', 'running')
  `).run(message, now, now);
  return rows.map(row => row.draft_id);
}

module.exports = {
  IMAGE_GENERATION_STATUSES,
  createLessonImageGeneration,
  findLessonImageGeneration,
  finishLessonImageGeneration,
  imageGenerationFromRow,
  setLessonImageGenerationStatus,
  startLessonImageGeneration,
  stopInterruptedLessonImageGenerations,
  updateLessonImageGenerationProgress,
};
