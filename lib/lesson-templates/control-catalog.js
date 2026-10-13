'use strict';

const { variableType } = require('./variable-types.js');

// A control describes how a template block becomes a lesson component.
//
// generated: the model fills `fields`; `schema`, `rules` and `defaultInstructions`
//   shape the stage prompt, `build(data, context)` turns the answer into a component.
//   `schema` may leave out a field that does not apply, e.g. without an optional input.
// derived: no model; `build({ sources }, context)` uses other blocks and variables.
//   Each source carries the built `component` and, for generated blocks, the `data`
//   it was built from.
//
// Shared optional members: `params` (a spec may add `check(value)` → problem text),
// `chrome`, `inputs`, `outputs` (an output may add `size(params)`),
// `exports(component, { params, data })`, `answerKey`, `example`, `acceptsSource` (derived only).

const CONTROL_KINDS = Object.freeze(['generated', 'derived']);
const FIELD_NAME = /^[a-z][A-Za-z0-9]*$/;

function fail(control, message) {
  throw new Error(`Контрол ${control.type || '(без type)'}: ${message}`);
}

function normalizeParamSpec(control, name, spec) {
  if (!spec || typeof spec !== 'object' || !Object.hasOwn(spec, 'default')) {
    fail(control, `параметр ${name} должен задавать default.`);
  }
  if ((spec.min !== undefined || spec.max !== undefined) && !Number.isInteger(spec.default)) {
    fail(control, `параметр ${name} с пределами должен быть целым числом.`);
  }
  if (spec.values !== undefined && (!Array.isArray(spec.values) || !spec.values.includes(spec.default))) {
    fail(control, `default параметра ${name} должен входить в values.`);
  }
  if (spec.check !== undefined && typeof spec.check !== 'function') {
    fail(control, `check параметра ${name} должен быть функцией.`);
  }
  if (spec.check?.(spec.default)) fail(control, `default параметра ${name} не проходит собственную проверку.`);
  return Object.freeze({ ...spec });
}

function normalizePort(control, direction, name, spec) {
  const port = typeof spec === 'string' ? { type: spec } : { ...spec };
  if (!variableType(port.type)) fail(control, `${direction} ${name} имеет неизвестный тип ${port.type}.`);
  if (direction === 'output' && port.field !== undefined && !control.fields?.includes(port.field)) {
    fail(control, `выход ${name} ссылается на неизвестное поле ${port.field}.`);
  }
  port.requires = Object.freeze([...(port.requires || [])]);
  return Object.freeze(port);
}

function normalizePorts(control, direction, ports = {}) {
  return Object.freeze(Object.fromEntries(Object.entries(ports)
    .map(([name, spec]) => [name, normalizePort(control, direction, name, spec)])));
}

function normalizeControl(control) {
  if (!control || typeof control.type !== 'string' || !control.type) fail({}, 'нужен type.');
  const kind = control.kind || 'generated';
  if (!CONTROL_KINDS.includes(kind)) fail(control, `неизвестный вид ${kind}.`);
  if (typeof control.build !== 'function') fail(control, 'нужна функция build.');
  if (kind === 'generated') {
    if (!Array.isArray(control.fields) || control.fields.length === 0) fail(control, 'нужен список fields.');
    control.fields.forEach(field => {
      if (!FIELD_NAME.test(field)) fail(control, `недопустимое имя поля ${field}.`);
    });
    if (typeof control.schema !== 'function') fail(control, 'нужна функция schema.');
  }
  if (control.outputs && Object.keys(control.outputs).length > 0 && typeof control.exports !== 'function') {
    fail(control, 'контрол с выходами должен реализовать exports.');
  }
  return Object.freeze({
    ...control,
    kind,
    label: control.label || control.type,
    fields: Object.freeze([...(control.fields || [])]),
    params: Object.freeze(Object.fromEntries(Object.entries(control.params || {})
      .map(([name, spec]) => [name, normalizeParamSpec(control, name, spec)]))),
    chrome: Object.freeze([...(control.chrome || [])]),
    inputs: normalizePorts(control, 'input', control.inputs),
    outputs: normalizePorts(control, 'output', control.outputs),
    defaultInstructions: control.defaultInstructions || '',
  });
}

function createControlCatalog(controls) {
  const catalog = new Map();
  for (const control of controls) {
    const normalized = normalizeControl(control);
    if (catalog.has(normalized.type)) fail(normalized, 'тип уже зарегистрирован.');
    catalog.set(normalized.type, normalized);
  }
  return catalog;
}

module.exports = { createControlCatalog };
