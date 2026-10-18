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
  const INPUT_TITLE_MAX_LENGTH = 40;

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

  // A new field is named from its English title, which the model sees: `Main character`
  // → `mainCharacter`, and a context line made from that name reads `Main character`
  // again. The name never changes later: context lines and fallbacks refer to it.
  function inputNameFromTitle(title) {
    const words = title.trim().split(/\s+/).map(word => word.toLowerCase());
    return words.map((word, index) => (index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1))).join('');
  }

  // Returns the problem with the title of a new field, or null.
  function newInputProblem(definition, title) {
    const trimmed = title.trim();
    if (!trimmed) return 'Напишите название по-английски.';
    if (trimmed.length > INPUT_TITLE_MAX_LENGTH) return `Не длиннее ${INPUT_TITLE_MAX_LENGTH} символов.`;
    if (!/^[A-Za-z]+(?: +[A-Za-z]+)*$/.test(trimmed)) return 'Только латинские буквы и пробелы.';
    const name = inputNameFromTitle(trimmed);
    if (Object.hasOwn(definition.inputs, name)) return `Поле «${definition.inputs[name].label}» уже так называется.`;
    return null;
  }

  // Adds a required field at the end of the list; returns its name.
  function addInput(definition, title, label) {
    const name = inputNameFromTitle(title);
    definition.inputs = { ...definition.inputs, [name]: { label: label.trim() } };
    return name;
  }

  // What keeps a field in the template: the stages whose context passes it and the
  // fields that take its value when left empty.
  function inputReaders(definition, name) {
    return {
      stages: definition.stages
        .filter(stage => contextLines(stage).some(line => line.source === 'input' && line.name === name))
        .map(stage => stage.id),
      fallbacks: Object.keys(definition.inputs).filter(other => definition.inputs[other].fallback === name),
    };
  }

  // A field is set optional with what an empty one takes, or required again.
  function setInputOptional(input, optional, fallback) {
    if (optional) input.optional = true;
    else delete input.optional;
    if (optional && fallback) input.fallback = fallback;
    else delete input.fallback;
  }

  function removeInput(definition, name) {
    const { [name]: _removed, ...inputs } = definition.inputs;
    definition.inputs = inputs;
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

  // «+ Этап»: a stage right after the stage at `after`, with all a stage needs but blocks.
  // Until it gets one the server lists it among the problems. Its context passes the
  // lesson topic, which every template has. Returns the stage.
  function addStage(definition, after) {
    const taken = new Set(definition.stages.map(stage => stage.id));
    let id = 'new-stage';
    for (let number = 2; taken.has(id); number += 1) id = `new-stage-${number}`;
    const stage = {
      id,
      title: 'New Stage',
      durationMinutes: 5,
      icon: 'sparkles',
      context: { [defaultContextLabel('topic')]: '$input.topic' },
      blocks: [],
    };
    definition.stages.splice(after + 1, 0, stage);
    return stage;
  }

  // `contextDropdown` → `context-dropdown`.
  const kebabCase = name => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

  // Ids of every block, rows and their parts too: a block id is unique in the template.
  function blockIds(definition) {
    return new Set(definition.stages.flatMap(stage => stage.blocks.flatMap(block => [
      block.id,
      ...(block.kind === 'row' ? block.blocks.map(part => part.id) : []),
    ])));
  }

  // `base`, `base2`, `base3`…: the first name `taken` lacks. Block ids put a dash before the number.
  function freeName(base, taken, separator = '') {
    if (!taken.has(base)) return base;
    let number = 2;
    while (taken.has(`${base}${separator}${number}`)) number += 1;
    return `${base}${separator}${number}`;
  }

  // Optional parts of an output's items that the producing block has on: a feature is
  // turned on by a flag parameter, which takes its default while the block leaves it out.
  // `controls` maps a control type to its description from /api/template-controls.
  function producerFeatures(producer, controls) {
    const control = controls.get(producer.block.control);
    const features = control?.outputs[producer.port]?.features || {};
    return Object.keys(features).filter(feature => {
      const param = features[feature];
      const value = Object.hasOwn(producer.block.params || {}, param) ? producer.block.params[param] : control.params[param]?.default;
      return value === true;
    });
  }

  // Where a block of `kind` at the end of `stage` may take its `input` from: blocks of this
  // and earlier stages that give away a variable of its type, the nearest first. A
  // generated block takes a variable of its own stage only when the control can, and only
  // from another generated block, which the model writes in the same answer. `missing`
  // lists the features the input requires and the producer has off. A block already in
  // the stage passes itself as `except`: it cannot read its own variables.
  function inputSources(definition, stage, kind, input, controls, except = null) {
    const stageIndex = definition.stages.indexOf(stage);
    const sources = [];
    for (const [variable, producer] of variableProducers(definition)) {
      if (producer.block === except) continue;
      const index = definition.stages.indexOf(producer.stage);
      const type = controls.get(producer.block.control)?.outputs[producer.port]?.type;
      if (type !== input.type || index > stageIndex) continue;
      if (index === stageIndex && kind === 'generated' && !(input.sameStage && producer.block.kind === 'generated')) continue;
      const features = producerFeatures(producer, controls);
      sources.push({
        variable,
        block: producer.block.id,
        port: producer.port,
        stage: producer.stage.id,
        sameStage: index === stageIndex,
        missing: (input.requires || []).filter(feature => !features.includes(feature)),
        order: [index, flattenBlocks(producer.stage.blocks).indexOf(producer.block)],
      });
    }
    return sources
      .sort((a, b) => b.order[0] - a.order[0] || b.order[1] - a.order[1])
      .map(({ order, ...source }) => source);
  }

  // Blocks of the stage a block built from other blocks takes as sources (`sources` of
  // its control description), in stage order.
  function stageSources(stage, sources) {
    return flattenBlocks(stage.blocks)
      .filter(block => block.kind !== 'static' && sources.accepts.includes(block.control))
      .map(block => block.id);
  }

  // What a block of the catalog gets once added at the end of the stage: for every input
  // the nearest source with all the features it needs, or else the nearest one, which
  // the server then reports; for a block built from other blocks the nearest such block,
  // or all of them for one that takes several, as an answer key does. `entry` is the
  // control's description.
  function plannedLinks(definition, stage, entry, controls) {
    const inputs = {};
    for (const [port, input] of Object.entries(entry.inputs || {})) {
      const sources = inputSources(definition, stage, entry.kind, input, controls);
      inputs[port] = sources.find(source => source.missing.length === 0) || sources[0] || null;
    }
    let from = [];
    if (entry.sources) {
      from = stageSources(stage, entry.sources);
      if (entry.sources.single) from = from.slice(-1);
    }
    return { inputs, from };
  }

  // «+ Блок»: a block of the catalog at the end of the stage. Its id comes from the stage
  // and the control or component type, each output gives away a variable named after the
  // port, answer fields the stage already holds get another name, and the links are those
  // of `plannedLinks`. A variable of an earlier stage gets a context line, as the model
  // needs it. `entry` is the control's description, or for a static block
  // `{ kind: 'static', type, sample }`. Returns the block and `addedLines`, the labels of
  // the context lines added.
  function addBlock(definition, stage, entry, controls) {
    const id = freeName(`${stage.id}-${kebabCase(entry.type)}`, blockIds(definition), '-');
    if (entry.kind === 'static') {
      const block = { id, kind: 'static', component: JSON.parse(JSON.stringify(entry.sample)) };
      stage.blocks.push(block);
      return { block, addedLines: [] };
    }

    const block = { id, kind: entry.kind, control: entry.type };
    if (entry.kind === 'generated') {
      const taken = answerNames(stage, controls);
      const renamed = entry.fields.map(field => {
        const name = freeName(field, taken);
        taken.add(name);
        return [field, name];
      }).filter(([field, name]) => field !== name);
      if (renamed.length > 0) block.fields = Object.fromEntries(renamed);
    }
    const links = plannedLinks(definition, stage, entry, controls);
    const addedLines = [];
    const inputs = Object.entries(links.inputs).filter(([, source]) => source);
    if (inputs.length > 0) block.inputs = Object.fromEntries(inputs.map(([port, source]) => [port, source.variable]));
    for (const [, source] of inputs) {
      const passed = contextLines(stage).some(line => line.source === 'var' && line.name === source.variable);
      if (!source.sameStage && !passed) addedLines.push(addContextLine(stage, 'var', source.variable));
    }
    if (links.from.length > 0) block.from = links.from;
    const variables = new Set(variableProducers(definition).keys());
    const ports = Object.keys(entry.outputs || {});
    if (ports.length > 0) {
      block.exports = {};
      for (const port of ports) {
        block.exports[port] = freeName(port, variables);
        variables.add(block.exports[port]);
      }
    }
    stage.blocks.push(block);
    return { block, addedLines };
  }

  // What a block reads and gives away, worked out from the definition, so the links show
  // while the template has problems too. An input reads `variable` from the block `from`;
  // both are null while it is not connected, and `from` is null for a variable nobody
  // gives away. An output's readers are the blocks that read its variable and the stages
  // whose context passes it. A block built from other blocks lists them as `sources`, each
  // block once, in `from` order; `inStage` is false for an id its stage lacks.
  function blockLinks(definition, block, controls) {
    const control = controls.get(block.control);
    const producers = variableProducers(definition);
    const inputs = {};
    for (const [port, spec] of Object.entries(control?.inputs || {})) {
      const variable = block.inputs?.[port] ?? null;
      const producer = producers.get(variable);
      inputs[port] = {
        type: spec.type,
        required: spec.required,
        variable,
        from: producer ? { block: producer.block.id, stage: producer.stage.id } : null,
      };
    }
    const exports = {};
    for (const [port, variable] of Object.entries(block.exports || {})) {
      const readers = { blocks: [], stages: [] };
      for (const stage of definition.stages) {
        if (contextLines(stage).some(line => line.source === 'var' && line.name === variable)) readers.stages.push(stage.id);
        for (const reader of flattenBlocks(stage.blocks)) {
          for (const [readerPort, read] of Object.entries(reader.inputs || {})) {
            if (read === variable) readers.blocks.push({ block: reader.id, stage: stage.id, port: readerPort });
          }
        }
      }
      exports[port] = { variable, type: control?.outputs[port]?.type, readers };
    }
    if (!control?.sources) return { inputs, exports };
    const stageBlocks = flattenBlocks(definition.stages.find(stage => flattenBlocks(stage.blocks).includes(block))?.blocks || []);
    const sources = [...new Set(sourceList(block.from).map(sourceBlock))]
      .map(id => ({ block: id, inStage: stageBlocks.some(other => other.id === id && other !== block) }));
    return { inputs, exports, sources };
  }

  // Connects the block's `port` to `variable`, or disconnects it when that is null. A
  // variable of an earlier stage gets a context line, as the model needs it; the line of
  // the variable read before goes once no block of the stage reads it, while lines only
  // the model reads stay. Returns the labels of the lines added and removed.
  function setInputSource(definition, stage, block, port, variable) {
    const previous = block.inputs?.[port] ?? null;
    if (variable === null) {
      const { [port]: _removed, ...inputs } = block.inputs || {};
      if (Object.keys(inputs).length > 0) block.inputs = inputs;
      else delete block.inputs;
    } else {
      block.inputs = { ...block.inputs, [port]: variable };
    }

    const producers = variableProducers(definition);
    const passes = name => contextLines(stage).some(line => line.source === 'var' && line.name === name);
    const addedLines = [];
    if (variable !== null && producers.get(variable)?.stage !== stage && !passes(variable)) {
      addedLines.push(addContextLine(stage, 'var', variable));
    }
    let removedLines = [];
    if (previous !== null && previous !== variable && passes(previous)
      && producers.get(previous)?.stage !== stage && !contextVariablesInUse(definition, stage).has(previous)) {
      const lines = contextLines(stage);
      removedLines = lines.filter(line => line.source === 'var' && line.name === previous).map(line => line.label);
      setContextLines(stage, lines.filter(line => !(line.source === 'var' && line.name === previous)));
    }
    return { addedLines, removedLines };
  }

  // `<block>.items[0].answer` → `<block>`.
  const slotSourceBlock = source => /^[a-z][a-z0-9-]*/.exec(String(source))?.[0];
  const sourceBlock = source => (typeof source === 'string' ? source : source?.block);
  const sourceList = from => (from === undefined ? [] : [].concat(from));

  // A block built from other blocks of its stage names them in `from`: by id, or by an
  // object that adds the `part` of a key in several parts, a section `title` and `id`.
  // A source is told by its block and part; an entry without a part takes the key's first.
  const keyParts = (block, controls) => Object.keys(controls.get(block?.control)?.answerKeyParts || {});
  const sourceRef = (block, part) => (part === undefined ? { block } : { block, part });
  const sameSource = (a, b) => a.block === b.block && a.part === b.part;

  function sourceOf(entry, stage, controls) {
    const id = sourceBlock(entry);
    const part = typeof entry === 'string' ? undefined : entry?.part;
    return sourceRef(id, part ?? keyParts(flattenBlocks(stage.blocks).find(block => block.id === id), controls)[0]);
  }

  // Where a source sits in its stage: its block's place, then its part's. One the stage
  // lacks comes last.
  function sourceOrder(item, stage, controls) {
    const blocks = flattenBlocks(stage.blocks);
    const index = blocks.findIndex(block => block.id === item.block);
    if (index < 0) return [Infinity, 0];
    return [index, Math.max(0, keyParts(blocks[index], controls).indexOf(item.part))];
  }
  const comesBefore = (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);

  // What a block built from other blocks may be built from: every block of the stage its
  // control takes, in stage order and a row per part of a key in several parts, then the
  // entries of `from` that are none of them. `index` is the row's entry in `from`, or -1.
  function sourceOptions(stage, block, controls) {
    const entries = sourceList(block.from).map(entry => sourceOf(entry, stage, controls));
    const accepts = controls.get(block.control)?.sources?.accepts || [];
    const claimed = new Set();
    const rows = flattenBlocks(stage.blocks)
      .filter(candidate => candidate !== block && candidate.kind !== 'static' && accepts.includes(candidate.control))
      .flatMap(candidate => {
        const parts = keyParts(candidate, controls);
        return parts.length > 0 ? parts.map(part => sourceRef(candidate.id, part)) : [sourceRef(candidate.id)];
      })
      .map(row => {
        const index = entries.findIndex((entry, other) => !claimed.has(other) && sameSource(entry, row));
        if (index >= 0) claimed.add(index);
        return { ...row, index };
      });
    const rest = entries.map((entry, index) => ({ ...entry, index })).filter(entry => !claimed.has(entry.index));
    return [...rows, ...rest];
  }

  // Builds the block from the sources `chosen` ({ block, part? }). The ones it keeps stay
  // in their order with their section title and id; a new one goes before the first that
  // comes later in the stage, so a new answer key section takes its block's place.
  function setSources(stage, block, chosen, controls) {
    const of = entry => sourceOf(entry, stage, controls);
    const kept = sourceList(block.from).filter(entry => chosen.some(item => sameSource(item, of(entry))));
    for (const item of chosen) {
      if (kept.some(entry => sameSource(item, of(entry)))) continue;
      const order = sourceOrder(item, stage, controls);
      const at = kept.findIndex(entry => comesBefore(order, sourceOrder(of(entry), stage, controls)));
      kept.splice(at < 0 ? kept.length : at, 0, item.part === undefined ? item.block : { block: item.block, part: item.part });
    }
    if (kept.length > 0) block.from = kept;
    else delete block.from;
  }

  // The section title of the source at `index` in `from`. An empty one is dropped, and an
  // entry left with its block alone is written as the id.
  function setSourceTitle(block, index, title) {
    const from = sourceList(block.from);
    const entry = typeof from[index] === 'string' ? { block: from[index] } : { ...from[index] };
    if (title.trim()) entry.title = title.trim();
    else delete entry.title;
    from[index] = Object.keys(entry).length === 1 ? entry.block : entry;
    block.from = from;
  }

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

  // The stage's block or row `id` with every block it takes along: a row moves whole.
  function moving(definition, id) {
    for (const stage of definition.stages) {
      const index = stage.blocks.findIndex(block => block.id === id);
      if (index >= 0) return { stage, index, blocks: flattenBlocks([stage.blocks[index]]) };
    }
    throw new Error(`No block ${id} among the stage blocks.`);
  }

  // Whether `reader` may read a variable of `producer` in one stage: a generated block
  // reads only a generated one, which the model writes in the same answer, and only when
  // its control can (`sameStage` of the input).
  function readsInStage(reader, port, producer, controls) {
    if (reader.kind !== 'generated') return true;
    return producer.kind === 'generated' && controls.get(reader.control)?.inputs?.[port]?.sameStage === true;
  }

  // What keeps the block or row `id` out of the stage `targetId`, links within a row aside:
  //   - `builtFrom`: it is built from blocks of its stage (`from` or a slot's `from`);
  //   - `usedBy`: blocks of its stage are built from it;
  //   - `input`: its input reads a block of a later stage, or of the target one where the
  //     block cannot read it (`inStage` tells whether that stage would do);
  //   - `reader`: a block of an earlier stage reads its variable, or one of the target
  //     stage that cannot; `block` is null for a context line of an earlier stage.
  // `input` and `reader` carry the variable's `type`.
  // Stages run in data-flow order, but the editor keeps the links pointing down the list,
  // as its source picker does. An empty list means the block may go there.
  function moveBlockers(definition, id, targetId, controls) {
    const { stage: home, blocks } = moving(definition, id);
    const ids = new Set(blocks.map(block => block.id));
    const position = stageId => definition.stages.findIndex(stage => stage.id === stageId);
    const target = position(targetId);
    const blockers = [];

    const builtFrom = blocks.flatMap(block => [
      ...sourceList(block.from).map(sourceBlock),
      ...Object.values(block.slots || {}).map(slot => slot?.from).filter(Boolean).map(slotSourceBlock),
    ]).filter(source => !ids.has(source));
    if (builtFrom.length > 0) blockers.push({ kind: 'builtFrom', blocks: [...new Set(builtFrom)] });
    const usedBy = flattenBlocks(home.blocks)
      .filter(block => !ids.has(block.id))
      .filter(block => sourceList(block.from).some(source => ids.has(sourceBlock(source)))
        || Object.values(block.slots || {}).some(slot => ids.has(slotSourceBlock(slot?.from))))
      .map(block => block.id);
    if (usedBy.length > 0) blockers.push({ kind: 'usedBy', blocks: usedBy });

    const producers = variableProducers(definition);
    const typeOf = variable => {
      const producer = producers.get(variable);
      return controls.get(producer.block.control)?.outputs?.[producer.port]?.type;
    };
    for (const block of blocks) {
      for (const [port, variable] of Object.entries(block.inputs || {})) {
        const producer = producers.get(variable);
        if (!producer || ids.has(producer.block.id)) continue;
        const at = position(producer.stage.id);
        const inStage = readsInStage(block, port, producer.block, controls);
        if (at > target || (at === target && !inStage)) {
          blockers.push({ kind: 'input', block: producer.block.id, stage: producer.stage.id, inStage, type: typeOf(variable) });
        }
      }
    }

    const variables = new Set(blocks.flatMap(block => Object.values(block.exports || {})));
    for (const stage of definition.stages) {
      const at = position(stage.id);
      let readByBlock = false;
      for (const reader of flattenBlocks(stage.blocks)) {
        if (ids.has(reader.id)) continue;
        for (const [port, variable] of Object.entries(reader.inputs || {})) {
          if (!variables.has(variable)) continue;
          readByBlock = true;
          const inStage = readsInStage(reader, port, producers.get(variable).block, controls);
          if (at < target || (at === target && !inStage)) {
            blockers.push({ kind: 'reader', block: reader.id, stage: stage.id, inStage, type: typeOf(variable) });
          }
        }
      }
      const passed = contextLines(stage).find(line => line.source === 'var' && variables.has(line.name));
      if (passed && !readByBlock && at < target) {
        blockers.push({ kind: 'reader', block: null, stage: stage.id, inStage: true, type: typeOf(passed.name) });
      }
    }
    return blockers;
  }

  // Puts `{{to}}` in place of `{{from}}` in every text of the component.
  function renamePlaceholder(value, from, to) {
    if (typeof value === 'string') return value.split(`{{${from}}}`).join(`{{${to}}}`);
    if (Array.isArray(value)) return value.map(item => renamePlaceholder(item, from, to));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renamePlaceholder(item, from, to)]));
    }
    return value;
  }

  // The moved blocks' answer names the target stage already holds get other ones: the
  // stage's answer is one flat object. A field for the AI is renamed in its text too.
  function renameAnswerNames(blocks, target, controls) {
    const taken = answerNames(target, controls);
    for (const block of blocks) {
      if (block.kind === 'generated') {
        for (const field of controls.get(block.control)?.fields || []) {
          const name = block.fields?.[field] ?? field;
          const free = taken.has(name) ? freeName(name.replace(/\d+$/, ''), taken) : name;
          taken.add(free);
          if (free === name) continue;
          block.fields = { ...block.fields, [field]: free };
          if (free === field) delete block.fields[field];
          if (Object.keys(block.fields).length === 0) delete block.fields;
        }
      }
      for (const name of Object.keys(block.slots || {})) {
        if (!taken.has(name)) {
          taken.add(name);
          continue;
        }
        const free = newFieldName(target, controls, [...taken]);
        taken.add(free);
        const { [name]: slot, ...slots } = block.slots;
        block.slots = { ...slots, [free]: slot };
        block.component = renamePlaceholder(block.component, name, free);
      }
    }
  }

  // Moves the block or row `id` to the end of the stage `targetId`, which `moveBlockers`
  // let it go to; its id and variables stay. Context lines follow the links it carries:
  // a stage reading a variable of another stage gets a line, a line on a variable of its
  // own stage goes, and the old stage loses a line only the moved block read, as when an
  // input switches. Returns the lines added and removed, as `{ stage, label }`.
  function moveToStage(definition, id, targetId, controls) {
    const { stage: home, index, blocks } = moving(definition, id);
    const target = definition.stages.find(stage => stage.id === targetId);
    const read = new Set(blocks.flatMap(block => Object.values(block.inputs || {})));
    const exported = blocks.flatMap(block => Object.values(block.exports || {}));
    renameAnswerNames(blocks, target, controls);
    target.blocks.push(...home.blocks.splice(index, 1));

    const producers = variableProducers(definition);
    const addedLines = [];
    const removedLines = [];
    for (const stage of definition.stages) {
      for (const variable of new Set([...read, ...exported])) {
        const producer = producers.get(variable);
        if (!producer) continue;
        const lines = contextLines(stage);
        const passing = lines.filter(line => line.source === 'var' && line.name === variable);
        const readByBlock = flattenBlocks(stage.blocks).some(block => Object.values(block.inputs || {}).includes(variable));
        const forsaken = stage === home && read.has(variable) && !readByBlock;
        if (passing.length > 0 && (producer.stage === stage || forsaken)) {
          setContextLines(stage, lines.filter(line => !passing.includes(line)));
          removedLines.push(...passing.map(line => ({ stage: stage.id, label: line.label })));
        } else if (passing.length === 0 && producer.stage !== stage && readByBlock) {
          addedLines.push({ stage: stage.id, label: addContextLine(stage, 'var', variable) });
        }
      }
    }
    return { addedLines, removedLines };
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
    INPUT_TITLE_MAX_LENGTH,
    flattenBlocks,
    variableProducers,
    contextLines,
    contextVariablesInUse,
    defaultContextLabel,
    uniqueContextLabel,
    renameContextLine,
    addContextLine,
    removeContextLine,
    setContextLines,
    inputNameFromTitle,
    newInputProblem,
    addInput,
    inputReaders,
    setInputOptional,
    removeInput,
    moveStage,
    moveBlock,
    addStage,
    inputSources,
    plannedLinks,
    blockLinks,
    setInputSource,
    sourceOptions,
    setSources,
    setSourceTitle,
    addBlock,
    deletionPlan,
    applyDeletion,
    moveBlockers,
    moveToStage,
    applyStaticChanges,
    newFieldName,
    appendNoteField,
    slotSourceBlock,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LessonTemplateEdits = api;
})(typeof window !== 'undefined' ? window : globalThis);
