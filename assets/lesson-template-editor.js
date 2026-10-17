(() => {
  'use strict';

  // Template editor: the template shown as its lesson built from sample data, every block
  // in a frame with its kind and links, and a panel with the settings of the selected
  // block, the current stage or the template itself. The server builds the preview:
  // controls run only there. A copy is edited in place and saved explicitly; a system
  // template is read-only.

  const KIND_LABELS = { static: 'Статичный', generated: 'Генерирует ИИ', derived: 'Собирается сам', row: 'Ряд' };
  const NARROW_LAYOUT = window.matchMedia('(max-width: 1180px)');
  // On phones the catalog takes the whole screen and shows the example under its card.
  const PHONE_LAYOUT = window.matchMedia('(max-width: 700px)');
  const TITLE_MAX_LENGTH = 80;
  const DESCRIPTION_MAX_LENGTH = 500;
  const INPUT_LABEL_MAX_LENGTH = 60;
  const INPUT_PLACEHOLDER_MAX_LENGTH = 60;
  const STAGE_TITLE_MAX_LENGTH = 80;
  const STAGE_SUBTITLE_MAX_LENGTH = 120;
  const PREVIEW_DELAY = 300;
  const DRAG_THRESHOLD = 7;
  const SCROLL_EDGE = 70;
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const Edits = window.LessonTemplateEdits;

  // `template` is the working copy: edits change it in place. `savedSnapshot` is what the
  // server holds, to tell unsaved changes. `selection` is the block, the stage or the
  // template whose settings the panel shows; without it a wide panel shows the stage.
  // `stageFacts` and `blockFacts` come from the last preview without problems and outlive
  // a preview with problems: the panel keeps showing default instructions and rules.
  // `openEdits` are the static blocks whose component editor holds unsaved changes;
  // `newSlots` the fields for the AI inserted into such an editor, by block: they join the
  // definition when the editor saves the text that holds them.
  const state = {
    template: null,
    savedSnapshot: '',
    controls: new Map(),
    statics: new Map(),
    // The block catalog: its entries in catalog order, the open group and search, the
    // chosen entry.
    catalog: { entries: [], groups: [], group: 'all', query: '', selected: null },
    variableTypes: {},
    stageIcons: { icons: {}, aliases: {} },
    preview: null,
    stageFacts: {},
    blockFacts: {},
    openEdits: new Set(),
    newSlots: new Map(),
    blocks: new Map(),
    stageIndex: 0,
    selection: null,
    saving: false,
    conflict: false,
    leaving: false,
  };
  const byId = id => document.getElementById(id);
  const panel = byId('block-panel');
  const layout = byId('template-content');
  let toastTimer;
  let previewTimer;
  let previewNumber = 0;
  let drag = null;
  let suppressClick = false;
  // Frames of the current stage's static blocks with the component each was drawn from.
  // A frame stays while its block keeps that component: redrawing the stage does not
  // take it out of the page, so an editor open in it keeps its text, focus and caret.
  let staticFrames = new Map();
  // The text field of a static block last typed in, with the caret of a contenteditable
  // one: «Вставить поле для ИИ» puts the field there.
  let caret = null;

  function el(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function button(className, text, onClick) {
    const element = el('button', className, text);
    element.type = 'button';
    element.addEventListener('click', onClick);
    return element;
  }

  // Russian plural: forms for 1, 2–4 and 5 items.
  function plural(count, [one, few, many]) {
    const tens = count % 100;
    const units = count % 10;
    if (units === 1 && tens !== 11) return one;
    if (units >= 2 && units <= 4 && (tens < 12 || tens > 14)) return few;
    return many;
  }

  const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
  const quoted = names => names.map(name => `«${name}»`).join(', ');
  const stageTitle = stage => stage.title || 'Без названия';
  // A duration being typed may be unfinished: the problems list explains it.
  const durationText = stage => (Number.isInteger(stage.durationMinutes) ? `${stage.durationMinutes} мин` : '— мин');

  // An optional text setting is left out of the definition while empty.
  function setOptional(object, key, value) {
    if (value) object[key] = value;
    else delete object[key];
  }

  // A toast may carry one action, such as «Вернуть»: it stays longer then, and goes away
  // once the template changes again (`dropToastAction`).
  function showToast(message, action) {
    const toast = byId('lesson-toast');
    toast.replaceChildren(el('span', '', message));
    if (action) {
      toast.append(button('lesson-toast__action', action.label, () => {
        hideToast();
        action.run();
      }));
    }
    toast.classList.toggle('lesson-toast--action', Boolean(action));
    toast.classList.add('lesson-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(hideToast, action ? 6000 : 2600);
  }

  function hideToast() {
    byId('lesson-toast').classList.remove('lesson-toast--visible', 'lesson-toast--action');
  }

  function dropToastAction() {
    if (byId('lesson-toast').classList.contains('lesson-toast--action')) hideToast();
  }

  async function request(method, url, body) {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(payload.error || 'Не удалось выполнить действие.'), {
        status: response.status,
        errors: payload.errors,
      });
    }
    return payload;
  }

  const editable = () => !state.template.system;
  const snapshot = ({ title, description, definition }) => JSON.stringify([title, description, definition]);
  const isDirty = () => editable() && snapshot(state.template) !== state.savedSnapshot;
  const hasUnsavedWork = () => isDirty() || state.openEdits.size > 0;

  // Opening another stage takes the frames of this one away, with any open block editor.
  const mayLeaveStage = () => state.openEdits.size === 0
    || window.confirm('В блоке есть несохранённые изменения. Отменить их и перейти к другому этапу?');

  // Every block by id, row parts included, with its stage and the row it sits in.
  function indexBlocks(definition) {
    const index = new Map();
    definition.stages.forEach((stage, stageIndex) => {
      for (const block of stage.blocks) {
        index.set(block.id, { block, stage, stageIndex, row: null });
        if (block.kind !== 'row') continue;
        for (const part of block.blocks) index.set(part.id, { block: part, stage, stageIndex, row: block });
      }
    });
    return index;
  }

  function blockName(block) {
    if (block.kind === 'row') return `${block.blocks.length} ${plural(block.blocks.length, ['блок', 'блока', 'блоков'])} в ряд`;
    if (block.kind === 'static') return state.statics.get(block.component.type)?.label || 'Статичный блок';
    return state.controls.get(block.control)?.label || block.control;
  }

  function blockTitle(block) {
    return block.kind === 'static'
      ? block.component.title || block.component.heading || ''
      : block.chrome?.title || block.chrome?.heading || '';
  }

  const kindBadge = kind => el('span', `template-kind template-kind--${kind}`, KIND_LABELS[kind]);
  const typeLabel = type => state.variableTypes[type] || type;
  // Links come from the working copy, so they show while the template has problems too.
  const blockLinks = block => Edits.blockLinks(state.template.definition, block, state.controls);

  // A block's name, with its stage when that is not the stage `fromStageId`.
  function placedName(id, fromStageId) {
    const { block, stage } = state.blocks.get(id);
    return stage.id === fromStageId ? blockName(block) : `${blockName(block)} · ${stageTitle(stage)}`;
  }

  function readersText(readers) {
    const stages = new Set(readers.blocks.map(reader => reader.stage));
    const parts = [];
    if (readers.blocks.length > 0) {
      parts.push(`${readers.blocks.length} ${plural(readers.blocks.length, ['блок', 'блока', 'блоков'])}`
        + ` в ${stages.size} ${plural(stages.size, ['этапе', 'этапах', 'этапах'])}`);
    }
    if (readers.stages.length > 0) {
      parts.push(`контекст ${readers.stages.length} ${plural(readers.stages.length, ['этапа', 'этапов', 'этапов'])}`);
    }
    return parts.join(', ') || 'никто не читает';
  }

  // Link chips of one block: what it reads (← source) and what it gives away (→ readers).
  // In a copy an input chip opens the choice of its source; in a system template it leads
  // to the source.
  function linkChips(id) {
    const { block, stage } = state.blocks.get(id);
    if (block.kind === 'static') return [];
    const links = blockLinks(block);
    const inputs = Object.entries(links.inputs).map(([port, link]) => {
      const type = capitalize(typeLabel(link.type));
      if (!editable() && !link.from) return null;
      const chip = button(
        `template-chip template-chip--input${link.from ? '' : ` template-chip--${link.required ? 'missing' : 'unbound'}`}`,
        `${type} ← ${link.from ? placedName(link.from.block, stage.id) : 'не подключено'}`,
        event => {
          event.stopPropagation();
          if (!editable()) {
            selectBlock(link.from.block, { scroll: true });
            return;
          }
          selectBlock(id);
          openSourcePicker(chip, id, port);
        },
      );
      if (editable()) chip.setAttribute('aria-haspopup', 'dialog');
      return chip;
    }).filter(Boolean);
    const exports = Object.values(links.exports).map(output => button(
      'template-chip template-chip--output',
      `${capitalize(typeLabel(output.type))} → ${readersText(output.readers)}`,
      event => {
        event.stopPropagation();
        selectBlock(id);
      },
    ));
    return [...inputs, ...exports];
  }

  // Where the block's `port` may read from: blocks of its stage and earlier ones that give
  // away a variable of the input's type, the nearest first (`Edits.inputSources`).
  function inputChoices(id, port) {
    const { block, stage } = state.blocks.get(id);
    const input = state.controls.get(block.control).inputs[port];
    return Edits.inputSources(state.template.definition, stage, block.kind, input, state.controls, block);
  }

  function sourceName(source) {
    const { block, stageIndex } = state.blocks.get(source.block);
    return [blockName(block), source.sameStage ? 'этот этап' : `${stageIndex + 1}. ${stageTitle(state.template.definition.stages[stageIndex])}`];
  }

  // What choosing the source brings: a context line for a variable of an earlier stage,
  // and the features the input needs that the source has off, named by their flags.
  function sourceNotes(id, source) {
    const { stage } = state.blocks.get(id);
    const notes = [];
    const passed = Edits.contextLines(stage).some(line => line.source === 'var' && line.name === source.variable);
    if (!source.sameStage && !passed) {
      const label = Edits.uniqueContextLabel(stage, Edits.defaultContextLabel(source.variable));
      notes.push(`В контекст этапа добавится строка «${label}».`);
    }
    if (source.missing.length > 0) notes.push(`В нём нужно включить ${quoted(missingFlags(source))}.`);
    return notes;
  }

  // The flags of the source block that turn on the features an input misses.
  function missingFlags(source) {
    const producer = state.controls.get(state.blocks.get(source.block).block.control);
    return source.missing.map(feature => producer.params[producer.outputs[source.port].features[feature]].label);
  }

  // The choice of an input's source, under its chip. Choosing connects at once.
  const sourcePicker = byId('source-picker');
  let pickerChip = null;

  function openSourcePicker(chip, id, port) {
    const { block } = state.blocks.get(id);
    const link = blockLinks(block).inputs[port];
    const type = typeLabel(link.type);
    const choices = inputChoices(id, port);
    const choose = variable => {
      sourcePicker.hidePopover();
      if (variable !== link.variable) connectInput(id, port, variable);
    };
    const option = ({ title, notes = [], variable, disabled = false }) => {
      const item = el('label', `template-source-option${disabled ? ' template-source-option--disabled' : ''}`);
      const radio = el('input');
      Object.assign(radio, { type: 'radio', name: 'source-picker', checked: variable === link.variable, disabled });
      radio.addEventListener('change', () => choose(variable));
      item.append(radio, title, ...notes.map(note => el('small', '', note)));
      return item;
    };
    const items = choices.map(source => {
      const [name, place] = sourceName(source);
      const title = el('span');
      title.append(el('b', '', name), ` · ${place}`);
      return option({ title, notes: sourceNotes(id, source), variable: source.variable });
    });
    items.push(option({
      title: el('span', '', 'Не подключать'),
      notes: link.required ? ['Этот вход обязателен.'] : [],
      variable: null,
      disabled: link.required,
    }));
    sourcePicker.replaceChildren(
      el('h4', '', `Откуда брать ${type}`),
      ...items,
      el('p', 'template-source-picker__foot', choices.length > 0
        ? `Блоки, которые отдают ${type}, из этого и более ранних этапов.`
        : `Подходящих блоков нет: добавьте в этот или более ранний этап блок, который отдаёт ${type}.`),
    );
    pickerChip?.removeAttribute('aria-expanded');
    pickerChip = chip;
    chip.setAttribute('aria-expanded', 'true');
    sourcePicker.showPopover();
    placeSourcePicker();
    // On narrow screens selecting the block has just moved the panel under it: the page
    // settles on the next frame.
    window.requestAnimationFrame(placeSourcePicker);
    (sourcePicker.querySelector('input:checked') || sourcePicker.querySelector('input:enabled'))?.focus({ preventScroll: true });
  }

  // The picker sits in the top layer, so it follows its chip on screen by itself; a chip
  // a redraw took away closes it.
  function placeSourcePicker() {
    if (!pickerChip) return;
    if (!pickerChip.isConnected) {
      sourcePicker.hidePopover();
      return;
    }
    const rect = pickerChip.getBoundingClientRect();
    const left = Math.min(Math.max(16, rect.left), document.documentElement.clientWidth - sourcePicker.offsetWidth - 16);
    sourcePicker.style.left = `${left}px`;
    sourcePicker.style.top = `${rect.bottom + 6}px`;
  }

  sourcePicker.addEventListener('toggle', event => {
    if (event.newState === 'open') return;
    pickerChip?.removeAttribute('aria-expanded');
    pickerChip = null;
  });
  window.addEventListener('scroll', placeSourcePicker, { capture: true, passive: true });
  window.addEventListener('resize', placeSourcePicker);

  const addedLinesText = lines => `В контекст этапа ${plural(lines.length, ['добавлена строка', 'добавлены строки', 'добавлены строки'])} ${quoted(lines)}`;

  // A new source; the toast names the context lines it adds and takes away. «Вернуть»
  // brings a line taken away back to its place, and the new source stays: the model may
  // still need the line.
  function connectInput(id, port, variable) {
    const { block, stage } = state.blocks.get(id);
    const before = Edits.contextLines(stage);
    let lines;
    change(({ definition }) => { lines = Edits.setInputSource(definition, stage, block, port, variable); });
    const messages = [];
    if (lines.addedLines.length > 0) messages.push(addedLinesText(lines.addedLines));
    if (lines.removedLines.length === 0) {
      if (messages.length > 0) showToast(messages[0]);
      return;
    }
    messages.push(`Из контекста этапа ${plural(lines.removedLines.length, ['убрана строка', 'убраны строки', 'убраны строки'])} ${quoted(lines.removedLines)}`);
    const added = Edits.contextLines(stage).filter(line => lines.addedLines.includes(line.label));
    showToast(messages.join('. '), {
      label: 'Вернуть',
      run: () => change(() => Edits.setContextLines(stage, [...before, ...added])),
    });
  }

  const GRIP_ICON = '<svg viewBox="0 0 10 16" aria-hidden="true">'
    + [3, 8, 13].map(y => `<circle cx="2.5" cy="${y}" r="1.4"/><circle cx="7.5" cy="${y}" r="1.4"/>`).join('')
    + '</svg>';

  // A handle to drag an item to another place among `items()`. The item stays where it is,
  // dimmed, while a compact ghost follows the pointer and a line shows where it lands.
  // `items()` is read on every move: a preview that comes mid-drag draws them anew.
  function dragHandle({ items, label, autoScroll = false, onMove }) {
    const handle = el('span', 'template-handle');
    handle.title = 'Перетащить';
    handle.innerHTML = GRIP_ICON;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || drag) return;
      event.preventDefault();
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        from: items().findIndex(item => item.contains(handle)),
        items,
        label,
        autoScroll,
        onMove,
        ghost: null,
        slot: null,
        frame: 0,
      };
    });
    return handle;
  }

  function dragMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.ghost) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < DRAG_THRESHOLD) return;
      drag.ghost = el('div', 'template-ghost', drag.label);
      document.body.append(drag.ghost);
      document.body.classList.add('template-sorting');
      if (drag.autoScroll) drag.frame = window.requestAnimationFrame(scrollWhileDragging);
    }
    drag.ghost.style.transform = `translate(${drag.x + 14}px, ${drag.y + 10}px)`;
    markDrop();
  }

  // The slot is the gap the pointer is over: 0 before the first item, the item count after
  // the last. The gaps around the dragged item leave it where it is.
  function markDrop() {
    const items = drag.items();
    const slot = items.filter(item => {
      const box = item.getBoundingClientRect();
      return box.top + box.height / 2 < drag.y;
    }).length;
    drag.slot = slot === drag.from || slot === drag.from + 1 ? null : slot;
    items.forEach((item, index) => {
      item.classList.toggle('template-dragged', index === drag.from);
      item.classList.toggle('template-drop-before', index === drag.slot);
      item.classList.toggle('template-drop-after', index === items.length - 1 && drag.slot === items.length);
    });
  }

  // Near the top or the bottom of the window the page scrolls by itself: stages are long.
  function scrollWhileDragging() {
    const top = Math.max(0, document.querySelector('.lesson-header').getBoundingClientRect().bottom) + SCROLL_EDGE;
    const bottom = window.innerHeight - SCROLL_EDGE;
    const overshoot = drag.y < top ? drag.y - top : Math.max(0, drag.y - bottom);
    if (overshoot !== 0) {
      window.scrollBy(0, Math.max(-SCROLL_EDGE, Math.min(SCROLL_EDGE, overshoot)) / 5);
      markDrop();
    }
    drag.frame = window.requestAnimationFrame(scrollWhileDragging);
  }

  function dragEnd(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const { ghost, from, slot, onMove } = drag;
    stopDrag();
    if (!ghost) return;
    // The click that ends a drag does not open or select what was dragged.
    suppressClick = true;
    window.setTimeout(() => { suppressClick = false; });
    if (slot !== null) onMove(from, slot > from ? slot - 1 : slot);
  }

  function stopDrag() {
    if (!drag) return;
    window.cancelAnimationFrame(drag.frame);
    drag.ghost?.remove();
    for (const item of drag.items()) item.classList.remove('template-dragged', 'template-drop-before', 'template-drop-after');
    document.body.classList.remove('template-sorting');
    drag = null;
  }

  const blockFrames = () => [...byId('template-blocks').querySelectorAll(':scope > .template-block')];
  const stageItems = () => [...byId('template-stages').children];

  // The current stage moves with its place in the list.
  function reorderStage(from, to) {
    const current = currentStage();
    change(({ definition }) => {
      Edits.moveStage(definition, from, to);
      state.stageIndex = definition.stages.indexOf(current);
    });
  }

  const reorderBlock = (from, to) => change(() => Edits.moveBlock(currentStage(), from, to));

  function blockFrame(block, component) {
    const kept = staticFrames.get(block.id);
    if (block.kind === 'static' && kept?.component === block.component) {
      kept.frame.firstElementChild.replaceWith(blockBar(block));
      return kept.frame;
    }
    const frame = el('article', 'template-block');
    frame.dataset.blockId = block.id;
    frame.addEventListener('click', () => selectBlock(block.id));
    frame.append(blockBar(block), block.kind === 'static' ? staticBody(block) : sampleBody(component));
    return frame;
  }

  function blockBar(block) {
    const bar = el('div', 'template-block__bar');
    if (editable()) {
      bar.append(dragHandle({
        items: blockFrames,
        label: `${KIND_LABELS[block.kind]} · ${blockName(block)}`,
        autoScroll: true,
        onMove: reorderBlock,
      }));
    }
    bar.append(kindBadge(block.kind));
    bar.append(button('template-block__name', blockName(block), event => {
      event.stopPropagation();
      selectBlock(block.id);
    }));
    if (block.kind === 'row') {
      for (const part of block.blocks) {
        bar.append(button('template-chip', blockTitle(part) || blockName(part), event => {
          event.stopPropagation();
          selectBlock(part.id);
        }));
      }
      for (const part of block.blocks) bar.append(...linkChips(part.id));
    } else {
      bar.append(...linkChips(block.id));
    }
    return bar;
  }

  // The sample lesson is shown, not taken: its exercises do not react to clicks.
  function sampleBody(component) {
    const body = el('div', 'template-block__preview');
    body.inert = true;
    body.append(component
      ? window.LessonView.renderComponent(component)
      : el('p', 'template-block__empty', 'Пример появится, когда в шаблоне не останется проблем.'));
    return body;
  }

  // A static block is drawn from the definition, its {{slots}} as they are, and a copy's
  // one is edited in place with the editor of its component. A video has no editor here.
  function staticBody(block) {
    const body = el('div', 'template-block__preview');
    const component = { id: block.id, ...block.component };
    if (!editable() || component.type === 'videoPlayer') {
      body.inert = true;
      body.append(window.LessonView.renderComponent(component));
      return body;
    }
    body.append(window.LessonView.renderComponent(component, {
      onSave: changes => saveStatic(block.id, changes),
      onDirtyChange: dirty => {
        if (dirty) {
          state.openEdits.add(block.id);
        } else {
          state.openEdits.delete(block.id);
          // Saved, cancelled or typed back: the editor holds no field of its own now.
          if (state.newSlots.delete(block.id) && selectedBlockId() === block.id) renderPanel();
        }
        renderSaveState();
      },
      onError: showToast,
      onMessage: showToast,
    }));
    return body;
  }

  // What a component editor saves goes into the working copy. The frame stays with the
  // block's new component: the editor repaints itself from the returned one.
  function saveStatic(id, changes) {
    const { block } = state.blocks.get(id);
    let component;
    try {
      change(() => {
        const pending = state.newSlots.get(id) || {};
        component = Edits.applyStaticChanges(block, changes, pending);
        // A field the saved text lacks stays pending: another open sub-block of Teacher's Notes may hold it.
        const left = Object.entries(pending).filter(([name]) => !block.slots?.[name]);
        if (left.length > 0) state.newSlots.set(id, Object.fromEntries(left));
        else state.newSlots.delete(id);
        const kept = staticFrames.get(id);
        if (kept) kept.component = component;
      });
    } catch (error) {
      showToast(`Не удалось применить изменения: ${error.message}`);
      throw error;
    }
    return { id, ...component };
  }

  const currentStage = () => state.template.definition.stages[state.stageIndex];
  const stageById = id => state.template.definition.stages.find(stage => stage.id === id);

  function renderStage() {
    const stage = currentStage();
    const lessonStage = state.preview.lesson?.stages.find(item => item.id === stage.id);
    const components = new Map((lessonStage?.content || []).map(component => [component.id, component]));
    renderStageHeading();
    keepingPanelInPlace(() => {
      const frames = stage.blocks.length > 0
        ? stage.blocks.map(block => blockFrame(block, components.get(block.id)))
        : [emptyStageNote()];
      const previous = staticFrames;
      staticFrames = new Map(stage.blocks.flatMap((block, index) => (block.kind === 'static'
        ? [[block.id, { component: block.component, frame: frames[index] }]]
        : [])));
      // An editor whose frame is gone took its unsaved changes with it.
      const open = state.openEdits.size;
      const gone = id => previous.get(id)?.frame !== staticFrames.get(id)?.frame;
      for (const id of state.openEdits) {
        if (gone(id)) state.openEdits.delete(id);
      }
      for (const id of state.newSlots.keys()) {
        if (gone(id)) state.newSlots.delete(id);
      }
      if (state.openEdits.size !== open) renderSaveState();
      placeFrames(frames);
      markSelectedFrame();
      placePanel();
    });
    byId('template-add-block').hidden = !editable() || stage.blocks.length === 0;
    window.history.replaceState(null, '', `#${encodeURIComponent(stage.id)}`);
  }

  // A stage is left without blocks only while it is new: it cannot be saved like that.
  function emptyStageNote() {
    const note = el('div', 'template-empty-stage');
    const text = el('p', '', editable()
      ? 'Добавьте первый из каталога. Пустой этап не сохранить.'
      : 'Пустой этап не сохранить: добавьте в него блок или удалите этап.');
    text.prepend(el('strong', '', 'В этапе пока нет блоков'));
    note.append(text);
    if (editable()) note.append(button('template-add-block template-add-block--first', '+ Блок', openCatalog));
    return note;
  }

  // Frames are put in place one by one, so a frame that stays where it was is never taken
  // out of the page. On narrow screens the panel sits among them: `placePanel` moves it.
  function placeFrames(frames) {
    const container = byId('template-blocks');
    for (const child of [...container.children]) {
      if (child !== panel && !frames.includes(child)) child.remove();
    }
    let next = container.firstElementChild;
    for (const frame of frames) {
      if (next === panel) next = next.nextElementSibling;
      if (next === frame) next = frame.nextElementSibling;
      else container.insertBefore(frame, next);
    }
  }

  // On narrow screens the panel sits among the block frames, so redrawing them takes it
  // out of the page for a moment, and frames above it may change height (examples become
  // placeholders while problems exist). A field being typed in gets its focus and caret
  // back, and the panel stays where it was on the screen.
  function keepingPanelInPlace(update) {
    const field = panel.contains(document.activeElement) ? document.activeElement : null;
    if (!field) {
      update();
      return;
    }
    const caret = typeof field.selectionStart === 'number' ? [field.selectionStart, field.selectionEnd] : null;
    const top = panel.getBoundingClientRect().top;
    update();
    window.scrollBy(0, panel.getBoundingClientRect().top - top);
    if (!field.isConnected || document.activeElement === field) return;
    field.focus({ preventScroll: true });
    if (caret) field.setSelectionRange(...caret);
  }

  // The current stage in the list and its heading above the blocks.
  function renderStageHeading() {
    const stage = currentStage();
    const stageList = byId('template-stages');
    [...stageList.children].forEach((item, index) => {
      const active = index === state.stageIndex;
      item.classList.toggle('lesson-stage--active', active);
      item.setAttribute('aria-current', active ? 'step' : 'false');
    });
    // On phones the stages are a horizontal strip: keep the current one in sight.
    const activeStage = stageList.children[state.stageIndex];
    stageList.scrollLeft = activeStage.offsetLeft - stageList.offsetLeft - 16;
    byId('stage-number').textContent = `${state.stageIndex + 1}.`;
    byId('stage-title').textContent = stageTitle(stage);
    byId('stage-duration').textContent = durationText(stage);
    const kicker = byId('stage-kicker');
    kicker.textContent = stage.subtitle || '';
    kicker.hidden = !stage.subtitle;
  }

  const selectedBlockId = () => (state.selection?.kind === 'block' ? state.selection.id : null);

  // Highlights the frame of the selected block (a row part highlights its row) and returns it.
  function markSelectedFrame() {
    const entry = state.blocks.get(selectedBlockId());
    const frameId = entry ? (entry.row || entry.block).id : null;
    let selectedFrame = null;
    for (const frame of byId('template-blocks').querySelectorAll(':scope > .template-block')) {
      const selected = frame.dataset.blockId === frameId;
      frame.classList.toggle('template-block--selected', selected);
      if (selected) selectedFrame = frame;
    }
    return selectedFrame;
  }

  // Opens a stage. A selected block gives way to the stage, the template's or the stage's
  // settings stay open.
  // Returns false when the admin keeps an open block editor instead.
  function selectStage(index) {
    const moved = index !== state.stageIndex;
    if (moved && !mayLeaveStage()) return false;
    state.stageIndex = index;
    if (state.selection?.kind === 'block') state.selection = null;
    renderStage();
    renderPanel();
    if (moved) window.scrollTo({ top: 0, behavior: 'smooth' });
    return true;
  }

  // Settings that are not a block's: the panel shows them and, on narrow screens, comes
  // into sight.
  function openSettings(selection) {
    state.selection = selection;
    markSelectedFrame();
    renderPanel();
    if (NARROW_LAYOUT.matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const selectStageSettings = () => openSettings({ kind: 'stage' });

  // «+ Этап»: a new stage after the open one opens with its settings, its title ready to
  // be typed over.
  function addStage() {
    if (!mayLeaveStage()) return;
    change(({ definition }) => {
      Edits.addStage(definition, state.stageIndex);
      state.stageIndex += 1;
      state.selection = { kind: 'stage' };
    });
    if (NARROW_LAYOUT.matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
    const title = panel.querySelector('input');
    title?.focus({ preventScroll: true });
    title?.select();
  }
  const selectTemplate = () => openSettings({ kind: 'template' });
  const selectInput = name => openSettings({ kind: 'input', name });

  // The new field's title and label live in the selection until the field is added.
  function selectNewInput() {
    openSettings({ kind: 'newInput', title: '', label: '' });
    panel.querySelector('input')?.focus({ preventScroll: true });
  }

  function markSelectedInput() {
    const name = state.selection?.kind === 'input' ? state.selection.name : null;
    for (const item of byId('template-inputs').querySelectorAll('.template-input')) {
      item.classList.toggle('template-input--selected', item.dataset.input === name);
    }
  }

  function selectBlock(id, { scroll = false } = {}) {
    const entry = state.blocks.get(id);
    if (!entry) return;
    if (entry.stageIndex !== state.stageIndex && !mayLeaveStage()) return;
    state.selection = { kind: 'block', id };
    if (entry.stageIndex !== state.stageIndex) {
      state.stageIndex = entry.stageIndex;
      renderStage();
      scroll = true;
    }
    const selectedFrame = markSelectedFrame();
    renderPanel();
    if (scroll) selectedFrame?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function panelSection(title, ...children) {
    const section = el('section', 'template-panel__section');
    section.append(el('h3', '', title), ...children);
    return section;
  }

  function settingRow(label, value) {
    const row = el('div', 'template-setting');
    row.append(el('span', 'template-setting__label', label));
    const content = el('span', 'template-setting__value');
    content.append(value);
    row.append(content);
    return row;
  }

  function paramValue(spec, value) {
    switch (spec.type) {
      case 'integer': {
        const node = el('span', '', String(value));
        node.append(el('small', '', ` (${spec.min}–${spec.max})`));
        return node;
      }
      case 'choice': return spec.options[value] ?? String(value);
      case 'flag': return value ? 'да' : 'нет';
      case 'text': return value || '—';
      case 'textList': {
        const list = el('ul', 'template-setting__list');
        list.append(...value.map(item => el('li', '', item)));
        return list;
      }
      default: return 'особая настройка';
    }
  }

  function chromeValue(field, value) {
    if (value === undefined) return el('small', '', 'по умолчанию');
    switch (field.type) {
      case 'color': {
        const node = el('span', 'template-color');
        const swatch = el('i');
        swatch.style.background = value;
        node.append(swatch, value);
        return node;
      }
      case 'choice': return field.options[value] ?? String(value);
      case 'flag': return value ? 'да' : 'нет';
      case 'custom': return 'задано в шаблоне';
      default: return String(value);
    }
  }

  const paramOf = (block, key, spec) => (Object.hasOwn(block.params || {}, key) ? block.params[key] : spec.default);

  // A parameter typed into the panel. The server checks it: its problem shows under the
  // field once the preview comes (`showFieldProblems`).
  function paramField(block, key, spec) {
    const value = paramOf(block, key, spec);
    const set = next => edit(() => { block.params = { ...block.params, [key]: next }; });
    const problem = fieldError('', true);
    problem.dataset.param = key;
    let input;
    switch (spec.type) {
      case 'integer':
        input = textInput({
          value,
          type: 'number',
          // An unfinished number stays as typed: the server lists it among the problems.
          onInput: text => set(text === '' ? null : Number(text)),
        });
        Object.assign(input, { min: spec.min, max: spec.max, step: 1, inputMode: 'numeric' });
        input.classList.add('template-field__input--short');
        return fieldGroup('label', `${spec.label} (${spec.min}–${spec.max})`, input, problem);
      case 'choice':
        input = el('select', 'template-field__input');
        input.append(...Object.entries(spec.options).map(([option, label]) => new Option(label, option, false, option === value)));
        input.addEventListener('change', () => set(input.value));
        return fieldGroup('label', spec.label, input, problem);
      case 'flag': {
        const field = el('label', 'template-field template-field--flag');
        input = el('input');
        input.type = 'checkbox';
        input.checked = value;
        input.addEventListener('change', () => set(input.checked));
        field.append(input, el('span', 'template-field__label', spec.label), problem);
        return field;
      }
      case 'text':
        return fieldGroup('label', spec.label, textInput({ value, onInput: text => set(text.trim()) }), problem);
      case 'textList':
        input = textInput({
          value: value.join('\n'),
          multiline: true,
          rows: Math.max(3, value.length + 1),
          onInput: text => set(text.split('\n').map(line => line.trim()).filter(Boolean)),
        });
        return fieldGroup('label', spec.label, el('small', 'template-panel__hint', 'Каждый пункт — с новой строки.'), input, problem);
      default:
        return settingRow(spec.label, paramValue(spec, value));
    }
  }

  // A chrome key left out of the block takes the control's default, which only the preview
  // shows: an emptied field or «по умолчанию» removes the key.
  function setChrome(block, key, value) {
    const chrome = { ...block.chrome };
    if (value === undefined) delete chrome[key];
    else chrome[key] = value;
    if (Object.keys(chrome).length > 0) block.chrome = chrome;
    else delete block.chrome;
  }

  // Choices and flags start with «по умолчанию»: a flag cannot be a checkbox, since its
  // default is unknown here.
  function chromeSelect(field, value, set) {
    const options = field.type === 'flag' ? { true: 'да', false: 'нет' } : field.options;
    const select = el('select', 'template-field__input');
    select.append(
      new Option('по умолчанию', ''),
      ...Object.entries(options).map(([option, label]) => new Option(label, option, false, String(value) === option)),
    );
    select.addEventListener('change', () => {
      if (select.value === '') set(undefined);
      else set(field.type === 'flag' ? select.value === 'true' : select.value);
    });
    return select;
  }

  // A colour is typed as #RRGGBB or picked; the picker looks empty while the default applies.
  function colorInput(label, value, set) {
    const picker = el('input', 'template-color-picker');
    picker.type = 'color';
    picker.setAttribute('aria-label', 'Выбрать цвет');
    const paint = color => {
      const valid = HEX_COLOR.test(color);
      if (valid) picker.value = color.toLowerCase();
      picker.classList.toggle('template-color-picker--unset', !valid);
    };
    const text = textInput({
      value: value ?? '',
      onInput: typed => {
        set(typed.trim().toUpperCase() || undefined);
        paint(typed.trim());
      },
    });
    text.placeholder = 'по умолчанию';
    text.setAttribute('aria-label', label);
    picker.addEventListener('input', () => {
      text.value = picker.value.toUpperCase();
      set(text.value);
      paint(text.value);
    });
    paint(value ?? '');
    const row = el('div', 'template-color-field');
    row.append(picker, text);
    return row;
  }

  // A chrome value set in the panel; like parameters, the server checks it.
  function chromeField(block, field) {
    const value = block.chrome?.[field.key];
    const set = next => edit(() => setChrome(block, field.key, next));
    const problem = fieldError('', true);
    problem.dataset.chrome = field.key;
    switch (field.type) {
      case 'text': {
        const input = textInput({ value: value ?? '', onInput: text => set(text.trim() || undefined) });
        input.placeholder = 'по умолчанию';
        return fieldGroup('label', field.label, input, problem);
      }
      case 'color':
        return fieldGroup('div', field.label, colorInput(field.label, value, set), problem);
      case 'choice':
      case 'flag':
        return fieldGroup('label', field.label, chromeSelect(field, value, set), problem);
      default:
        return settingRow(field.label, chromeValue(field, value));
    }
  }

  // Problems of the selected block's parameters, chrome and fields for the AI, each under
  // its field.
  function showFieldProblems() {
    const id = selectedBlockId();
    for (const problem of panel.querySelectorAll('[data-param], [data-chrome], [data-slot]')) {
      const { param, chrome, slot } = problem.dataset;
      const error = state.preview.errors.find(item => item.block === id && (param
        ? item.param === param
        : (chrome ? item.chrome === chrome : item.slot === slot)));
      problem.textContent = error ? capitalize(error.detail || error.message) : '';
      problem.hidden = !error;
      problem.parentElement.querySelector('.template-field__input')?.setAttribute('aria-invalid', String(Boolean(error)));
    }
  }

  function linkButton(text, id) {
    return button('template-link', text, () => selectBlock(id, { scroll: true }));
  }

  // An input's source is chosen here as well as from its chip.
  function inputSourceField(id, port, link) {
    const select = el('select', 'template-field__input');
    const choices = inputChoices(id, port);
    if (link.variable === null) {
      select.append(new Option(link.required ? 'не подключено' : 'Не подключать', '', true, true));
      if (link.required) select.options[0].disabled = true;
    } else if (!link.required) {
      select.append(new Option('Не подключать', ''));
    }
    // A source that is out of reach now stays shown: the problems tell what is wrong.
    if (link.variable !== null && !choices.some(source => source.variable === link.variable)) {
      const { stage } = state.blocks.get(id);
      select.append(new Option(link.from ? placedName(link.from.block, stage.id) : link.variable, link.variable, true, true));
    }
    select.append(...choices.map(source => new Option(sourceName(source).join(' · '), source.variable, false, source.variable === link.variable)));
    select.addEventListener('change', () => connectInput(id, port, select.value || null));
    const field = fieldGroup('label', `Берёт ${typeLabel(link.type)} из`, select);
    return link.from ? [field, linkButton(`Перейти к «${blockName(state.blocks.get(link.from.block).block)}» →`, link.from.block)] : [field];
  }

  function linksSection(block) {
    const links = blockLinks(block);
    const { stage } = state.blocks.get(block.id);
    const rows = [];
    for (const [port, link] of Object.entries(links.inputs)) {
      if (editable()) {
        rows.push(...inputSourceField(block.id, port, link));
        continue;
      }
      rows.push(settingRow(
        `Берёт: ${typeLabel(link.type)}`,
        link.from ? linkButton(`← ${placedName(link.from.block, stage.id)}`, link.from.block) : el('small', '', 'не подключено'),
      ));
    }
    for (const output of Object.values(links.exports)) {
      const readers = el('div', 'template-readers');
      for (const reader of output.readers.blocks) readers.append(linkButton(placedName(reader.block, stage.id), reader.block));
      if (output.readers.stages.length > 0) {
        const titles = output.readers.stages.map(id => stageTitle(stageById(id)));
        readers.append(el('small', '', `Контекст этапов: ${titles.join(', ')}`));
      }
      if (readers.children.length === 0) readers.append(el('small', '', 'никто не читает'));
      rows.push(settingRow(`Отдаёт: ${typeLabel(output.type)}`, readers));
    }
    return rows.length > 0 ? panelSection('Связи', ...rows) : null;
  }

  // A block without instructions of its own uses the control's.
  const controlInstructions = block => state.controls.get(block.control).defaultInstructions;
  const blockInstructions = block => block.instructions ?? controlInstructions(block);

  // The control's own instructions are left out of the definition, as system templates do.
  function setBlockInstructions(block, text) {
    if (text === controlInstructions(block).trim()) delete block.instructions;
    else block.instructions = text;
  }

  function blockInstructionsSection(block) {
    if (!editable()) return panelSection('Указания для ИИ', el('p', 'template-instructions', blockInstructions(block) || '—'));
    return instructionsSection({
      text: blockInstructions(block),
      fallback: state.blockFacts[block.id]?.defaultInstructions,
      apply: text => setBlockInstructions(block, text),
    });
  }

  // The rules follow the parameters: `showRules` refills them after each preview.
  function rulesSection() {
    const details = el('details', 'template-rules');
    details.append(el('summary'), el('ul'));
    return details;
  }

  function showRules() {
    const details = panel.querySelector('.template-rules');
    if (!details) return;
    const rules = state.blockFacts[selectedBlockId()]?.rules || [];
    details.querySelector('summary').textContent = `Технические правила (${rules.length})`;
    details.querySelector('ul').replaceChildren(...rules.map(rule => el('li', '', rule)));
  }

  function controlledBlockSections(block) {
    const control = state.controls.get(block.control);
    const sections = [];
    const params = Object.entries(control.params);
    if (params.length > 0) {
      sections.push(panelSection('Параметры', ...params.map(([key, spec]) => (editable()
        ? paramField(block, key, spec)
        : settingRow(spec.label, paramValue(spec, paramOf(block, key, spec)))))));
    }
    if (control.chrome.length > 0) {
      sections.push(panelSection('Оформление', ...control.chrome.map(field => (editable()
        ? chromeField(block, field)
        : settingRow(field.label, chromeValue(field, block.chrome?.[field.key]))))));
    }
    sections.push(linksSection(block));
    if (block.kind === 'generated') sections.push(blockInstructionsSection(block));
    if (block.kind === 'generated' && state.blockFacts[block.id]) sections.push(rulesSection());
    return sections.filter(Boolean);
  }

  // An input that writes to the working copy as the admin types.
  function textInput({ value, maxLength, multiline = false, rows = 4, type = 'text', onInput }) {
    const input = el(multiline ? 'textarea' : 'input', 'template-field__input');
    if (multiline) input.rows = rows;
    else input.type = type;
    if (maxLength) input.maxLength = maxLength;
    input.value = value;
    input.addEventListener('input', () => onInput(input.value));
    return input;
  }

  function fieldGroup(tag, label, ...children) {
    const field = el(tag, 'template-field');
    field.append(el('span', 'template-field__label', label), ...children);
    return field;
  }

  const textField = ({ label, ...options }) => fieldGroup('label', label, textInput(options));

  const fieldError = (text, valid) => Object.assign(el('small', 'template-field__error', text), { hidden: valid });

  function templatePanel() {
    const { template } = state;
    const header = el('header', 'template-panel__header');
    header.append(el('h2', '', 'Шаблон'));
    if (!editable()) {
      return [
        header,
        panelSection('Название', el('p', 'template-instructions', template.title)),
        panelSection('Описание', el('p', 'template-instructions', template.description || '—')),
      ];
    }
    const titleHint = fieldError('Без названия шаблон не сохранить.', Boolean(template.title));
    const title = textField({
      label: 'Название',
      value: template.title,
      maxLength: TITLE_MAX_LENGTH,
      onInput: value => {
        template.title = value.trim();
        titleHint.hidden = Boolean(template.title);
        renderHeader();
      },
    });
    title.append(titleHint);
    const description = textField({
      label: 'Описание',
      value: template.description,
      maxLength: DESCRIPTION_MAX_LENGTH,
      multiline: true,
      onInput: value => {
        template.description = value.trim();
        renderSaveState();
      },
    });
    return [header, el('p', 'template-panel__hint', 'Видны в списке шаблонов и в «Новом уроке».'), title, description];
  }

  const inputLabel = name => `«${state.template.definition.inputs[name].label || name}»`;
  const fieldsText = names => `${plural(names.length, ['поле', 'поля', 'поля'])} ${names.map(inputLabel).join(', ')}`;

  function requirementText(input) {
    if (!input.optional) return 'обязательно';
    return input.fallback ? `необязательно, если пусто — ${inputLabel(input.fallback)}` : 'необязательно';
  }

  // Who keeps a field: the stages that pass it to the model and the fields that take its
  // value when left empty.
  function inputReadersSection(readers) {
    const { definition } = state.template;
    const rows = [];
    if (readers.stages.length === 0) {
      rows.push(el('p', 'template-panel__hint', editable()
        ? 'Пока не читает ни один этап. Чтобы ИИ получил поле, добавьте его в контекст этапа: «+ Строка» в панели этапа.'
        : 'Пока не читает ни один этап.'));
    } else {
      const stages = el('div', 'template-readers');
      stages.append(...readers.stages.map(id => {
        const index = definition.stages.findIndex(stage => stage.id === id);
        return button('template-link', stageTitle(definition.stages[index]), () => {
          if (selectStage(index)) selectStageSettings();
        });
      }));
      rows.push(settingRow('Контекст этапов', stages));
    }
    if (readers.fallbacks.length > 0) {
      const fields = el('div', 'template-readers');
      fields.append(...readers.fallbacks.map(name => button('template-link', inputLabel(name), () => selectInput(name))));
      rows.push(settingRow('Замена для полей', fields));
    }
    return panelSection('Кто читает', ...rows);
  }

  // The topic and a fallback's target stay required; an optional field may take another
  // field's value when left empty.
  function requirementFields(name, input, readers) {
    let reason = '';
    if (name === 'topic') reason = 'Тема урока обязательна: из неё название и обложка урока.';
    else if (readers.fallbacks.length > 0) reason = `Из него берёт значение ${fieldsText(readers.fallbacks)}, поэтому оно обязательное.`;
    const field = el('label', 'template-field template-field--flag');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = Boolean(input.optional);
    box.disabled = Boolean(reason);
    box.dataset.inputOptional = '';
    box.addEventListener('change', () => {
      change(() => Edits.setInputOptional(input, box.checked));
      panel.querySelector('[data-input-optional]')?.focus();
    });
    field.append(box, el('span', 'template-field__label', 'Необязательное'));
    if (reason) field.append(el('small', 'template-panel__hint', reason));
    if (!input.optional) return [field];

    const select = el('select', 'template-field__input');
    select.append(
      new Option('ничего: поле останется пустым', ''),
      ...Object.entries(state.template.definition.inputs)
        .filter(([other, candidate]) => other !== name && !candidate.optional && candidate.fallback === undefined)
        .map(([other, candidate]) => new Option(candidate.label || other, other, false, other === input.fallback)),
    );
    select.addEventListener('change', () => edit(() => Edits.setInputOptional(input, true, select.value)));
    return [field, fieldGroup('label', 'Если пусто, брать из', select)];
  }

  // Only a field nothing reads can go; a stage's context line is taken away in its panel.
  function inputDeleteSection(name, readers) {
    const section = el('div', 'template-delete');
    const control = button('template-delete__button', 'Удалить поле', () => deleteInput(name));
    section.append(control);
    const stages = readers.stages.map(id => `«${stageTitle(stageById(id))}»`);
    let reason = '';
    if (name === 'topic') {
      reason = 'Тему урока не удалить: из неё название и обложка урока.';
    } else if (stages.length > 0) {
      reason = `Поле ${plural(stages.length, ['читает этап', 'читают этапы', 'читают этапы'])} ${stages.join(', ')}.`
        + ` Сначала уберите его строку из контекста ${plural(stages.length, ['этапа', 'этих этапов', 'этих этапов'])}.`;
    } else if (readers.fallbacks.length > 0) {
      reason = `Из него берёт значение ${fieldsText(readers.fallbacks)}.`;
    }
    control.disabled = Boolean(reason);
    if (reason) section.append(el('small', 'template-panel__hint', reason));
    return section;
  }

  function deleteInput(name) {
    const before = structuredClone(state.template.definition);
    change(template => Edits.removeInput(template.definition, name));
    showToast('Поле удалено', {
      label: 'Вернуть',
      run: () => {
        state.selection = { kind: 'input', name };
        change(template => { template.definition = before; });
      },
    });
  }

  // A field the teacher fills in «Новый урок». Its name, and so its title for the AI,
  // never changes: context lines and fallbacks refer to it.
  function inputPanel(name) {
    const input = state.template.definition.inputs[name];
    const readers = Edits.inputReaders(state.template.definition, name);
    const header = el('header', 'template-panel__header');
    header.append(el('h2', '', 'Поле при создании'), el('p', '', 'Его заполняет учитель в «Новом уроке».'));
    const promptTitle = settingRow('Название для ИИ', Edits.defaultContextLabel(name));
    if (!editable()) {
      return [header, panelSection(
        'Поле',
        settingRow('Подпись', input.label),
        settingRow('Подсказка', input.placeholder || '—'),
        settingRow('Заполнять', requirementText(input)),
        promptTitle,
      ), inputReadersSection(readers)];
    }

    const labelHint = fieldError('Без подписи поле не сохранить.', Boolean(input.label));
    const label = textField({
      label: 'Подпись',
      value: input.label || '',
      maxLength: INPUT_LABEL_MAX_LENGTH,
      onInput: value => {
        edit(() => { input.label = value.trim(); });
        labelHint.hidden = Boolean(input.label);
      },
    });
    label.append(labelHint);
    const placeholder = textField({
      label: 'Подсказка',
      value: input.placeholder || '',
      maxLength: INPUT_PLACEHOLDER_MAX_LENGTH,
      onInput: value => edit(() => setOptional(input, 'placeholder', value.trim())),
    });
    placeholder.querySelector('input').placeholder = 'Напр. Past Simple';
    placeholder.append(el('small', 'template-panel__hint', 'Видна серым в пустом поле.'));
    const settings = el('section', 'template-panel__section');
    settings.append(promptTitle, el('small', 'template-panel__hint', 'Не меняется. Подпись строки в контексте этапа правится в его панели.'));
    return [
      header,
      label,
      placeholder,
      ...requirementFields(name, input, readers),
      settings,
      inputReadersSection(readers),
      inputDeleteSection(name, readers),
    ];
  }

  // «+ Поле»: the title for the AI names the field, the label is what the teacher sees.
  function newInputPanel() {
    const draft = state.selection;
    const problemOf = () => Edits.newInputProblem(state.template.definition, draft.title);
    const header = el('header', 'template-panel__header');
    header.append(
      el('h2', '', 'Новое поле'),
      el('p', '', 'Его заполнит учитель в «Новом уроке», а ИИ получит в контексте этапов, куда вы его добавите.'),
    );

    const titleError = fieldError('', true);
    const titleNote = el('small', 'template-panel__hint');
    const showTitle = () => {
      const problem = draft.title.trim() ? problemOf() : null;
      titleError.textContent = problem || '';
      titleError.hidden = !problem;
      titleNote.textContent = draft.title.trim() && !problem
        ? `В запросе к ИИ: «${Edits.defaultContextLabel(Edits.inputNameFromTitle(draft.title))}». Потом не меняется.`
        : 'По-английски: так поле увидит ИИ. Потом не меняется.';
    };
    const title = textField({
      label: 'Название для ИИ',
      value: draft.title,
      maxLength: Edits.INPUT_TITLE_MAX_LENGTH,
      onInput: value => {
        draft.title = value;
        showTitle();
      },
    });
    const titleInput = title.querySelector('input');
    titleInput.placeholder = 'Например: Main character';
    title.append(titleError, titleNote);
    showTitle();

    const labelError = fieldError('Напишите подпись: её увидит учитель.', true);
    const label = textField({
      label: 'Подпись для учителя',
      value: draft.label,
      maxLength: INPUT_LABEL_MAX_LENGTH,
      onInput: value => {
        draft.label = value;
        labelError.hidden = true;
      },
    });
    const labelInput = label.querySelector('input');
    labelInput.placeholder = 'Например: Главный герой';
    label.append(labelError);

    const add = el('button', 'template-save', 'Добавить');
    add.type = 'submit';
    const actions = el('div', 'template-panel__actions');
    actions.append(add, button('template-discard', 'Отмена', () => {
      state.selection = null;
      renderPanel();
    }));
    const form = el('form');
    form.noValidate = true;
    form.append(title, label, actions);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const problem = problemOf();
      if (problem) {
        titleError.textContent = problem;
        titleError.hidden = false;
        titleInput.focus();
      } else if (!draft.label.trim()) {
        labelError.hidden = false;
        labelInput.focus();
      } else {
        change(template => {
          state.selection = { kind: 'input', name: Edits.addInput(template.definition, draft.title, draft.label) };
        });
      }
    });
    return [header, form];
  }

  // «Выше / Ниже»: the moves a handle makes, for the keyboard and for phones. The panel is
  // drawn anew after a move, so the focus goes on to the same button, or to the other one
  // once the item reached the end.
  function orderButtons(index, count, move) {
    if (count < 2) return [];
    const row = el('div', 'template-order');
    for (const [label, offset, direction] of [['↑ Выше', -1, 'up'], ['↓ Ниже', 1, 'down']]) {
      const control = button('template-order__button', label, () => {
        move(index, index + offset);
        (panel.querySelector(`[data-order="${direction}"]:enabled`) || panel.querySelector('[data-order]:enabled'))?.focus();
      });
      control.dataset.order = direction;
      control.disabled = index + offset < 0 || index + offset >= count;
      row.append(control);
    }
    return [row];
  }

  // A block moved by the buttons stays in sight.
  function moveSelectedBlock(from, to) {
    reorderBlock(from, to);
    markSelectedFrame()?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const fieldChip = name => el('span', 'markdown-field', name);
  const writtenByModel = slot => slot.from === undefined;

  function fieldRow(name, value, joint = '') {
    const row = settingRow('', value);
    row.firstElementChild.append(fieldChip(name), joint);
    return row;
  }

  // A field the AI writes: what to write is part of the prompt, so it is English. A field
  // still in the open editor keeps its rule here until the editor saves the text.
  function ruleField(block, name, slot, pending) {
    const field = el('label', 'template-field template-slot');
    const problem = fieldError('', true);
    problem.dataset.slot = name;
    const input = textInput({
      value: slot.rule ?? '',
      multiline: true,
      rows: 3,
      onInput: text => {
        if (pending) slot.rule = text.trim();
        else edit(() => { block.slots[name] = { ...block.slots[name], rule: text.trim() }; });
      },
    });
    input.placeholder = 'Например: one short measurable sentence about the goal of the stage.';
    input.dataset.slotRule = name;
    input.setAttribute('aria-label', `Что ИИ пишет в поле ${name}`);
    field.append(el('span', 'template-field__label', 'Что ИИ пишет в поле '), input, problem);
    field.firstElementChild.append(fieldChip(name));
    if (pending) field.append(el('small', 'template-panel__hint', 'Появится в шаблоне, когда сохраните текст блока (✓).'));
    return field;
  }

  // A field filled from a block of the same stage, without the AI. New ones come with the
  // block catalog.
  function sourceField(block, name, slot) {
    const source = Edits.slotSourceBlock(slot.from);
    const value = el('span', 'template-slot__source');
    value.append(
      linkButton(placedName(source, state.blocks.get(block.id).stage.id), source),
      el('small', '', `${slot.from.slice(source.length)}${slot.capitalize ? ', с заглавной буквы' : ''}`),
    );
    const row = fieldRow(name, value, ' ← ');
    const problem = fieldError('', true);
    problem.dataset.slot = name;
    const field = el('div', 'template-slot');
    field.append(row, problem);
    return field;
  }

  // «Поля для ИИ»: the {{slots}} of a static block. A copy inserts new ones into the text.
  function fieldsSection(block) {
    if (block.component.type === 'videoPlayer') return null;
    const slots = Object.entries(block.slots || {});
    const pending = Object.entries(state.newSlots.get(block.id) || {});
    const fields = [
      ...slots.map(([name, slot]) => {
        if (!writtenByModel(slot)) return sourceField(block, name, slot);
        return editable() ? ruleField(block, name, slot, false) : fieldRow(name, slot.rule || '—');
      }),
      ...pending.map(([name, slot]) => ruleField(block, name, slot, true)),
    ];
    if (!editable()) return fields.length > 0 ? panelSection('Поля для ИИ', ...fields) : null;
    const insert = button('template-slot__insert', '+ Вставить поле для ИИ', () => insertField(block));
    // The editor keeps its focus and caret while the button is pressed.
    insert.addEventListener('mousedown', event => event.preventDefault());
    const hint = pending.length > 0 || slots.some(([, slot]) => writtenByModel(slot))
      ? 'Что писать — по-английски: текст идёт в запрос к ИИ.'
      : 'Поставьте курсор в текст блока и вставьте поле: его напишет ИИ вместе с этапом.';
    return panelSection('Поля для ИИ', el('p', 'template-panel__hint', hint), ...fields, insert);
  }

  const writable = field => field.isConnected
    && (field.isContentEditable || (field.matches('textarea, input') && !field.disabled && !field.readOnly));

  // The selection inside a contenteditable field, if it is there.
  function rangeIn(field) {
    const selection = document.getSelection();
    const range = selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
    return range && field.isContentEditable && field.contains(range.startContainer) ? range.cloneRange() : null;
  }

  // The field in focus, or else the one last typed in, if it is in the frame and open.
  function caretIn(frame) {
    const active = document.activeElement;
    if (frame?.contains(active) && writable(active)) return { field: active, range: rangeIn(active) };
    return caret && frame?.contains(caret.field) && writable(caret.field) ? caret : null;
  }

  // At the caret of the block's open editor; into a closed Teacher's Notes, at the end of
  // its text. The name is new in the stage, so it never takes over an answer field.
  function insertField(block) {
    const target = caretIn(staticFrames.get(block.id)?.frame);
    const taken = [...state.newSlots.values()].flatMap(Object.keys);
    const name = Edits.newFieldName(currentStage(), state.controls, taken);
    if (target) {
      putField(target, name);
      caret = target;
      state.newSlots.set(block.id, { ...state.newSlots.get(block.id), [name]: { rule: '' } });
      renderPanel();
    } else if (block.component.type === 'teacherNote' && !state.openEdits.has(block.id)) {
      change(() => Edits.appendNoteField(block, name));
    } else {
      showToast('Поставьте курсор в текст блока: откройте его редактор кнопкой ✎.');
      return;
    }
    panel.querySelector(`[data-slot-rule="${name}"]`)?.focus();
  }

  // A contenteditable gets the chip the Markdown draws, a plain field the {{name}} itself.
  // The editor hears an `input`, as if the admin typed it.
  function putField(target, name) {
    const { field } = target;
    if (field.isContentEditable) {
      let range = target.range && field.contains(target.range.startContainer) ? target.range : null;
      if (!range) {
        range = document.createRange();
        range.selectNodeContents(field);
        range.collapse(false);
      }
      const chip = window.SafeMarkdown.createFieldChip(name, document);
      range.deleteContents();
      range.insertNode(chip);
      range.setStartAfter(chip);
      range.collapse(true);
      target.range = range.cloneRange();
    } else {
      const { selectionStart: start, selectionEnd: end, value } = field;
      const text = `{{${name}}}`;
      field.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
      field.setSelectionRange(start + text.length, start + text.length);
    }
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // A chip in the text tells on hover what goes there.
  function fieldTitle(id, name) {
    const block = state.blocks.get(id)?.block;
    const slot = block?.slots?.[name] || state.newSlots.get(id)?.[name];
    if (!slot) return 'Поле не описано';
    if (!writtenByModel(slot)) return `Подставляется из блока «${placedName(Edits.slotSourceBlock(slot.from), currentStage().id)}»`;
    return `ИИ пишет: ${slot.rule || 'не сказано, что'}`;
  }

  function blockPanel({ block, stage, row }) {
    const header = el('header', 'template-panel__header');
    header.append(kindBadge(block.kind));
    header.append(el('h2', '', blockName(block)));
    const title = blockTitle(block);
    if (title) header.append(el('p', '', title));
    if (row) header.append(linkButton('Часть ряда', row.id));
    if (editable() && row) header.append(el('small', 'template-panel__hint', 'Части ряда не переставляются: двигается весь ряд.'));
    else if (editable()) header.append(...orderButtons(stage.blocks.indexOf(block), stage.blocks.length, moveSelectedBlock));

    const sections = [];
    if (block.kind === 'row') {
      sections.push(panelSection('Части ряда', ...block.blocks.map(part => linkButton(
        blockTitle(part) ? `${blockName(part)} · ${blockTitle(part)}` : blockName(part),
        part.id,
      ))));
    } else if (block.kind === 'static') {
      const written = Object.values(block.slots || {}).some(writtenByModel);
      sections.push(el('p', 'template-panel__hint', written
        ? 'Попадает в урок как есть, кроме полей для ИИ: их ИИ пишет вместе с этапом.'
        : 'Попадает в урок как есть: ИИ его не меняет.'));
      if (editable() && block.component.type !== 'videoPlayer') {
        sections.push(el('p', 'template-panel__hint', 'Текст правится прямо в блоке: кнопка ✎ в его углу.'));
      }
      sections.push(fieldsSection(block));
    } else {
      sections.push(...controlledBlockSections(block));
    }
    if (editable()) {
      let label = 'Удалить блок';
      if (row) label = 'Удалить из ряда';
      else if (block.kind === 'row') label = 'Удалить ряд';
      sections.push(deleteSection(label, { block: block.id }));
    }
    return [header, ...sections.filter(Boolean)];
  }

  const iconName = icon => state.stageIcons.aliases[icon] || icon || 'sparkles';

  function stageIcon(name) {
    const icon = el('span', 'template-icon__picture');
    icon.append(window.LessonView.createStageIcon(name));
    return icon;
  }

  // Nine pictures to choose from; an older name lights up the picture it stands for.
  function iconPicker(stage) {
    const picker = el('div', 'template-icons');
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Иконка');
    const options = Object.entries(state.stageIcons.icons).map(([name, label]) => {
      const option = button('template-icon', '', () => {
        edit(() => { stage.icon = name; });
        markChosen();
      });
      option.title = label;
      option.setAttribute('aria-label', label);
      option.append(stageIcon(name));
      return [name, option];
    });
    const markChosen = () => {
      for (const [name, option] of options) option.setAttribute('aria-pressed', String(name === iconName(stage.icon)));
    };
    markChosen();
    picker.append(...options.map(([, option]) => option));
    return picker;
  }

  // What a context line passes to the model: a field filled in when the lesson is created,
  // or a value another stage generated.
  function contextSource(line, producers) {
    if (line.source === 'input') {
      const input = state.template.definition.inputs[line.name];
      return el('small', '', input ? `Поле «${input.label}»` : `Неизвестное поле ${line.name}`);
    }
    const producer = line.source === 'var' && producers.get(line.name);
    if (!producer) return el('small', '', line.reference);
    const type = state.controls.get(producer.block.control)?.outputs[producer.port]?.type;
    return linkButton(`${capitalize(typeLabel(type))} · ${stageTitle(producer.stage)}`, producer.block.id);
  }

  function contextLine(stage, line, index, { producers, inUse }) {
    const item = el('li', 'template-context__line');
    const error = fieldError('', true);
    const label = textInput({
      value: line.label,
      maxLength: Edits.CONTEXT_LABEL_MAX_LENGTH,
      onInput: value => {
        const problem = Edits.renameContextLine(stage, index, value);
        error.textContent = problem || '';
        error.hidden = !problem;
        if (!problem) edited();
      },
    });
    label.setAttribute('aria-label', 'Подпись строки');
    // A label that cannot be kept goes back to the one the template has.
    label.addEventListener('blur', () => {
      if (error.hidden) return;
      label.value = Edits.contextLines(stage)[index].label;
      error.hidden = true;
    });
    const source = el('div', 'template-context__source');
    source.append(contextSource(line, producers));
    item.append(label);
    if (line.source === 'var' && inUse.has(line.name)) {
      item.classList.add('template-context__line--kept');
      source.append(el('small', '', ' · её читают блоки этапа'));
    } else {
      const remove = button('template-context__remove', '×', () => change(() => Edits.removeContextLine(stage, index)));
      remove.setAttribute('aria-label', `Убрать строку «${line.label}»`);
      item.append(remove);
    }
    item.append(source, error);
    return item;
  }

  // «+ Строка»: a field or another stage's value the context does not pass yet.
  function contextAdder(stage, producers) {
    const { definition } = state.template;
    const taken = new Set(Edits.contextLines(stage).map(line => line.reference));
    const inputs = el('optgroup');
    inputs.label = 'Поля при создании';
    for (const [name, input] of Object.entries(definition.inputs)) {
      if (!taken.has(`$input.${name}`)) inputs.append(new Option(input.label, `input.${name}`));
    }
    const variables = el('optgroup');
    variables.label = 'Другие этапы';
    for (const [name, producer] of producers) {
      if (producer.stage === stage || taken.has(`$var.${name}`)) continue;
      const type = state.controls.get(producer.block.control)?.outputs[producer.port]?.type;
      variables.append(new Option(`${capitalize(typeLabel(type))} · ${stageTitle(producer.stage)}`, `var.${name}`));
    }
    const groups = [inputs, variables].filter(group => group.children.length > 0);
    if (groups.length === 0) return null;

    const select = el('select', 'template-field__input template-context__add');
    select.setAttribute('aria-label', 'Добавить строку');
    select.append(new Option('+ Строка', '', true, true), ...groups);
    select.options[0].disabled = true;
    select.addEventListener('change', () => {
      const [source, name] = select.value.split('.');
      change(() => Edits.addContextLine(stage, source, name));
      const added = panel.querySelectorAll('.template-context__line .template-field__input');
      added[added.length - 1]?.select();
    });
    return select;
  }

  function contextSection(stage) {
    const { definition } = state.template;
    const producers = Edits.variableProducers(definition);
    const scope = { producers, inUse: Edits.contextVariablesInUse(definition, stage) };
    const list = el('ul', 'template-context');
    list.append(...Edits.contextLines(stage).map((line, index) => contextLine(stage, line, index, scope)));
    return panelSection(
      'Контекст',
      el('p', 'template-panel__hint', 'Что ИИ получает перед заданием этапа. Подписи — по-английски, как в запросе.'),
      list,
      ...[contextAdder(stage, producers)].filter(Boolean),
    );
  }

  // Words to the model, of a stage or a block, with a way back to the system template's.
  // `fallback` is unknown until a preview without problems; `apply(text)` writes the
  // trimmed text to the working copy.
  function instructionsSection({ text, fallback, apply }) {
    const status = el('small', 'template-panel__hint');
    const reset = button('template-link', 'Вернуть по умолчанию', () => {
      input.value = fallback;
      edit(() => apply(fallback.trim()));
      showStatus();
      input.focus();
    });
    const input = textInput({
      value: text,
      multiline: true,
      rows: 8,
      onInput: value => {
        edit(() => apply(value.trim()));
        showStatus();
      },
    });
    input.setAttribute('aria-label', 'Указания для ИИ');
    const showStatus = () => {
      const same = input.value.trim() === fallback.trim();
      status.textContent = same ? 'Как в исходном шаблоне' : 'Изменены относительно исходного шаблона';
      reset.hidden = same;
    };
    if (fallback === undefined) {
      status.textContent = 'По-английски: текст идёт в запрос к ИИ.';
      reset.hidden = true;
    } else {
      showStatus();
    }
    const head = el('div', 'template-panel__row');
    head.append(status, reset);
    return panelSection('Указания для ИИ', head, input);
  }

  function readOnlyStagePanel(stage, usesModel) {
    const icon = el('span', 'template-icon template-icon--shown');
    icon.append(stageIcon(iconName(stage.icon)));
    const settings = el('section', 'template-panel__section');
    settings.append(
      settingRow('Название', stageTitle(stage)),
      settingRow('Подзаголовок', stage.subtitle || '—'),
      settingRow('Длительность', durationText(stage)),
      settingRow('Иконка', icon),
    );
    const sections = [settings];
    if (!usesModel) return sections;
    sections.push(panelSection('Указания для ИИ', el('p', 'template-instructions', stage.instructions || '—')));
    const producers = Edits.variableProducers(state.template.definition);
    const lines = Edits.contextLines(stage);
    sections.push(panelSection('Контекст', ...(lines.length > 0
      ? lines.map(line => settingRow(line.label, contextSource(line, producers)))
      : [el('small', 'template-panel__hint', 'Пусто')])));
    return sections;
  }

  function stagePanel() {
    const stage = currentStage();
    const facts = state.stageFacts[stage.id];
    // Before the first preview without problems the stage is taken to use the model.
    const usesModel = facts?.usesModel ?? true;
    const header = el('header', 'template-panel__header');
    header.append(el('h2', '', `Этап ${state.stageIndex + 1}`));
    if (!usesModel) header.append(el('p', '', 'Собирается без ИИ: указания и контекст ему не нужны.'));
    if (!editable()) return [header, ...readOnlyStagePanel(stage, usesModel)];
    header.append(...orderButtons(state.stageIndex, state.template.definition.stages.length, reorderStage));

    const titleHint = fieldError('Без названия этап не сохранить.', Boolean(stage.title));
    const title = textField({
      label: 'Название',
      value: stage.title || '',
      maxLength: STAGE_TITLE_MAX_LENGTH,
      onInput: value => {
        edit(() => { stage.title = value.trim(); });
        titleHint.hidden = Boolean(stage.title);
      },
    });
    title.append(titleHint);
    const subtitle = textField({
      label: 'Подзаголовок',
      value: stage.subtitle || '',
      maxLength: STAGE_SUBTITLE_MAX_LENGTH,
      onInput: value => edit(() => setOptional(stage, 'subtitle', value.trim())),
    });
    const durationHint = fieldError('Целое число минут, больше нуля.', true);
    const durationInput = textInput({
      value: stage.durationMinutes ?? '',
      type: 'number',
      onInput: value => {
        // An unfinished number stays as typed: the server lists it among the problems.
        edit(() => { stage.durationMinutes = value === '' ? null : Number(value); });
        durationHint.hidden = Number.isInteger(stage.durationMinutes) && stage.durationMinutes > 0;
      },
    });
    Object.assign(durationInput, { min: 1, step: 1, inputMode: 'numeric' });
    durationInput.classList.add('template-field__input--short');
    const duration = fieldGroup('label', 'Длительность, мин', durationInput, durationHint);

    const sections = [header, title, subtitle, duration, fieldGroup('div', 'Иконка', iconPicker(stage))];
    if (usesModel) {
      sections.push(instructionsSection({
        text: stage.instructions || '',
        fallback: facts?.defaultInstructions,
        apply: text => setOptional(stage, 'instructions', text),
      }), contextSection(stage));
    }
    sections.push(deleteSection('Удалить этап', { stage: stage.id }));
    return sections;
  }

  // Deletion is worked out from the working copy, so it works while the template has
  // problems too. Only the target goes at once; anything else that would go or change is
  // listed in a dialog first. Either way the toast offers «Вернуть».
  const deletionPlan = target => Edits.deletionPlan(state.template.definition, target, state.controls);

  // A deletion that would leave no stage is not offered.
  function deleteSection(label, target) {
    const section = el('div', 'template-delete');
    const control = button('template-delete__button', label, () => requestDeletion(target));
    section.append(control);
    if (deletionPlan(target).emptiesTemplate) {
      control.disabled = true;
      section.append(el('small', 'template-panel__hint', target.stage && state.template.definition.stages.length === 1
        ? 'Последний этап не удалить: в шаблоне должен остаться хотя бы один.'
        : 'Вместе с ним удалились бы все этапы шаблона.'));
    }
    return section;
  }

  // A stage's own blocks and a row's own parts go with it and are not listed apart.
  function ownBlock({ target }, entry) {
    if (target.stage) return entry.stage === target.stage;
    return entry.block === target.block || state.blocks.get(entry.block).row?.id === target.block;
  }

  // A block as the dialog lists it, with its stage when that is another one.
  function blockLine(id, fromStageId) {
    const { block, stage } = state.blocks.get(id);
    const title = blockTitle(block);
    const name = title ? `${blockName(block)} «${title}»` : blockName(block);
    return stage.id === fromStageId ? name : `${name} — этап «${stageTitle(stage)}»`;
  }

  function targetName({ target }) {
    return target.stage ? `этап «${stageTitle(stageById(target.stage))}»` : `«${blockName(state.blocks.get(target.block).block)}»`;
  }

  // Everything the deletion takes or changes besides the target, by group; empty when
  // only the target goes.
  function deletionEffects(plan) {
    const stageId = plan.target.stage || state.blocks.get(plan.target.block).stage.id;
    const portType = ({ block, port }) => {
      const { control } = state.blocks.get(block).block;
      return typeLabel(state.controls.get(control).inputs[port].type);
    };
    return [
      ['Удалятся вместе с ним', plan.blocks
        .filter(entry => !ownBlock(plan, entry))
        .map(entry => blockLine(entry.block, stageId))],
      ['Опустеют и удалятся этапы', plan.stages
        .filter(id => id !== plan.target.stage)
        .map(id => `«${stageTitle(stageById(id))}»`)],
      ['Изменятся', [
        ...plan.unbound.map(entry => `${blockLine(entry.block, stageId)}: больше не берёт ${portType(entry)}`),
        ...plan.sources.map(entry => `${blockLine(entry.block, stageId)}: больше не собирается из «${blockName(state.blocks.get(entry.source).block)}»`),
      ]],
      ['Уйдут строки контекста', plan.context
        .map(line => `«${line.label}» — этап «${stageTitle(stageById(line.stage))}»`)],
    ].filter(([, items]) => items.length > 0);
  }

  let pendingDeletion = null;

  function requestDeletion(target) {
    const plan = deletionPlan(target);
    if (plan.emptiesTemplate) return;
    const effects = deletionEffects(plan);
    if (effects.length === 0) {
      deleteNow(plan);
      return;
    }
    pendingDeletion = plan;
    byId('delete-dialog-title').textContent = `Удалить ${targetName(plan)}?`;
    byId('delete-dialog-effects').replaceChildren(...effects.map(([title, items]) => {
      const list = el('ul');
      list.append(...items.map(item => el('li', '', item)));
      return panelSection(title, list);
    }));
    const dialog = byId('delete-dialog');
    dialog.showModal();
    dialog.scrollTop = 0;
    byId('delete-cancel').focus({ preventScroll: true });
  }

  function deleteNow(plan) {
    const { definition } = state.template;
    const before = { definition: structuredClone(definition), stageIndex: state.stageIndex, selection: state.selection };
    const others = plan.blocks.filter(entry => !ownBlock(plan, entry)).length;
    let message = 'Блок удалён';
    if (plan.target.stage) message = 'Этап удалён';
    else if (state.blocks.get(plan.target.block).block.kind === 'row') message = 'Ряд удалён';
    if (others > 0) message += `, с ним ещё ${others} ${plural(others, ['блок', 'блока', 'блоков'])}`;
    // The open stage stays open; once it is gone, the stage that took its place opens.
    const stagesBefore = definition.stages.slice(0, state.stageIndex).filter(stage => !plan.stages.includes(stage.id)).length;
    change(template => {
      Edits.applyDeletion(template.definition, plan);
      state.stageIndex = Math.min(stagesBefore, template.definition.stages.length - 1);
    });
    showToast(message, {
      label: 'Вернуть',
      run: () => {
        state.stageIndex = before.stageIndex;
        state.selection = before.selection;
        change(template => { template.definition = before.definition; });
      },
    });
  }

  // The block catalog: «+ Блок» opens it for the current stage. Groups on the left, an
  // entry's card tells what the block is and what it would take and give in this stage,
  // and the chosen one shows its component built from sample data.
  const catalogDialog = byId('catalog-dialog');
  const examples = new Map();

  // A control's example is built by the server once per type; a static block's is its sample.
  function catalogExample(entry) {
    if (entry.kind === 'static') return Promise.resolve({ id: 'catalog-example', ...entry.sample });
    if (!examples.has(entry.type)) {
      examples.set(entry.type, request('GET', `/api/template-controls/${encodeURIComponent(entry.type)}/example`)
        .then(({ component }) => component)
        .catch(error => {
          examples.delete(entry.type);
          throw error;
        }));
    }
    return examples.get(entry.type);
  }

  // What the entry would take and give at the end of the current stage, as rows of
  // `{ label, value, chip, note?, warning?, output? }`: the preview shows `label` and
  // `value`, the card a chip or the warning.
  function catalogLinks(entry) {
    if (entry.kind === 'static') return [];
    const planned = Edits.plannedLinks(state.template.definition, currentStage(), entry, state.controls);
    const rows = [];
    for (const [port, input] of Object.entries(entry.inputs)) {
      const source = planned.inputs[port];
      const label = `Берёт: ${typeLabel(input.type)}`;
      if (!source) {
        if (input.required) {
          rows.push({
            label,
            value: 'не подключено',
            warning: `В этом и прошлых этапах нет блока, который отдаёт ${typeLabel(input.type)}: вход останется не подключён.`,
          });
        }
        continue;
      }
      const { block } = state.blocks.get(source.block);
      const row = {
        label,
        value: blockName(block),
        chip: `${capitalize(typeLabel(input.type))} ← ${placedName(source.block, currentStage().id)}`,
        note: source.sameStage ? 'этот этап' : `этап «${stageTitle(stageById(source.stage))}»`,
      };
      if (source.missing.length > 0) {
        row.warning = `Включите ${quoted(missingFlags(source))} в блоке «${blockName(block)}»: без этого блок не соберётся.`;
      }
      rows.push(row);
    }
    if (entry.sources) {
      const names = planned.from.map(id => blockName(state.blocks.get(id).block));
      if (names.length > 0) {
        const shown = names.length > 2 ? `${quoted(names.slice(0, 2))} и ещё ${names.length - 2}` : quoted(names);
        rows.push({ label: 'Собирается из', value: quoted(names), chip: `Из ${shown}` });
      } else {
        const { accepts } = entry.sources;
        rows.push({
          label: 'Собирается из',
          value: 'не из чего',
          warning: accepts.length === 1
            ? `Нужен блок «${state.controls.get(accepts[0]).label}» в этом этапе.`
            : 'В этапе нет блоков, из которых он собирается.',
        });
      }
    }
    for (const output of Object.values(entry.outputs)) {
      rows.push({ label: 'Отдаёт', value: typeLabel(output.type), chip: `Отдаёт ${typeLabel(output.type)}`, output: true });
    }
    return rows;
  }

  function catalogLinkChips(rows) {
    const chips = el('span', 'template-catalog__links');
    for (const row of rows) {
      if (row.warning) chips.append(el('span', 'template-catalog__warning', row.warning));
      else chips.append(el('span', `template-chip template-chip--${row.output ? 'output' : 'input'}`, row.chip));
    }
    return chips;
  }

  // Parameters a new block starts with; lists and special ones are left to its panel.
  function defaultsList(entry) {
    const items = Object.values(entry.params || {}).flatMap(spec => {
      if (spec.type === 'integer') return [`${spec.label} — ${spec.default}`];
      if (spec.type === 'choice') return [`${spec.label} — ${spec.options[spec.default].toLowerCase()}`];
      if (spec.type === 'flag') return [`${spec.label} — ${spec.default ? 'да' : 'нет'}`];
      return [];
    });
    if (items.length === 0) return null;
    const list = el('ul', 'template-setting__list');
    list.append(...items.map(item => el('li', '', item)));
    return list;
  }

  // A search looks in names and descriptions; a match in the name comes first.
  const visibleEntries = () => {
    const { entries, group, query } = state.catalog;
    const words = query.trim().toLowerCase();
    const inGroup = entries.filter(entry => group === 'all' || entry.group === group);
    if (!words) return inGroup;
    const named = inGroup.filter(entry => entry.label.toLowerCase().includes(words));
    return [...named, ...inGroup.filter(entry => !named.includes(entry) && entry.description.toLowerCase().includes(words))];
  };

  function catalogGroups() {
    const { entries, groups, group } = state.catalog;
    return [{ key: 'all', label: 'Все' }, ...groups].map(item => {
      const count = item.key === 'all' ? entries.length : entries.filter(entry => entry.group === item.key).length;
      const control = button('template-catalog__group', '', () => {
        state.catalog.group = item.key;
        renderCatalog();
      });
      control.setAttribute('aria-pressed', String(item.key === group));
      control.append(el('span', '', item.label), el('small', '', String(count)));
      return control;
    });
  }

  function catalogCard(entry) {
    const card = button('template-catalog__item', '', () => chooseEntry(entry));
    card.setAttribute('aria-pressed', String(entry === state.catalog.selected));
    card.addEventListener('dblclick', () => {
      chooseEntry(entry);
      addFromCatalog();
    });
    const top = el('span', 'template-catalog__item-top');
    top.append(kindBadge(entry.kind), el('span', 'template-catalog__name', entry.label));
    card.append(top, el('span', 'template-catalog__about', entry.description));
    const links = catalogLinks(entry);
    if (links.length > 0) card.append(catalogLinkChips(links));
    return card;
  }

  // The chosen entry: what it is, what it would take and give, its parameters and its
  // example. The example comes a moment later; a newer choice drops it.
  function catalogPreview(entry) {
    const preview = byId('catalog-preview');
    if (!entry) {
      preview.replaceChildren(el('p', 'template-catalog__placeholder', 'Выберите блок, чтобы увидеть, как он выглядит в уроке.'));
      return;
    }
    const links = catalogLinks(entry);
    const rows = links.map(row => {
      const value = el('span', '', row.value);
      if (row.note) value.append(el('small', '', ` (${row.note})`));
      return settingRow(row.label, value);
    });
    const defaults = defaultsList(entry);
    if (defaults) rows.push(settingRow('По умолчанию', defaults));
    const warnings = links.filter(row => row.warning).map(row => el('p', 'template-catalog__warning', row.warning));
    const frame = el('div', 'template-catalog__frame');
    frame.inert = true;
    frame.append(el('p', 'template-catalog__placeholder', 'Загружаем пример…'));
    // On phones the card above says the same.
    const head = el('div', 'template-catalog__preview-head');
    head.append(kindBadge(entry.kind), el('h3', '', entry.label), el('p', '', entry.description));
    preview.replaceChildren(
      head,
      ...rows,
      ...warnings,
      frame,
    );
    catalogExample(entry).then(component => {
      if (state.catalog.selected === entry) frame.replaceChildren(window.LessonView.renderComponent(component));
    }, () => {
      if (state.catalog.selected === entry) frame.replaceChildren(el('p', 'template-catalog__placeholder', 'Не удалось загрузить пример.'));
    });
  }

  // On phones the example opens right under its card.
  function placeCatalogPreview() {
    const preview = byId('catalog-preview');
    const card = byId('catalog-list').querySelector('[aria-pressed="true"]');
    if (PHONE_LAYOUT.matches) {
      preview.hidden = !card;
      if (card && card.nextElementSibling !== preview) card.after(preview);
    } else {
      preview.hidden = false;
      if (preview.previousElementSibling !== byId('catalog-list')) byId('catalog-list').after(preview);
    }
  }

  function renderCatalog() {
    const entries = visibleEntries();
    byId('catalog-groups').replaceChildren(...catalogGroups());
    byId('catalog-list').replaceChildren(...(entries.length > 0
      ? entries.map(catalogCard)
      : [el('p', 'template-catalog__placeholder', 'Ничего не нашлось.')]));
    byId('catalog-add').disabled = !state.catalog.selected;
    catalogPreview(state.catalog.selected);
    placeCatalogPreview();
  }

  function chooseEntry(entry) {
    if (state.catalog.selected === entry) return;
    state.catalog.selected = entry;
    for (const card of byId('catalog-list').querySelectorAll('.template-catalog__item')) {
      card.setAttribute('aria-pressed', 'false');
    }
    const cards = [...byId('catalog-list').querySelectorAll('.template-catalog__item')];
    cards[visibleEntries().indexOf(entry)]?.setAttribute('aria-pressed', 'true');
    byId('catalog-add').disabled = false;
    catalogPreview(entry);
    placeCatalogPreview();
  }

  // The catalog opens on the group it was left at, with nothing chosen.
  function openCatalog() {
    const stage = currentStage();
    state.catalog.selected = null;
    state.catalog.query = '';
    byId('catalog-search').value = '';
    byId('catalog-stage').textContent = `в этап ${state.stageIndex + 1} «${stageTitle(stage)}»`;
    renderCatalog();
    catalogDialog.showModal();
    byId('catalog-list').scrollTop = 0;
    // On phones the keyboard would cover the catalog.
    if (!PHONE_LAYOUT.matches) byId('catalog-search').focus();
  }

  // The new block goes to the end of the stage, selected, with the panel of its settings.
  function addFromCatalog() {
    const entry = state.catalog.selected;
    if (!entry) return;
    let added;
    change(({ definition }) => {
      added = Edits.addBlock(definition, currentStage(), entry, state.controls);
      state.selection = { kind: 'block', id: added.block.id };
    });
    catalogDialog.close();
    markSelectedFrame()?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (added.addedLines.length > 0) {
      showToast(addedLinesText(added.addedLines));
    }
  }

  function renderPanel() {
    const entry = state.blocks.get(selectedBlockId());
    const kind = state.selection?.kind;
    if (kind === 'template') panel.replaceChildren(...templatePanel());
    else if (kind === 'input') panel.replaceChildren(...inputPanel(state.selection.name));
    else if (kind === 'newInput') panel.replaceChildren(...newInputPanel());
    else if (entry) panel.replaceChildren(...blockPanel(entry));
    else panel.replaceChildren(...stagePanel());
    markSelectedInput();
    showPanelFacts();
    placePanel();
  }

  // What the panel takes from the preview: field problems and the block's rules.
  function showPanelFacts() {
    showFieldProblems();
    showRules();
  }

  // On narrow screens the panel opens right under the selected block, under the stage
  // heading for the stage's settings and above the stage for the template's and a field's.
  // Without a selection it stays closed. The panel moves only when it has to: moving takes
  // the focus out of its fields.
  function placePanel() {
    if (!NARROW_LAYOUT.matches) {
      panel.hidden = false;
      if (panel.parentElement !== layout) layout.append(panel);
      return;
    }
    const kind = state.selection?.kind;
    if (kind === 'template' || kind === 'input' || kind === 'newInput') {
      panel.hidden = false;
      const canvas = byId('template-canvas');
      if (canvas.firstElementChild !== panel) canvas.prepend(panel);
      return;
    }
    const anchor = kind === 'stage'
      ? byId('stage-kicker')
      : selectedBlockId() && byId('template-blocks').querySelector('.template-block--selected');
    panel.hidden = !anchor;
    if (anchor && anchor.nextElementSibling !== panel) anchor.after(panel);
  }

  function renderOutline() {
    const { definition } = state.template;
    byId('template-inputs').replaceChildren(...Object.entries(definition.inputs).map(([name, input]) => {
      const item = button('template-input', '', () => selectInput(name));
      item.dataset.input = name;
      item.append(el('span', '', input.label || 'Без подписи'));
      if (input.optional) item.append(el('small', '', 'необязательное'));
      const line = el('li');
      line.append(item);
      return line;
    }));
    byId('template-add-input').hidden = !editable();
    byId('template-add-stage').hidden = !editable();
    markSelectedInput();
    const minutes = definition.stages.reduce((sum, stage) => sum + (Number.isInteger(stage.durationMinutes) ? stage.durationMinutes : 0), 0);
    byId('template-stages-title').textContent = `Этапы · ${minutes} мин`;
    const stageList = byId('template-stages');
    stageList.classList.toggle('template-stages--sortable', editable());
    stageList.replaceChildren(...definition.stages.map((stage, index) => {
      const item = button('lesson-stage', '', () => selectStage(index));
      const icon = el('span', 'lesson-stage__icon');
      icon.append(window.LessonView.createStageIcon(stage.icon));
      if (editable()) item.append(dragHandle({ items: stageItems, label: stageTitle(stage), onMove: reorderStage }));
      item.append(
        icon,
        el('span', 'lesson-stage__number', String(index + 1)),
        el('span', 'lesson-stage__title', stageTitle(stage)),
        el('span', 'lesson-stage__duration', durationText(stage)),
      );
      return item;
    }));
  }

  function renderProblems() {
    const { errors } = state.preview;
    const status = byId('template-status');
    status.hidden = false;
    status.classList.toggle('template-status--problems', errors.length > 0);
    status.textContent = errors.length === 0
      ? 'Связи в порядке'
      : `${errors.length} ${plural(errors.length, ['проблема', 'проблемы', 'проблем'])}`;
    status.disabled = errors.length === 0;

    const problems = byId('template-problems');
    problems.hidden = errors.length === 0;
    byId('template-problems-list').replaceChildren(...errors.map(error => {
      const item = el('li', '', error.message);
      const target = error.block || error.stage;
      if (error.input && Object.hasOwn(state.template.definition.inputs, error.input)) {
        item.append(' ', button('template-link', 'Показать поле', () => selectInput(error.input)));
      } else if (error.block && state.blocks.has(error.block)) {
        item.append(' ', linkButton('Показать блок', error.block));
      } else if (target) {
        const index = state.template.definition.stages.findIndex(stage => stage.id === target);
        if (index >= 0) item.append(' ', button('template-link', 'Показать этап', () => selectStage(index)));
      }
      return item;
    }));
  }

  function renderHeader() {
    const { template } = state;
    const title = template.title || 'Без названия';
    document.title = `${title} — шаблон урока — EasyClass`;
    byId('template-title').textContent = title;
    byId('template-copy').hidden = !template.system;
    byId('template-save').hidden = template.system;
    renderSaveState();
  }

  const canSave = () => isDirty() && !state.saving && !state.conflict && state.openEdits.size === 0
    && state.preview.errors.length === 0 && Boolean(state.template.title);

  function renderSaveState() {
    if (!editable()) {
      byId('template-subtitle').textContent = 'Системный шаблон · только чтение';
      return;
    }
    const dirty = isDirty();
    let subtitle = 'Копия · все изменения сохранены';
    if (state.saving) subtitle = 'Копия · сохраняем…';
    else if (dirty || state.openEdits.size > 0) subtitle = 'Копия · есть несохранённые изменения';
    byId('template-subtitle').textContent = subtitle;
    byId('template-discard').hidden = !dirty;
    const save = byId('template-save');
    save.disabled = !canSave();
    save.textContent = state.saving ? 'Сохраняем…' : 'Сохранить';
    if (state.openEdits.size > 0) save.title = 'Сначала сохраните или отмените правку блока';
    else if (dirty && state.preview.errors.length > 0) save.title = 'Сначала исправьте проблемы';
    else if (dirty && !state.template.title) save.title = 'Укажите название шаблона';
    else save.title = '';
  }

  // Everything that depends on the definition, drawn again after it changed.
  function redraw() {
    const { definition } = state.template;
    state.blocks = indexBlocks(definition);
    if (state.selection?.kind === 'block' && !state.blocks.has(state.selection.id)) state.selection = null;
    if (state.selection?.kind === 'input' && !Object.hasOwn(definition.inputs, state.selection.name)) state.selection = null;
    state.stageIndex = Math.min(state.stageIndex, definition.stages.length - 1);
    renderHeader();
    renderOutline();
    renderStage();
    renderPanel();
  }

  // Every edit of the template goes through here: the page redraws from the working copy
  // at once, and the preview with its problems catches up a moment later.
  function change(mutate) {
    dropToastAction();
    mutate(state.template);
    redraw();
    schedulePreview();
  }

  // Edits typed into the panel: the panel itself stays, so its field keeps the focus.
  function edit(mutate) {
    mutate(state.template);
    edited();
  }

  function edited() {
    dropToastAction();
    renderHeader();
    renderOutline();
    renderStageHeading();
    schedulePreview();
  }

  // Only the latest preview counts: an answer to an older definition is dropped.
  function schedulePreview() {
    const number = ++previewNumber;
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => refreshPreview(number), PREVIEW_DELAY);
  }

  async function refreshPreview(number) {
    const { definition, systemTemplateId } = state.template;
    try {
      const preview = await request('POST', '/api/lesson-templates/preview', { definition, systemTemplateId });
      if (number !== previewNumber) return;
      state.preview = preview;
      if (preview.stages) state.stageFacts = preview.stages;
      if (preview.blocks) state.blockFacts = preview.blocks;
      renderProblems();
      renderStage();
      // A field being typed in stays as it is: redrawing the panel would take the focus away.
      if (panel.contains(document.activeElement)) showPanelFacts();
      else renderPanel();
      renderSaveState();
    } catch (error) {
      if (number === previewNumber) showToast(error.message);
    }
  }

  async function save() {
    if (!canSave()) return;
    const { template } = state;
    const sent = snapshot(template);
    state.saving = true;
    renderSaveState();
    try {
      const { template: saved } = await request('PATCH', `/api/lesson-templates/${encodeURIComponent(template.id)}`, {
        revision: template.revision,
        title: template.title,
        description: template.description,
        definition: template.definition,
      });
      template.revision = saved.revision;
      state.savedSnapshot = sent;
      showToast('Шаблон сохранён');
    } catch (error) {
      if (error.status === 409) {
        state.conflict = true;
        byId('template-conflict').hidden = false;
        byId('template-conflict').scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (error.errors) {
        state.preview = { errors: error.errors, lesson: null, blocks: null, stages: null };
        renderProblems();
        renderStage();
      } else {
        showToast(error.message);
      }
    } finally {
      state.saving = false;
      renderSaveState();
    }
  }

  function discardChanges() {
    if (!window.confirm('Отменить все несохранённые изменения?')) return;
    const [title, description, definition] = JSON.parse(state.savedSnapshot);
    change(template => Object.assign(template, { title, description, definition }));
  }

  // Someone saved the copy first: their version is loaded, ours is dropped.
  function loadFreshVersion() {
    if (hasUnsavedWork() && !window.confirm('Ваши несохранённые изменения пропадут. Загрузить свежую версию?')) return;
    state.leaving = true;
    window.location.reload();
  }

  async function copyTemplate() {
    const copyButton = byId('template-copy');
    copyButton.disabled = true;
    copyButton.textContent = 'Копируем…';
    try {
      const { template } = await request('POST', `/api/lesson-templates/${encodeURIComponent(state.template.id)}/copy`, {});
      window.location.assign(`/lesson-templates/${encodeURIComponent(template.id)}`);
    } catch (error) {
      showToast(error.message);
      copyButton.disabled = false;
      copyButton.textContent = 'Сделать копию';
    }
  }

  async function load() {
    const id = decodeURIComponent(window.location.pathname.split('/').pop());
    try {
      const [{ template }, controls] = await Promise.all([
        request('GET', `/api/lesson-templates/${encodeURIComponent(id)}`),
        request('GET', '/api/template-controls'),
      ]);
      state.template = template;
      state.savedSnapshot = snapshot(template);
      state.controls = new Map(controls.controls.map(control => [control.type, control]));
      state.statics = new Map(controls.statics.map(entry => [entry.type, { ...entry, kind: 'static' }]));
      // Static blocks come first in their group: notes and cards are mostly theirs.
      const groupOrder = controls.groups.map(group => group.key);
      state.catalog.groups = controls.groups;
      state.catalog.entries = [...state.statics.values(), ...controls.controls]
        .filter(entry => groupOrder.includes(entry.group))
        .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group));
      state.variableTypes = controls.variableTypes;
      state.stageIcons = controls.stageIcons;
      state.blocks = indexBlocks(template.definition);
      state.preview = await request('POST', '/api/lesson-templates/preview', {
        definition: template.definition,
        systemTemplateId: template.systemTemplateId,
      });
      state.stageFacts = state.preview.stages || {};
      state.blockFacts = state.preview.blocks || {};
    } catch (error) {
      byId('template-loading').hidden = true;
      byId('template-error').hidden = false;
      byId('template-error-message').textContent = error.message;
      return;
    }

    renderOutline();
    renderProblems();
    renderHeader();
    const hashStage = decodeURIComponent(window.location.hash.slice(1));
    state.stageIndex = Math.max(0, state.template.definition.stages.findIndex(stage => stage.id === hashStage));
    byId('template-loading').hidden = true;
    layout.hidden = false;
    renderStage();
    renderPanel();
  }

  byId('template-copy').addEventListener('click', copyTemplate);
  byId('template-title').addEventListener('click', selectTemplate);
  byId('template-add-input').addEventListener('click', selectNewInput);
  byId('template-add-stage').addEventListener('click', addStage);
  byId('template-add-block').addEventListener('click', openCatalog);
  byId('catalog-add').addEventListener('click', addFromCatalog);
  byId('catalog-cancel').addEventListener('click', () => catalogDialog.close());
  byId('catalog-close').addEventListener('click', () => catalogDialog.close());
  byId('catalog-search').addEventListener('input', event => {
    state.catalog.query = event.target.value;
    // A search looks through every group.
    if (state.catalog.query.trim()) state.catalog.group = 'all';
    renderCatalog();
  });
  PHONE_LAYOUT.addEventListener('change', placeCatalogPreview);
  byId('stage-settings').addEventListener('click', selectStageSettings);
  byId('template-save').addEventListener('click', save);
  byId('template-discard').addEventListener('click', discardChanges);
  byId('template-reload').addEventListener('click', loadFreshVersion);
  const deleteDialog = byId('delete-dialog');
  byId('delete-confirm').addEventListener('click', () => {
    const plan = pendingDeletion;
    deleteDialog.close();
    deleteNow(plan);
  });
  byId('delete-cancel').addEventListener('click', () => deleteDialog.close());
  // A click on the backdrop lands on the dialog too: only one outside its box closes it.
  for (const dialog of [deleteDialog, catalogDialog]) {
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside = event.clientX >= box.left && event.clientX <= box.right
        && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!inside) dialog.close();
    });
  }
  deleteDialog.addEventListener('close', () => { pendingDeletion = null; });
  document.addEventListener('keydown', event => {
    if (!(event.metaKey || event.ctrlKey) || event.code !== 'KeyS' || !state.template || !editable()) return;
    event.preventDefault();
    save();
  });
  window.addEventListener('beforeunload', event => {
    if (!state.template || !hasUnsavedWork() || state.leaving) return;
    event.preventDefault();
    event.returnValue = '';
  });
  // Links away from the editor ask in the page's own words instead of the browser's.
  for (const link of document.querySelectorAll('.lesson-header a')) {
    link.addEventListener('click', event => {
      if (!state.template || !hasUnsavedWork()) return;
      if (window.confirm('Есть несохранённые изменения. Уйти без сохранения?')) state.leaving = true;
      else event.preventDefault();
    });
  }
  byId('template-status').addEventListener('click', () => byId('template-problems').scrollIntoView({ behavior: 'smooth' }));
  document.addEventListener('pointermove', dragMove);
  document.addEventListener('pointerup', dragEnd);
  document.addEventListener('pointercancel', stopDrag);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') stopDrag();
  });
  document.addEventListener('click', event => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  NARROW_LAYOUT.addEventListener('change', placePanel);
  const blocksContainer = byId('template-blocks');
  // On narrow screens the panel sits among the frames: its fields are no place for a field.
  const inFrame = node => !panel.contains(node) && Boolean(node.closest('.template-block'));
  blocksContainer.addEventListener('focusin', event => {
    const field = event.target;
    if (inFrame(field) && writable(field)) caret = { field, range: rangeIn(field) };
  });
  document.addEventListener('selectionchange', () => {
    const range = caret && rangeIn(caret.field);
    if (range) caret.range = range;
  });
  blocksContainer.addEventListener('mouseover', event => {
    const chip = event.target.closest('[data-md-field]');
    if (chip && inFrame(chip)) chip.title = fieldTitle(chip.closest('.template-block')?.dataset.blockId, chip.dataset.mdField);
  });
  load();
})();
