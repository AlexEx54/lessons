(function initTeacherNoteBlockComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('TeacherNoteBlock requires SafeMarkdown.');
  const { editorToMarkdown } = markdown;

  const CHAT_BUBBLE = ['path', { d: 'M5.2 5.5h13.6a2.2 2.2 0 0 1 2.2 2.2v7.1a2.2 2.2 0 0 1-2.2 2.2H11l-5.8 3v-3H5.2A2.2 2.2 0 0 1 3 14.8V7.7a2.2 2.2 0 0 1 2.2-2.2Z' }];
  // Icon name → its name in the editor and the shapes of its 24×24 drawing.
  const ICON_DRAWINGS = {
    audio: ['Звук', [
      ['path', { d: 'M5 9v6h4l5 4V5L9 9z' }],
      ['path', { d: 'M17 8.2a5.2 5.2 0 0 1 0 7.6' }],
      ['path', { d: 'M19.5 5.7a8.7 8.7 0 0 1 0 12.6' }],
    ]],
    chat: ['Реплика', [CHAT_BUBBLE]],
    chatDots: ['Реплика с точками', [CHAT_BUBBLE, ...[8, 12, 16].map(cx => ['circle', { cx: String(cx), cy: '11.3', r: '.75' }])]],
    bulb: ['Лампочка', [
      ['path', { d: 'M9 17h6m-5 3h4m-7.2-8.6A5.3 5.3 0 1 1 17.2 13c-.8.8-1.5 1.7-1.7 2.8h-7C8.3 14 7.5 13.3 6.8 12.5a5.3 5.3 0 0 1 0-1.1Z' }],
    ]],
    check: ['Галочка', [
      ['circle', { cx: '12', cy: '12', r: '9' }],
      ['path', { d: 'm8.2 12.1 2.4 2.4 5.4-5.5' }],
    ]],
    book: ['Книга', [
      ['path', { d: 'M4 5.2c2.9 0 5.8.6 8 2.1v12c-2.2-1.5-5.1-2.1-8-2.1z' }],
      ['path', { d: 'M20 5.2c-2.9 0-5.8.6-8 2.1v12c2.2-1.5 5.1-2.1 8-2.1z' }],
    ]],
    key: ['Ключ', [
      ['circle', { cx: '8', cy: '15', r: '4' }],
      ['path', { d: 'm10.9 12.1 8.6-8.6' }],
      ['path', { d: 'm16.4 6.2 2.4 2.4' }],
      ['path', { d: 'm14.1 8.5 1.9 1.9' }],
    ]],
    trophy: ['Кубок', [
      ['path', { d: 'M8 4h8v5.2a4 4 0 0 1-8 0z' }],
      ['path', { d: 'M8 5.4H4.9a3.2 3.2 0 0 0 3.3 3.8' }],
      ['path', { d: 'M16 5.4h3.1a3.2 3.2 0 0 1-3.3 3.8' }],
      ['path', { d: 'M12 13.2v3.3' }],
      ['path', { d: 'M9.5 16.5h5' }],
      ['path', { d: 'M8.4 20h7.2' }],
    ]],
  };
  const ICONS = new Set(Object.keys(ICON_DRAWINGS));
  // The title colors the editor offers; a stored block may hold any other #RRGGBB.
  const COLORS = [['#6545F5', 'Фиолетовый'], ['#20A85B', 'Зелёный'], ['#2F80ED', 'Синий'], ['#E0812D', 'Оранжевый']];
  const HEX_COLOR = /^#[0-9A-F]{6}$/;
  const KEBAB_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

  function normalizeTeacherNoteBlock(data) {
    if (!data || data.type !== 'teacherNoteBlock') {
      throw new Error('TeacherNoteBlock requires type "teacherNoteBlock".');
    }
    const id = typeof data.id === 'string' ? data.id.trim() : '';
    const title = typeof data.title === 'string' ? data.title.trim().replace(/\s+/g, ' ') : '';
    const titleColor = typeof data.titleColor === 'string' ? data.titleColor.trim().toUpperCase() : '';
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!KEBAB_ID.test(id)) throw new Error('TeacherNoteBlock requires a lowercase kebab-case id.');
    if (!title || !text) throw new Error('TeacherNoteBlock requires non-empty title and text values.');
    if (!HEX_COLOR.test(titleColor)) throw new Error('TeacherNoteBlock requires a #RRGGBB titleColor.');
    if (!ICONS.has(data.icon)) throw new Error('TeacherNoteBlock requires a supported icon.');

    let tip = null;
    if (data.tip != null) {
      const tipText = typeof data.tip.text === 'string' ? data.tip.text.trim() : '';
      if (!tipText) throw new Error('TeacherNoteBlock tip requires a non-empty text value.');
      tip = { text: tipText };
    }
    return { type: 'teacherNoteBlock', id, title, titleColor, icon: data.icon, text, tip };
  }

  // What the admin has to fix in an edited sub-block before it is saved, or null.
  function teacherNoteBlockProblem({ title, text, tip }) {
    if (!String(title).trim() || !String(text).trim()) return 'Заполните заголовок и текст подблока.';
    if (tip && !String(tip.text).trim()) return 'Заполните Tip или уберите его.';
    return null;
  }

  function svgElement(documentRef, tag, attributes) {
    const node = documentRef.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function createIcon(documentRef, type) {
    const svg = svgElement(documentRef, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', 'data-icon': type });
    ICON_DRAWINGS[type][1].forEach(([tag, attributes]) => svg.append(svgElement(documentRef, tag, attributes)));
    return svg;
  }

  function createTipIcon(documentRef) {
    const svg = svgElement(documentRef, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    svg.append(
      svgElement(documentRef, 'path', { d: 'M9 18h6' }),
      svgElement(documentRef, 'path', { d: 'M10 21h4' }),
      svgElement(documentRef, 'path', { d: 'M8.5 15.4A6.5 6.5 0 1 1 15.5 15.4C14.6 16.2 14.2 17 14.1 18H9.9c-.1-1-.5-1.8-1.4-2.6Z' }),
    );
    return svg;
  }

  // `fresh`: a sub-block added in the note's editor and not saved yet. It opens empty, has
  // no ✎ of its own, and the note reads it with `card.readValue()` when the note saves.
  function renderTeacherNoteBlock(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('TeacherNoteBlock requires a document.');
    const fresh = Boolean(settings.fresh);
    const block = fresh ? { ...data, tip: null } : normalizeTeacherNoteBlock(data);
    const renderText = (container, value) => (
      markdown.renderMarkdownInto(container, value, doc, 'teacher-note-block__spacer', { linkify: true })
    );

    const card = doc.createElement('article');
    card.className = 'teacher-note-block';
    card.dataset.blockId = block.id;

    const header = doc.createElement('div');
    header.className = 'teacher-note-block__header';
    const heading = doc.createElement('h3');
    heading.className = 'teacher-note-block__title';
    const icon = doc.createElement('span');
    icon.className = 'teacher-note-block__icon';
    const label = doc.createElement('span');
    label.textContent = block.title;
    heading.append(icon, label);
    header.append(heading);

    const actions = doc.createElement('div');
    actions.className = 'teacher-note-block__actions';

    if (settings.removable && typeof settings.onRemove === 'function') {
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.className = 'teacher-note-block__remove';
      remove.textContent = 'Удалить';
      remove.setAttribute('aria-label', `Удалить подблок «${block.title || 'Новый подблок'}»`);
      remove.addEventListener('click', () => settings.onRemove(block.id));
      actions.append(remove);
    }

    const body = doc.createElement('div');
    body.className = 'teacher-note-block__body';
    body.dataset.placeholder = 'Текст подблока';
    renderText(body, block.text);

    // Icon and color pickers, shown while the sub-block is edited.
    const style = doc.createElement('div');
    style.className = 'teacher-note-block__style';
    style.hidden = true;
    const iconChoices = doc.createElement('div');
    iconChoices.className = 'teacher-note-block__choices';
    iconChoices.setAttribute('role', 'group');
    iconChoices.setAttribute('aria-label', 'Иконка подблока');
    const iconButtons = [...ICONS].map((name) => {
      const choice = doc.createElement('button');
      choice.type = 'button';
      choice.className = 'teacher-note-block__icon-choice';
      choice.dataset.icon = name;
      choice.title = ICON_DRAWINGS[name][0];
      choice.setAttribute('aria-label', ICON_DRAWINGS[name][0]);
      choice.append(createIcon(doc, name));
      choice.addEventListener('click', () => {
        paintStyle(name, titleColor);
        changed();
      });
      iconChoices.append(choice);
      return choice;
    });
    const colorChoices = doc.createElement('div');
    colorChoices.className = 'teacher-note-block__choices';
    colorChoices.setAttribute('role', 'group');
    colorChoices.setAttribute('aria-label', 'Цвет заголовка');
    const colorButtons = COLORS.map(([color, name]) => {
      const choice = doc.createElement('button');
      choice.type = 'button';
      choice.className = 'teacher-note-block__color-choice';
      choice.dataset.color = color;
      choice.title = name;
      choice.setAttribute('aria-label', name);
      choice.style.setProperty('--teacher-note-block-swatch', color);
      choice.addEventListener('click', () => {
        paintStyle(iconName, color);
        changed();
      });
      colorChoices.append(choice);
      return choice;
    });
    style.append(iconChoices, colorChoices);

    const addTip = doc.createElement('button');
    addTip.type = 'button';
    addTip.className = 'teacher-note-block__add-tip';
    addTip.textContent = '+ Tip';
    addTip.hidden = true;
    addTip.addEventListener('click', () => {
      paintTip('', true);
      changed();
      tipText.focus();
    });

    let iconName = block.icon;
    let titleColor = block.titleColor;
    let tip = null;
    let tipText = null;
    let editing = false;
    let saving = false;
    let titleInput;
    let initialSnapshot = '';

    function paintStyle(nextIcon, nextColor) {
      iconName = nextIcon;
      titleColor = nextColor;
      card.style.setProperty('--teacher-note-block-accent', titleColor);
      icon.replaceChildren(createIcon(doc, iconName));
      iconButtons.forEach(choice => choice.setAttribute('aria-pressed', String(choice.dataset.icon === iconName)));
      colorButtons.forEach(choice => choice.setAttribute('aria-pressed', String(choice.dataset.color === titleColor)));
    }

    function editable(element, ariaLabel) {
      element.contentEditable = 'true';
      element.setAttribute('role', 'textbox');
      element.setAttribute('aria-label', ariaLabel);
    }

    function readOnly(element) {
      element.contentEditable = 'false';
      element.removeAttribute('role');
      element.removeAttribute('aria-label');
    }

    // The tip box for `text`, or none for null. An edited one can be taken away.
    function paintTip(text, open) {
      tip = null;
      tipText = null;
      if (text !== null) {
        tip = doc.createElement('div');
        tip.className = 'teacher-note-block__tip';
        const tipIcon = doc.createElement('span');
        tipIcon.className = 'teacher-note-block__tip-icon';
        tipIcon.append(createTipIcon(doc));
        const tipContent = doc.createElement('div');
        tipContent.className = 'teacher-note-block__tip-content';
        const tipLabel = doc.createElement('strong');
        tipLabel.textContent = 'Tip:';
        tipText = doc.createElement('div');
        tipText.className = 'teacher-note-block__tip-text';
        tipText.dataset.placeholder = 'Текст Tip';
        renderText(tipText, text);
        tipContent.append(tipLabel, tipText);
        tip.append(tipIcon, tipContent);
        if (open) {
          editable(tipText, 'Текст Tip');
          const removeTip = doc.createElement('button');
          removeTip.type = 'button';
          removeTip.className = 'teacher-note-block__remove-tip';
          removeTip.textContent = '×';
          removeTip.title = 'Убрать Tip';
          removeTip.setAttribute('aria-label', 'Убрать Tip');
          removeTip.addEventListener('click', () => {
            paintTip(null, true);
            changed();
          });
          tip.append(removeTip);
        }
      }
      addTip.hidden = !open || text !== null;
      card.replaceChildren(header, style, body, ...(tip ? [tip] : []), addTip);
    }

    function value() {
      return {
        id: block.id,
        title: titleInput.value,
        titleColor,
        icon: iconName,
        text: editorToMarkdown(body),
        tip: tipText ? { text: editorToMarkdown(tipText) } : null,
      };
    }

    function snapshot() { return JSON.stringify(value()); }

    function setDirty(dirty) {
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, block.id);
    }

    function changed() { if (editing) setDirty(snapshot() !== initialSnapshot); }

    function showSaved() {
      editing = false;
      card.classList.remove('teacher-note-block--editing');
      if (edit) {
        edit.textContent = '✎';
        edit.setAttribute('aria-label', `Редактировать подблок «${block.title}»`);
        edit.disabled = false;
      }
      label.textContent = block.title;
      heading.replaceChildren(icon, label);
      readOnly(body);
      renderText(body, block.text);
      style.hidden = true;
      paintStyle(block.icon, block.titleColor);
      paintTip(block.tip ? block.tip.text : null, false);
      setDirty(false);
    }

    function cancelEditing() {
      if (!editing || saving || fresh) return;
      showSaved();
    }

    async function saveEditing() {
      const next = value();
      const problem = teacherNoteBlockProblem(next);
      if (problem) {
        if (typeof settings.onError === 'function') settings.onError(problem);
        return;
      }
      saving = true;
      card.classList.add('teacher-note-block--saving');
      edit.disabled = true;
      try {
        const saved = await settings.onSave(next);
        Object.assign(block, normalizeTeacherNoteBlock(saved));
        saving = false;
        card.classList.remove('teacher-note-block--saving');
        showSaved();
      } catch (_error) {
        saving = false;
        card.classList.remove('teacher-note-block--saving');
        edit.disabled = false;
        body.focus();
      }
    }

    function enterEditing() {
      editing = true;
      card.classList.add('teacher-note-block--editing');
      titleInput = doc.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'teacher-note-block__title-input';
      titleInput.value = block.title;
      titleInput.placeholder = 'Заголовок подблока';
      titleInput.setAttribute('aria-label', 'Заголовок подблока');
      heading.replaceChildren(icon, titleInput);
      editable(body, 'Текст подблока');
      style.hidden = false;
      paintTip(block.tip ? block.tip.text : null, true);
      if (edit) {
        edit.textContent = '✓';
        edit.setAttribute('aria-label', `Сохранить подблок «${block.title}»`);
      }
      initialSnapshot = snapshot();
      titleInput.focus();
    }

    let edit;
    if (!fresh && settings.editable && typeof settings.onSave === 'function') {
      edit = doc.createElement('button');
      edit.type = 'button';
      edit.className = 'teacher-note-block__edit';
      edit.textContent = '✎';
      edit.setAttribute('aria-label', `Редактировать подблок «${block.title}»`);
      edit.addEventListener('click', () => editing ? saveEditing() : enterEditing());
      actions.append(edit);
    }
    if (actions.childNodes.length) header.append(actions);

    paintStyle(block.icon, block.titleColor);
    paintTip(block.tip ? block.tip.text : null, false);
    card.addEventListener('input', changed);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !fresh) {
        event.preventDefault();
        cancelEditing();
      }
    });
    if (fresh) {
      enterEditing();
      card.readValue = value;
    }
    return card;
  }

  const api = { COLORS, ICONS, normalizeTeacherNoteBlock, renderTeacherNoteBlock, teacherNoteBlockProblem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TeacherNoteBlockComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
