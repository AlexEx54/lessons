'use strict';

const { formatContextLine, variableType } = require('./variable-types.js');
const { assertValidTemplate, flattenBlocks } = require('./validate-template.js');

// Runs a validated template. Generation is a sequence of steps, one per stage that has
// anything to build, in data-flow order. Each step is either a model call
// (`request` → model → `apply`) or, for stages without generated content, `apply` alone.
// The generation state is { lesson, variables } and is rebuilt from scratch on recovery
// by replaying `apply` over the recovered answers.

const SYSTEM_ROLE = 'You design one-to-one English lessons.';
const JSON_ONLY = 'Return JSON matching the supplied schema and nothing else.';
const PLACEHOLDER = /\{\{([a-z][A-Za-z0-9]*)\}\}/g;

function fail(message, statusCode) {
  throw Object.assign(new Error(message), statusCode ? { statusCode } : {});
}

function readPath(value, path) {
  return path.reduce((current, key) => (current == null ? undefined : current[key]), value);
}

function fillSlots(value, slotValues) {
  if (typeof value === 'string') return value.replace(PLACEHOLDER, (match, name) => slotValues[name] ?? match);
  if (Array.isArray(value)) return value.map(item => fillSlots(item, slotValues));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fillSlots(item, slotValues)]));
  }
  return value;
}

function stageSlots(stage) {
  return flattenBlocks(stage.blocks)
    .filter(block => block.kind === 'static')
    .flatMap(block => Object.entries(block.slots).map(([name, slot]) => ({ name, ...slot, block })));
}

function compileTemplate(definition, catalog) {
  const { template, analysis } = assertValidTemplate(definition, catalog);
  const stagesById = new Map(template.stages.map(stage => [stage.id, stage]));
  const blocksById = new Map(template.stages.flatMap(stage => flattenBlocks(stage.blocks).map(block => [block.id, block])));
  const controlOf = block => catalog.get(block.control);

  const isFullyStatic = stage => analysis.buildOrders.get(stage.id).length === 0
    && stageSlots(stage).length === 0;
  const needsModel = stage => flattenBlocks(stage.blocks).some(block => block.kind === 'generated')
    || stageSlots(stage).some(slot => slot.rule);

  const steps = Object.freeze(analysis.generationOrder
    .map(id => stagesById.get(id))
    .filter(stage => !isFullyStatic(stage))
    .map(stage => Object.freeze({ key: stage.id, name: stage.title, needsModel: needsModel(stage) })));

  function stepStage(key) {
    const stage = stagesById.get(key);
    if (!stage || isFullyStatic(stage)) fail(`В шаблоне ${template.id} нет шага ${key}.`);
    return stage;
  }

  // Link descriptions handed to controls. `value` is present only while building.
  function blockLinks(block, values) {
    const links = {};
    for (const [port, link] of Object.entries(analysis.links.get(block.id) || {})) {
      const { producer } = link;
      const field = producer.output.field && producer.block.fields
        ? producer.block.fields[producer.output.field]
        : undefined;
      links[port] = {
        variable: link.variable,
        type: link.type,
        sameStage: link.sameStage,
        source: { block: producer.block.id, field },
      };
      if (values) {
        const value = values[link.variable];
        if (value === undefined) fail(`Переменная ${link.variable} ещё не готова для блока ${block.id}.`);
        links[port].value = value;
      }
    }
    return links;
  }

  function resolveInputs(raw = {}) {
    const values = {};
    const direct = name => String(raw[name] ?? '').trim();
    for (const [name, input] of Object.entries(template.inputs)) {
      const value = direct(name) || (input.fallback ? direct(input.fallback) : '');
      if (!value && !input.optional) fail(`Заполните поле «${input.label}».`, 400);
      values[name] = value;
    }
    return values;
  }

  function stageMeta(stage, number) {
    const meta = { id: stage.id, title: stage.title };
    if (stage.subtitle) meta.subtitle = stage.subtitle;
    if (stage.durationMinutes !== undefined) meta.durationMinutes = stage.durationMinutes;
    if (stage.icon !== undefined) meta.icon = stage.icon;
    meta.number = number;
    return meta;
  }

  function renderBlock(block, built, slotValues) {
    if (block.kind === 'static') return fillSlots(structuredClone(block.component), slotValues);
    if (block.kind === 'row') {
      return { type: 'cardRow', id: block.id, items: block.blocks.map(child => renderBlock(child, built, slotValues)) };
    }
    return built.get(block.id);
  }

  function createSkeleton(meta = {}) {
    const durationMinutes = template.lesson.durationMinutes
      ?? template.stages.reduce((sum, stage) => sum + (stage.durationMinutes || 0), 0);
    return {
      schemaVersion: 'lesson-draft-v1',
      meta: { lessonNumber: 1, durationMinutes, ...meta },
      stages: template.stages.map((stage, index) => ({
        ...stageMeta(stage, index + 1),
        content: isFullyStatic(stage) ? stage.blocks.map(block => renderBlock(block, new Map(), {})) : [],
      })),
    };
  }

  function producerHints(stage) {
    const hints = [];
    for (const consumerStage of template.stages) {
      if (consumerStage === stage) continue;
      for (const block of flattenBlocks(consumerStage.blocks)) {
        for (const [port, link] of Object.entries(analysis.links.get(block.id) || {})) {
          const hint = controlOf(block).inputs[port].producerHint;
          if (link.producer.stage !== stage || typeof hint !== 'function') continue;
          const text = String(hint({ params: block.params, consumer: block.id }) || '').trim();
          if (text && !hints.includes(text)) hints.push(text);
        }
      }
    }
    return hints;
  }

  function blockPromptLines(block) {
    const control = controlOf(block);
    const links = blockLinks(block);
    const lines = [...(control.rules?.({ params: block.params, links, f: block.fields }) || [])];
    for (const [port, link] of Object.entries(links)) {
      if (!link.sameStage) continue;
      lines.push(control.inputs[port].sameStageRule({ params: block.params, source: link.source }));
    }
    if (block.instructions.trim()) lines.push(block.instructions.trim());
    return lines;
  }

  function responseSchema(stage) {
    const properties = {};
    for (const block of flattenBlocks(stage.blocks)) {
      if (block.kind !== 'generated') continue;
      const control = controlOf(block);
      const fragment = control.schema({ params: block.params, links: blockLinks(block) });
      for (const field of control.fields) {
        if (!fragment || !Object.hasOwn(fragment, field)) fail(`Контрол ${control.type} не вернул схему поля ${field}.`);
        properties[block.fields[field]] = fragment[field];
      }
    }
    for (const slot of stageSlots(stage)) {
      if (slot.rule) properties[slot.name] = { type: 'string', minLength: 1 };
    }
    return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
  }

  function userMessage(stage, inputs, variables) {
    const lines = [];
    for (const line of stage.context) {
      if (line.source === 'input') {
        if (inputs[line.name]) lines.push(`${line.label}: ${inputs[line.name]}`);
        continue;
      }
      const value = variables[line.name];
      if (value === undefined) fail(`Переменная ${line.name} ещё не готова для этапа ${stage.id}.`);
      lines.push(formatContextLine(line.label, analysis.producers.get(line.name).type, value));
    }
    return lines.length > 0 ? lines.join('\n') : 'Generate the content for this stage.';
  }

  function request(key, { inputs = {}, variables = {}, preamble = '' } = {}) {
    const stage = stepStage(key);
    if (!needsModel(stage)) fail(`Этап ${key} собирается без нейросети.`);
    const system = [
      preamble,
      SYSTEM_ROLE,
      stage.instructions,
      ...producerHints(stage),
      ...flattenBlocks(stage.blocks).filter(block => block.kind === 'generated').flatMap(blockPromptLines),
      ...stageSlots(stage).filter(slot => slot.rule).map(slot => `${slot.name}: ${slot.rule}`),
      JSON_ONLY,
    ].map(line => String(line || '').trim()).filter(Boolean);
    return {
      messages: [
        { role: 'system', content: system.join('\n') },
        { role: 'user', content: userMessage(stage, inputs, variables) },
      ],
      schema: responseSchema(stage),
      schemaName: `easyclass_${template.id}_${stage.id}`.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 64),
    };
  }

  // `dataFor(block, control, links)` supplies a generated block's data and
  // `slotFor(slot)` a model-filled slot; the rest is shared by real and example runs.
  function buildStage(stage, state, { dataFor, slotFor, random }) {
    const variables = { ...state.variables };
    const built = new Map();
    for (const id of analysis.buildOrders.get(stage.id)) {
      const block = blocksById.get(id);
      const control = controlOf(block);
      const links = blockLinks(block, variables);
      const context = { id: block.id, params: block.params, chrome: block.chrome, links, random };
      const component = block.kind === 'generated'
        ? control.build(dataFor(block, control, links), context)
        : control.build({
          sources: block.from.map(source => {
            const sourceBlock = blocksById.get(source.block);
            return { ...source, component: built.get(source.block), control: controlOf(sourceBlock), params: sourceBlock.params };
          }),
        }, context);
      if (!component || component.id !== block.id) fail(`Контрол ${control.type} должен вернуть компонент с id ${block.id}.`);
      built.set(block.id, component);

      if (Object.keys(block.exports).length === 0) continue;
      const exported = control.exports(component, { params: block.params }) || {};
      for (const [port, variable] of Object.entries(block.exports)) {
        variables[variable] = variableType(control.outputs[port].type).check(exported[port], variable);
      }
    }

    const slotValues = {};
    for (const slot of stageSlots(stage)) {
      const value = slot.rule ? slotFor(slot) : readPath(built.get(slot.from.block), slot.from.path);
      if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) {
        fail(`Слот ${slot.name} этапа ${stage.id} остался пустым.`);
      }
      slotValues[slot.name] = String(value).trim();
    }

    const lesson = structuredClone(state.lesson);
    const target = lesson.stages.find(candidate => candidate.id === stage.id);
    if (!target) fail(`В уроке нет этапа ${stage.id}.`);
    target.content = stage.blocks.map(block => renderBlock(block, built, slotValues));
    return { lesson, variables };
  }

  function apply(key, state, generated, { random = Math.random } = {}) {
    const stage = stepStage(key);
    const answer = needsModel(stage) ? generated : {};
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) fail(`Ответ для этапа ${stage.title} должен быть объектом.`);
    for (const responseKey of analysis.responseKeys.get(stage.id).keys()) {
      if (!Object.hasOwn(answer, responseKey)) fail(`В ответе для этапа ${stage.title} нет поля ${responseKey}.`);
    }
    return buildStage(stage, state, {
      random,
      dataFor: (block, control) => Object.fromEntries(control.fields.map(field => [field, answer[block.fields[field]]])),
      slotFor: slot => answer[slot.name],
    });
  }

  // Synthetic mode and catalog previews: controls supply sample data instead of the model.
  function applyExample(key, state, { random = Math.random } = {}) {
    return buildStage(stepStage(key), state, {
      random,
      dataFor: (block, control, links) => {
        if (typeof control.example !== 'function') fail(`У контрола ${control.type} нет примера данных.`);
        return control.example({ params: block.params, links });
      },
      slotFor: slot => slot.rule,
    });
  }

  return Object.freeze({ template, steps, resolveInputs, createSkeleton, request, apply, applyExample });
}

module.exports = { compileTemplate };
