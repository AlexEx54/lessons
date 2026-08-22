(function initMarkdownCardComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('MarkdownCard requires SafeMarkdown.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const ICONS = new Set(['book', 'check', 'chat', 'bulb', 'key', 'pencil', 'lifeRing', 'trophy']);
  const LAYOUTS = new Set(['columns', 'stacked']);
  const STUDENT_VISIBILITIES = new Set(['always', 'controlled', 'teacherOnly']);
  const HEADING_SIZES = new Set(['default', 'large']);
  const VIEWER_ROLES = new Set(['teacher', 'student']);

  function normalizeTitle(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function normalizeMarkdownCard(data) {
    if (!data || data.type !== 'markdownCard' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('MarkdownCard requires type "markdownCard" and a kebab-case id.');
    }
    const title = normalizeTitle(data.title);
    const accentColor = typeof data.accentColor === 'string' ? data.accentColor.trim().toUpperCase() : '';
    if (!title) throw new Error('MarkdownCard requires non-empty title and text values.');
    if (!ICONS.has(data.icon)) throw new Error('MarkdownCard requires a supported icon.');
    if (!HEX_COLOR.test(accentColor)) throw new Error('MarkdownCard requires accentColor in #RRGGBB format.');
    if (!STUDENT_VISIBILITIES.has(data.studentVisibility)) {
      throw new Error('MarkdownCard requires a supported studentVisibility.');
    }
    if (data.headingSize != null && !HEADING_SIZES.has(data.headingSize)) {
      throw new Error('MarkdownCard requires a supported headingSize.');
    }
    const hasText = data.text != null;
    const hasSections = data.sections != null;
    if (hasText === hasSections) {
      throw new Error('MarkdownCard requires exactly one of text or sections.');
    }

    const normalized = {
      type: 'markdownCard',
      id: data.id,
      title,
      icon: data.icon,
      accentColor,
      studentVisibility: data.studentVisibility,
    };
    if (data.headingSize != null) normalized.headingSize = data.headingSize;
    if (hasText) {
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      if (!text) throw new Error('MarkdownCard requires non-empty title and text values.');
      if (data.layout != null) throw new Error('MarkdownCard layout is supported only with sections.');
      return { ...normalized, text };
    }

    if (!Array.isArray(data.sections) || data.sections.length < 1 || data.sections.length > 3) {
      throw new Error('MarkdownCard requires between 1 and 3 sections.');
    }
    if (!LAYOUTS.has(data.layout)) throw new Error('MarkdownCard requires a supported layout with sections.');
    const sectionIds = new Set();
    const sections = data.sections.map((section) => {
      const id = typeof section?.id === 'string' ? section.id.trim() : '';
      const sectionTitle = normalizeTitle(section?.title);
      const text = typeof section?.text === 'string' ? section.text.trim() : '';
      if (!KEBAB_CASE.test(id)) throw new Error('MarkdownCard section requires a kebab-case id.');
      if (sectionIds.has(id)) throw new Error('MarkdownCard section ids must be unique.');
      if (!text) throw new Error('MarkdownCard sections require non-empty text values.');
      sectionIds.add(id);
      return { id, title: sectionTitle, text };
    });
    return { ...normalized, layout: data.layout, sections };
  }

  function shouldRenderMarkdownCard(studentVisibility, viewerRole, studentVisible) {
    const role = viewerRole || 'teacher';
    if (!STUDENT_VISIBILITIES.has(studentVisibility)) {
      throw new Error('MarkdownCard requires a supported studentVisibility.');
    }
    if (!VIEWER_ROLES.has(role)) throw new Error('MarkdownCard requires a supported viewer role.');
    if (role === 'teacher') return true;
    if (studentVisibility === 'teacherOnly') return false;
    return studentVisibility === 'always' || Boolean(studentVisible);
  }

  function createSvg(documentRef, shapes) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = documentRef.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    shapes.forEach(([tag, attributes]) => {
      const shape = documentRef.createElementNS(namespace, tag);
      Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, value));
      svg.append(shape);
    });
    return svg;
  }

  function createIcon(documentRef, name) {
    if (name === 'book') {
      return createSvg(documentRef, [
        ['path', { d: 'M4 5.2c2.9 0 5.8.6 8 2.1v12c-2.2-1.5-5.1-2.1-8-2.1z' }],
        ['path', { d: 'M20 5.2c-2.9 0-5.8.6-8 2.1v12c2.2-1.5 5.1-2.1 8-2.1z' }],
      ]);
    }
    if (name === 'check' || name === 'key') {
      return createSvg(documentRef, [
        ['circle', { cx: '12', cy: '12', r: '9' }],
        ['path', { d: 'm8.2 12.1 2.4 2.4 5.4-5.5' }],
      ]);
    }
    if (name === 'bulb') {
      return createSvg(documentRef, [
        ['path', { d: 'M9 17h6m-5 3h4m-7.2-8.6A5.3 5.3 0 1 1 17.2 13c-.8.8-1.5 1.7-1.7 2.8h-7C8.3 14 7.5 13.3 6.8 12.5a5.3 5.3 0 0 1 0-1.1Z' }],
      ]);
    }
    if (name === 'pencil') {
      return createSvg(documentRef, [
        ['path', { d: 'm13.2 5.2 5.6 5.6' }],
        ['path', { d: 'M4 20.1 5.7 14.4 16.2 3.9a2 2 0 0 1 2.8 0l1.1 1.1a2 2 0 0 1 0 2.8L9.6 18.3z' }],
        ['path', { d: 'M4 20.1 8.4 18.8' }],
      ]);
    }
    if (name === 'lifeRing') {
      return createSvg(documentRef, [
        ['circle', { cx: '12', cy: '12', r: '9' }],
        ['circle', { cx: '12', cy: '12', r: '3.8' }],
        ['path', { d: 'M9.3 9.3 5.7 5.7' }],
        ['path', { d: 'm14.7 9.3 3.6-3.6' }],
        ['path', { d: 'm14.7 14.7 3.6 3.6' }],
        ['path', { d: 'M9.3 14.7 5.7 18.3' }],
      ]);
    }
    if (name === 'trophy') {
      return createSvg(documentRef, [
        ['path', { d: 'M8 4h8v5.2a4 4 0 0 1-8 0z' }],
        ['path', { d: 'M8 5.4H4.9a3.2 3.2 0 0 0 3.3 3.8' }],
        ['path', { d: 'M16 5.4h3.1a3.2 3.2 0 0 1-3.3 3.8' }],
        ['path', { d: 'M12 13.2v3.3' }],
        ['path', { d: 'M9.5 16.5h5' }],
        ['path', { d: 'M8.4 20h7.2' }],
      ]);
    }
    return createSvg(documentRef, [
      ['path', { d: 'M20 11.5a8 8 0 0 1-8.5 8L6 22l1.3-4A8 8 0 1 1 20 11.5Z' }],
      ['circle', { cx: '9', cy: '11', r: '.7' }],
      ['circle', { cx: '12', cy: '11', r: '.7' }],
      ['circle', { cx: '15', cy: '11', r: '.7' }],
    ]);
  }

  function createEyeIcon(documentRef) {
    return createSvg(documentRef, [
      ['path', { d: 'M2.7 12s3.4-6 9.3-6 9.3 6 9.3 6-3.4 6-9.3 6-9.3-6-9.3-6Z' }],
      ['circle', { cx: '12', cy: '12', r: '2.6' }],
    ]);
  }

  function renderMarkdownCard(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('MarkdownCard requires a document.');

    let current = normalizeMarkdownCard(data);
    const viewerRole = settings.viewerRole || 'teacher';
    let studentVisible = Boolean(settings.studentVisible);
    if (!shouldRenderMarkdownCard(current.studentVisibility, viewerRole, studentVisible)) return null;

    let editing = false;
    let saving = false;
    let initialSnapshot = '';
    let activeEditor = null;
    let sectionEditors = [];

    const card = doc.createElement('aside');
    card.className = 'markdown-card';
    card.dataset.componentId = current.id;
    card.dataset.icon = current.icon;
    card.dataset.studentVisibility = current.studentVisibility;
    card.dataset.headingSize = current.headingSize || 'default';
    card.style.setProperty('--markdown-card-accent', current.accentColor);

    const header = doc.createElement('div');
    header.className = 'markdown-card__header';
    const heading = doc.createElement('h2');
    heading.className = 'markdown-card__heading';
    const icon = doc.createElement('span');
    icon.className = 'markdown-card__icon';
    icon.append(createIcon(doc, current.icon));
    const title = doc.createElement('span');
    title.className = 'markdown-card__title';
    title.dataset.placeholder = 'Введите заголовок';
    const titleError = doc.createElement('span');
    titleError.className = 'markdown-card__title-error';
    titleError.textContent = 'Введите заголовок карточки.';
    titleError.hidden = true;
    heading.append(icon, title, titleError);

    const actions = doc.createElement('div');
    actions.className = 'markdown-card__actions';
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'markdown-card__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать карточку');

    const visibilityButton = doc.createElement('button');
    visibilityButton.type = 'button';
    visibilityButton.className = 'markdown-card__visibility';
    visibilityButton.append(createEyeIcon(doc));
    const visibilityLabel = doc.createElement('span');
    visibilityButton.append(visibilityLabel);

    function paintVisibility() {
      visibilityLabel.textContent = studentVisible ? 'Скрыть' : 'Показать';
      visibilityButton.setAttribute('aria-pressed', String(studentVisible));
      visibilityButton.setAttribute(
        'aria-label',
        studentVisible ? `Скрыть ${current.title} у ученика` : `Показать ${current.title} ученику`,
      );
    }

    visibilityButton.addEventListener('click', () => {
      const previous = studentVisible;
      studentVisible = !studentVisible;
      paintVisibility();
      if (typeof settings.onStudentVisibilityChange !== 'function') return;
      Promise.resolve(settings.onStudentVisibilityChange(studentVisible, current.id)).catch((error) => {
        studentVisible = previous;
        paintVisibility();
        if (typeof settings.onError === 'function') {
          settings.onError(error?.message || 'Не удалось изменить видимость карточки.');
        }
      });
    });

    const toolbar = doc.createElement('div');
    toolbar.className = 'markdown-card__toolbar';
    toolbar.hidden = true;
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Форматирование карточки');
    const formattingControls = [];
    [['B', 'Жирный', 'bold'], ['I', 'Курсив', 'italic'], ['• ≡', 'Маркированный список', 'insertUnorderedList'], ['1. ≡', 'Нумерованный список', 'insertOrderedList']]
      .forEach(([label, ariaLabel, command]) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'markdown-card__format';
        button.textContent = label;
        button.setAttribute('aria-label', ariaLabel);
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => {
          if (!editing || saving || !activeEditor) return;
          activeEditor.focus();
          if (typeof doc.execCommand === 'function') doc.execCommand(command, false, null);
          updateDirty();
        });
        formattingControls.push(button);
        toolbar.append(button);
      });
    (markdown.TEXT_SIZES || []).forEach((size) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'markdown-card__format markdown-card__format--size';
      button.textContent = size.toUpperCase();
      button.setAttribute('aria-label', `Размер текста ${size.toUpperCase()}`);
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        if (!editing || saving || !activeEditor) return;
        activeEditor.focus();
        markdown.applyTextSize(doc, size);
        updateDirty();
      });
      formattingControls.push(button);
      toolbar.append(button);
    });

    const content = doc.createElement('div');
    content.dataset.placeholder = 'Введите текст';

    const editorFooter = doc.createElement('div');
    editorFooter.className = 'markdown-card__editor-footer';
    editorFooter.hidden = true;
    const addSectionButton = doc.createElement('button');
    addSectionButton.type = 'button';
    addSectionButton.className = 'markdown-card__add-section';
    addSectionButton.textContent = '+ Добавить секцию';
    const footerActions = doc.createElement('div');
    footerActions.className = 'markdown-card__footer-actions';
    const cancelButton = doc.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'markdown-card__cancel';
    cancelButton.textContent = 'Отмена';
    const saveButton = doc.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'markdown-card__save';
    saveButton.textContent = 'Сохранить';
    footerActions.append(cancelButton, saveButton);
    editorFooter.append(addSectionButton, footerActions);

    function enableTextEditor(element, label, multiline) {
      element.contentEditable = 'true';
      element.setAttribute('role', 'textbox');
      element.setAttribute('aria-label', label);
      if (multiline) element.setAttribute('aria-multiline', 'true');
      if (element.dataset.markdownCardEditorBound === 'true') return;
      element.dataset.markdownCardEditorBound = 'true';
      element.addEventListener('focus', () => { activeEditor = multiline ? element : null; });
      element.addEventListener('input', () => { if (editing) updateDirty(); });
      element.addEventListener('paste', (event) => {
        if (!editing) return;
        event.preventDefault();
        const plainText = event.clipboardData?.getData('text/plain') || '';
        if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
      });
      if (!multiline) {
        element.addEventListener('keydown', (event) => {
          if (editing && event.key === 'Enter') event.preventDefault();
        });
      }
    }

    function sectionValues() {
      return sectionEditors.map(section => ({
        id: section.id,
        title: normalizeTitle(section.title.textContent),
        text: markdown.editorToMarkdown(section.body),
      }));
    }

    function freshSectionId(sections) {
      const ids = new Set(sections.map(section => section.id));
      let index = sections.length + 1;
      while (ids.has(`section-${index}`)) index += 1;
      return `section-${index}`;
    }

    function renderSections(sections, editable) {
      sectionEditors = [];
      content.replaceChildren();
      sections.forEach((section, index) => {
        const sectionElement = doc.createElement('section');
        sectionElement.className = 'markdown-card__section';
        sectionElement.dataset.sectionId = section.id;
        const sectionHeader = doc.createElement('div');
        sectionHeader.className = 'markdown-card__section-header';
        const sectionTitle = doc.createElement('h3');
        sectionTitle.className = 'markdown-card__section-title';
        sectionTitle.dataset.placeholder = 'Введите заголовок секции';
        sectionTitle.textContent = section.title;
        const sectionActions = doc.createElement('div');
        sectionActions.className = 'markdown-card__section-actions';
        const up = doc.createElement('button');
        up.type = 'button';
        up.textContent = '↑';
        up.setAttribute('aria-label', `Переместить секцию «${section.title || index + 1}» выше`);
        up.disabled = index === 0;
        const down = doc.createElement('button');
        down.type = 'button';
        down.textContent = '↓';
        down.setAttribute('aria-label', `Переместить секцию «${section.title || index + 1}» ниже`);
        down.disabled = index === sections.length - 1;
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'markdown-card__remove-section';
        remove.textContent = 'Удалить';
        remove.disabled = sections.length === 1;
        remove.setAttribute('aria-label', `Удалить секцию «${section.title || index + 1}»`);
        sectionActions.append(up, down, remove);
        sectionHeader.append(sectionTitle, sectionActions);

        const sectionBody = doc.createElement('div');
        sectionBody.className = 'markdown-card__section-body';
        sectionBody.dataset.placeholder = 'Введите текст секции';
        if (section.text) markdown.renderMarkdownInto(sectionBody, section.text, doc, 'markdown-card__spacer');
        const sectionError = doc.createElement('p');
        sectionError.className = 'markdown-card__section-error';
        sectionError.textContent = 'Заполните текст секции.';
        sectionError.hidden = true;
        sectionElement.append(sectionHeader, sectionBody, sectionError);
        content.append(sectionElement);

        const editor = { id: section.id, element: sectionElement, title: sectionTitle, body: sectionBody, error: sectionError };
        sectionEditors.push(editor);
        if (editable) {
          enableTextEditor(sectionTitle, `Заголовок секции ${index + 1}`, false);
          enableTextEditor(sectionBody, `Текст секции ${index + 1}`, true);
          up.addEventListener('click', () => moveSection(index, -1));
          down.addEventListener('click', () => moveSection(index, 1));
          remove.addEventListener('click', () => removeSection(index));
        }
      });
      addSectionButton.disabled = sections.length >= 3;
    }

    function moveSection(index, delta) {
      const sections = sectionValues();
      const target = index + delta;
      if (target < 0 || target >= sections.length) return;
      [sections[index], sections[target]] = [sections[target], sections[index]];
      renderSections(sections, true);
      updateDirty();
    }

    function removeSection(index) {
      const sections = sectionValues();
      if (sections.length === 1) return;
      sections.splice(index, 1);
      renderSections(sections, true);
      updateDirty();
    }

    function snapshot() {
      const value = { title: normalizeTitle(title.textContent) };
      if (Array.isArray(current.sections)) value.sections = sectionValues();
      else value.text = markdown.editorToMarkdown(content);
      return JSON.stringify(value);
    }

    function setDirty(dirty) {
      card.classList.toggle('markdown-card--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function updateDirty() { setDirty(snapshot() !== initialSnapshot); }

    function paint(value) {
      current = normalizeMarkdownCard({ ...current, ...value });
      title.textContent = current.title;
      card.classList.toggle('markdown-card--sectioned', Array.isArray(current.sections));
      card.dataset.layout = current.layout || '';
      if (Array.isArray(current.sections)) {
        content.className = `markdown-card__sections markdown-card__sections--${current.layout}`;
        renderSections(current.sections, false);
      } else {
        sectionEditors = [];
        content.className = 'markdown-card__body';
        markdown.renderMarkdownInto(content, current.text, doc, 'markdown-card__spacer');
      }
      if (current.studentVisibility === 'controlled') paintVisibility();
    }

    function clearValidation() {
      title.classList.remove('markdown-card__field--invalid');
      content.classList.remove('markdown-card__field--invalid');
      titleError.hidden = true;
      sectionEditors.forEach((section) => {
        section.element.classList.remove('markdown-card__section--invalid');
        section.error.hidden = true;
      });
    }

    function validateEditing() {
      clearValidation();
      let valid = true;
      if (!normalizeTitle(title.textContent)) {
        title.classList.add('markdown-card__field--invalid');
        titleError.hidden = false;
        valid = false;
      }
      if (Array.isArray(current.sections)) {
        sectionEditors.forEach((section) => {
          if (!markdown.editorToMarkdown(section.body)) {
            section.element.classList.add('markdown-card__section--invalid');
            section.error.hidden = false;
            valid = false;
          }
        });
      } else if (!markdown.editorToMarkdown(content)) {
        content.classList.add('markdown-card__field--invalid');
        valid = false;
      }
      return valid;
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      activeEditor = null;
      title.contentEditable = 'false';
      title.removeAttribute('role');
      title.removeAttribute('aria-label');
      content.contentEditable = 'false';
      content.removeAttribute('role');
      content.removeAttribute('aria-label');
      content.removeAttribute('aria-multiline');
      card.classList.remove('markdown-card--editing', 'markdown-card--saving');
      toolbar.hidden = true;
      editorFooter.hidden = true;
      editButton.hidden = false;
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать карточку');
      [...formattingControls, addSectionButton, cancelButton, saveButton].forEach(control => { control.disabled = false; });
      clearValidation();
      setDirty(false);
    }

    function enterEditMode() {
      if (editing) return;
      editing = true;
      card.classList.add('markdown-card--editing');
      toolbar.hidden = false;
      title.contentEditable = 'true';
      title.setAttribute('role', 'textbox');
      title.setAttribute('aria-label', 'Заголовок карточки');
      initialSnapshot = snapshot();
      if (Array.isArray(current.sections)) {
        renderSections(current.sections, true);
        editorFooter.hidden = false;
        editButton.hidden = true;
        sectionEditors[0]?.body.focus();
      } else {
        enableTextEditor(content, 'Текст карточки', true);
        editButton.textContent = '✓';
        editButton.setAttribute('aria-label', 'Сохранить карточку');
        activeEditor = content;
        content.focus();
      }
    }

    function cancelEditing() {
      if (!editing || saving) return;
      paint(current);
      leaveEditMode();
      editButton.focus();
    }

    async function saveEditing() {
      if (!editing || saving || !validateEditing()) return;
      let next;
      try {
        next = JSON.parse(snapshot());
        normalizeMarkdownCard({ ...current, ...next });
      } catch (_error) {
        if (typeof settings.onError === 'function') settings.onError('Проверьте содержимое карточки.');
        return;
      }
      saving = true;
      card.classList.add('markdown-card--saving');
      editButton.disabled = true;
      [...formattingControls, addSectionButton, cancelButton, saveButton].forEach(control => { control.disabled = true; });
      try {
        const saved = await settings.onSave(next, current.id);
        paint(saved || next);
        leaveEditMode();
      } catch (_error) {
        saving = false;
        card.classList.remove('markdown-card--saving');
        editButton.disabled = false;
        [...formattingControls, addSectionButton, cancelButton, saveButton].forEach(control => { control.disabled = false; });
        activeEditor?.focus();
      }
    }

    addSectionButton.addEventListener('click', () => {
      if (!editing || saving || !Array.isArray(current.sections)) return;
      const sections = sectionValues();
      if (sections.length >= 3) return;
      sections.push({ id: freshSectionId(sections), title: '', text: '' });
      renderSections(sections, true);
      updateDirty();
      sectionEditors.at(-1)?.title.focus();
    });
    cancelButton.addEventListener('click', cancelEditing);
    saveButton.addEventListener('click', saveEditing);
    editButton.addEventListener('click', () => editing ? saveEditing() : enterEditMode());
    enableTextEditor(title, 'Заголовок карточки', false);
    title.contentEditable = 'false';
    title.removeAttribute('role');
    title.removeAttribute('aria-label');
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      } else if (editing && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        saveEditing();
      }
    });

    if (viewerRole === 'teacher') {
      if (typeof settings.onSave === 'function') actions.append(editButton);
      if (current.studentVisibility === 'controlled') {
        paintVisibility();
        actions.append(visibilityButton);
      }
    }
    header.append(heading, actions);
    paint(current);
    card.append(header, toolbar, content, editorFooter);
    return card;
  }

  const api = { normalizeMarkdownCard, renderMarkdownCard, shouldRenderMarkdownCard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MarkdownCardComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
