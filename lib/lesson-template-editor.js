'use strict';

const { createExampleLesson } = require('./lesson-generation-plan.js');
const { CHROME_FIELDS } = require('./lesson-templates/chrome-fields.js');
const { STAGE_ICONS, STAGE_ICON_ALIASES } = require('./lesson-templates/stage-icons.js');
const { findSystemTemplate } = require('./lesson-templates/system-templates.js');
const { compileTemplate } = require('./lesson-templates/template-engine.js');
const { flattenBlocks, validateTemplate } = require('./lesson-templates/validate-template.js');
const { VARIABLE_TYPES } = require('./lesson-templates/variable-types.js');
const { CONTROL_CATALOG } = require('./template-controls/index.js');

// What the template editor gets from the server. Controls run only here, so the editor
// sends its unsaved definition and receives the problems, the lesson built from sample
// data and, for every block, its links and the rules the control adds to the prompt.

const EXAMPLE_TOPIC = 'Example topic';
// The same sample lesson on every preview: tasks are not reshuffled on each edit.
const steadyRandom = () => 0.5;

const mapValues = (object, transform) => Object.fromEntries(Object.entries(object)
  .map(([key, value]) => [key, transform(value)]));

function describeControl(control) {
  return {
    type: control.type,
    kind: control.kind,
    label: control.label,
    // `check` stays on the server: the preview reports its problems.
    params: mapValues(control.params, ({ check, ...spec }) => spec),
    chrome: control.chrome.map(key => ({ key, ...CHROME_FIELDS[key] })),
    inputs: mapValues(control.inputs, port => ({ type: port.type, required: port.required === true })),
    outputs: mapValues(control.outputs, port => ({ type: port.type })),
    // Answer fields of a generated control: a new field for the AI must not take their names.
    fields: control.fields,
    defaultInstructions: control.defaultInstructions,
  };
}

function describeControls() {
  return {
    controls: [...CONTROL_CATALOG.values()].map(describeControl),
    variableTypes: mapValues(VARIABLE_TYPES, type => type.label),
    stageIcons: { icons: STAGE_ICONS, aliases: STAGE_ICON_ALIASES },
  };
}

// «Вернуть по умолчанию» restores the instructions of the same block in the system
// template the copy descends from; blocks it does not have fall back to the control's.
const systemBlocks = new Map();

function systemBlock(systemTemplateId, blockId) {
  const system = findSystemTemplate(systemTemplateId);
  if (!system) return undefined;
  if (!systemBlocks.has(system.id)) {
    const { template } = validateTemplate(system.definition, CONTROL_CATALOG);
    systemBlocks.set(system.id, new Map(template.stages
      .flatMap(stage => flattenBlocks(stage.blocks))
      .map(block => [block.id, block])));
  }
  return systemBlocks.get(system.id).get(blockId);
}

function defaultInstructions(block, systemTemplateId) {
  const original = systemBlock(systemTemplateId, block.id);
  return original?.control === block.control
    ? original.instructions
    : CONTROL_CATALOG.get(block.control).defaultInstructions;
}

// The same for a stage: its instructions in the system template, or none.
function defaultStageInstructions(stageId, systemTemplateId) {
  const original = findSystemTemplate(systemTemplateId)?.definition.stages.find(stage => stage.id === stageId);
  return original?.instructions ?? '';
}

// Who reads each variable: blocks through their inputs and stages through their context.
function variableReaders(template, analysis) {
  const readers = new Map([...analysis.producers.keys()].map(variable => [variable, { blocks: [], stages: [] }]));
  for (const stage of template.stages) {
    for (const line of stage.context) {
      if (line.source === 'var') readers.get(line.name).stages.push(stage.id);
    }
    for (const block of flattenBlocks(stage.blocks)) {
      for (const [port, link] of Object.entries(analysis.links.get(block.id) || {})) {
        readers.get(link.variable).blocks.push({ block: block.id, stage: stage.id, port });
      }
    }
  }
  return readers;
}

function describeBlock(block, stage, { analysis, compiled, readers, systemTemplateId }) {
  const described = {
    stage: stage.id,
    inputs: mapValues(analysis.links.get(block.id), link => ({
      variable: link.variable,
      type: link.type,
      from: { block: link.producer.block.id, stage: link.producer.stage.id },
    })),
    exports: mapValues(block.exports, variable => ({
      variable,
      type: analysis.producers.get(variable).type,
      readers: readers.get(variable),
    })),
  };
  if (block.kind === 'generated') {
    described.rules = compiled.blockRules(block.id);
    described.defaultInstructions = defaultInstructions(block, systemTemplateId);
  }
  return described;
}

// `lesson`, `blocks` and `stages` are null while the template has errors: the editor
// shows the list of problems instead.
function previewLessonTemplate({ definition, systemTemplateId }) {
  const { template, analysis, errors } = validateTemplate(definition, CONTROL_CATALOG);
  if (errors.length > 0) return { errors, lesson: null, blocks: null, stages: null };

  const compiled = compileTemplate(definition, CONTROL_CATALOG);
  const scope = {
    analysis,
    compiled,
    readers: variableReaders(template, analysis),
    systemTemplateId,
  };
  const blocks = {};
  for (const stage of template.stages) {
    for (const block of flattenBlocks(stage.blocks)) {
      if (block.kind !== 'static') blocks[block.id] = describeBlock(block, stage, scope);
    }
  }
  // Fully static stages are not among the steps: they never reach the model.
  const usesModel = new Map(compiled.steps.map(step => [step.key, step.needsModel]));
  const stages = Object.fromEntries(template.stages.map(stage => [stage.id, {
    usesModel: usesModel.get(stage.id) === true,
    defaultInstructions: defaultStageInstructions(stage.id, systemTemplateId),
  }]));
  return {
    errors,
    lesson: createExampleLesson(definition, EXAMPLE_TOPIC, { random: steadyRandom }),
    blocks,
    stages,
  };
}

module.exports = { describeControls, previewLessonTemplate };
