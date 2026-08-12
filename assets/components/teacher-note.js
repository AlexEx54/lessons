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
      const listMatch = line.match(/^\s*-\s+(.+)$/);
      if (listMatch) {
        flushParagraph();
        listItems.push(parseInlineMarkdown(listMatch[1].trim()));
        return;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
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
      const element = documentRef.createElement(token.type === 'strong' ? 'strong' : 'em');
      appendInlineTokens(element, token.children, documentRef);
      parent.append(element);
    });
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

  function renderTeacherNote(data, documentRef) {
    const doc = documentRef || root.document;
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

    parseTeacherNoteMarkdown(data.text).forEach((block) => {
      if (block.type === 'list') {
        const list = doc.createElement('ul');
        block.items.forEach((itemTokens) => {
          const item = doc.createElement('li');
          appendInlineTokens(item, itemTokens, doc);
          list.append(item);
        });
        content.append(list);
        return;
      }
      const paragraph = doc.createElement('p');
      appendInlineTokens(paragraph, block.children, doc);
      content.append(paragraph);
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

    header.append(heading, button);
    note.append(header, content);
    return note;
  }

  const api = { parseInlineMarkdown, parseTeacherNoteMarkdown, renderTeacherNote };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TeacherNoteComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
