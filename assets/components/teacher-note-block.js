(function initTeacherNoteBlockComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('TeacherNoteBlock requires SafeMarkdown.');
  const { editorToMarkdown } = markdown;

  const ICONS = new Set(['audio', 'chat', 'chatDots']);
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

  function svgElement(documentRef, tag, attributes) {
    const node = documentRef.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function createIcon(documentRef, type) {
    const svg = svgElement(documentRef, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', 'data-icon': type });
    if (type === 'audio') {
      svg.append(
        svgElement(documentRef, 'path', { d: 'M5 9v6h4l5 4V5L9 9z' }),
        svgElement(documentRef, 'path', { d: 'M17 8.2a5.2 5.2 0 0 1 0 7.6' }),
        svgElement(documentRef, 'path', { d: 'M19.5 5.7a8.7 8.7 0 0 1 0 12.6' }),
      );
    } else {
      svg.append(svgElement(documentRef, 'path', { d: 'M5.2 5.5h13.6a2.2 2.2 0 0 1 2.2 2.2v7.1a2.2 2.2 0 0 1-2.2 2.2H11l-5.8 3v-3H5.2A2.2 2.2 0 0 1 3 14.8V7.7a2.2 2.2 0 0 1 2.2-2.2Z' }));
      if (type === 'chatDots') {
        [8, 12, 16].forEach(cx => svg.append(svgElement(documentRef, 'circle', { cx: String(cx), cy: '11.3', r: '.75' })));
      }
    }
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

  function renderTeacherNoteBlock(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('TeacherNoteBlock requires a document.');
    const block = normalizeTeacherNoteBlock(data);

    const card = doc.createElement('article');
    card.className = 'teacher-note-block';
    card.dataset.blockId = block.id;
    card.style.setProperty('--teacher-note-block-accent', block.titleColor);

    const header = doc.createElement('div');
    header.className = 'teacher-note-block__header';
    const heading = doc.createElement('h3');
    heading.className = 'teacher-note-block__title';
    const icon = doc.createElement('span');
    icon.className = 'teacher-note-block__icon';
    icon.append(createIcon(doc, block.icon));
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
      remove.setAttribute('aria-label', `Удалить подблок «${block.title}»`);
      remove.addEventListener('click', () => settings.onRemove(block.id));
      actions.append(remove);
    }

    const body = doc.createElement('div');
    body.className = 'teacher-note-block__body';
    markdown.renderMarkdownInto(body, block.text, doc, 'teacher-note-block__spacer', { linkify: true });

    let editing = false;
    let saving = false;
    let titleInput;
    let tipText;

    function cancelEditing() {
      if (!editing || saving) return;
      editing = false;
      card.classList.remove('teacher-note-block--editing');
      edit.textContent = '✎';
      edit.setAttribute('aria-label', `Редактировать подблок «${block.title}»`);
      edit.disabled = false;
      heading.replaceChildren(icon, label);
      body.contentEditable = 'false';
      body.removeAttribute('role');
      body.removeAttribute('aria-label');
      markdown.renderMarkdownInto(body, block.text, doc, 'teacher-note-block__spacer', { linkify: true });
      if (tipText) {
        tipText.contentEditable = 'false';
        tipText.removeAttribute('role');
        tipText.removeAttribute('aria-label');
        markdown.renderMarkdownInto(tipText, block.tip.text, doc, 'teacher-note-block__spacer', { linkify: true });
      }
    }

    async function saveEditing() {
      const next = {
        id: block.id,
        title: titleInput.value,
        text: editorToMarkdown(body),
      };
      if (tipText) next.tip = { text: editorToMarkdown(tipText) };
      if (!next.title.trim() || !next.text.trim() || (next.tip && !next.tip.text.trim())) {
        if (typeof settings.onError === 'function') settings.onError('Заполните заголовок, текст и Tip.');
        return;
      }
      saving = true;
      card.classList.add('teacher-note-block--saving');
      edit.disabled = true;
      try {
        const saved = await settings.onSave(next);
        Object.assign(block, normalizeTeacherNoteBlock(saved));
        label.textContent = block.title;
        saving = false;
        card.classList.remove('teacher-note-block--saving');
        cancelEditing();
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
      titleInput.setAttribute('aria-label', 'Заголовок подблока');
      heading.replaceChildren(icon, titleInput);
      body.contentEditable = 'true';
      body.setAttribute('role', 'textbox');
      body.setAttribute('aria-label', 'Текст подблока');
      if (tipText) {
        tipText.contentEditable = 'true';
        tipText.setAttribute('role', 'textbox');
        tipText.setAttribute('aria-label', 'Текст Tip');
      }
      edit.textContent = '✓';
      edit.setAttribute('aria-label', `Сохранить подблок «${block.title}»`);
      titleInput.focus();
    }

    let edit;
    if (settings.editable && typeof settings.onSave === 'function') {
      edit = doc.createElement('button');
      edit.type = 'button';
      edit.className = 'teacher-note-block__edit';
      edit.textContent = '✎';
      edit.setAttribute('aria-label', `Редактировать подблок «${block.title}»`);
      edit.addEventListener('click', () => editing ? saveEditing() : enterEditing());
      actions.append(edit);
    }
    if (actions.childNodes.length) header.append(actions);

    card.append(header, body);

    if (block.tip) {
      const tip = doc.createElement('div');
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
      markdown.renderMarkdownInto(tipText, block.tip.text, doc, 'teacher-note-block__spacer', { linkify: true });
      tipContent.append(tipLabel, tipText);
      tip.append(tipIcon, tipContent);
      card.append(tip);
    }
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });
    return card;
  }

  const api = { ICONS, normalizeTeacherNoteBlock, renderTeacherNoteBlock };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TeacherNoteBlockComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
