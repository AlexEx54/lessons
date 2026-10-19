(function initTeacherNoteComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  const blockComponent = root.TeacherNoteBlockComponent
    || (typeof require === 'function' ? require('./teacher-note-block.js') : null);
  if (!markdown) throw new Error('TeacherNote requires SafeMarkdown.');
  if (!blockComponent) throw new Error('TeacherNote requires TeacherNoteBlock.');
  const {
    editorToMarkdown,
    parseInlineMarkdown,
    parseMarkdown: parseTeacherNoteMarkdown,
    serializeMarkdownBlocks: serializeTeacherNoteBlocks,
  } = markdown;
  const {
    COLORS, normalizeTeacherNoteBlock, renderTeacherNoteBlock, teacherNoteBlockProblem,
  } = blockComponent;
  const KEBAB_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const renderMarkdownInto = (container, value, documentRef) => (
    markdown.renderMarkdownInto(container, value, documentRef, 'teacher-note__spacer', { linkify: true })
  );

  function normalizeTeacherNote(data) {
    if (!data || typeof data !== 'object') throw new Error('TeacherNote requires data.');
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (data.blocks != null && !Array.isArray(data.blocks)) {
      throw new Error('TeacherNote blocks must be an array.');
    }
    const blocks = (data.blocks || []).map(normalizeTeacherNoteBlock);
    const blockIds = new Set();
    blocks.forEach((block) => {
      if (blockIds.has(block.id)) throw new Error('TeacherNote block ids must be unique.');
      blockIds.add(block.id);
    });
    if (!text && blocks.length === 0) {
      throw new Error('TeacherNote requires text or at least one block.');
    }
    return { text, blocks };
  }

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

  function createChevronIcon(documentRef) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = documentRef.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = documentRef.createElementNS(namespace, 'path');
    path.setAttribute('d', 'm6 15 6-6 6 6');
    svg.append(path);
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
    const initial = normalizeTeacherNote(data);
    let current = initial;
    let workingBlocks = [...initial.blocks];
    // Sub-blocks added in the open editor: their cards hold what the admin typed.
    let freshCards = [];
    let editing = false;
    let saving = false;
    let initialSnapshot = '';
    let ownDirty = false;
    // Sub-blocks whose own editor holds unsaved changes: they count as the note's.
    const dirtyBlocks = new Set();

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
    const blocks = doc.createElement('div');
    blocks.className = 'teacher-note__blocks';
    const addBlockButton = doc.createElement('button');
    addBlockButton.type = 'button';
    addBlockButton.className = 'teacher-note__add-block';
    addBlockButton.textContent = '+ Подблок';
    addBlockButton.hidden = true;
    const customText = doc.createElement('div');
    customText.className = 'teacher-note__text';
    customText.dataset.placeholder = 'Добавьте собственную заметку…';
    content.append(blocks, addBlockButton, customText);

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
        customText.focus();
        if (typeof doc.execCommand === 'function') doc.execCommand(command, false, null);
        updateDirty();
      });
      toolbar.append(control);
      return control;
    }

    const formattingControls = [
      formattingButton('B', 'Жирный', 'bold', 'teacher-note__format--bold'),
      formattingButton('I', 'Курсив', 'italic', 'teacher-note__format--italic'),
      formattingButton('• ≡', 'Маркированный список', 'insertUnorderedList'),
      formattingButton('1. ≡', 'Нумерованный список', 'insertOrderedList'),
    ];
    (markdown.TEXT_SIZES || []).forEach((size) => {
      const control = doc.createElement('button');
      control.type = 'button';
      control.className = 'teacher-note__format teacher-note__format--size';
      control.textContent = size.toUpperCase();
      control.title = `Размер текста ${size.toUpperCase()}`;
      control.setAttribute('aria-label', `Размер текста ${size.toUpperCase()}`);
      control.addEventListener('mousedown', event => event.preventDefault());
      control.addEventListener('click', () => {
        if (!editing || saving) return;
        customText.focus();
        markdown.applyTextSize(doc, size);
        updateDirty();
      });
      toolbar.append(control);
      formattingControls.push(control);
    });

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'teacher-note__toggle';
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-controls', content.id);
    const buttonLabel = doc.createElement('span');
    buttonLabel.textContent = 'Скрыть';
    const chevron = doc.createElement('span');
    chevron.className = 'teacher-note__chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.append(createChevronIcon(doc));
    button.append(buttonLabel, chevron);
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      buttonLabel.textContent = expanded ? 'Показать' : 'Скрыть';
      content.hidden = expanded;
      note.classList.toggle('teacher-note--collapsed', expanded);
    });

    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'teacher-note__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать Teacher’s Notes');

    function snapshot() {
      return JSON.stringify({
        text: editorToMarkdown(customText),
        retainedBlockIds: workingBlocks.map(block => block.id),
        addedBlocks: freshCards.map(card => card.readValue()),
      });
    }

    function reportDirty() {
      const dirty = ownDirty || dirtyBlocks.size > 0;
      note.classList.toggle('teacher-note--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, data.id);
    }

    function setDirty(dirty) {
      ownDirty = dirty;
      reportDirty();
    }

    // The note's own editor paints the sub-blocks again: an open edit of one would be lost.
    function setBlockDirty(dirty, blockId) {
      if (dirty) dirtyBlocks.add(blockId);
      else dirtyBlocks.delete(blockId);
      editButton.disabled = dirtyBlocks.size > 0;
      editButton.title = dirtyBlocks.size > 0 ? 'Сначала сохраните или отмените правку подблока' : '';
      reportDirty();
    }

    function updateDirty() { setDirty(snapshot() !== initialSnapshot); }

    function paintBlocks() {
      const rendered = workingBlocks.map(block => renderTeacherNoteBlock(block, {
        removable: editing,
        editable: !editing && typeof settings.onSave === 'function',
        onSave: async (nextBlock) => {
          const saved = await settings.onSave({ blocks: [nextBlock] }, data.id);
          // The note's own editor starts from `current`, and its cancel repaints it.
          current = normalizeTeacherNote(saved);
          return current.blocks.find(item => item.id === nextBlock.id) || nextBlock;
        },
        onDirtyChange: setBlockDirty,
        onError: settings.onError,
        onRemove: removeBlock,
      }, doc));
      blocks.replaceChildren(...rendered, ...freshCards);
      blocks.hidden = blocks.childNodes.length === 0;
    }

    function removeBlock(blockId) {
      if (!editing || saving) return;
      workingBlocks = workingBlocks.filter(item => item.id !== blockId);
      freshCards = freshCards.filter(card => card.dataset.blockId !== blockId);
      paintBlocks();
      updateDirty();
      customText.focus();
    }

    function freshBlockId() {
      const prefix = KEBAB_ID.test(data.id) ? data.id : 'note';
      const taken = new Set([...current.blocks.map(block => block.id), ...freshCards.map(card => card.dataset.blockId)]);
      let index = current.blocks.length + freshCards.length + 1;
      while (taken.has(`${prefix}-block-${index}`)) index += 1;
      return `${prefix}-block-${index}`;
    }

    function addBlock() {
      if (!editing || saving) return;
      const card = renderTeacherNoteBlock({
        type: 'teacherNoteBlock', id: freshBlockId(), title: '', titleColor: COLORS[0][0], icon: 'chat', text: '',
      }, { fresh: true, removable: true, onRemove: removeBlock, onDirtyChange: updateDirty }, doc);
      freshCards.push(card);
      paintBlocks();
      updateDirty();
      card.querySelector('.teacher-note-block__title-input').focus();
    }

    function paint(value) {
      current = normalizeTeacherNote(value);
      workingBlocks = [...current.blocks];
      freshCards = [];
      paintBlocks();
      if (current.text) renderMarkdownInto(customText, current.text, doc);
      else customText.replaceChildren();
      customText.hidden = !editing && !current.text;
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      customText.contentEditable = 'false';
      customText.removeAttribute('role');
      customText.removeAttribute('aria-label');
      note.classList.remove('teacher-note--editing', 'teacher-note--saving');
      toolbar.hidden = true;
      addBlockButton.hidden = true;
      button.hidden = false;
      editButton.textContent = '✎';
      editButton.setAttribute('aria-label', 'Редактировать Teacher’s Notes');
      editButton.disabled = false;
      formattingControls.forEach(control => { control.disabled = false; });
      addBlockButton.disabled = false;
      freshCards = [];
      paintBlocks();
      customText.hidden = !current.text;
      setDirty(false);
    }

    function cancelEditing() {
      if (!editing || saving) return;
      paint(current);
      leaveEditMode();
      editButton.focus();
    }

    function enterEditMode() {
      if (editing) return;
      if (content.hidden) button.click();
      editing = true;
      workingBlocks = [...current.blocks];
      freshCards = [];
      note.classList.add('teacher-note--editing');
      toolbar.hidden = false;
      addBlockButton.hidden = false;
      button.hidden = true;
      customText.hidden = false;
      customText.contentEditable = 'true';
      customText.setAttribute('role', 'textbox');
      customText.setAttribute('aria-label', 'Собственный текст Teacher’s Notes');
      customText.setAttribute('aria-multiline', 'true');
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить Teacher’s Notes');
      paintBlocks();
      initialSnapshot = snapshot();
      customText.focus();
    }

    async function saveEditing() {
      if (!editing || saving) return;
      const nextText = editorToMarkdown(customText);
      const addedBlocks = freshCards.map(card => card.readValue());
      const problem = addedBlocks.map(teacherNoteBlockProblem).find(Boolean)
        || (!nextText && workingBlocks.length + addedBlocks.length === 0
          && 'Teacher’s Notes должна содержать текст или хотя бы один подблок.');
      if (problem) {
        if (typeof settings.onError === 'function') settings.onError(problem);
        return;
      }
      const changes = { text: nextText || null, retainedBlockIds: workingBlocks.map(block => block.id) };
      if (addedBlocks.length > 0) changes.addedBlocks = addedBlocks;
      saving = true;
      note.classList.add('teacher-note--saving');
      editButton.disabled = true;
      addBlockButton.disabled = true;
      formattingControls.forEach(control => { control.disabled = true; });
      try {
        const saved = await settings.onSave(changes, data.id);
        const fallback = {
          text: nextText,
          blocks: [...workingBlocks, ...addedBlocks.map(block => ({ type: 'teacherNoteBlock', ...block }))],
        };
        paint(saved || fallback);
        leaveEditMode();
      } catch (_error) {
        saving = false;
        note.classList.remove('teacher-note--saving');
        editButton.disabled = false;
        addBlockButton.disabled = false;
        formattingControls.forEach(control => { control.disabled = false; });
        customText.focus();
      }
    }

    editButton.addEventListener('click', () => editing ? saveEditing() : enterEditMode());
    addBlockButton.addEventListener('click', addBlock);
    customText.addEventListener('input', () => { if (editing) updateDirty(); });
    note.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });
    customText.addEventListener('paste', (event) => {
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
    paint(initial);
    return note;
  }

  const api = {
    editorToMarkdown,
    normalizeTeacherNote,
    parseInlineMarkdown,
    parseTeacherNoteMarkdown,
    renderTeacherNote,
    serializeTeacherNoteBlocks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TeacherNoteComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
