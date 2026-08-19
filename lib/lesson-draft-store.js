'use strict';

const crypto = require('crypto');
const { normalizeAudioPlayer } = require('../assets/components/audio-player.js');
const { normalizeDescribeAndGuess } = require('../assets/components/describe-and-guess.js');
const { normalizeItems: normalizeFillInBlanksItems } = require('../assets/components/fill-in-blanks.js');
const { normalizeCheckboxChoice } = require('../assets/components/checkbox-choice.js');
const { normalizeMultipleChoice } = require('../assets/components/multiple-choice.js');
const { normalizePersonalizedQuestions } = require('../assets/components/personalized-questions.js');
const { normalizeTextReading } = require('../assets/components/text-reading.js');

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

function deleteLessonDraft(id, ownerAdminId, database) {
  const result = database.prepare(`
    DELETE FROM lesson_drafts WHERE id = ? AND owner_admin_id = ?
  `).run(id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
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

function updateTeacherNote({ id, ownerAdminId, noteId, text, retainedBlockIds }, database) {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  if (retainedBlockIds !== undefined && !Array.isArray(retainedBlockIds)) {
    const error = new Error('Список подблоков Teacher’s Notes должен быть массивом.');
    error.statusCode = 400;
    throw error;
  }
  if (Array.isArray(retainedBlockIds)
    && (retainedBlockIds.some(value => typeof value !== 'string' || !value.trim())
      || new Set(retainedBlockIds).size !== retainedBlockIds.length)) {
    const error = new Error('Список подблоков Teacher’s Notes содержит некорректные или повторяющиеся id.');
    error.statusCode = 400;
    throw error;
  }

  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component && component.type === 'teacherNote' && component.id === noteId) {
        matches.push(component);
      }
    }
  }

  if (matches.length === 0) {
    const error = new Error('Teacher’s Notes не найдена.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько Teacher’s Notes с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }

  const note = matches[0];
  if (note.blocks != null && !Array.isArray(note.blocks)) {
    const error = new Error('Структура Teacher’s Notes повреждена.');
    error.statusCode = 409;
    throw error;
  }
  const existingBlocks = note.blocks || [];
  const existingIds = new Set();
  for (const block of existingBlocks) {
    if (!block || typeof block.id !== 'string' || existingIds.has(block.id)) {
      const error = new Error('Структура Teacher’s Notes повреждена.');
      error.statusCode = 409;
      throw error;
    }
    existingIds.add(block.id);
  }
  const retainedIds = retainedBlockIds === undefined ? [...existingIds] : retainedBlockIds;
  if (retainedIds.some(blockId => !existingIds.has(blockId))) {
    const error = new Error('Teacher’s Notes содержит неизвестный подблок.');
    error.statusCode = 400;
    throw error;
  }
  const retainedSet = new Set(retainedIds);
  const nextBlocks = existingBlocks.filter(block => retainedSet.has(block.id));
  if (!normalizedText && nextBlocks.length === 0) {
    const message = existingBlocks.length === 0
      ? 'Содержимое Teacher’s Notes не может быть пустым.'
      : 'Teacher’s Notes должна содержать текст или хотя бы один подблок.';
    const error = new Error(message);
    error.statusCode = 400;
    throw error;
  }

  if (normalizedText) note.text = normalizedText;
  else delete note.text;
  if (nextBlocks.length > 0) note.blocks = nextBlocks;
  else delete note.blocks;
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts
    SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updateMarkdownCard({ id, ownerAdminId, componentId, title, text }, database) {
  const normalizedTitle = typeof title === 'string' ? title.trim().replace(/\s+/g, ' ') : '';
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  if (!normalizedTitle || !normalizedText) {
    const error = new Error('Заголовок и содержимое карточки не могут быть пустыми.');
    error.statusCode = 400;
    throw error;
  }

  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'markdownCard' && component.id === componentId) matches.push(component);
    }
  }

  if (matches.length === 0) {
    const error = new Error('Карточка не найдена.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько карточек с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }

  matches[0].title = normalizedTitle;
  matches[0].text = normalizedText;
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts
    SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updateFillInBlanks({ id, ownerAdminId, componentId, items }, database) {
  let normalizedItems;
  try {
    normalizedItems = normalizeFillInBlanksItems(items);
  } catch (cause) {
    const error = new Error(cause.message || 'Некорректные предложения Fill in the Blanks.');
    error.statusCode = 400;
    throw error;
  }

  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'fillInBlanks' && component.id === componentId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Fill in the Blanks не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько Fill in the Blanks с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }

  matches[0].items = normalizedItems;
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts
    SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updatePersonalizedQuestions({ id, ownerAdminId, componentId, title, instruction, items }, database) {
  let normalized;
  try {
    normalized = normalizePersonalizedQuestions({
      type: 'personalizedQuestions',
      id: componentId,
      title,
      instruction,
      items,
    });
  } catch (cause) {
    const error = new Error(cause.message || 'Некорректный Personalised Questions.');
    error.statusCode = 400;
    throw error;
  }

  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'personalizedQuestions' && component.id === componentId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Personalised Questions не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько Personalised Questions с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }

  matches[0].title = normalized.title;
  matches[0].instruction = normalized.instruction;
  matches[0].items = normalized.items;
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updateMultipleChoice({ id, ownerAdminId, componentId, title, instruction, items }, database) {
  let normalized;
  try {
    normalized = normalizeMultipleChoice({
      type: 'multipleChoice',
      id: componentId,
      title,
      instruction,
      items,
    });
  } catch (cause) {
    const error = new Error(cause.message || 'Некорректный Multiple Choice.');
    error.statusCode = 400;
    throw error;
  }

  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'multipleChoice' && component.id === componentId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Multiple Choice не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько Multiple Choice с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }

  matches[0].title = normalized.title;
  matches[0].instruction = normalized.instruction;
  matches[0].items = normalized.items;
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updateCheckboxChoice({ id, ownerAdminId, componentId, title, instruction, items }, database) {
  let normalized;
  try {
    normalized = normalizeCheckboxChoice({
      type: 'checkboxChoice',
      id: componentId,
      title,
      instruction,
      items,
    });
  } catch (cause) {
    const error = new Error(cause.message || 'Некорректный Checkbox Choice.');
    error.statusCode = 400;
    throw error;
  }

  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'checkboxChoice' && component.id === componentId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Checkbox Choice не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько Checkbox Choice с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }

  matches[0].title = normalized.title;
  matches[0].instruction = normalized.instruction;
  matches[0].items = normalized.items;
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updateDescribeAndGuess({ id, ownerAdminId, componentId, title, instruction, items, howToPlay }, database) {
  let normalized;
  try {
    normalized = normalizeDescribeAndGuess({
      type: 'describeAndGuess',
      id: componentId,
      title,
      instruction,
      items,
      howToPlay,
    });
  } catch (cause) {
    const error = new Error(cause.message || 'Некорректный Describe and Guess.');
    error.statusCode = 400;
    throw error;
  }

  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'describeAndGuess' && component.id === componentId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Describe and Guess не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько Describe and Guess с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }

  matches[0].title = normalized.title;
  matches[0].instruction = normalized.instruction;
  matches[0].items = normalized.items;
  matches[0].howToPlay = normalized.howToPlay;
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updateTaskPrompt({ id, ownerAdminId, promptId, title, text, support }, database) {
  const normalizeTitle = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  const normalizedTitle = normalizeTitle(title);
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  if (!normalizedTitle || !normalizedText) {
    const error = new Error('Заголовок и текст блока задания не могут быть пустыми.');
    error.statusCode = 400;
    throw error;
  }

  let normalizedSupport = null;
  if (support != null) {
    const supportTitle = typeof support === 'object' ? normalizeTitle(support.title) : '';
    const supportText = typeof support === 'object' && typeof support.text === 'string'
      ? support.text.trim() : '';
    if (!supportTitle || !supportText) {
      const error = new Error('Заголовок и текст дополнительной секции не могут быть пустыми.');
      error.statusCode = 400;
      throw error;
    }
    normalizedSupport = { title: supportTitle, text: supportText };
  }

  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component && component.type === 'taskPrompt' && component.id === promptId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Блок задания не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько блоков задания с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }
  if (matches[0].variant !== 'followUp') {
    const error = new Error('Вариант блока задания не поддерживается.');
    error.statusCode = 409;
    throw error;
  }

  matches[0].title = normalizedTitle;
  matches[0].text = normalizedText;
  if (normalizedSupport) matches[0].support = normalizedSupport;
  else delete matches[0].support;

  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts
    SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updatePanelByType({ id, ownerAdminId, panelId, text, backgroundColor }, database, componentType, label) {
  const normalizedText = typeof text === 'string' ? text.trim() : '';
  const normalizedColor = typeof backgroundColor === 'string' ? backgroundColor.trim().toUpperCase() : '';
  if (!normalizedText) {
    const error = new Error('Текст панели не может быть пустым.');
    error.statusCode = 400;
    throw error;
  }
  if (!/^#[0-9A-F]{6}$/.test(normalizedColor)) {
    const error = new Error('Цвет фона панели должен быть в формате #RRGGBB.');
    error.statusCode = 400;
    throw error;
  }

  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === componentType && component.id === panelId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error(`${label} не найдена.`);
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error(`В черновике найдено несколько компонентов «${label}» с одинаковым id.`);
    error.statusCode = 409;
    throw error;
  }

  matches[0].text = normalizedText;
  matches[0].backgroundColor = normalizedColor;
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updateTextPanel(args, database) {
  return updatePanelByType(args, database, 'textPanel', 'Текстовая панель');
}

function updateIllustratedTextPanel(args, database) {
  return updatePanelByType(args, database, 'illustratedTextPanel', 'Иллюстрированная текстовая панель');
}

function updateTextReading({ id, ownerAdminId, componentId, title, subtitle, text }, database) {
  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'textReading' && component.id === componentId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Текст для чтения не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько текстов для чтения с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }

  const component = matches[0];
  const next = { ...component, title, text };
  if (subtitle !== undefined) next.subtitle = subtitle;
  let normalized;
  try {
    normalized = normalizeTextReading(next);
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }
  component.title = normalized.title;
  component.text = normalized.text;
  if (normalized.subtitle) component.subtitle = normalized.subtitle;
  else delete component.subtitle;

  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updateTextReadingImage({ id, ownerAdminId, componentId, side, imageSrc }, database) {
  if (!['header', 'text'].includes(side)) {
    const error = new Error('Неизвестная область изображения текста для чтения.');
    error.statusCode = 400;
    throw error;
  }
  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const pictureField = side === 'header' ? 'headerImage' : 'textImage';
  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'textReading' && component.id === componentId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Текст для чтения не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько текстов для чтения с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }
  const picture = matches[0][pictureField];
  if (!picture || typeof picture !== 'object'
    || typeof picture.imagePrompt !== 'string' || !picture.imagePrompt.trim()) {
    const error = new Error('Слот изображения текста для чтения не найден.');
    error.statusCode = 404;
    throw error;
  }

  const previousImageSrc = typeof picture.imageSrc === 'string' ? picture.imageSrc : null;
  if (imageSrc == null) delete picture.imageSrc;
  else picture.imageSrc = String(imageSrc);

  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return { draft: findLessonDraft(id, ownerAdminId, database), previousImageSrc };
}

function updateIllustratedTextPanelImage({ id, ownerAdminId, panelId, side, imageSrc }, database) {
  if (!['leading', 'trailing'].includes(side)) {
    const error = new Error('Неизвестная сторона изображения панели.');
    error.statusCode = 400;
    throw error;
  }
  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const pictureField = side === 'leading' ? 'leadingPicture' : 'trailingPicture';
  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'illustratedTextPanel' && component.id === panelId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Иллюстрированная текстовая панель не найдена.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько иллюстрированных текстовых панелей с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }
  const picture = matches[0][pictureField];
  if (!picture || typeof picture !== 'object' || typeof picture.imagePrompt !== 'string' || !picture.imagePrompt.trim()) {
    const error = new Error('Слот изображения панели не найден.');
    error.statusCode = 404;
    throw error;
  }
  const previousImageSrc = typeof picture.imageSrc === 'string' ? picture.imageSrc : null;
  if (imageSrc == null) delete picture.imageSrc;
  else picture.imageSrc = String(imageSrc);

  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return { draft: findLessonDraft(id, ownerAdminId, database), previousImageSrc };
}

function updateThisOrThatImage({ id, ownerAdminId, componentId, itemId, optionId, imageSrc }, database) {
  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type !== 'thisOrThat' || component.id !== componentId) continue;
      if (!Array.isArray(component.items)) {
        const error = new Error('Структура This or That повреждена.');
        error.statusCode = 409;
        throw error;
      }
      for (const item of component.items) {
        if (item?.id !== itemId || !Array.isArray(item.options)) continue;
        for (const option of item.options) {
          if (option?.id === optionId) matches.push(option);
        }
      }
    }
  }
  if (matches.length === 0) {
    const error = new Error('Вариант This or That не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько одинаковых вариантов This or That.');
    error.statusCode = 409;
    throw error;
  }
  const previousImageSrc = typeof matches[0].imageSrc === 'string' ? matches[0].imageSrc : null;
  if (imageSrc == null) delete matches[0].imageSrc;
  else matches[0].imageSrc = String(imageSrc);

  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return { draft: findLessonDraft(id, ownerAdminId, database), previousImageSrc };
}

function updateMatchWordsImage({ id, ownerAdminId, componentId, itemId, imageSrc }, database) {
  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }

  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type !== 'matchWords' || component.id !== componentId) continue;
      if (!Array.isArray(component.items)) {
        const error = new Error('Структура Match the Words повреждена.');
        error.statusCode = 409;
        throw error;
      }
      for (const item of component.items) {
        if (item?.id === itemId) matches.push(item);
      }
    }
  }
  if (matches.length === 0) {
    const error = new Error('Элемент Match the Words не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько одинаковых элементов Match the Words.');
    error.statusCode = 409;
    throw error;
  }
  if (typeof matches[0].imagePrompt !== 'string' || !matches[0].imagePrompt.trim()) {
    const error = new Error('Слот изображения Match the Words повреждён.');
    error.statusCode = 409;
    throw error;
  }

  const previousImageSrc = typeof matches[0].imageSrc === 'string' ? matches[0].imageSrc : null;
  if (imageSrc == null) delete matches[0].imageSrc;
  else matches[0].imageSrc = String(imageSrc);

  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return { draft: findLessonDraft(id, ownerAdminId, database), previousImageSrc };
}

function findAudioPlayerMatches(draft, componentId) {
  if (!draft.content || !Array.isArray(draft.content.stages)) {
    const error = new Error('Структура черновика повреждена.');
    error.statusCode = 409;
    throw error;
  }
  const matches = [];
  for (const stage of draft.content.stages) {
    if (!stage || typeof stage !== 'object' || (stage.content !== null && !Array.isArray(stage.content))) {
      const error = new Error('Структура черновика повреждена.');
      error.statusCode = 409;
      throw error;
    }
    for (const component of stage.content || []) {
      if (component?.type === 'audioPlayer' && component.id === componentId) matches.push(component);
    }
  }
  if (matches.length === 0) {
    const error = new Error('Аудиоплеер не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (matches.length > 1) {
    const error = new Error('В черновике найдено несколько аудиоплееров с одинаковым id.');
    error.statusCode = 409;
    throw error;
  }
  return matches[0];
}

function requireReviewDraft(id, ownerAdminId, database) {
  const draft = findLessonDraft(id, ownerAdminId, database);
  if (!draft) {
    const error = new Error('Черновик урока не найден.');
    error.statusCode = 404;
    throw error;
  }
  if (draft.status !== 'review') {
    const error = new Error('Редактировать можно только черновик на проверке.');
    error.statusCode = 409;
    throw error;
  }
  return draft;
}

function saveReviewDraftContent(id, ownerAdminId, draft, database) {
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE lesson_drafts SET content_json = ?, updated_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status = 'review'
  `).run(JSON.stringify(draft.content), now, id, ownerAdminId);
  if (result.changes === 0) {
    const error = new Error('Черновик изменился и больше недоступен для редактирования.');
    error.statusCode = 409;
    throw error;
  }
  return findLessonDraft(id, ownerAdminId, database);
}

function updateAudioPlayer({ id, ownerAdminId, componentId, title }, database) {
  const draft = requireReviewDraft(id, ownerAdminId, database);
  const component = findAudioPlayerMatches(draft, componentId);
  let normalized;
  try {
    normalized = normalizeAudioPlayer({ ...component, title });
  } catch (error) {
    error.statusCode = 400;
    throw error;
  }
  component.title = normalized.title;
  return saveReviewDraftContent(id, ownerAdminId, draft, database);
}

function updateAudioPlayerAudio({ id, ownerAdminId, componentId, audioSrc }, database) {
  const draft = requireReviewDraft(id, ownerAdminId, database);
  const component = findAudioPlayerMatches(draft, componentId);
  if (typeof component.script !== 'string' || !component.script.trim()) {
    const error = new Error('Слот аудиоплеера повреждён.');
    error.statusCode = 409;
    throw error;
  }
  const previousAudioSrc = typeof component.audioSrc === 'string' ? component.audioSrc : null;
  if (audioSrc == null) delete component.audioSrc;
  else component.audioSrc = String(audioSrc);
  return { draft: saveReviewDraftContent(id, ownerAdminId, draft, database), previousAudioSrc };
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
  deleteLessonDraft,
  failLessonDraft,
  findLessonDraft,
  listLessonDrafts,
  publishLessonDraft,
  retryLessonDraft,
  updateTaskPrompt,
  updateTeacherNote,
  updateAudioPlayer,
  updateAudioPlayerAudio,
  updateMarkdownCard,
  updateFillInBlanks,
  updateDescribeAndGuess,
  updateCheckboxChoice,
  updateMultipleChoice,
  updatePersonalizedQuestions,
  updateMatchWordsImage,
  updateIllustratedTextPanel,
  updateIllustratedTextPanelImage,
  updateTextReading,
  updateTextReadingImage,
  updateTextPanel,
  updateThisOrThatImage,
};
