'use strict';

// Lesson variables carry data between blocks. Every type knows how to check a value
// produced by a control and how to show it to the model in a stage's user message.

function fail(message) {
  throw new Error(message);
}

function nonEmptyString(value, what) {
  if (typeof value !== 'string' || !value.trim()) fail(`${what} должен быть непустой строкой.`);
  return value;
}

const VARIABLE_TYPES = Object.freeze({
  vocabulary: Object.freeze({
    label: 'словарь',
    // Optional parts of an item that a producer may promise and a consumer may require.
    features: Object.freeze(['distractor', 'imagePrompt']),
    check(value, name) {
      if (!Array.isArray(value) || value.length === 0) fail(`Переменная ${name} должна быть непустым списком слов.`);
      value.forEach((item, index) => {
        nonEmptyString(item?.term, `${name}[${index}].term`);
        nonEmptyString(item?.definition, `${name}[${index}].definition`);
        if (item.distractor !== undefined) nonEmptyString(item.distractor, `${name}[${index}].distractor`);
        if (item.imagePrompt !== undefined) nonEmptyString(item.imagePrompt, `${name}[${index}].imagePrompt`);
      });
      return value;
    },
    format: value => JSON.stringify(value.map(item => item.term)),
  }),
  statements: Object.freeze({
    label: 'утверждения',
    features: Object.freeze([]),
    check(value, name) {
      if (!Array.isArray(value) || value.length === 0) fail(`Переменная ${name} должна быть непустым списком утверждений.`);
      value.forEach((item, index) => {
        if (!Number.isInteger(item?.number) || item.number < 1) fail(`${name}[${index}].number должен быть положительным целым.`);
        nonEmptyString(item.text, `${name}[${index}].text`);
      });
      return value;
    },
    format: value => value.map((item, index) => `${index + 1}. ${item.text}`).join('\n'),
  }),
  text: Object.freeze({
    label: 'текст',
    features: Object.freeze([]),
    check: (value, name) => nonEmptyString(value, `Переменная ${name}`),
    format: value => value.trim(),
  }),
});

function variableType(type) {
  return Object.hasOwn(VARIABLE_TYPES, type) ? VARIABLE_TYPES[type] : null;
}

// Multi-line values go below their label, single-line values follow it.
function formatContextLine(label, type, value) {
  const formatted = VARIABLE_TYPES[type].format(value);
  return formatted.includes('\n') ? `${label}:\n${formatted}` : `${label}: ${formatted}`;
}

module.exports = { VARIABLE_TYPES, formatContextLine, variableType };
