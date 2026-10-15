'use strict';

const { normalizeTeacherNote } = require('../../assets/components/teacher-note.js');
const { blockName, fail, requiredText } = require('./helpers.js');

// A teacher note written by the model as one Markdown text; the block instructions
// describe what goes into it.

const CYRILLIC = /[Ѐ-ӿ]/u;

module.exports = {
  type: 'teacherNoteText',
  label: 'Заметка учителю',
  fields: ['text'],
  schema: () => ({ text: { type: 'string', minLength: 1 } }),
  rules: ({ f }) => [
    `Write every part of ${f.text} in English, including instructions and direct address to the teacher. Do not use Russian or any other language in ${f.text}.`,
  ],
  defaultInstructions: '',
  build({ text }, context) {
    const note = { type: 'teacherNote', id: context.id, text: requiredText(text, 'заметка учителю', context) };
    if (CYRILLIC.test(note.text)) fail(`${blockName(context)}: заметка учителю должна быть полностью на английском языке.`);
    normalizeTeacherNote(note);
    return note;
  },
  example: () => ({
    text: '- Show the options and ask the student to explain their choice.\n- Accept short answers.\n\n**Say:** *Let’s start with a quick game!*',
  }),
};
