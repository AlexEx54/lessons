(function initLessonTemplateEdits(root) {
  'use strict';

  // Edits of a template definition made by the template editor. They change the
  // definition in place: the editor works on its own copy and sends it to the server,
  // which checks the result. Runs in the browser and, for tests, in node.

  const Statics = root.LessonTemplateStatics
    || (typeof require === 'function' ? require('./lesson-template-statics.js') : null);
  if (!Statics) throw new Error('LessonTemplateEdits requires LessonTemplateStatics.');

  const CONTEXT_REFERENCE = /^\$(input|var)\.([a-z][A-Za-z0-9]*)$/;
  const PLACEHOLDER = /\{\{([a-z][A-Za-z0-9]*)\}\}/g;
  const CONTEXT_LABEL_MAX_LENGTH = 80;

  const flattenBlocks = blocks => blocks.flatMap(block => (block.kind === 'row' ? block.blocks : [block]));

  // Which block gives away each variable, and in which stage.
  function variableProducers(definition) {
    const producers = new Map();
    for (const stage of definition.stages) {
      for (const block of flattenBlocks(stage.blocks)) {
        for (const [port, variable] of Object.entries(block.exports || {})) {
          producers.set(variable, { stage, block, port });
        }
      }
    }
    return producers;
  }

  // The stage's context as a list, in prompt order. A reference the editor cannot read
  // keeps `source: null`: the server reports it.
  function contextLines(stage) {
    return Object.entries(stage.context || {}).map(([label, reference]) => {
      const match = CONTEXT_REFERENCE.exec(String(reference));
      return { label, reference, source: match?.[1] ?? null, name: match?.[2] ?? null };
    });
  }

  // Variables the stage's blocks read from other stages: the model sees them through
  // the context, so their lines must stay.
  function contextVariablesInUse(definition, stage) {
    const producers = variableProducers(definition);
    const used = new Set();
    for (const block of flattenBlocks(stage.blocks)) {
      for (const variable of Object.values(block.inputs || {})) {
        const producer = producers.get(variable);
        if (producer && producer.stage !== stage) used.add(variable);
      }
    }
    return used;
  }

  // Labels are part of the prompt, so they are English: `grammarTopic` → `Grammar topic`.
  function defaultContextLabel(name) {
    const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  }

  function uniqueContextLabel(stage, base) {
    const taken = new Set(Object.keys(stage.context || {}));
    if (!taken.has(base)) return base;
    let number = 2;
    while (taken.has(`${base} ${number}`)) number += 1;
    return `${base} ${number}`;
  }

  // The lines are an object keyed by label, so a line is renamed by rebuilding the object
  // in the same order. A stage without lines has no context at all.
  function setContextLines(stage, lines) {
    if (lines.length === 0) delete stage.context;
    else stage.context = Object.fromEntries(lines.map(line => [line.label, line.reference]));
  }

  // Returns the problem with the new label, or null once the line is renamed.
  function renameContextLine(stage, index, label) {
    const lines = contextLines(stage);
    const trimmed = label.trim();
    if (!trimmed) return 'Подпись не может быть пустой.';
    if (lines.some((line, other) => other !== index && line.label === trimmed)) return 'Такая подпись уже есть.';
    lines[index].label = trimmed;
    setContextLines(stage, lines);
    return null;
  }

  // Adds `$input.<name>` or `$var.<name>` with a label made from the name; returns the label.
  function addContextLine(stage, source, name) {
    const label = uniqueContextLabel(stage, defaultContextLabel(name));
    stage.context = { ...stage.context, [label]: `$${source}.${name}` };
    return label;
  }

  function removeContextLine(stage, index) {
    setContextLines(stage, contextLines(stage).filter((_line, other) => other !== index));
  }

  // Puts the item at `from` to index `to`; the others keep their order.
  function moveItem(list, from, to) {
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
  }

  // Stages run in data-flow order, so any order is valid; blocks move only within their
  // stage, where their links live.
  const moveStage = (definition, from, to) => moveItem(definition.stages, from, to);
  const moveBlock = (stage, from, to) => moveItem(stage.blocks, from, to);

  // `<block>.items[0].answer` → `<block>`.
  const slotSourceBlock = source => /^[a-z][a-z0-9-]*/.exec(String(source))?.[0];
  const sourceBlock = source => (typeof source === 'string' ? source : source?.block);
  const sourceList = from => (from === undefined ? [] : [].concat(from));

  // What goes away with a block, a row or a stage (`target` is `{ block }` or `{ stage }`;
  // a row is a block). A deleted block takes its variables with it, and the loop goes on
  // until nothing else breaks:
  //   - a required input reading a gone variable takes its block too; an optional one is
  //     unbound;
  //   - a block built from deleted blocks loses those sources, and goes once none is left;
  //   - a static block whose slot reads a deleted block goes.
  // Then emptied rows and stages go, and context lines lose the gone variables.
  // `controls` maps a control type to `{ inputs: { <port>: { required } } }`.
  // The definition is not changed: `applyDeletion` does it once the user agrees.
  function deletionPlan(definition, target, controls) {
    const entries = [];
    for (const stage of definition.stages) {
      for (const block of stage.blocks) {
        const parts = block.kind === 'row' ? block.blocks : [block];
        for (const part of parts) entries.push({ block: part, stage, row: block.kind === 'row' ? block : null });
      }
    }
    const deleted = new Set(entries
      .filter(({ block, stage, row }) => (target.stage
        ? stage.id === target.stage
        : block.id === target.block || row?.id === target.block))
      .map(({ block }) => block.id));

    const goneVariables = () => new Set(entries
      .filter(({ block }) => deleted.has(block.id))
      .flatMap(({ block }) => Object.values(block.exports || {})));
    const isRequired = (block, port) => controls.get(block.control)?.inputs?.[port]?.required !== false;
    const breaks = (block, gone) => {
      if (block.kind === 'static') {
        return Object.values(block.slots || {}).some(slot => deleted.has(slotSourceBlock(slot?.from)));
      }
      const sources = sourceList(block.from).map(sourceBlock);
      return Object.entries(block.inputs || {}).some(([port, variable]) => gone.has(variable) && isRequired(block, port))
        || (sources.length > 0 && sources.every(id => deleted.has(id)));
    };
    let grown = true;
    while (grown) {
      grown = false;
      const gone = goneVariables();
      for (const { block } of entries) {
        if (deleted.has(block.id) || !breaks(block, gone)) continue;
        deleted.add(block.id);
        grown = true;
      }
    }

    const gone = goneVariables();
    const kept = entries.filter(({ block }) => !deleted.has(block.id));
    const emptied = stage => entries.some(entry => entry.stage === stage)
      && !kept.some(entry => entry.stage === stage);
    const stages = definition.stages
      .filter(stage => stage.id === target.stage || emptied(stage))
      .map(stage => stage.id);
    const keptStages = definition.stages.filter(stage => !stages.includes(stage.id));
    return {
      target,
      blocks: entries.filter(({ block }) => deleted.has(block.id))
        .map(({ block, stage }) => ({ block: block.id, stage: stage.id })),
      stages,
      unbound: kept.flatMap(({ block, stage }) => Object.entries(block.inputs || {})
        .filter(([, variable]) => gone.has(variable))
        .map(([port, variable]) => ({ block: block.id, stage: stage.id, port, variable }))),
      sources: kept.flatMap(({ block, stage }) => sourceList(block.from).map(sourceBlock)
        .filter(id => deleted.has(id))
        .map(source => ({ block: block.id, stage: stage.id, source }))),
      context: keptStages.flatMap(stage => contextLines(stage)
        .filter(line => line.source === 'var' && gone.has(line.name))
        .map(line => ({ stage: stage.id, label: line.label }))),
      emptiesTemplate: keptStages.length === 0,
    };
  }

  // Carries out a plan from `deletionPlan` on the same definition. A row left with one
  // part becomes that block: a row is there to put several blocks side by side.
  function applyDeletion(definition, plan) {
    const deleted = new Set(plan.blocks.map(entry => entry.block));
    definition.stages = definition.stages.filter(stage => !plan.stages.includes(stage.id));
    for (const stage of definition.stages) {
      stage.blocks = stage.blocks.flatMap(block => {
        if (block.kind !== 'row') return deleted.has(block.id) ? [] : [block];
        block.blocks = block.blocks.filter(part => !deleted.has(part.id));
        if (block.blocks.length > 1) return [block];
        return block.blocks;
      });
    }

    const blocks = new Map(definition.stages.flatMap(stage => flattenBlocks(stage.blocks)).map(block => [block.id, block]));
    for (const { block: id, port } of plan.unbound) {
      const block = blocks.get(id);
      delete block.inputs[port];
      if (Object.keys(block.inputs).length === 0) delete block.inputs;
    }
    for (const { block: id } of plan.sources) {
      const block = blocks.get(id);
      if (Array.isArray(block.from)) block.from = block.from.filter(source => !deleted.has(sourceBlock(source)));
    }
    for (const stage of definition.stages) {
      const labels = new Set(plan.context.filter(line => line.stage === stage.id).map(line => line.label));
      if (labels.size > 0) setContextLines(stage, contextLines(stage).filter(line => !labels.has(line.label)));
    }
  }

  // Names of the {{slots}} found in the component's texts.
  function placeholders(value, names = new Set()) {
    if (typeof value === 'string') {
      for (const match of value.matchAll(PLACEHOLDER)) names.add(match[1]);
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(item => placeholders(item, names));
    }
    return names;
  }

  // Teacher's Notes saves its own text apart from its sub-blocks: `retainedBlockIds` keeps
  // some of them, `blocks` gives new texts of one.
  function teacherNoteWith(note, { text, retainedBlockIds, blocks: updates = [] }) {
    const next = { ...note };
    if (text) next.text = text;
    else if (text !== undefined) delete next.text;
    const blocks = (note.blocks || [])
      .filter(block => !retainedBlockIds || retainedBlockIds.includes(block.id))
      .map(block => {
        const update = updates.find(item => item.id === block.id);
        if (!update) return block;
        const changed = { ...block, title: update.title, text: update.text };
        if (block.tip) changed.tip = { ...block.tip, text: update.tip?.text };
        return changed;
      });
    if (blocks.length > 0) next.blocks = blocks;
    else delete next.blocks;
    return next;
  }

  // Puts what a component editor saves (`onSave(changes, id)`) into a static block. The
  // other editors send new values of the fields they edit, null or undefined for a field
  // to drop. The component's normalizer checks the result before the block changes; a
  // slot whose {{name}} is gone from the texts goes too, and a field for the AI inserted
  // into the open editor (`newSlots`) joins the block once its {{name}} is in the texts.
  // Returns the component.
  function applyStaticChanges(block, changes, newSlots = {}) {
    let component;
    if (block.component.type === 'teacherNote') {
      component = teacherNoteWith(block.component, changes);
    } else {
      component = { ...block.component };
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined) delete component[key];
        else component[key] = value;
      }
    }
    Statics.checkStaticComponent({ ...component, id: block.id });
    block.component = component;
    const used = placeholders(component);
    const slots = { ...block.slots };
    for (const name of Object.keys(slots)) {
      if (!used.has(name)) delete slots[name];
    }
    for (const [name, slot] of Object.entries(newSlots)) {
      if (used.has(name) && !slots[name]) slots[name] = slot;
    }
    if (Object.keys(slots).length > 0) block.slots = slots;
    else delete block.slots;
    return component;
  }

  // Names the stage's model answer already holds: fields of its generated blocks and its
  // slots, which share one flat answer object. `controls` maps a control type to
  // `{ fields }`.
  function answerNames(stage, controls) {
    const names = new Set();
    for (const block of flattenBlocks(stage.blocks)) {
      if (block.kind === 'generated') {
        for (const field of controls.get(block.control)?.fields || []) names.add(block.fields?.[field] ?? field);
      }
      Object.keys(block.slots || {}).forEach(name => names.add(name));
    }
    return names;
  }

  // `aiField1`, `aiField2`…: the first name free in the stage and among `taken`.
  function newFieldName(stage, controls, taken = []) {
    const names = new Set([...answerNames(stage, controls), ...taken]);
    let number = 1;
    while (names.has(`aiField${number}`)) number += 1;
    return `aiField${number}`;
  }

  // A field for the AI put at the end of a Teacher's Notes text, for a note whose editor
  // is closed: the AI writes it, by `rule`, together with the stage.
  function appendNoteField(block, name, rule = '') {
    const { text } = block.component;
    block.component = { ...block.component, text: text ? `${text}\n\n{{${name}}}` : `{{${name}}}` };
    block.slots = { ...block.slots, [name]: { rule } };
  }

  const api = {
    CONTEXT_LABEL_MAX_LENGTH,
    flattenBlocks,
    variableProducers,
    contextLines,
    contextVariablesInUse,
    defaultContextLabel,
    uniqueContextLabel,
    renameContextLine,
    addContextLine,
    removeContextLine,
    moveStage,
    moveBlock,
    deletionPlan,
    applyDeletion,
    applyStaticChanges,
    newFieldName,
    appendNoteField,
    slotSourceBlock,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LessonTemplateEdits = api;
})(typeof window !== 'undefined' ? window : globalThis);
