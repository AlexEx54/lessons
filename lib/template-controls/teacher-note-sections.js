'use strict';

const { normalizeTeacherNote } = require('../../assets/components/teacher-note.js');
const { requiredText, warnCyrillic } = require('./helpers.js');

// A generated teacher note with named parts: the model returns one text per section.
// `blocks` shows each part as a titled block, `list` as a bold-labelled bullet list.

const SECTION_KEY = /^[a-z][A-Za-z0-9]*$/;
const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function checkSections(sections) {
  if (sections.length === 0) return 'нужен хотя бы один раздел';
  const keys = new Set();
  for (const section of sections) {
    if (!section || !SECTION_KEY.test(String(section.key || ''))) return 'у раздела нужен key в camelCase';
    if (keys.has(section.key)) return `раздел ${section.key} повторяется`;
    if (typeof section.title !== 'string' || !section.title.trim()) return `у раздела ${section.key} нет title`;
    if (section.id !== undefined && !KEBAB_CASE.test(section.id)) return `id раздела ${section.key} должен быть в kebab-case`;
    keys.add(section.key);
  }
  return null;
}

const EXAMPLE_TEXT = '- Keep it short and friendly.\n- Praise full sentences.';

module.exports = {
  type: 'teacherNoteSections',
  label: 'Заметки учителю по разделам',
  params: {
    sections: {
      default: [{ key: 'tips', title: 'Tips' }],
      check: checkSections,
    },
    format: { values: ['blocks', 'list'], default: 'blocks' },
  },
  fields: ['notes'],
  schema: ({ params }) => ({
    notes: {
      type: 'object',
      additionalProperties: false,
      required: params.sections.map(section => section.key),
      properties: Object.fromEntries(params.sections.map(section => [section.key, { type: 'string', minLength: 1 }])),
    },
  }),
  defaultInstructions: '',
  build({ notes }, context) {
    const { id, params } = context;
    const texts = params.sections.map(section => requiredText(notes?.[section.key], `раздел «${section.title}»`, context));
    warnCyrillic(texts, context);
    const note = params.format === 'list'
      ? { type: 'teacherNote', id, text: params.sections.map((section, index) => `- **${section.title}:** ${texts[index]}`).join('\n') }
      : {
        type: 'teacherNote',
        id,
        blocks: params.sections.map((section, index) => ({
          type: 'teacherNoteBlock',
          id: section.id ?? `${id}-${index + 1}`,
          title: section.title,
          titleColor: section.titleColor ?? '#6545F5',
          icon: section.icon ?? 'chat',
          text: texts[index],
        })),
      };
    // Validation only: the stored note keeps its authored shape.
    normalizeTeacherNote(note);
    return note;
  },
  example: ({ params }) => ({
    notes: Object.fromEntries(params.sections.map(section => [section.key, EXAMPLE_TEXT])),
  }),
};
