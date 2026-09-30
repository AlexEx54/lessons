'use strict';
const Y = require('yjs');
const { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } = require('@tiptap/y-tiptap');
const { notesSchema } = require('./lesson-notes-editor.js');
const { EMPTY_NOTES, MAX_BYTES, validateNotes } = require('./lesson-notes-schema.js');
const MAX_STATE_BYTES = 2 * 1024 * 1024;
function readClassNotes(sessionId, db) {
  const saved = db.prepare('SELECT state, format_version FROM class_notes WHERE session_id = ?').get(sessionId);
  if (saved) {
    if (saved.format_version !== 1) throw new Error('Неизвестный формат заметок.');
    const doc = new Y.Doc();
    Y.applyUpdate(doc, saved.state);
    return doc;
  }
  const row = db.prepare('SELECT content_json FROM class_sessions WHERE id = ?').get(sessionId);
  if (!row) throw new Error('Занятие недоступно.');
  const content = validateNotes(JSON.parse(row.content_json).notes || EMPTY_NOTES);
  const doc = prosemirrorJSONToYDoc(notesSchema(), content, 'notes');
  db.prepare('INSERT INTO class_notes (session_id, state, updated_at) VALUES (?, ?, ?)').run(sessionId, Buffer.from(Y.encodeStateAsUpdate(doc)), new Date().toISOString());
  return doc;
}
function persistUpdate(sessionId, doc, update, db) {
  if (!update.length || update.length > MAX_STATE_BYTES) throw new Error('Слишком большой документ.');
  // Validate in isolation: a rejected update must never contaminate the live document.
  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
    Y.applyUpdate(candidate, update);
    if ([...candidate.share.keys()].some(key => key !== 'notes')) throw new Error('Неизвестное поле заметок.');
    const json = validateNotes(yDocToProsemirrorJSON(candidate, 'notes'));
    notesSchema().nodeFromJSON(json).check();
    if (Buffer.byteLength(JSON.stringify(json)) > MAX_BYTES) throw new Error('Заметки слишком большие.');
    const state = Buffer.from(Y.encodeStateAsUpdate(candidate));
    if (state.length > MAX_STATE_BYTES) throw new Error('Заметки слишком большие.');
    db.prepare('UPDATE class_notes SET state = ?, updated_at = ? WHERE session_id = ?').run(state, new Date().toISOString(), sessionId);
    Y.applyUpdate(doc, update);
  } finally { candidate.destroy(); }
}
module.exports = { readClassNotes, persistUpdate, MAX_STATE_BYTES };
