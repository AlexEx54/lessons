'use strict';
const { isNotesLink } = require('./lesson-notes-config.js');
function validMark(mark) {
  if (!mark || !['bold', 'italic', 'highlight', 'link'].includes(mark.type) || Object.keys(mark).some(key => !['type', 'attrs'].includes(key))) return false;
  const attrs = mark.attrs;
  if (attrs !== undefined && (!attrs || typeof attrs !== 'object' || Array.isArray(attrs))) return false;
  if (mark.type !== 'link') return !attrs || Object.keys(attrs).length === 0;
  return attrs && isNotesLink(attrs.href) && Object.entries(attrs).every(([key, value]) => ['href', 'target', 'rel', 'class', 'title'].includes(key) && (value === null || (typeof value === 'string' && value.length <= 4096)));
}
const EMPTY_NOTES = { type: 'doc', content: [{ type: 'paragraph' }] };
const MAX_BYTES = 256 * 1024;
function validateNotes(value) {
  const fail = () => { throw Object.assign(new Error('Некорректные заметки или превышен размер 256 КБ.'), { statusCode: 400 }); };
  if (!value || new TextEncoder().encode(JSON.stringify(value)).length > MAX_BYTES) fail();
  let count = 0;
  function visit(node, parent, depth) {
    if (++count > 10000 || depth > 12 || !node || typeof node !== 'object' || Array.isArray(node)) fail();
    const allowed = { root: ['doc'], doc: ['paragraph', 'bulletList'], bulletList: ['listItem'], listItem: ['paragraph', 'bulletList'], paragraph: ['text', 'hardBreak'] };
    if (!allowed[parent]?.includes(node.type)) fail();
    if (Object.keys(node).some(key => !['type', 'content', 'text', 'marks'].includes(key))) fail();
    if (node.type === 'text') {
      if (typeof node.text !== 'string' || !node.text.length || node.content !== undefined) fail();
      if (node.marks !== undefined && (!Array.isArray(node.marks) || node.marks.length > 4 || node.marks.some(mark => !validMark(mark)))) fail();
    } else {
      if (node.text !== undefined || node.marks !== undefined) fail();
      if (node.content !== undefined && !Array.isArray(node.content)) fail();
      if (['doc', 'bulletList', 'listItem'].includes(node.type) && !node.content?.length) fail();
      if (node.type === 'listItem' && node.content[0].type !== 'paragraph') fail();
      for (const child of node.content || []) visit(child, node.type, depth + 1);
    }
  }
  visit(value, 'root', 0);
  return value;
}
function readDraftNotes(id, ownerId, db) {
  const row = db.prepare('SELECT notes_json, notes_version, status FROM lesson_drafts WHERE id = ? AND owner_admin_id = ?').get(id, ownerId);
  if (!row) throw Object.assign(new Error('Черновик не найден.'), { statusCode: 404 });
  return { content: JSON.parse(row.notes_json), version: row.notes_version, editable: row.status === 'review' };
}
function saveDraftNotes(id, ownerId, input, db) {
  const notes = readDraftNotes(id, ownerId, db);
  if (!notes.editable) throw Object.assign(new Error('Черновик недоступен для редактирования.'), { statusCode: 409 });
  validateNotes(input?.content);
  if (!Number.isSafeInteger(input.version)) throw Object.assign(new Error('Не указана версия заметок.'), { statusCode: 400 });
  const result = db.prepare("UPDATE lesson_drafts SET notes_json = ?, notes_version = notes_version + 1, updated_at = ? WHERE id = ? AND owner_admin_id = ? AND notes_version = ? AND status = 'review'").run(JSON.stringify(input.content), new Date().toISOString(), id, ownerId, input.version);
  if (!result.changes) throw Object.assign(new Error('Заметки изменены в другой вкладке. Скопируйте свой текст и перезагрузите страницу.'), { statusCode: 409 });
  return readDraftNotes(id, ownerId, db);
}
module.exports = { EMPTY_NOTES, MAX_BYTES, validateNotes, readDraftNotes, saveDraftNotes };
