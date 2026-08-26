'use strict';

function generationFromRow(row) {
  if (!row) return null;
  return {
    draftId: row.draft_id,
    mode: row.mode,
    model: row.model,
    status: row.status,
    reasoning: row.reasoning_text || '',
    output: row.output_text || '',
    costUsd: row.cost_usd,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    reasoningTokens: row.reasoning_tokens,
    providerGenerationId: row.provider_generation_id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    errorMessage: row.error_message,
  };
}

function createLessonGeneration({ draftId, mode, model = null }, database) {
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO lesson_draft_generations (
      draft_id, mode, model, status, started_at
    ) VALUES (?, ?, ?, 'running', ?)
  `).run(draftId, mode, model, now);
  return findLessonGeneration(draftId, database);
}

function findLessonGeneration(draftId, database) {
  return generationFromRow(database.prepare(`
    SELECT * FROM lesson_draft_generations WHERE draft_id = ?
  `).get(draftId));
}

function updateLessonGenerationStream({
  draftId,
  reasoning,
  output,
  providerGenerationId,
}, database) {
  database.prepare(`
    UPDATE lesson_draft_generations
    SET reasoning_text = ?, output_text = ?,
        provider_generation_id = COALESCE(?, provider_generation_id)
    WHERE draft_id = ? AND status = 'running'
  `).run(reasoning || '', output || '', providerGenerationId || null, draftId);
  return findLessonGeneration(draftId, database);
}

function completeLessonGeneration({ draftId, reasoning, output, usage = {}, providerGenerationId }, database) {
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_draft_generations
    SET status = 'completed', reasoning_text = ?, output_text = ?,
        cost_usd = ?, prompt_tokens = ?, completion_tokens = ?, reasoning_tokens = ?,
        provider_generation_id = COALESCE(?, provider_generation_id),
        completed_at = ?, error_message = NULL
    WHERE draft_id = ? AND status = 'running'
  `).run(
    reasoning || '',
    output || '',
    Number.isFinite(usage.cost) ? usage.cost : null,
    Number.isInteger(usage.promptTokens) ? usage.promptTokens : null,
    Number.isInteger(usage.completionTokens) ? usage.completionTokens : null,
    Number.isInteger(usage.reasoningTokens) ? usage.reasoningTokens : null,
    providerGenerationId || null,
    now,
    draftId,
  );
  if (result.changes === 0) throw Object.assign(new Error('Генерация уже завершена.'), { statusCode: 409 });
  return findLessonGeneration(draftId, database);
}

function failLessonGeneration({ draftId, reasoning, output, usage = {}, providerGenerationId, errorMessage }, database) {
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE lesson_draft_generations
    SET status = 'failed', reasoning_text = ?, output_text = ?,
        cost_usd = COALESCE(?, cost_usd),
        prompt_tokens = COALESCE(?, prompt_tokens),
        completion_tokens = COALESCE(?, completion_tokens),
        reasoning_tokens = COALESCE(?, reasoning_tokens),
        provider_generation_id = COALESCE(?, provider_generation_id),
        completed_at = ?, error_message = ?
    WHERE draft_id = ? AND status = 'running'
  `).run(
    reasoning || '',
    output || '',
    Number.isFinite(usage.cost) ? usage.cost : null,
    Number.isInteger(usage.promptTokens) ? usage.promptTokens : null,
    Number.isInteger(usage.completionTokens) ? usage.completionTokens : null,
    Number.isInteger(usage.reasoningTokens) ? usage.reasoningTokens : null,
    providerGenerationId || null,
    now,
    errorMessage || 'Генерация завершилась с ошибкой.',
    draftId,
  );
  return findLessonGeneration(draftId, database);
}

function failInterruptedLessonGenerations(database) {
  const now = new Date().toISOString();
  const message = 'Генерация была прервана перезапуском сервера.';
  const rows = database.prepare(`
    SELECT draft_id FROM lesson_draft_generations WHERE status = 'running'
  `).all();
  if (rows.length === 0) return [];
  database.exec('BEGIN IMMEDIATE');
  try {
    const failGeneration = database.prepare(`
      UPDATE lesson_draft_generations
      SET status = 'failed', completed_at = ?, error_message = ?
      WHERE draft_id = ? AND status = 'running'
    `);
    const failDraft = database.prepare(`
      UPDATE lesson_drafts
      SET status = 'failed', error_message = ?, updated_at = ?
      WHERE id = ? AND status = 'generating'
    `);
    rows.forEach(({ draft_id: draftId }) => {
      failGeneration.run(now, message, draftId);
      failDraft.run(message, now, draftId);
    });
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return rows.map(row => row.draft_id);
}

module.exports = {
  completeLessonGeneration,
  createLessonGeneration,
  failInterruptedLessonGenerations,
  failLessonGeneration,
  findLessonGeneration,
  generationFromRow,
  updateLessonGenerationStream,
};
