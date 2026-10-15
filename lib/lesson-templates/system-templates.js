'use strict';

// Built-in templates live in the repository next to the controls they use; tests keep
// their definitions valid.
const SYSTEM_TEMPLATES = Object.freeze([
  systemTemplate(require('../templates/template-1.json')),
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
