'use strict';

// Built-in templates live in the repository next to the controls they use; tests keep
// their definitions valid. Template 1 still runs on hand-written sections, so it has no
// definition and cannot be copied until it moves to the engine.
const SYSTEM_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'template-1',
    title: 'Шаблон 1',
    description: 'This or That, Lead-In, чтение, аудирование, грамматика, Guided Speaking и Wrap-Up.',
    definition: null,
  }),
  systemTemplate(require('../templates/template-2.json')),
]);

function systemTemplate(definition) {
  return Object.freeze({
    id: definition.id,
    title: definition.title,
    description: definition.description,
    definition,
  });
}

function findSystemTemplate(id) {
  return SYSTEM_TEMPLATES.find(template => template.id === id) || null;
}

module.exports = { SYSTEM_TEMPLATES, findSystemTemplate };
