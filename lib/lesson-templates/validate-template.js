'use strict';

const { CHROME_FIELDS, chromeProblem } = require('./chrome-fields.js');
const { paramProblem } = require('./param-types.js');
const { isStageIcon } = require('./stage-icons.js');
const { checkStaticComponent, isStaticType } = require('../../assets/lesson-template-statics.js');
const { variableType } = require('./variable-types.js');

// Checks a template definition against the control catalog and returns a normalized
// copy plus the data-flow analysis that the engine runs on. Every problem is reported
// as { stage?, block?, param? | chrome?, detail?, message } so the editor can point at the
// broken place and show `detail` under the field.

const SCHEMA_VERSION = 'lesson-template-v1';
const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const IDENTIFIER = /^[a-z][A-Za-z0-9]*$/;
const PLACEHOLDER = /\{\{([a-z][A-Za-z0-9]*)\}\}/g;
const CONTEXT_REFERENCE = /^\$(input|var)\.([a-z][A-Za-z0-9]*)$/;
const SLOT_SOURCE = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)((?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])+)$/;
const BLOCK_KINDS = Object.freeze(['static', 'generated', 'derived', 'row']);

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const isText = value => typeof value === 'string' && value.trim() !== '';
const isPositiveInteger = value => Number.isInteger(value) && value > 0;

class TemplateValidationError extends Error {
  constructor(errors) {
    super(`Шаблон содержит ошибки:\n${errors.map(error => `- ${error.message}`).join('\n')}`);
    this.name = 'TemplateValidationError';
    this.errors = errors;
    this.statusCode = 400;
  }
}

// Kahn's algorithm. Among ready nodes the earliest one in display order goes first,
// so independent nodes keep the order the author sees.
function topologicalOrder(nodes, dependenciesOf) {
  const remaining = new Map(nodes.map(node => [node, new Set(dependenciesOf(node))]));
  const order = [];
  while (remaining.size > 0) {
    const next = nodes.find(node => remaining.has(node)
      && [...remaining.get(node)].every(dependency => !remaining.has(dependency)));
    if (next === undefined) return { order, cycle: cycleMembers(remaining) };
    order.push(next);
    remaining.delete(next);
  }
  return { order, cycle: null };
}

// Nodes left after a stuck sort are either in a cycle or only wait for one.
// Dropping nodes that nothing left depends on keeps just the cycle.
function cycleMembers(remaining) {
  const members = new Set(remaining.keys());
  let pruned = true;
  while (pruned) {
    pruned = false;
    for (const node of members) {
      const needed = [...members].some(other => remaining.get(other).has(node));
      if (!needed) {
        members.delete(node);
        pruned = true;
      }
    }
  }
  return [...members];
}

function collectPlaceholders(value, names = new Set()) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(PLACEHOLDER)) names.add(match[1]);
  } else if (Array.isArray(value)) {
    value.forEach(item => collectPlaceholders(item, names));
  } else if (isObject(value)) {
    Object.values(value).forEach(item => collectPlaceholders(item, names));
  }
  return names;
}

function parseSlotSource(source) {
  const match = typeof source === 'string' ? SLOT_SOURCE.exec(source) : null;
  if (!match) return null;
  const path = [...match[2].matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g)]
    .map(part => (part[1] !== undefined ? part[1] : Number(part[2])));
  return { block: match[1], path };
}

function validateTemplate(definition, catalog) {
  const errors = [];
  const report = (message, where = {}) => errors.push({ ...where, message });

  if (!isObject(definition)) {
    report('Определение шаблона должно быть объектом.');
    return { template: null, analysis: null, errors };
  }
  if (definition.schemaVersion !== SCHEMA_VERSION) report(`schemaVersion должен быть ${SCHEMA_VERSION}.`);
  if (!isText(definition.id)) report('У шаблона нет id.');
  if (!isText(definition.title)) report('У шаблона нет названия.');

  const inputs = normalizeInputs(definition.inputs, report);
  const lesson = isObject(definition.lesson) ? { ...definition.lesson } : {};
  if (lesson.durationMinutes !== undefined && !isPositiveInteger(lesson.durationMinutes)) {
    report('lesson.durationMinutes должен быть положительным целым.');
  }

  const blockIds = new Set();
  const blockIndex = new Map();
  const stageIds = new Set();
  const stages = [];
  if (!Array.isArray(definition.stages) || definition.stages.length === 0) {
    report('В шаблоне нет этапов.');
  } else {
    definition.stages.forEach((rawStage, index) => {
      const stage = normalizeStage(rawStage, index, { catalog, inputs, report, blockIds, blockIndex });
      if (!stage) return;
      if (stageIds.has(stage.id)) report(`Этап ${stage.id} повторяется.`, { stage: stage.id });
      stageIds.add(stage.id);
      stages.push(stage);
    });
  }

  const template = {
    schemaVersion: SCHEMA_VERSION,
    id: definition.id,
    title: definition.title,
    description: typeof definition.description === 'string' ? definition.description : '',
    inputs,
    lesson,
    stages,
  };
  const analysis = analyzeDataFlow(template, { catalog, blockIndex, report });
  return { template, analysis, errors };
}

function normalizeInputs(rawInputs, report) {
  const inputs = {};
  if (!isObject(rawInputs) || Object.keys(rawInputs).length === 0) {
    report('Шаблон должен объявить хотя бы одно поле ввода.');
    return inputs;
  }
  for (const [name, spec] of Object.entries(rawInputs)) {
    if (!IDENTIFIER.test(name)) report(`Недопустимое имя поля ввода ${name}.`);
    if (!isObject(spec) || !isText(spec.label)) report(`У поля ввода ${name} нет подписи.`);
    inputs[name] = { label: spec?.label, optional: spec?.optional === true, fallback: spec?.fallback };
  }
  for (const [name, input] of Object.entries(inputs)) {
    if (input.fallback === undefined) continue;
    const target = inputs[input.fallback];
    if (!target || target.fallback !== undefined || input.fallback === name) {
      report(`Поле ввода ${name} ссылается на недопустимую замену ${input.fallback}.`);
    }
  }
  return inputs;
}

function normalizeStage(raw, index, scope) {
  const { report, inputs } = scope;
  if (!isObject(raw) || !KEBAB_CASE.test(String(raw.id || ''))) {
    report(`Этап №${index + 1} должен иметь id в kebab-case.`);
    return null;
  }
  const where = { stage: raw.id };
  if (!isText(raw.title)) report(`У этапа ${raw.id} нет названия.`, where);
  if (raw.durationMinutes !== undefined && !isPositiveInteger(raw.durationMinutes)) {
    report(`Длительность этапа ${raw.id} должна быть положительным целым.`, where);
  }
  if (raw.instructions !== undefined && typeof raw.instructions !== 'string') {
    report(`Указания этапа ${raw.id} должны быть строкой.`, where);
  }
  if (raw.icon !== undefined && !isStageIcon(raw.icon)) report(`У этапа ${raw.id} неизвестная иконка ${raw.icon}.`, where);

  const context = [];
  if (raw.context !== undefined && !isObject(raw.context)) report(`context этапа ${raw.id} должен быть объектом.`, where);
  for (const [label, reference] of Object.entries(isObject(raw.context) ? raw.context : {})) {
    const match = CONTEXT_REFERENCE.exec(String(reference));
    if (!isText(label) || !match) {
      report(`Строка context «${label}» этапа ${raw.id} должна ссылаться на $input.<имя> или $var.<имя>.`, where);
      continue;
    }
    const [, source, name] = match;
    if (source === 'input' && !Object.hasOwn(inputs, name)) {
      report(`context этапа ${raw.id} ссылается на неизвестное поле ввода ${name}.`, where);
    }
    context.push({ label, source, name });
  }

  const stage = {
    id: raw.id,
    title: raw.title,
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    durationMinutes: raw.durationMinutes,
    icon: raw.icon,
    instructions: typeof raw.instructions === 'string' ? raw.instructions : '',
    context,
    blocks: [],
  };
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) {
    report(`В этапе ${raw.id} нет блоков.`, where);
  } else {
    stage.blocks = raw.blocks
      .map(block => normalizeBlock(block, stage, scope, { insideRow: false }))
      .filter(Boolean);
  }
  return stage;
}

function normalizeBlock(raw, stage, scope, { insideRow }) {
  const { report, blockIds, blockIndex } = scope;
  if (!isObject(raw) || !KEBAB_CASE.test(String(raw.id || ''))) {
    report(`В этапе ${stage.id} есть блок без id в kebab-case.`, { stage: stage.id });
    return null;
  }
  const where = { stage: stage.id, block: raw.id };
  if (blockIds.has(raw.id)) report(`Блок ${raw.id} повторяется.`, where);
  blockIds.add(raw.id);
  if (!BLOCK_KINDS.includes(raw.kind)) {
    report(`У блока ${raw.id} неизвестный вид ${raw.kind}.`, where);
    return null;
  }

  let block;
  if (raw.kind === 'row') {
    block = normalizeRow(raw, stage, scope, { insideRow, where });
  } else if (raw.kind === 'static') {
    block = normalizeStatic(raw, report, where);
  } else {
    block = normalizeControlBlock(raw, scope.catalog, report, where);
  }
  if (block) blockIndex.set(block.id, { block, stage });
  return block;
}

function normalizeRow(raw, stage, scope, { insideRow, where }) {
  if (insideRow) {
    scope.report(`Ряд ${raw.id} нельзя вложить в другой ряд.`, where);
    return null;
  }
  if (!Array.isArray(raw.blocks) || raw.blocks.length === 0) {
    scope.report(`Ряд ${raw.id} пуст.`, where);
    return null;
  }
  return {
    id: raw.id,
    kind: 'row',
    blocks: raw.blocks.map(child => normalizeBlock(child, stage, scope, { insideRow: true })).filter(Boolean),
  };
}

function normalizeStatic(raw, report, where) {
  if (!isObject(raw.component) || !isText(raw.component.type)) {
    report(`Статичный блок ${raw.id} должен содержать компонент с type.`, where);
    return null;
  }
  if (raw.component.id !== undefined && raw.component.id !== raw.id) {
    report(`id компонента в блоке ${raw.id} должен совпадать с id блока.`, where);
  }
  const component = { type: raw.component.type, id: raw.id, ...raw.component };
  if (!isStaticType(component.type)) {
    report(`Компонент ${component.type} не может быть статичным блоком (${raw.id}).`, where);
  } else {
    try {
      checkStaticComponent(component);
    } catch (error) {
      report(`Блок ${raw.id}: содержимое не подходит компоненту: ${error.message}`, { ...where, detail: error.message });
    }
  }
  const slots = {};
  const rawSlots = isObject(raw.slots) ? raw.slots : {};
  const used = collectPlaceholders(raw.component);
  for (const name of used) {
    if (!Object.hasOwn(rawSlots, name)) report(`В блоке ${raw.id} слот {{${name}}} не описан в slots.`, where);
  }
  for (const [name, spec] of Object.entries(rawSlots)) {
    if (!used.has(name)) report(`Слот ${name} блока ${raw.id} не используется в тексте.`, where);
    if (isObject(spec) && spec.capitalize !== undefined && typeof spec.capitalize !== 'boolean') {
      report(`capitalize слота ${name} блока ${raw.id} должен быть true или false.`, where);
    }
    const capitalize = spec?.capitalize === true;
    if (isObject(spec) && isText(spec.rule) && spec.from === undefined) {
      slots[name] = { rule: spec.rule.trim(), capitalize };
    } else if (isObject(spec) && spec.rule === undefined && parseSlotSource(spec.from)) {
      slots[name] = { from: parseSlotSource(spec.from), source: spec.from, capitalize };
    } else {
      report(`Слот ${name} блока ${raw.id} должен задавать либо rule, либо from вида <блок>.<путь>.`, where);
    }
  }
  return { id: raw.id, kind: 'static', component, slots };
}

function normalizeControlBlock(raw, catalog, report, where) {
  const control = catalog.get(raw.control);
  if (!control) {
    report(`Блок ${raw.id} ссылается на неизвестный контрол ${raw.control}.`, where);
    return null;
  }
  if (control.kind !== raw.kind) {
    report(`Контрол ${control.type} — ${control.kind}, а блок ${raw.id} объявлен как ${raw.kind}.`, where);
    return null;
  }

  const params = {};
  const rawParams = isObject(raw.params) ? raw.params : {};
  for (const name of Object.keys(rawParams)) {
    if (!Object.hasOwn(control.params, name)) report(`У контрола ${control.type} нет параметра ${name}.`, where);
  }
  const invalid = new Set();
  for (const [name, spec] of Object.entries(control.params)) {
    const value = Object.hasOwn(rawParams, name) ? rawParams[name] : spec.default;
    const problem = paramProblem(spec, value);
    if (problem) {
      report(`Блок ${raw.id}, «${spec.label}»: ${problem}.`, { ...where, param: name, detail: problem });
      invalid.add(name);
    }
    params[name] = value;
  }
  for (const [name, spec] of Object.entries(control.params)) {
    const limit = spec.atMost;
    if (limit === undefined || invalid.has(name) || invalid.has(limit) || params[name] <= params[limit]) continue;
    const detail = `больше, чем «${control.params[limit].label}»`;
    report(`Блок ${raw.id}: «${spec.label}» ${detail}.`, { ...where, param: name, detail });
  }

  const chrome = isObject(raw.chrome) ? { ...raw.chrome } : {};
  for (const [key, value] of Object.entries(chrome)) {
    if (!control.chrome.includes(key)) {
      report(`Контрол ${control.type} не поддерживает оформление ${key}.`, where);
      continue;
    }
    const field = CHROME_FIELDS[key];
    const problem = chromeProblem(field, value);
    if (problem) report(`Блок ${raw.id}, «${field.label}»: ${problem}.`, { ...where, chrome: key, detail: problem });
  }

  const fields = Object.fromEntries(control.fields.map(field => [field, field]));
  for (const [field, name] of Object.entries(isObject(raw.fields) ? raw.fields : {})) {
    if (!control.fields.includes(field)) report(`У контрола ${control.type} нет поля ${field}.`, where);
    else if (!IDENTIFIER.test(String(name))) report(`Недопустимое имя поля ${name} в блоке ${raw.id}.`, where);
    else fields[field] = name;
  }

  const inputs = normalizePortBindings(raw.inputs, control.inputs, 'входа', control, report, where);
  for (const [port, spec] of Object.entries(control.inputs)) {
    if (spec.required && !Object.hasOwn(inputs, port)) {
      report(`Блоку ${raw.id} нужен вход ${port} (${variableType(spec.type).label}).`, where);
    }
  }
  const exports = normalizePortBindings(raw.exports, control.outputs, 'выхода', control, report, where);

  const block = { id: raw.id, kind: raw.kind, control: control.type, params, chrome, inputs, exports };
  if (raw.kind === 'generated') {
    block.fields = fields;
    if (raw.instructions !== undefined && typeof raw.instructions !== 'string') {
      report(`Указания блока ${raw.id} должны быть строкой.`, where);
    }
    block.instructions = typeof raw.instructions === 'string' ? raw.instructions : control.defaultInstructions;
  } else {
    block.from = normalizeSources(raw.from, report, where);
  }
  return block;
}

function normalizePortBindings(rawBindings, ports, what, control, report, where) {
  const bindings = {};
  for (const [port, variable] of Object.entries(isObject(rawBindings) ? rawBindings : {})) {
    if (!Object.hasOwn(ports, port)) report(`У контрола ${control.type} нет ${what} ${port}.`, where);
    else if (!IDENTIFIER.test(String(variable))) report(`Недопустимое имя переменной ${variable} в блоке ${where.block}.`, where);
    else bindings[port] = variable;
  }
  return bindings;
}

function normalizeSources(rawFrom, report, where) {
  if (rawFrom === undefined) return [];
  const list = Array.isArray(rawFrom) ? rawFrom : [rawFrom];
  return list.map(source => {
    const normalized = typeof source === 'string' ? { block: source } : { ...source };
    if (!KEBAB_CASE.test(String(normalized.block || ''))) {
      report(`Источник блока ${where.block} должен указывать id блока.`, where);
      return null;
    }
    return normalized;
  }).filter(Boolean);
}

function flattenBlocks(blocks) {
  return blocks.flatMap(block => (block.kind === 'row' ? block.blocks : [block]));
}

function analyzeDataFlow(template, { catalog, blockIndex, report }) {
  const producers = new Map();
  for (const stage of template.stages) {
    for (const block of flattenBlocks(stage.blocks)) {
      for (const [port, variable] of Object.entries(block.exports || {})) {
        const where = { stage: stage.id, block: block.id };
        if (producers.has(variable)) {
          report(`Переменную ${variable} отдают два блока: ${producers.get(variable).block.id} и ${block.id}.`, where);
          continue;
        }
        const output = catalog.get(block.control).outputs[port];
        producers.set(variable, {
          variable, block, stage, port, type: output.type, output,
          features: typeof output.features === 'function' ? output.features(block.params) : [],
          size: typeof output.size === 'function' ? output.size(block.params) : undefined,
        });
      }
    }
  }

  const stageDependencies = new Map(template.stages.map(stage => [stage.id, new Set()]));
  const blockDependencies = new Map();
  const links = new Map();

  for (const stage of template.stages) {
    const contextVariables = new Set(stage.context.filter(line => line.source === 'var').map(line => line.name));
    for (const name of contextVariables) {
      const producer = producers.get(name);
      if (!producer) report(`context этапа ${stage.id} ссылается на переменную ${name}, которую никто не отдаёт.`, { stage: stage.id });
      else if (producer.stage === stage) report(`context этапа ${stage.id} не может ссылаться на переменную своего этапа ${name}.`, { stage: stage.id });
      else stageDependencies.get(stage.id).add(producer.stage.id);
    }

    for (const block of flattenBlocks(stage.blocks)) {
      if (block.kind === 'static') continue;
      const where = { stage: stage.id, block: block.id };
      const control = catalog.get(block.control);
      const dependencies = new Set();
      const blockLinks = {};

      for (const [port, variable] of Object.entries(block.inputs)) {
        const spec = control.inputs[port];
        const producer = producers.get(variable);
        if (!producer) {
          report(`Блок ${block.id} читает переменную ${variable}, которую никто не отдаёт.`, where);
          continue;
        }
        if (producer.type !== spec.type) {
          report(`Вход ${port} блока ${block.id} ждёт ${variableType(spec.type).label}, а ${variable} — ${variableType(producer.type).label}.`, where);
          continue;
        }
        const missing = spec.requires.filter(feature => !producer.features.includes(feature));
        if (missing.length > 0) {
          report(`Вход ${port} блока ${block.id} требует у ${variable}: ${missing.join(', ')}.`, where);
          continue;
        }
        const sameStage = producer.stage === stage;
        if (sameStage) {
          if (producer.block === block) {
            report(`Блок ${block.id} не может читать собственную переменную ${variable}.`, where);
            continue;
          }
          if (block.kind === 'generated' && producer.block.kind !== 'generated') {
            report(`Блок ${block.id} генерируется до того, как собран ${producer.block.id}: перенесите его в следующий этап.`, where);
            continue;
          }
          if (block.kind === 'generated' && typeof spec.sameStageRule !== 'function') {
            report(`Контрол ${control.type} не умеет брать ${port} из того же этапа.`, where);
            continue;
          }
          dependencies.add(producer.block.id);
        } else {
          stageDependencies.get(stage.id).add(producer.stage.id);
          if (!contextVariables.has(variable)) {
            report(`Блок ${block.id} читает ${variable} из этапа ${producer.stage.id}: добавьте её в context этапа ${stage.id}.`, where);
          }
        }
        blockLinks[port] = { port, variable, type: spec.type, sameStage, producer };
      }

      for (const source of block.from || []) {
        const target = blockIndex.get(source.block);
        if (!target || target.stage !== stage) {
          report(`Блок ${block.id} собирается из ${source.block}, а такого блока нет в этапе ${stage.id}.`, where);
        } else if (target.block.kind === 'static' || target.block.kind === 'row' || target.block === block) {
          report(`Блок ${block.id} не может собираться из ${source.block}.`, where);
        } else {
          const problem = control.acceptsSource?.(catalog.get(target.block.control), source);
          if (problem) report(`Блок ${block.id}: ${problem}`, where);
          else dependencies.add(source.block);
        }
      }
      blockDependencies.set(block.id, dependencies);
      links.set(block.id, blockLinks);
    }
  }

  const stageOrder = topologicalOrder(template.stages.map(stage => stage.id), id => stageDependencies.get(id));
  if (stageOrder.cycle) report(`Этапы зависят друг от друга по кругу: ${stageOrder.cycle.join(', ')}.`);

  const buildOrders = new Map();
  const responseKeys = new Map();
  for (const stage of template.stages) {
    const nodes = flattenBlocks(stage.blocks).filter(block => block.kind !== 'static').map(block => block.id);
    const order = topologicalOrder(nodes, id => blockDependencies.get(id) || []);
    if (order.cycle) report(`Блоки этапа ${stage.id} зависят друг от друга по кругу: ${order.cycle.join(', ')}.`, { stage: stage.id });
    buildOrders.set(stage.id, order.order);
    responseKeys.set(stage.id, collectResponseKeys(stage, blockIndex, report));
  }

  return {
    producers,
    links,
    generationOrder: stageOrder.order,
    buildOrders,
    responseKeys,
  };
}

// Field names of generated blocks and model-filled slots share one flat answer object.
function collectResponseKeys(stage, blockIndex, report) {
  const keys = new Map();
  const claim = (key, owner) => {
    if (keys.has(key)) {
      report(`В этапе ${stage.id} поле ответа ${key} занято дважды: ${keys.get(key)} и ${owner}.`, { stage: stage.id, block: owner });
    } else {
      keys.set(key, owner);
    }
  };
  for (const block of flattenBlocks(stage.blocks)) {
    if (block.kind === 'generated') Object.values(block.fields).forEach(key => claim(key, block.id));
    if (block.kind !== 'static') continue;
    for (const [name, slot] of Object.entries(block.slots)) {
      if (slot.rule) {
        claim(name, block.id);
        continue;
      }
      const target = blockIndex.get(slot.from.block);
      if (!target || target.stage !== stage || target.block.kind === 'static' || target.block.kind === 'row') {
        report(`Слот ${name} блока ${block.id} ссылается на ${slot.from.block}, а такого блока с данными нет в этапе ${stage.id}.`, { stage: stage.id, block: block.id });
      }
    }
  }
  return keys;
}

function assertValidTemplate(definition, catalog) {
  const result = validateTemplate(definition, catalog);
  if (result.errors.length > 0) throw new TemplateValidationError(result.errors);
  return result;
}

module.exports = {
  SCHEMA_VERSION,
  TemplateValidationError,
  assertValidTemplate,
  flattenBlocks,
  validateTemplate,
};
