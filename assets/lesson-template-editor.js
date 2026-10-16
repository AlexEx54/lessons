(() => {
  'use strict';

  // Template editor: the template shown as its lesson built from sample data, every block
  // in a frame with its kind and links, and a panel with the settings of the selected
  // block, the current stage or the template itself. The server builds the preview:
  // controls run only there. A copy is edited in place and saved explicitly; a system
  // template is read-only.

  const KIND_LABELS = { static: 'Статичный', generated: 'Генерирует ИИ', derived: 'Собирается сам', row: 'Ряд' };
  const STATIC_LABELS = {
    teacherNote: 'Заметки учителю',
    taskPrompt: 'Задание',
    markdownCard: 'Карточка',
    textPanel: 'Текстовая панель',
    multipleChoice: 'Выбор ответа',
    videoPlayer: 'Видео',
    howToPlay: 'Как играть',
    selfAssessment: 'Самооценка',
  };
  const NARROW_LAYOUT = window.matchMedia('(max-width: 1180px)');
  const TITLE_MAX_LENGTH = 80;
  const DESCRIPTION_MAX_LENGTH = 500;
  const STAGE_TITLE_MAX_LENGTH = 80;
  const STAGE_SUBTITLE_MAX_LENGTH = 120;
  const PREVIEW_DELAY = 300;
  const DRAG_THRESHOLD = 7;
  const SCROLL_EDGE = 70;
  const Edits = window.LessonTemplateEdits;

  // `template` is the working copy: edits change it in place. `savedSnapshot` is what the
  // server holds, to tell unsaved changes. `selection` is the block, the stage or the
  // template whose settings the panel shows; without it a wide panel shows the stage.
  // `stageFacts` outlive a preview with problems: stage settings do not change them.
  const state = {
    template: null,
    savedSnapshot: '',
    controls: new Map(),
    variableTypes: {},
    stageIcons: { icons: {}, aliases: {} },
    preview: null,
    stageFacts: {},
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
  const stageTitle = stage => stage.title || 'Без названия';
  // A duration being typed may be unfinished: the problems list explains it.
  const durationText = stage => (Number.isInteger(stage.durationMinutes) ? `${stage.durationMinutes} мин` : '— мин');

  // An optional text setting is left out of the definition while empty.
  function setOptional(object, key, value) {
    if (value) object[key] = value;
    else delete object[key];
  }

  function showToast(message) {
    const toast = byId('lesson-toast');
    toast.textContent = message;
    toast.classList.add('lesson-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('lesson-toast--visible'), 2600);
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
    if (block.kind === 'static') return STATIC_LABELS[block.component.type] || 'Статичный блок';
    return state.controls.get(block.control)?.label || block.control;
  }

  function blockTitle(block) {
    return block.kind === 'static'
      ? block.component.title || block.component.heading || ''
      : block.chrome?.title || block.chrome?.heading || '';
  }

  const kindBadge = kind => el('span', `template-kind template-kind--${kind}`, KIND_LABELS[kind]);
  const typeLabel = type => state.variableTypes[type] || type;
  const described = id => state.preview.blocks?.[id];

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
  function linkChips(id) {
    const links = described(id);
    if (!links) return [];
    const inputs = Object.values(links.inputs).map(link => button(
      'template-chip template-chip--input',
      `${capitalize(typeLabel(link.type))} ← ${placedName(link.from.block, links.stage)}`,
      event => {
        event.stopPropagation();
        selectBlock(link.from.block, { scroll: true });
      },
    ));
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
    const frame = el('article', 'template-block');
    frame.dataset.blockId = block.id;
    frame.addEventListener('click', () => selectBlock(block.id));

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
    frame.append(bar);

    // The sample lesson is shown, not taken: its exercises do not react to clicks.
    const preview = el('div', 'template-block__preview');
    preview.inert = true;
    preview.append(component
      ? window.LessonView.renderComponent(component)
      : el('p', 'template-block__empty', 'Пример появится, когда в шаблоне не останется проблем.'));
    frame.append(preview);
    return frame;
  }

  const currentStage = () => state.template.definition.stages[state.stageIndex];

  function renderStage() {
    const stage = currentStage();
    const lessonStage = state.preview.lesson?.stages.find(item => item.id === stage.id);
    const components = new Map((lessonStage?.content || []).map(component => [component.id, component]));
    renderStageHeading();
    byId('template-blocks').replaceChildren(...stage.blocks.map(block => blockFrame(block, components.get(block.id))));
    markSelectedFrame();
    placePanel();
    window.history.replaceState(null, '', `#${encodeURIComponent(stage.id)}`);
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
  function selectStage(index) {
    const moved = index !== state.stageIndex;
    state.stageIndex = index;
    if (state.selection?.kind === 'block') state.selection = null;
    renderStage();
    renderPanel();
    if (moved) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectStageSettings() {
    state.selection = { kind: 'stage' };
    markSelectedFrame();
    renderPanel();
    if (NARROW_LAYOUT.matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function selectBlock(id, { scroll = false } = {}) {
    const entry = state.blocks.get(id);
    if (!entry) return;
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

  function selectTemplate() {
    state.selection = { kind: 'template' };
    markSelectedFrame();
    renderPanel();
    if (NARROW_LAYOUT.matches) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function linkButton(text, id) {
    return button('template-link', text, () => selectBlock(id, { scroll: true }));
  }

  function linksSection(block, control) {
    const links = described(block.id);
    const rows = [];
    for (const [port, spec] of Object.entries(control.inputs)) {
      const link = links.inputs[port];
      rows.push(settingRow(
        `Берёт: ${typeLabel(spec.type)}`,
        link ? linkButton(`← ${placedName(link.from.block, links.stage)}`, link.from.block) : el('small', '', 'не подключено'),
      ));
    }
    for (const output of Object.values(links.exports)) {
      const readers = el('div', 'template-readers');
      for (const reader of output.readers.blocks) readers.append(linkButton(placedName(reader.block, links.stage), reader.block));
      if (output.readers.stages.length > 0) {
        const titles = output.readers.stages.map(id => state.template.definition.stages.find(stage => stage.id === id).title);
        readers.append(el('small', '', `Контекст этапов: ${titles.join(', ')}`));
      }
      if (readers.children.length === 0) readers.append(el('small', '', 'никто не читает'));
      rows.push(settingRow(`Отдаёт: ${typeLabel(output.type)}`, readers));
    }
    return rows.length > 0 ? panelSection('Связи', ...rows) : null;
  }

  function instructionsSection(block) {
    const links = described(block.id);
    const text = el('p', 'template-instructions', block.instructions || '—');
    const children = [text];
    if (!state.template.system) {
      const same = (block.instructions || '').trim() === (links.defaultInstructions || '').trim();
      children.unshift(el('small', 'template-panel__hint', same ? 'Как в исходном шаблоне' : 'Изменены относительно исходного шаблона'));
    }
    return panelSection('Указания для ИИ', ...children);
  }

  function rulesSection(block) {
    const rules = described(block.id).rules;
    const details = el('details', 'template-rules');
    details.append(el('summary', '', `Технические правила (${rules.length})`));
    const list = el('ul');
    list.append(...rules.map(rule => el('li', '', rule)));
    details.append(list);
    return details;
  }

  function controlledBlockSections(block) {
    const control = state.controls.get(block.control);
    const sections = [];
    const params = Object.entries(control.params);
    if (params.length > 0) {
      sections.push(panelSection('Параметры', ...params.map(([key, spec]) => settingRow(
        spec.label,
        paramValue(spec, Object.hasOwn(block.params || {}, key) ? block.params[key] : spec.default),
      ))));
    }
    if (control.chrome.length > 0) {
      sections.push(panelSection('Оформление', ...control.chrome.map(field => settingRow(
        field.label,
        chromeValue(field, block.chrome?.[field.key]),
      ))));
    }
    if (described(block.id)) sections.push(linksSection(block, control));
    if (block.kind === 'generated' && described(block.id)) sections.push(instructionsSection(block), rulesSection(block));
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
      sections.push(el('p', 'template-panel__hint', 'Попадает в урок как есть: ИИ его не меняет.'));
    } else {
      sections.push(...controlledBlockSections(block));
    }
    return [header, ...sections];
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

  // The stage's own words to the model, with a way back to the system template's.
  function stageInstructionsSection(stage, fallback) {
    const status = el('small', 'template-panel__hint');
    const reset = button('template-link', 'Вернуть по умолчанию', () => {
      input.value = fallback;
      edit(() => setOptional(stage, 'instructions', fallback.trim()));
      showStatus();
      input.focus();
    });
    const input = textInput({
      value: stage.instructions || '',
      multiline: true,
      rows: 8,
      onInput: value => {
        edit(() => setOptional(stage, 'instructions', value.trim()));
        showStatus();
      },
    });
    input.setAttribute('aria-label', 'Указания для ИИ');
    const showStatus = () => {
      const same = (stage.instructions || '') === fallback.trim();
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
    if (usesModel) sections.push(stageInstructionsSection(stage, facts?.defaultInstructions), contextSection(stage));
    return sections;
  }

  function renderPanel() {
    const entry = state.blocks.get(selectedBlockId());
    if (state.selection?.kind === 'template') panel.replaceChildren(...templatePanel());
    else if (entry) panel.replaceChildren(...blockPanel(entry));
    else panel.replaceChildren(...stagePanel());
    placePanel();
  }

  // On narrow screens the panel opens right under the selected block, under the stage
  // heading for the stage's settings and above the stage for the template's. Without a
  // selection it stays closed. The panel moves only when it has to: moving takes the focus
  // out of its fields.
  function placePanel() {
    if (!NARROW_LAYOUT.matches) {
      panel.hidden = false;
      if (panel.parentElement !== layout) layout.append(panel);
      return;
    }
    const kind = state.selection?.kind;
    if (kind === 'template') {
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
    byId('template-inputs').replaceChildren(...Object.values(definition.inputs).map(input => {
      const item = el('li', '', input.label);
      if (input.optional) item.append(el('small', '', 'необязательное'));
      return item;
    }));
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
      if (error.block && state.blocks.has(error.block)) {
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

  const canSave = () => isDirty() && !state.saving && !state.conflict
    && state.preview.errors.length === 0 && Boolean(state.template.title);

  function renderSaveState() {
    if (!editable()) {
      byId('template-subtitle').textContent = 'Системный шаблон · только чтение';
      return;
    }
    const dirty = isDirty();
    let subtitle = 'Копия · все изменения сохранены';
    if (state.saving) subtitle = 'Копия · сохраняем…';
    else if (dirty) subtitle = 'Копия · есть несохранённые изменения';
    byId('template-subtitle').textContent = subtitle;
    byId('template-discard').hidden = !dirty;
    const save = byId('template-save');
    save.disabled = !canSave();
    save.textContent = state.saving ? 'Сохраняем…' : 'Сохранить';
    if (dirty && state.preview.errors.length > 0) save.title = 'Сначала исправьте проблемы';
    else if (dirty && !state.template.title) save.title = 'Укажите название шаблона';
    else save.title = '';
  }

  // Everything that depends on the definition, drawn again after it changed.
  function redraw() {
    const { definition } = state.template;
    state.blocks = indexBlocks(definition);
    if (state.selection?.kind === 'block' && !state.blocks.has(state.selection.id)) state.selection = null;
    state.stageIndex = Math.min(state.stageIndex, definition.stages.length - 1);
    renderHeader();
    renderOutline();
    renderStage();
    renderPanel();
  }

  // Every edit of the template goes through here: the page redraws from the working copy
  // at once, and the preview with its problems catches up a moment later.
  function change(mutate) {
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
      renderProblems();
      renderStage();
      // A field being typed in stays as it is: redrawing the panel would take the focus away.
      if (!panel.contains(document.activeElement)) renderPanel();
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
    if (isDirty() && !window.confirm('Ваши несохранённые изменения пропадут. Загрузить свежую версию?')) return;
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
      state.variableTypes = controls.variableTypes;
      state.stageIcons = controls.stageIcons;
      state.blocks = indexBlocks(template.definition);
      state.preview = await request('POST', '/api/lesson-templates/preview', {
        definition: template.definition,
        systemTemplateId: template.systemTemplateId,
      });
      state.stageFacts = state.preview.stages || {};
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
  byId('stage-settings').addEventListener('click', selectStageSettings);
  byId('template-save').addEventListener('click', save);
  byId('template-discard').addEventListener('click', discardChanges);
  byId('template-reload').addEventListener('click', loadFreshVersion);
  document.addEventListener('keydown', event => {
    if (!(event.metaKey || event.ctrlKey) || event.code !== 'KeyS' || !state.template || !editable()) return;
    event.preventDefault();
    save();
  });
  window.addEventListener('beforeunload', event => {
    if (!state.template || !isDirty() || state.leaving) return;
    event.preventDefault();
    event.returnValue = '';
  });
  // Links away from the editor ask in the page's own words instead of the browser's.
  for (const link of document.querySelectorAll('.lesson-header a')) {
    link.addEventListener('click', event => {
      if (!state.template || !isDirty()) return;
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
  load();
})();
