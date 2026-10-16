(function initLessonTemplateEdits(root) {
  'use strict';

  // Edits of a template definition made by the template editor. They change the
  // definition in place: the editor works on its own copy and sends it to the server,
  // which checks the result. Runs in the browser and, for tests, in node.

  const CONTEXT_REFERENCE = /^\$(input|var)\.([a-z][A-Za-z0-9]*)$/;
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
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LessonTemplateEdits = api;
})(typeof window !== 'undefined' ? window : globalThis);
