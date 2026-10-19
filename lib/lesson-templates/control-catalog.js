'use strict';

const { CHROME_FIELDS } = require('./chrome-fields.js');
const { PARAM_TYPES, paramProblem } = require('./param-types.js');
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
// Shared optional members: `group` and `description` (where and how the template
// editor's block catalog shows the control), `params` (made with the helpers in template-controls/helpers.js;
// a spec may add `check(value)` → problem text), `chrome` (keys of CHROME_FIELDS),
// `inputs`, `outputs` (an output may add `size(params)`),
// `exports(component, { params, data })`, `answerKey` with `answerKeyParts` (part →
// label, for a key in several parts), `example`, and for derived controls built from
// blocks of their stage `acceptsSource` (which blocks), `sourceLabel` (what it takes from
// them, as the template editor names it: «ответы») and `singleSource` (from exactly one).
//
// An output may promise optional parts of its items: `features` maps a feature of the
// variable type to the flag parameter that turns it on.

const CONTROL_KINDS = Object.freeze(['generated', 'derived']);
// Groups of the block catalog, in its order; static blocks use them too.
const CONTROL_GROUPS = Object.freeze({
  notes: 'Заметки и карточки',
  vocabulary: 'Лексика',
  grammar: 'Грамматика',
  comprehension: 'Чтение и аудирование',
  speaking: 'Говорение',
  answers: 'Ответы',
});
const FIELD_NAME = /^[a-z][A-Za-z0-9]*$/;

const isLabel = value => typeof value === 'string' && value.trim() !== '';

function fail(control, message) {
  throw new Error(`Контрол ${control.type || '(без type)'}: ${message}`);
}

function normalizeParamSpec(control, name, spec) {
  if (!spec || !PARAM_TYPES.includes(spec.type)) fail(control, `у параметра ${name} неизвестный тип ${spec?.type}.`);
  if (typeof spec.label !== 'string' || !spec.label.trim()) fail(control, `у параметра ${name} нет подписи.`);
  if (spec.type === 'integer' && !(spec.min <= spec.default && spec.default <= spec.max)) {
    fail(control, `default параметра ${name} должен лежать между min и max.`);
  }
  if (paramProblem(spec, spec.default)) fail(control, `default параметра ${name} не проходит собственную проверку.`);
  return Object.freeze({ ...spec });
}

// `atMost` pairs are checked once all params are known: minWords may not exceed maxWords.
function checkParamOrder(control, params) {
  for (const [name, spec] of Object.entries(params)) {
    if (spec.atMost === undefined) continue;
    const limit = params[spec.atMost];
    if (spec.type !== 'integer' || limit?.type !== 'integer') fail(control, `atMost параметра ${name} должен связывать два целых.`);
    if (spec.default > limit.default) fail(control, `default параметра ${name} больше default параметра ${spec.atMost}.`);
  }
}

function normalizePort(control, direction, name, spec) {
  const port = typeof spec === 'string' ? { type: spec } : { ...spec };
  if (!variableType(port.type)) fail(control, `${direction} ${name} имеет неизвестный тип ${port.type}.`);
  if (direction === 'output' && port.field !== undefined && !control.fields?.includes(port.field)) {
    fail(control, `выход ${name} ссылается на неизвестное поле ${port.field}.`);
  }
  port.requires = Object.freeze([...(port.requires || [])]);
  if (direction === 'output') port.features = normalizeFeatures(control, name, port);
  return Object.freeze(port);
}

function normalizeFeatures(control, output, { type, features = {} }) {
  for (const [feature, param] of Object.entries(features)) {
    if (!variableType(type).features.includes(feature)) fail(control, `выход ${output}: у типа ${type} нет возможности ${feature}.`);
    if (control.params?.[param]?.type !== 'flag') fail(control, `выход ${output}: возможность ${feature} должна включаться флагом.`);
  }
  return Object.freeze({ ...features });
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
  if (control.group !== undefined && !Object.hasOwn(CONTROL_GROUPS, control.group)) fail(control, `неизвестная группа ${control.group}.`);
  if (control.description !== undefined && (typeof control.description !== 'string' || !control.description.trim())) {
    fail(control, 'описание должно быть непустой строкой.');
  }
  if (control.singleSource !== undefined && (control.singleSource !== true || typeof control.acceptsSource !== 'function')) {
    fail(control, 'singleSource бывает только true и только вместе с acceptsSource.');
  }
  if ((typeof control.acceptsSource === 'function') !== isLabel(control.sourceLabel)) {
    fail(control, 'acceptsSource и sourceLabel задаются только вместе.');
  }
  const partLabels = Object.values(control.answerKeyParts || {});
  if (control.answerKeyParts !== undefined
    && (typeof control.answerKey !== 'function' || partLabels.length < 2 || !partLabels.every(isLabel))) {
    fail(control, 'answerKeyParts — подписи хотя бы двух частей ключа, и только вместе с answerKey.');
  }
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
  const params = Object.freeze(Object.fromEntries(Object.entries(control.params || {})
    .map(([name, spec]) => [name, normalizeParamSpec(control, name, spec)])));
  checkParamOrder(control, params);
  for (const key of control.chrome || []) {
    if (!Object.hasOwn(CHROME_FIELDS, key)) fail(control, `неизвестный ключ оформления ${key}.`);
  }
  return Object.freeze({
    ...control,
    kind,
    label: control.label || control.type,
    fields: Object.freeze([...(control.fields || [])]),
    params,
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

module.exports = { CONTROL_GROUPS, createControlCatalog };
