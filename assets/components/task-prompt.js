(function initTaskPromptComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('TaskPrompt requires SafeMarkdown.');
  const VARIANTS = new Set(['yourTurn', 'followUp']);

  function normalizeTitle(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function normalizeTaskPrompt(data) {
    if (!data || !VARIANTS.has(data.variant)) throw new Error('TaskPrompt requires a supported variant.');
    const title = normalizeTitle(data.title);
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!title || !text) throw new Error('TaskPrompt requires non-empty title and text values.');
    let support = null;
    if (data.support != null) {
      const supportTitle = normalizeTitle(data.support.title);
      const supportText = typeof data.support.text === 'string' ? data.support.text.trim() : '';
      if (!supportTitle || !supportText) throw new Error('TaskPrompt support requires non-empty title and text values.');
      support = { title: supportTitle, text: supportText };
    }
    return { title, text, support };
  }

  function createIcon(documentRef) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = documentRef.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const bubble = documentRef.createElementNS(namespace, 'path');
    bubble.setAttribute('d', 'M20 11.5a8 8 0 0 1-8.5 8L6 22l1.3-4A8 8 0 1 1 20 11.5Z');
    svg.append(bubble);
    [9, 12, 15].forEach((cx) => {
      const dot = documentRef.createElementNS(namespace, 'circle');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', '11');
      dot.setAttribute('r', '.7');
      svg.append(dot);
    });
    return svg;
  }

  function renderTaskPrompt(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('TaskPrompt requires a document.');
    const initial = normalizeTaskPrompt(data);
    let current = initial;
    let editing = false;
    let saving = false;
    let initialSnapshot = '';
    let activeEditor = null;

    const prompt = doc.createElement('aside');
    prompt.className = `task-prompt task-prompt--${data.variant === 'yourTurn' ? 'your-turn' : 'follow-up'}`;

    const header = doc.createElement('div');
    header.className = 'task-prompt__header';
    const heading = doc.createElement('div');
    heading.className = 'task-prompt__heading';
    const icon = doc.createElement('span');
    icon.className = 'task-prompt__icon';
    icon.append(createIcon(doc));
    const title = doc.createElement('span');
    title.className = 'task-prompt__title';
    heading.append(icon, title);
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'task-prompt__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать блок задания');
    header.append(heading);
    if (typeof settings.onSave === 'function') header.append(editButton);

    const toolbar = doc.createElement('div');
    toolbar.className = 'task-prompt__toolbar';
    toolbar.hidden = true;
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Форматирование текста задания');
    const formattingControls = [];
    [['B', 'Жирный', 'bold'], ['I', 'Курсив', 'italic'], ['• ≡', 'Маркированный список', 'insertUnorderedList']]
      .forEach(([label, ariaLabel, command]) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'task-prompt__format';
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

    const body = doc.createElement('div');
    body.className = 'task-prompt__body';
    const mainText = doc.createElement('div');
    mainText.className = 'task-prompt__text';
    const support = doc.createElement('div');
    support.className = 'task-prompt__support';
    const supportHeader = doc.createElement('div');
    supportHeader.className = 'task-prompt__support-header';
    const supportTitle = doc.createElement('span');
    supportTitle.className = 'task-prompt__support-title';
    supportTitle.dataset.placeholder = 'Введите заголовок';
    const removeSupport = doc.createElement('button');
    removeSupport.type = 'button';
    removeSupport.className = 'task-prompt__remove-support';
    removeSupport.textContent = 'Удалить секцию';
    const supportText = doc.createElement('div');
    supportText.className = 'task-prompt__support-text';
    supportText.dataset.placeholder = 'Введите текст';
    supportHeader.append(supportTitle, removeSupport);
    support.append(supportHeader, supportText);
    const addSupport = doc.createElement('button');
    addSupport.type = 'button';
    addSupport.className = 'task-prompt__add-support';
    addSupport.textContent = '+ Добавить дополнительную секцию';
    addSupport.hidden = true;
    body.append(mainText, support, addSupport);

    function snapshot() {
      return JSON.stringify({
        title: title.textContent.trim(),
        text: markdown.editorToMarkdown(mainText),
        support: support.hidden ? null : {
          title: supportTitle.textContent.trim(),
          text: markdown.editorToMarkdown(supportText),
        },
      });
    }

    function setDirty(dirty) {
      prompt.classList.toggle('task-prompt--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, data.id);
    }
    function updateDirty() { setDirty(snapshot() !== initialSnapshot); }

    function enableEditor(element, label, supportsFormatting = true) {
      element.contentEditable = 'true';
      element.setAttribute('role', 'textbox');
      element.setAttribute('aria-label', label);
      element.addEventListener('focus', () => { activeEditor = supportsFormatting ? element : null; });
    }
    function disableEditor(element) {
      element.contentEditable = 'false';
      element.removeAttribute('role');
      element.removeAttribute('aria-label');
    }

    function paint(value) {
      current = normalizeTaskPrompt({ ...data, ...value });
      title.textContent = current.title;
      markdown.renderMarkdownInto(mainText, current.text, doc, 'task-prompt__spacer');
      support.hidden = !current.support;
      if (current.support) {
        supportTitle.textContent = current.support.title;
        markdown.renderMarkdownInto(supportText, current.support.text, doc, 'task-prompt__spacer');
      } else {
        supportTitle.textContent = '';
        supportText.replaceChildren();
      }
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      prompt.classList.remove('task-prompt--editing', 'task-prompt--saving');
      toolbar.hidden = true;
      addSupport.hidden = true;
      removeSupport.hidden = true;
      [title, mainText, supportTitle, supportText].forEach(disableEditor);
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать блок задания');
      formattingControls.forEach(control => { control.disabled = false; });
      setDirty(false);
    }

    function enterEditMode() {
      editing = true;
      prompt.classList.add('task-prompt--editing');
      toolbar.hidden = false;
      removeSupport.hidden = support.hidden;
      addSupport.hidden = !support.hidden;
      enableEditor(title, 'Заголовок блока задания', false);
      enableEditor(mainText, 'Текст задания');
      enableEditor(supportTitle, 'Заголовок дополнительной секции', false);
      enableEditor(supportText, 'Текст дополнительной секции');
      initialSnapshot = snapshot();
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить блок задания');
      mainText.focus();
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
        normalizeTaskPrompt({ ...data, ...next });
      } catch (_error) {
        if (typeof settings.onError === 'function') settings.onError('Заполните все видимые поля блока задания.');
        return;
      }
      saving = true;
      prompt.classList.add('task-prompt--saving');
      editButton.disabled = true;
      formattingControls.forEach(control => { control.disabled = true; });
      try {
        const saved = await settings.onSave(next, data.id);
        paint(saved || next);
        leaveEditMode();
      } catch (_error) {
        saving = false;
        prompt.classList.remove('task-prompt--saving');
        editButton.disabled = false;
        formattingControls.forEach(control => { control.disabled = false; });
      }
    }

    editButton.addEventListener('click', () => editing ? saveEditing() : enterEditMode());
    [title, mainText, supportTitle, supportText].forEach((element) => {
      element.addEventListener('input', () => { if (editing) updateDirty(); });
      element.addEventListener('paste', (event) => {
        if (!editing) return;
        event.preventDefault();
        const plainText = event.clipboardData?.getData('text/plain') || '';
        if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
      });
    });
    [title, supportTitle].forEach((element) => {
      element.addEventListener('keydown', (event) => {
        if (editing && event.key === 'Enter') event.preventDefault();
      });
    });
    prompt.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });
    addSupport.addEventListener('click', () => {
      support.hidden = false;
      addSupport.hidden = true;
      removeSupport.hidden = false;
      supportTitle.textContent = '';
      supportText.replaceChildren();
      updateDirty();
      supportTitle.focus();
    });
    removeSupport.addEventListener('click', () => {
      support.hidden = true;
      addSupport.hidden = false;
      updateDirty();
    });

    paint(initial);
    removeSupport.hidden = true;
    prompt.append(header, toolbar, body);
    return prompt;
  }

  const api = { normalizeTaskPrompt, renderTaskPrompt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TaskPromptComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
