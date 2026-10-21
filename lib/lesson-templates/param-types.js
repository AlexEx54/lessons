'use strict';

// Kinds of block parameters (see lib/template-controls/helpers.js). The catalog checks
// control defaults with them, the validator checks the values a template sets.

const PARAM_TYPES = Object.freeze(['integer', 'choice', 'flag', 'text']);

// Problem text for a value that does not fit the spec, or null.
function paramProblem(spec, value) {
  switch (spec.type) {
    case 'integer':
      if (!Number.isInteger(value)) return 'нужно целое число';
      if (value < spec.min) return `не меньше ${spec.min}`;
      if (value > spec.max) return `не больше ${spec.max}`;
      break;
    case 'choice':
      if (!Object.hasOwn(spec.options, value)) return `нужно одно из: ${Object.values(spec.options).join(', ')}`;
      break;
    case 'flag':
      if (typeof value !== 'boolean') return 'нужно да или нет';
      break;
    case 'text':
      if (typeof value !== 'string') return 'нужен текст';
      break;
    default:
      break;
  }
  return null;
}

module.exports = { PARAM_TYPES, paramProblem };
