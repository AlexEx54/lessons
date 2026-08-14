(function initSuggestedAnswersComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('SuggestedAnswers requires SafeMarkdown.');

  const VIEWER_ROLES = new Set(['teacher', 'student']);
  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

  function normalizeSuggestedAnswers(data) {
    if (!data || data.type !== 'suggestedAnswers' || !KEBAB_CASE.test(data.id)) {
      throw new Error('SuggestedAnswers requires type "suggestedAnswers" and a kebab-case id.');
    }
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('SuggestedAnswers requires a non-empty text value.');
    return { type: 'suggestedAnswers', id: data.id, text };
  }

  function shouldRenderSuggestedAnswers(viewerRole, studentVisible) {
    const role = viewerRole || 'teacher';
    if (!VIEWER_ROLES.has(role)) throw new Error('SuggestedAnswers requires a supported viewer role.');
    return role === 'teacher' || Boolean(studentVisible);
  }

  function createSvg(documentRef, paths, className) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = documentRef.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (className) svg.setAttribute('class', className);
    paths.forEach((attributes) => {
      const path = documentRef.createElementNS(namespace, attributes.tag || 'path');
      Object.entries(attributes).forEach(([name, value]) => {
        if (name !== 'tag') path.setAttribute(name, value);
      });
      svg.append(path);
    });
    return svg;
  }

  function createCheckIcon(documentRef) {
    return createSvg(documentRef, [
      { tag: 'circle', cx: '12', cy: '12', r: '9' },
      { d: 'm8.2 12.1 2.4 2.4 5.4-5.5' },
    ]);
  }

  function createEyeIcon(documentRef) {
    return createSvg(documentRef, [
      { d: 'M2.7 12s3.4-6 9.3-6 9.3 6 9.3 6-3.4 6-9.3 6-9.3-6-9.3-6Z' },
      { tag: 'circle', cx: '12', cy: '12', r: '2.6' },
    ]);
  }

  function renderSuggestedAnswers(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('SuggestedAnswers requires a document.');

    const normalized = normalizeSuggestedAnswers(data);
    const viewerRole = settings.viewerRole || 'teacher';
    let studentVisible = Boolean(settings.studentVisible);
    if (!shouldRenderSuggestedAnswers(viewerRole, studentVisible)) return null;

    let currentText = normalized.text;
    let editing = false;
    let saving = false;
    let initialEditorText = '';

    const panel = doc.createElement('aside');
    panel.className = 'suggested-answers';
    panel.dataset.componentId = normalized.id;

    const header = doc.createElement('div');
    header.className = 'suggested-answers__header';
    const heading = doc.createElement('h2');
    heading.className = 'suggested-answers__title';
    const icon = doc.createElement('span');
    icon.className = 'suggested-answers__icon';
    icon.append(createCheckIcon(doc));
    const title = doc.createElement('span');
    title.textContent = 'Suggested answers';
    heading.append(icon, title);

    const actions = doc.createElement('div');
    actions.className = 'suggested-answers__actions';

    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'suggested-answers__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать Suggested answers');

    const visibilityButton = doc.createElement('button');
    visibilityButton.type = 'button';
    visibilityButton.className = 'suggested-answers__visibility';
    visibilityButton.append(createEyeIcon(doc));
    const visibilityLabel = doc.createElement('span');
    visibilityButton.append(visibilityLabel);

    function paintVisibility() {
      visibilityLabel.textContent = studentVisible ? 'Скрыть' : 'Показать';
      visibilityButton.setAttribute('aria-pressed', String(studentVisible));
      visibilityButton.setAttribute(
        'aria-label',
        studentVisible ? 'Скрыть Suggested answers у ученика' : 'Показать Suggested answers ученику',
      );
    }

    visibilityButton.addEventListener('click', () => {
      const previous = studentVisible;
      studentVisible = !studentVisible;
      paintVisibility();
      if (typeof settings.onStudentVisibilityChange !== 'function') return;
      Promise.resolve(settings.onStudentVisibilityChange(studentVisible, normalized.id)).catch((error) => {
        studentVisible = previous;
        paintVisibility();
        if (typeof settings.onError === 'function') {
          settings.onError(error?.message || 'Не удалось изменить видимость Suggested answers.');
        }
      });
    });

    const toolbar = doc.createElement('div');
    toolbar.className = 'suggested-answers__toolbar';
    toolbar.hidden = true;
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Форматирование Suggested answers');
    const formattingControls = [];
    [['B', 'Жирный', 'bold'], ['I', 'Курсив', 'italic'], ['• ≡', 'Маркированный список', 'insertUnorderedList'], ['1. ≡', 'Нумерованный список', 'insertOrderedList']]
      .forEach(([label, ariaLabel, command]) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'suggested-answers__format';
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
    content.className = 'suggested-answers__body';

    function paint(text) {
      currentText = normalizeSuggestedAnswers({ ...normalized, text }).text;
      markdown.renderMarkdownInto(content, currentText, doc, 'suggested-answers__spacer');
    }

    function setDirty(dirty) {
      panel.classList.toggle('suggested-answers--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, normalized.id);
    }

    function updateDirty() {
      setDirty(markdown.editorToMarkdown(content) !== initialEditorText);
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      content.contentEditable = 'false';
      content.removeAttribute('role');
      content.removeAttribute('aria-label');
      panel.classList.remove('suggested-answers--editing', 'suggested-answers--saving');
      toolbar.hidden = true;
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать Suggested answers');
      formattingControls.forEach(control => { control.disabled = false; });
      setDirty(false);
    }

    function enterEditMode() {
      if (editing) return;
      editing = true;
      panel.classList.add('suggested-answers--editing');
      toolbar.hidden = false;
      content.contentEditable = 'true';
      content.setAttribute('role', 'textbox');
      content.setAttribute('aria-label', 'Текст Suggested answers');
      content.setAttribute('aria-multiline', 'true');
      initialEditorText = markdown.editorToMarkdown(content);
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить Suggested answers');
      content.focus();
    }

    function cancelEditing() {
      if (!editing || saving) return;
      paint(currentText);
      leaveEditMode();
      editButton.focus();
    }

    async function saveEditing() {
      if (!editing || saving) return;
      const nextText = markdown.editorToMarkdown(content);
      try {
        normalizeSuggestedAnswers({ ...normalized, text: nextText });
      } catch (_error) {
        if (typeof settings.onError === 'function') settings.onError('Suggested answers не может быть пустым.');
        return;
      }
      saving = true;
      panel.classList.add('suggested-answers--saving');
      editButton.disabled = true;
      formattingControls.forEach(control => { control.disabled = true; });
      try {
        const saved = await settings.onSave(nextText, normalized.id);
        paint(saved?.text || nextText);
        leaveEditMode();
      } catch (_error) {
        saving = false;
        panel.classList.remove('suggested-answers--saving');
        editButton.disabled = false;
        formattingControls.forEach(control => { control.disabled = false; });
        content.focus();
      }
    }

    editButton.addEventListener('click', () => editing ? saveEditing() : enterEditMode());
    content.addEventListener('input', () => { if (editing) updateDirty(); });
    content.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });
    content.addEventListener('paste', (event) => {
      if (!editing) return;
      event.preventDefault();
      const plainText = event.clipboardData?.getData('text/plain') || '';
      if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
    });

    if (viewerRole === 'teacher') {
      if (typeof settings.onSave === 'function') actions.append(editButton);
      paintVisibility();
      actions.append(visibilityButton);
    }
    header.append(heading, actions);
    paint(currentText);
    panel.append(header, toolbar, content);
    return panel;
  }

  const api = {
    normalizeSuggestedAnswers,
    renderSuggestedAnswers,
    shouldRenderSuggestedAnswers,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SuggestedAnswersComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
