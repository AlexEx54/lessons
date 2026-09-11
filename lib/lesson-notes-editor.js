'use strict';
const { getSchema } = require('@tiptap/core');
const { StarterKit } = require('@tiptap/starter-kit');
const { Highlight } = require('@tiptap/extension-highlight');
function notesExtensions() {
  return [StarterKit.configure(require('./lesson-notes-config.js').starterOptions), Highlight];
}
let schema;
module.exports = { notesExtensions, notesSchema: () => schema ||= getSchema(notesExtensions()) };
