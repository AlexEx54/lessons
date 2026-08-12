(function initTeacherNoteComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('TeacherNote requires SafeMarkdown.');
  const {
    editorToMarkdown,
    parseInlineMarkdown,
    parseMarkdown: parseTeacherNoteMarkdown,
    serializeMarkdownBlocks: serializeTeacherNoteBlocks,
  } = markdown;
  const renderMarkdownInto = (container, value, documentRef) => (
    markdown.renderMarkdownInto(container, value, documentRef, 'teacher-note__spacer')
  );

  function createIcon(documentRef) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = documentRef.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    ['M9 18h6', 'M10 22h4', 'M8.4 15.2A7 7 0 1 1 15.6 15.2C14.7 16 14.3 17 14.2 18h-4.4c-.1-1-.5-2-1.4-2.8Z']
      .forEach((d) => {
        const path = documentRef.createElementNS(namespace, 'path');
        path.setAttribute('d', d);
        svg.append(path);
      });
    return svg;
  }

  function renderTeacherNote(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('TeacherNote requires a document.');
    if (!data || typeof data.text !== 'string' || !data.text.trim()) {
      throw new Error('TeacherNote requires a non-empty text value.');
    }

    const note = doc.createElement('aside');
    note.className = 'teacher-note';

    const header = doc.createElement('div');
    header.className = 'teacher-note__header';

    const heading = doc.createElement('h2');
    heading.className = 'teacher-note__title';
    const icon = doc.createElement('span');
    icon.className = 'teacher-note__icon';
    icon.append(createIcon(doc));
    const title = doc.createElement('span');
    title.textContent = 'Teacher’s Notes';
    heading.append(icon, title);

    const content = doc.createElement('div');
    content.className = 'teacher-note__body';
    const safeId = String(data.id || 'note').replace(/[^a-zA-Z0-9_-]/g, '-');
    content.id = `teacher-note-${safeId}`;
    let currentText = data.text;
    let editing = false;
    let saving = false;
    let initialEditorText = '';
    renderMarkdownInto(content, currentText, doc);

    const toolbar = doc.createElement('div');
    toolbar.className = 'teacher-note__toolbar';
    toolbar.hidden = true;
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Форматирование Teacher’s Notes');

    function formattingButton(label, titleText, command, className = '') {
      const control = doc.createElement('button');
      control.type = 'button';
      control.className = `teacher-note__format ${className}`.trim();
      control.textContent = label;
      control.title = titleText;
      control.setAttribute('aria-label', titleText);
      control.addEventListener('mousedown', event => event.preventDefault());
      control.addEventListener('click', () => {
        if (!editing || saving) return;
        if (typeof doc.execCommand === 'function') doc.execCommand(command, false, null);
        setDirty(editorToMarkdown(content) !== initialEditorText);
      });
      toolbar.append(control);
      return control;
    }

    const formattingControls = [
      formattingButton('B', 'Жирный', 'bold', 'teacher-note__format--bold'),
      formattingButton('I', 'Курсив', 'italic', 'teacher-note__format--italic'),
      formattingButton('• ≡', 'Маркированный список', 'insertUnorderedList'),
    ];

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'teacher-note__toggle';
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', content.id);
    const buttonLabel = doc.createElement('span');
    buttonLabel.textContent = 'Скрыть';
    const chevron = doc.createElement('span');
    chevron.className = 'teacher-note__chevron';
    chevron.textContent = '⌃';
    chevron.setAttribute('aria-hidden', 'true');
    button.append(buttonLabel, chevron);
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      buttonLabel.textContent = expanded ? 'Показать' : 'Скрыть';
      chevron.textContent = expanded ? '⌄' : '⌃';
      content.hidden = expanded;
      note.classList.toggle('teacher-note--collapsed', expanded);
    });

    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'teacher-note__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать Teacher’s Notes');

    function setDirty(dirty) {
      note.classList.toggle('teacher-note--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, data.id);
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      content.contentEditable = 'false';
      content.removeAttribute('role');
      content.removeAttribute('aria-label');
      note.classList.remove('teacher-note--editing', 'teacher-note--saving');
      toolbar.hidden = true;
      button.hidden = false;
      editButton.textContent = '✎';
      editButton.setAttribute('aria-label', 'Редактировать Teacher’s Notes');
      editButton.disabled = false;
      formattingControls.forEach(control => { control.disabled = false; });
      setDirty(false);
    }

    function cancelEditing() {
      if (!editing || saving) return;
      renderMarkdownInto(content, currentText, doc);
      leaveEditMode();
      editButton.focus();
    }

    function enterEditMode() {
      if (editing) return;
      if (content.hidden) button.click();
      editing = true;
      note.classList.add('teacher-note--editing');
      toolbar.hidden = false;
      button.hidden = true;
      content.contentEditable = 'true';
      content.setAttribute('role', 'textbox');
      content.setAttribute('aria-label', 'Содержимое Teacher’s Notes');
      content.setAttribute('aria-multiline', 'true');
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить Teacher’s Notes');
      initialEditorText = editorToMarkdown(content);
      content.focus();
    }

    async function saveEditing() {
      if (!editing || saving) return;
      const nextText = editorToMarkdown(content);
      if (!nextText) {
        if (typeof settings.onError === 'function') {
          settings.onError('Содержимое Teacher’s Notes не может быть пустым.');
        }
        return;
      }
      saving = true;
      note.classList.add('teacher-note--saving');
      editButton.disabled = true;
      formattingControls.forEach(control => { control.disabled = true; });
      try {
        await settings.onSave(nextText, data.id);
        currentText = nextText;
        renderMarkdownInto(content, currentText, doc);
        leaveEditMode();
      } catch (_error) {
        saving = false;
        note.classList.remove('teacher-note--saving');
        editButton.disabled = false;
        formattingControls.forEach(control => { control.disabled = false; });
        content.focus();
      }
    }

    editButton.addEventListener('click', () => {
      if (editing) saveEditing();
      else enterEditMode();
    });

    content.addEventListener('input', () => {
      if (editing) setDirty(editorToMarkdown(content) !== initialEditorText);
    });
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

    const actions = doc.createElement('div');
    actions.className = 'teacher-note__actions';
    if (typeof settings.onSave === 'function') actions.append(editButton);
    actions.append(button);

    header.append(heading, actions);
    note.append(header, toolbar, content);
    return note;
  }

  const api = {
    editorToMarkdown,
    parseInlineMarkdown,
    parseTeacherNoteMarkdown,
    renderTeacherNote,
    serializeTeacherNoteBlocks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TeacherNoteComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
