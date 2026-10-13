'use strict';

const { CONTROL_CATALOG } = require('../template-controls/index.js');
const { compileTemplate } = require('./template-engine.js');

// Built-in templates live in the repository next to the controls they use. They are
// compiled at startup, so a broken definition stops the server instead of a generation.
const SYSTEM_TEMPLATES = new Map([
  ['template-2', compileTemplate(require('../templates/template-2.json'), CONTROL_CATALOG)],
]);

function findSystemTemplate(id) {
  return SYSTEM_TEMPLATES.get(id) || null;
}

module.exports = { findSystemTemplate };
