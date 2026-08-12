'use strict';

const crypto = require('crypto');

const DRAFT_STATUSES = Object.freeze(['generating', 'review', 'published', 'failed']);

function draftFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerAdminId: row.owner_admin_id,
    topic: row.topic,
    template: row.template_id,
    status: row.status,
    content: row.content_json ? JSON.parse(row.content_json) : null,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

function createLessonDraft({ ownerAdminId, topic, template }, database) {
  const owner = database.prepare('SELECT role FROM users WHERE id = ?').get(ownerAdminId);
  if (!owner || owner.role !== 'admin') {
    const error = new Error('Черновик урока должен принадлежать администратору.');
    error.statusCode = 403;
    throw error;
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO lesson_drafts (
      id, owner_admin_id, topic, template_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'generating', ?, ?)
  `).run(id, ownerAdminId, topic, template, now, now);
  return findLessonDraft(id, ownerAdminId, database);
}

function listLessonDrafts(ownerAdminId, database) {
  return database.prepare(`
    SELECT * FROM lesson_drafts
    WHERE owner_admin_id = ?
    ORDER BY updated_at DESC, created_at DESC
  `).all(ownerAdminId).map(draftFromRow);
}

function findLessonDraft(id, ownerAdminId, database) {
  return draftFromRow(database.prepare(`
    SELECT * FROM lesson_drafts WHERE id = ? AND owner_admin_id = ?
  `).get(id, ownerAdminId));
}

function transitionLessonDraft({ id, ownerAdminId, from, to, content, errorMessage }, database) {
  const now = new Date().toISOString();
  const contentJson = content === undefined ? null : JSON.stringify(content);
  const publishedAt = to === 'published' ? now : null;
  const result = database.prepare(`
    UPDATE lesson_drafts
    SET status = ?, content_json = COALESCE(?, content_json), error_message = ?,
        updated_at = ?, published_at = COALESCE(?, published_at)
    WHERE id = ? AND owner_admin_id = ? AND status = ?
  `).run(to, contentJson, errorMessage || null, now, publishedAt, id, ownerAdminId, from);

  if (result.changes === 0) {
    const error = new Error(`Черновик нельзя перевести из статуса ${from} в ${to}.`);
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function completeLessonDraft(id, ownerAdminId, content, database) {
  return transitionLessonDraft({
    id, ownerAdminId, from: 'generating', to: 'review', content, errorMessage: null,
  }, database);
}

function failLessonDraft(id, ownerAdminId, errorMessage, database) {
  return transitionLessonDraft({
    id, ownerAdminId, from: 'generating', to: 'failed', errorMessage,
  }, database);
}

function retryLessonDraft(id, ownerAdminId, database) {
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts
    SET status = 'generating', content_json = NULL, error_message = NULL,
        updated_at = ?, published_at = NULL
    WHERE id = ? AND owner_admin_id = ? AND status = 'failed'
  `).run(now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Повторный запуск доступен только для черновика с ошибкой.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function publishLessonDraft(id, ownerAdminId, database) {
  return transitionLessonDraft({
    id, ownerAdminId, from: 'review', to: 'published', errorMessage: null,
  }, database);
}

module.exports = {
  DRAFT_STATUSES,
  completeLessonDraft,
  createLessonDraft,
  failLessonDraft,
  findLessonDraft,
  listLessonDrafts,
  publishLessonDraft,
  retryLessonDraft,
};
