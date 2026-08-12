(function initTeacherNoteComponent(root) {
  'use strict';

  function appendTextToken(tokens, value) {
    if (!value) return;
    const previous = tokens[tokens.length - 1];
    if (previous && previous.type === 'text') previous.value += value;
    else tokens.push({ type: 'text', value });
  }

  function parseInlineMarkdown(value) {
    const source = String(value || '');
    const tokens = [];
    let index = 0;

    while (index < source.length) {
      if (source.startsWith('***', index)) {
        const closing = source.indexOf('***', index + 3);
        if (closing > index + 3) {
          tokens.push({
            type: 'strongEmphasis',
            children: parseInlineMarkdown(source.slice(index + 3, closing)),
          });
          index = closing + 3;
          continue;
        }
      }

      if (source.startsWith('**', index)) {
        const closing = source.indexOf('**', index + 2);
        if (closing > index + 2) {
          tokens.push({
            type: 'strong',
            children: parseInlineMarkdown(source.slice(index + 2, closing)),
          });
          index = closing + 2;
          continue;
        }
      }

      if (source[index] === '*') {
        const closing = source.indexOf('*', index + 1);
        if (closing > index + 1) {
          tokens.push({
            type: 'emphasis',
            children: parseInlineMarkdown(source.slice(index + 1, closing)),
          });
          index = closing + 1;
          continue;
        }
      }

      appendTextToken(tokens, source[index]);
      index += 1;
    }

    return tokens;
  }

  function parseTeacherNoteMarkdown(value) {
    const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let paragraphLines = [];
    let listItems = [];
    let blankLines = 0;

    function flushParagraph() {
      if (!paragraphLines.length) return;
      blocks.push({
        type: 'paragraph',
        children: parseInlineMarkdown(paragraphLines.join(' ')),
      });
      paragraphLines = [];
    }

    function flushList() {
      if (!listItems.length) return;
      blocks.push({ type: 'list', items: listItems });
      listItems = [];
    }

    lines.forEach((line) => {
      if (!line.trim()) {
        flushParagraph();
        flushList();
        blankLines += 1;
        return;
      }

      if (blankLines > 1 && blocks.length > 0) {
        for (let count = 1; count < blankLines; count += 1) blocks.push({ type: 'spacer' });
      }
      blankLines = 0;

      const listMatch = line.match(/^\s*-\s+(.+)$/);
      if (listMatch) {
        flushParagraph();
        listItems.push(parseInlineMarkdown(listMatch[1].trim()));
        return;
      }

      flushList();
      paragraphLines.push(line.trim());
    });

    flushParagraph();
    flushList();
    return blocks;
  }

  function appendInlineTokens(parent, tokens, documentRef) {
    tokens.forEach((token) => {
      if (token.type === 'text') {
        parent.append(documentRef.createTextNode(token.value));
        return;
      }
      if (token.type === 'strongEmphasis') {
        const strong = documentRef.createElement('strong');
        const emphasis = documentRef.createElement('em');
        appendInlineTokens(emphasis, token.children, documentRef);
        strong.append(emphasis);
        parent.append(strong);
        return;
      }
      const element = documentRef.createElement(token.type === 'strong' ? 'strong' : 'em');
      appendInlineTokens(element, token.children, documentRef);
      parent.append(element);
    });
  }

  function serializeInlineTokens(tokens) {
    return tokens.map((token) => {
      if (token.type === 'text') return token.value;
      if (token.type === 'strong') return `**${serializeInlineTokens(token.children)}**`;
      if (token.type === 'emphasis') return `*${serializeInlineTokens(token.children)}*`;
      if (token.type === 'strongEmphasis') return `***${serializeInlineTokens(token.children)}***`;
      return '';
    }).join('');
  }

  function serializeTeacherNoteBlocks(blocks) {
    const serialized = (blocks || []).map((block) => {
      if (block.type === 'spacer') return null;
      if (block.type === 'list') {
        return block.items.map(item => `- ${serializeInlineTokens(item)}`).join('\n');
      }
      return serializeInlineTokens(block.children || []);
    });
    return joinMarkdownBlocks(serialized);
  }

  function joinMarkdownBlocks(blocks) {
    let result = '';
    let spacers = 0;
    blocks.forEach((block) => {
      if (block === null) {
        if (result) spacers += 1;
        return;
      }
      if (!block) return;
      if (result) result += `\n\n${'\n'.repeat(spacers)}`;
      result += block;
      spacers = 0;
    });
    return result.trim();
  }

  function inlineNodeToMarkdown(node) {
    if (node.nodeType === 3) return String(node.nodeValue || '').replace(/\u00a0/g, ' ');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const value = Array.from(node.childNodes).map(inlineNodeToMarkdown).join('');
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return value ? `**${value}**` : '';
    if (tag === 'em' || tag === 'i') return value ? `*${value}*` : '';
    return value;
  }

  function editorToMarkdown(editor) {
    function blocksFromChildren(parent) {
      const blocks = [];
      let inlineBuffer = '';

      function flushInlineBuffer() {
        const value = inlineBuffer.trim();
        if (value) blocks.push(value);
        inlineBuffer = '';
      }

      Array.from(parent.childNodes).forEach((node) => {
        const tag = node.nodeType === 1 ? node.tagName.toLowerCase() : '';
        if (tag === 'ul') {
          flushInlineBuffer();
          const items = Array.from(node.children)
            .filter(child => child.tagName.toLowerCase() === 'li')
            .map(child => inlineNodeToMarkdown(child).replace(/\s*\n\s*/g, ' ').trim())
            .filter(Boolean);
          if (items.length) blocks.push(items.map(item => `- ${item}`).join('\n'));
          return;
        }

        if (tag === 'div' || tag === 'p') {
          flushInlineBuffer();
          const nestedBlocks = blocksFromChildren(node);
          if (nestedBlocks.length) blocks.push(...nestedBlocks);
          else blocks.push(null);
          return;
        }

        const value = inlineNodeToMarkdown(node);
        if (value === '\n') flushInlineBuffer();
        else inlineBuffer += value;
      });
      flushInlineBuffer();
      return blocks;
    }

    return joinMarkdownBlocks(blocksFromChildren(editor));
  }

  function renderMarkdownInto(container, value, documentRef) {
    const rendered = parseTeacherNoteMarkdown(value).map((block) => {
      if (block.type === 'spacer') {
        const spacer = documentRef.createElement('div');
        spacer.className = 'teacher-note__spacer';
        spacer.setAttribute('aria-hidden', 'true');
        return spacer;
      }
      if (block.type === 'list') {
        const list = documentRef.createElement('ul');
        block.items.forEach((itemTokens) => {
          const item = documentRef.createElement('li');
          appendInlineTokens(item, itemTokens, documentRef);
          list.append(item);
        });
        return list;
      }
      const paragraph = documentRef.createElement('p');
      appendInlineTokens(paragraph, block.children, documentRef);
      return paragraph;
    });
    container.replaceChildren(...rendered);
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
