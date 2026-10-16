(() => {
  'use strict';

  // Template editor, read-only for now: the template shown as its lesson built from sample
  // data, every block in a frame with its kind and links, and a panel with the selected
  // block's settings. The server builds the preview: controls run only there.

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

  const state = {
    template: null,
    controls: new Map(),
    variableTypes: {},
    preview: null,
    blocks: new Map(),
    stageIndex: 0,
    selectedId: null,
  };
  const byId = id => document.getElementById(id);
  const panel = byId('block-panel');
  const layout = byId('template-content');
  let toastTimer;

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
    if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить действие.');
    return payload;
  }

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
    return stage.id === fromStageId ? blockName(block) : `${blockName(block)} · ${stage.title}`;
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

  function blockFrame(block, component) {
    const frame = el('article', 'template-block');
    frame.dataset.blockId = block.id;
    frame.addEventListener('click', () => selectBlock(block.id));

    const bar = el('div', 'template-block__bar');
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

  function renderStage() {
    const stage = state.template.definition.stages[state.stageIndex];
    const lessonStage = state.preview.lesson?.stages.find(item => item.id === stage.id);
    const components = new Map((lessonStage?.content || []).map(component => [component.id, component]));

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
    byId('stage-title').textContent = stage.title;
    byId('stage-duration').textContent = `${stage.durationMinutes} мин`;
    const kicker = byId('stage-kicker');
    kicker.textContent = stage.subtitle || '';
    kicker.hidden = !stage.subtitle;
    byId('template-blocks').replaceChildren(...stage.blocks.map(block => blockFrame(block, components.get(block.id))));
    window.history.replaceState(null, '', `#${encodeURIComponent(stage.id)}`);
  }

  function selectStage(index) {
    if (index === state.stageIndex) return;
    state.stageIndex = index;
    state.selectedId = null;
    renderStage();
    renderPanel();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function selectBlock(id, { scroll = false } = {}) {
    const entry = state.blocks.get(id);
    if (!entry) return;
    if (entry.stageIndex !== state.stageIndex) {
      state.stageIndex = entry.stageIndex;
      renderStage();
      scroll = true;
    }
    state.selectedId = id;
    const frameId = entry.row ? entry.row.id : id;
    let selectedFrame = null;
    for (const frame of byId('template-blocks').querySelectorAll(':scope > .template-block')) {
      const selected = frame.dataset.blockId === frameId;
      frame.classList.toggle('template-block--selected', selected);
      if (selected) selectedFrame = frame;
    }
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

  function renderPanel() {
    const entry = state.blocks.get(state.selectedId);
    if (!entry) {
      panel.replaceChildren(el('p', 'template-panel__empty', 'Выберите блок, чтобы увидеть его настройки и связи.'));
      placePanel();
      return;
    }
    const { block, row } = entry;
    const header = el('header', 'template-panel__header');
    header.append(kindBadge(block.kind));
    header.append(el('h2', '', blockName(block)));
    const title = blockTitle(block);
    if (title) header.append(el('p', '', title));
    if (row) header.append(linkButton('Часть ряда', row.id));

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
    panel.replaceChildren(header, ...sections);
    placePanel();
  }

  // On narrow screens the panel opens right under the selected block.
  function placePanel() {
    const frame = state.selectedId
      && byId('template-blocks').querySelector('.template-block--selected');
    if (NARROW_LAYOUT.matches) {
      panel.hidden = !frame;
      if (frame) frame.after(panel);
    } else {
      panel.hidden = false;
      if (panel.parentElement !== layout) layout.append(panel);
    }
  }

  function renderOutline() {
    const { definition } = state.template;
    byId('template-inputs').replaceChildren(...Object.values(definition.inputs).map(input => {
      const item = el('li', '', input.label);
      if (input.optional) item.append(el('small', '', 'необязательное'));
      return item;
    }));
    const minutes = definition.stages.reduce((sum, stage) => sum + stage.durationMinutes, 0);
    byId('template-stages-title').textContent = `Этапы · ${minutes} мин`;
    byId('template-stages').replaceChildren(...definition.stages.map((stage, index) => {
      const item = button('lesson-stage', '', () => selectStage(index));
      const icon = el('span', 'lesson-stage__icon');
      icon.append(window.LessonView.createStageIcon(stage.icon));
      item.append(
        icon,
        el('span', 'lesson-stage__number', String(index + 1)),
        el('span', 'lesson-stage__title', stage.title),
        el('span', 'lesson-stage__duration', `${stage.durationMinutes} мин`),
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
    document.title = `${template.title} — шаблон урока — EasyClass`;
    byId('template-title').textContent = template.title;
    byId('template-subtitle').textContent = template.system
      ? 'Системный шаблон · только чтение'
      : 'Копия · пока только просмотр';
    byId('template-copy').hidden = !template.system;
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
      state.controls = new Map(controls.controls.map(control => [control.type, control]));
      state.variableTypes = controls.variableTypes;
      state.blocks = indexBlocks(template.definition);
      state.preview = await request('POST', '/api/lesson-templates/preview', {
        definition: template.definition,
        systemTemplateId: template.systemTemplateId,
      });
    } catch (error) {
      byId('template-loading').hidden = true;
      byId('template-error').hidden = false;
      byId('template-error-message').textContent = error.message;
      return;
    }

    renderHeader();
    renderOutline();
    renderProblems();
    const hashStage = decodeURIComponent(window.location.hash.slice(1));
    state.stageIndex = Math.max(0, state.template.definition.stages.findIndex(stage => stage.id === hashStage));
    byId('template-loading').hidden = true;
    layout.hidden = false;
    renderStage();
    renderPanel();
  }

  byId('template-copy').addEventListener('click', copyTemplate);
  byId('template-status').addEventListener('click', () => byId('template-problems').scrollIntoView({ behavior: 'smooth' }));
  NARROW_LAYOUT.addEventListener('change', placePanel);
  load();
})();
