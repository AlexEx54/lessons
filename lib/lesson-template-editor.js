'use strict';

const { STATIC_BLOCKS } = require('../assets/lesson-template-statics.js');
const { LEARNER_PROFILE_LABELS } = require('./ai-lesson-generator.js');
const { createExampleLesson } = require('./lesson-generation-plan.js');
const { ANSWER_KEY_FIELDS, answerKeyId } = require('./lesson-templates/answer-key.js');
const { CHROME_FIELDS } = require('./lesson-templates/chrome-fields.js');
const { CONTROL_GROUPS } = require('./lesson-templates/control-catalog.js');
const { STAGE_ICONS, STAGE_ICON_ALIASES } = require('./lesson-templates/stage-icons.js');
const { findSystemTemplate } = require('./lesson-templates/system-templates.js');
const { compileTemplate } = require('./lesson-templates/template-engine.js');
const { SCHEMA_VERSION, flattenBlocks, validateTemplate } = require('./lesson-templates/validate-template.js');
const { VARIABLE_TYPES } = require('./lesson-templates/variable-types.js');
const { CONTROL_CATALOG } = require('./template-controls/index.js');

// What the template editor gets from the server. Controls run only here, so the editor
// sends its unsaved definition and receives the problems, the lesson built from sample
// data and, for every generated block, the rules the control adds to the prompt.

const EXAMPLE_TOPIC = 'Example topic';
// The same sample lesson on every preview: tasks are not reshuffled on each edit.
const steadyRandom = () => 0.5;

const mapValues = (object, transform) => Object.fromEntries(Object.entries(object)
  .map(([key, value]) => [key, transform(value)]));

// The controls a block built from another block may take as its source, and what it
// takes from it.
function acceptedSources(control) {
  const accepts = [...CONTROL_CATALOG.values()]
    .filter(other => other !== control && control.acceptsSource(other) === null)
    .map(other => other.type);
  return { accepts, label: control.sourceLabel };
}

function describeControl(control) {
  return {
    type: control.type,
    kind: control.kind,
    label: control.label,
    group: control.group,
    description: control.description,
    // `check` stays on the server: the preview reports its problems.
    params: mapValues(control.params, ({ check, ...spec }) => spec),
    chrome: control.chrome.map(key => ({ key, ...CHROME_FIELDS[key] })),
    // `sameStage`: a generated block may read the input from a block of its own stage.
    inputs: mapValues(control.inputs, port => ({
      type: port.type,
      required: port.required === true,
      requires: port.requires,
      sameStage: typeof port.sameStageRule === 'function',
    })),
    outputs: mapValues(control.outputs, port => ({ type: port.type, features: port.features })),
    ...(typeof control.acceptsSource === 'function' ? { sources: acceptedSources(control) } : {}),
    // A task that can have an answer key, and the parts of a key in several parts.
    ...(typeof control.answerKey === 'function'
      ? { answerKey: control.answerKeyParts ? { parts: control.answerKeyParts } : {} }
      : {}),
    // Answer fields of a generated control: a new field for the AI must not take their names.
    fields: control.fields,
    defaultInstructions: control.defaultInstructions,
  };
}

function describeControls() {
  return {
    controls: [...CONTROL_CATALOG.values()].map(describeControl),
    statics: Object.entries(STATIC_BLOCKS).map(([type, block]) => ({ type, ...block })),
    // In catalog order.
    groups: Object.entries(CONTROL_GROUPS).map(([key, label]) => ({ key, label })),
    answerKeyFields: ANSWER_KEY_FIELDS,
    variableTypes: mapValues(VARIABLE_TYPES, type => type.label),
    stageIcons: { icons: STAGE_ICONS, aliases: STAGE_ICON_ALIASES },
    // What every stage prompt says about the learner, by the names it uses.
    learnerProfile: Object.values(LEARNER_PROFILE_LABELS),
  };
}

// The block catalog shows a control as the lesson component it builds from sample data
// with its default parameters, a task with its answer key, as a block from the catalog
// comes. The control sits in a lesson of its own: an earlier stage gives it every
// variable it reads, and a control built from another block gets the first control it
// accepts as its source. Samples never change, so each is built once.
const SAMPLE_PRODUCERS = Object.freeze({
  vocabulary: { control: 'vocabularyList', params: { distractors: true }, port: 'vocabulary' },
  statements: { control: 'factOrMyth', port: 'guessStatements' },
});
const EXAMPLE_BLOCK = 'catalog-example';
const examples = new Map();

function exampleDefinition(control) {
  const sources = [];
  const context = { Topic: '$input.topic' };
  const variable = type => {
    const producer = SAMPLE_PRODUCERS[type];
    if (!producer) throw new Error(`Для типа ${type} нет образца в каталоге.`);
    if (!sources.some(block => block.exports[producer.port] === type)) {
      sources.push({
        id: `sample-${type}`,
        kind: 'generated',
        control: producer.control,
        ...(producer.params ? { params: producer.params } : {}),
        exports: { [producer.port]: type },
      });
      context[`Sample ${type}`] = `$var.${type}`;
    }
    return type;
  };
  const blockOf = (id, { type, kind, inputs }) => {
    const block = { id, kind, control: type };
    const ports = Object.entries(inputs).map(([port, spec]) => [port, variable(spec.type)]);
    if (ports.length > 0) block.inputs = Object.fromEntries(ports);
    return block;
  };
  const blocks = [];
  const target = blockOf(EXAMPLE_BLOCK, control);
  if (typeof control.answerKey === 'function') target.answerKey = {};
  if (typeof control.acceptsSource === 'function') {
    const source = [...CONTROL_CATALOG.values()]
      .find(other => other.kind === 'generated' && control.acceptsSource(other) === null);
    blocks.push(blockOf('sample-source', source));
    target.from = 'sample-source';
  }
  blocks.push(target);
  const stage = (id, stageBlocks, stageContext) => ({ id, title: id, durationMinutes: 5, context: stageContext, blocks: stageBlocks });
  return {
    schemaVersion: SCHEMA_VERSION,
    id: 'catalog-example',
    title: 'Catalog example',
    inputs: { topic: { label: 'Тема урока' } },
    stages: [
      ...(sources.length > 0 ? [stage('sources', sources, { Topic: '$input.topic' })] : []),
      stage('example', blocks, context),
    ],
  };
}

// { component, answerKey? }, or null for a type the catalog does not have.
function controlExample(type) {
  const control = CONTROL_CATALOG.get(type);
  if (!control) return null;
  if (!examples.has(type)) {
    const lesson = createExampleLesson(exampleDefinition(control), EXAMPLE_TOPIC, { random: steadyRandom });
    const built = id => lesson.stages.at(-1).content.find(component => component.id === id);
    const answerKey = built(answerKeyId(EXAMPLE_BLOCK));
    examples.set(type, { component: built(EXAMPLE_BLOCK), ...(answerKey ? { answerKey } : {}) });
  }
  return examples.get(type);
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

// What the panel shows of a generated block beyond the definition: its technical rules
// and the instructions «Вернуть по умолчанию» restores. Links are worked out in the
// editor from the definition, so they show while the template has problems too.
function describeBlock(block, { compiled, systemTemplateId }) {
  return {
    rules: compiled.blockRules(block.id),
    defaultInstructions: defaultInstructions(block, systemTemplateId),
  };
}

// `lesson`, `blocks` and `stages` are null while the template has errors: the editor
// shows the list of problems instead.
function previewLessonTemplate({ definition, systemTemplateId }) {
  const { template, errors } = validateTemplate(definition, CONTROL_CATALOG);
  if (errors.length > 0) return { errors, lesson: null, blocks: null, stages: null };

  const compiled = compileTemplate(definition, CONTROL_CATALOG);
  const blocks = {};
  for (const stage of template.stages) {
    for (const block of flattenBlocks(stage.blocks)) {
      if (block.kind === 'generated') blocks[block.id] = describeBlock(block, { compiled, systemTemplateId });
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

module.exports = { controlExample, describeControls, previewLessonTemplate };
