(function initMarkdownCardComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('MarkdownCard requires SafeMarkdown.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const ICONS = new Set(['book', 'check', 'chat']);
  const STUDENT_VISIBILITIES = new Set(['always', 'controlled', 'teacherOnly']);
  const VIEWER_ROLES = new Set(['teacher', 'student']);

  function normalizeTitle(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function normalizeMarkdownCard(data) {
    if (!data || data.type !== 'markdownCard' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('MarkdownCard requires type "markdownCard" and a kebab-case id.');
    }
    const title = normalizeTitle(data.title);
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    const accentColor = typeof data.accentColor === 'string' ? data.accentColor.trim().toUpperCase() : '';
    if (!title || !text) throw new Error('MarkdownCard requires non-empty title and text values.');
    if (!ICONS.has(data.icon)) throw new Error('MarkdownCard requires a supported icon.');
    if (!HEX_COLOR.test(accentColor)) throw new Error('MarkdownCard requires accentColor in #RRGGBB format.');
    if (!STUDENT_VISIBILITIES.has(data.studentVisibility)) {
      throw new Error('MarkdownCard requires a supported studentVisibility.');
    }
    return {
      type: 'markdownCard',
      id: data.id,
      title,
      text,
      icon: data.icon,
      accentColor,
      studentVisibility: data.studentVisibility,
    };
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
    if (name === 'check') {
      return createSvg(documentRef, [
        ['circle', { cx: '12', cy: '12', r: '9' }],
        ['path', { d: 'm8.2 12.1 2.4 2.4 5.4-5.5' }],
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

    const card = doc.createElement('aside');
    card.className = 'markdown-card';
    card.dataset.componentId = current.id;
    card.dataset.icon = current.icon;
    card.dataset.studentVisibility = current.studentVisibility;
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
    heading.append(icon, title);

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
          if (!editing || saving) return;
          content.focus();
          if (typeof doc.execCommand === 'function') doc.execCommand(command, false, null);
          updateDirty();
        });
        formattingControls.push(button);
        toolbar.append(button);
      });

    const content = doc.createElement('div');
    content.className = 'markdown-card__body';
    content.dataset.placeholder = 'Введите текст';

    function snapshot() {
      return JSON.stringify({
        title: normalizeTitle(title.textContent),
        text: markdown.editorToMarkdown(content),
      });
    }

    function setDirty(dirty) {
      card.classList.toggle('markdown-card--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function updateDirty() { setDirty(snapshot() !== initialSnapshot); }

    function paint(value) {
      current = normalizeMarkdownCard({ ...current, ...value });
      title.textContent = current.title;
      markdown.renderMarkdownInto(content, current.text, doc, 'markdown-card__spacer');
      if (current.studentVisibility === 'controlled') paintVisibility();
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      title.contentEditable = 'false';
      content.contentEditable = 'false';
      [title, content].forEach(element => {
        element.removeAttribute('role');
        element.removeAttribute('aria-label');
      });
      card.classList.remove('markdown-card--editing', 'markdown-card--saving');
      toolbar.hidden = true;
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать карточку');
      formattingControls.forEach(control => { control.disabled = false; });
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
      content.contentEditable = 'true';
      content.setAttribute('role', 'textbox');
      content.setAttribute('aria-label', 'Текст карточки');
      content.setAttribute('aria-multiline', 'true');
      initialSnapshot = snapshot();
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить карточку');
      content.focus();
    }

    function cancelEditing() {
      if (!editing || saving) return;
      paint(current);
      leaveEditMode();
      editButton.focus();
    }

    async function saveEditing() {
      if (!editing || saving) return;
      let next;
      try {
        next = JSON.parse(snapshot());
        normalizeMarkdownCard({ ...current, ...next });
      } catch (_error) {
        if (typeof settings.onError === 'function') settings.onError('Заголовок и текст карточки не могут быть пустыми.');
        return;
      }
      saving = true;
      card.classList.add('markdown-card--saving');
      editButton.disabled = true;
      formattingControls.forEach(control => { control.disabled = true; });
      try {
        const saved = await settings.onSave(next, current.id);
        paint(saved || next);
        leaveEditMode();
      } catch (_error) {
        saving = false;
        card.classList.remove('markdown-card--saving');
        editButton.disabled = false;
        formattingControls.forEach(control => { control.disabled = false; });
        content.focus();
      }
    }

    editButton.addEventListener('click', () => editing ? saveEditing() : enterEditMode());
    [title, content].forEach((element) => {
      element.addEventListener('input', () => { if (editing) updateDirty(); });
      element.addEventListener('paste', (event) => {
        if (!editing) return;
        event.preventDefault();
        const plainText = event.clipboardData?.getData('text/plain') || '';
        if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
      });
    });
    title.addEventListener('keydown', (event) => {
      if (editing && event.key === 'Enter') event.preventDefault();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
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
    card.append(header, toolbar, content);
    return card;
  }

  const api = { normalizeMarkdownCard, renderMarkdownCard, shouldRenderMarkdownCard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MarkdownCardComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
