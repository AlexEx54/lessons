'use strict';

const crypto = require('crypto');
const { SYSTEM_TEMPLATES, findSystemTemplate } = require('./lesson-templates/system-templates.js');
const { assertValidTemplate } = require('./lesson-templates/validate-template.js');
const { CONTROL_CATALOG } = require('./template-controls/index.js');

// Lesson templates are the system ones from the repository followed by copies in the
// database. Every admin sees and edits every copy; `createdBy` only names the author.
// A copy may be deleted while drafts use it: each draft keeps its own snapshot.
// Lists and changes return summaries; `findLessonTemplate` adds the definition.

const TITLE_MAX_LENGTH = 80;
const DESCRIPTION_MAX_LENGTH = 500;

function fail(message, statusCode) {
  throw Object.assign(new Error(message), { statusCode });
}

function systemSummary(template) {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    system: true,
    sourceTemplateId: null,
    createdBy: null,
    revision: null,
    createdAt: null,
    updatedAt: null,
  };
}

function copySummary(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    system: false,
    sourceTemplateId: row.source_template_id,
    createdBy: row.created_by ? { id: row.created_by, name: row.created_by_name } : null,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COPY_COLUMNS = `
  lesson_templates.*, users.display_name AS created_by_name
  FROM lesson_templates LEFT JOIN users ON users.id = lesson_templates.created_by
`;

function listLessonTemplates(database) {
  const copies = database.prepare(`SELECT ${COPY_COLUMNS} ORDER BY lesson_templates.created_at DESC, lesson_templates.id`).all();
  return [...SYSTEM_TEMPLATES.map(systemSummary), ...copies.map(copySummary)];
}

function findCopyRow(id, database) {
  return database.prepare(`SELECT ${COPY_COLUMNS} WHERE lesson_templates.id = ?`).get(id);
}

// The summary plus `definition`: the template JSON, or null for Template 1.
function findLessonTemplate(id, database) {
  const system = findSystemTemplate(id);
  if (system) return { ...systemSummary(system), definition: system.definition };
  const row = findCopyRow(id, database);
  return row ? { ...copySummary(row), definition: JSON.parse(row.definition_json) } : null;
}

function normalizeTitle(value) {
  const title = typeof value === 'string' ? value.trim() : '';
  if (!title || title.length > TITLE_MAX_LENGTH) fail(`Название шаблона должно содержать от 1 до ${TITLE_MAX_LENGTH} символов.`, 400);
  return title;
}

function normalizeDescription(value) {
  if (typeof value !== 'string') fail('Описание шаблона должно быть строкой.', 400);
  const description = value.trim();
  if (description.length > DESCRIPTION_MAX_LENGTH) fail(`Описание шаблона должно содержать не более ${DESCRIPTION_MAX_LENGTH} символов.`, 400);
  return description;
}

// The title and description live both in columns, for lists, and inside the definition,
// which travels into draft snapshots on its own.
function definitionJson(definition, { id, title, description }) {
  const next = { ...structuredClone(definition), id, title, description };
  assertValidTemplate(next, CONTROL_CATALOG);
  return JSON.stringify(next);
}

function copyLessonTemplate({ id, title, createdBy }, database) {
  const source = findLessonTemplate(id, database);
  if (!source) fail('Шаблон не найден.', 404);

  const copy = {
    id: crypto.randomUUID(),
    title: title === undefined ? `${source.title} (копия)`.slice(0, TITLE_MAX_LENGTH) : normalizeTitle(title),
    description: source.description,
  };
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO lesson_templates (
      id, title, description, source_template_id, created_by, definition_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(copy.id, copy.title, copy.description, source.id, createdBy, definitionJson(source.definition, copy), now, now);
  return copySummary(findCopyRow(copy.id, database));
}

function editableCopy(id, database) {
  if (findSystemTemplate(id)) fail('Системный шаблон нельзя изменить: сделайте копию.', 403);
  const row = findCopyRow(id, database);
  if (!row) fail('Шаблон не найден.', 404);
  return row;
}

// `revision` is the one the change was based on; a stale one means someone saved first.
function updateLessonTemplate({ id, revision, title, description }, database) {
  const row = editableCopy(id, database);
  if (!Number.isInteger(revision)) fail('Не указана версия шаблона.', 400);
  const next = {
    id,
    title: title === undefined ? row.title : normalizeTitle(title),
    description: description === undefined ? row.description : normalizeDescription(description),
  };
  const result = database.prepare(`
    UPDATE lesson_templates
    SET title = ?, description = ?, definition_json = ?, revision = revision + 1, updated_at = ?
    WHERE id = ? AND revision = ?
  `).run(
    next.title, next.description, definitionJson(JSON.parse(row.definition_json), next),
    new Date().toISOString(), id, revision,
  );
  if (result.changes === 0) fail('Шаблон уже изменили: обновите страницу и повторите.', 409);
  return copySummary(findCopyRow(id, database));
}

function deleteLessonTemplate(id, database) {
  editableCopy(id, database);
  database.prepare('DELETE FROM lesson_templates WHERE id = ?').run(id);
}

module.exports = {
  copyLessonTemplate,
  deleteLessonTemplate,
  findLessonTemplate,
  listLessonTemplates,
  updateLessonTemplate,
};
