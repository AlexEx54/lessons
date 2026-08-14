(function initSafeMarkdown(root) {
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
      const marker = source.startsWith('***', index) ? '***'
        : source.startsWith('**', index) ? '**'
          : source[index] === '*' ? '*' : '';
      if (marker) {
        const closing = source.indexOf(marker, index + marker.length);
        if (closing > index + marker.length) {
          const type = marker === '***' ? 'strongEmphasis' : marker === '**' ? 'strong' : 'emphasis';
          tokens.push({ type, children: parseInlineMarkdown(source.slice(index + marker.length, closing)) });
          index = closing + marker.length;
          continue;
        }
      }
      appendTextToken(tokens, source[index]);
      index += 1;
    }
    return tokens;
  }

  function parseMarkdown(value) {
    const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let paragraphLines = [];
    let listItems = [];
    let listOrdered = false;
    let blankLines = 0;
    function flushParagraph() {
      if (!paragraphLines.length) return;
      blocks.push({ type: 'paragraph', children: parseInlineMarkdown(paragraphLines.join(' ')) });
      paragraphLines = [];
    }
    function flushList() {
      if (!listItems.length) return;
      blocks.push({ type: 'list', ordered: listOrdered, items: listItems });
      listItems = [];
      listOrdered = false;
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
      const unorderedMatch = line.match(/^\s*-\s+(.+)$/);
      const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);
      const listMatch = unorderedMatch || orderedMatch;
      if (listMatch) {
        flushParagraph();
        const ordered = Boolean(orderedMatch);
        if (listItems.length && listOrdered !== ordered) flushList();
        listOrdered = ordered;
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

  function serializeMarkdownBlocks(blocks) {
    return joinMarkdownBlocks((blocks || []).map((block) => {
      if (block.type === 'spacer') return null;
      if (block.type === 'list') {
        return block.items.map((item, index) => (
          `${block.ordered ? `${index + 1}.` : '-'} ${serializeInlineTokens(item)}`
        )).join('\n');
      }
      return serializeInlineTokens(block.children || []);
    }));
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
        if (tag === 'ul' || tag === 'ol') {
          flushInlineBuffer();
          const items = Array.from(node.children)
            .filter(child => child.tagName.toLowerCase() === 'li')
            .map(child => inlineNodeToMarkdown(child).replace(/\s*\n\s*/g, ' ').trim())
            .filter(Boolean);
          if (items.length) {
            blocks.push(items.map((item, index) => `${tag === 'ol' ? `${index + 1}.` : '-'} ${item}`).join('\n'));
          }
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

  function renderMarkdownInto(container, value, documentRef, spacerClass = 'markdown-spacer') {
    const rendered = parseMarkdown(value).map((block) => {
      if (block.type === 'spacer') {
        const spacer = documentRef.createElement('div');
        spacer.className = spacerClass;
        spacer.setAttribute('aria-hidden', 'true');
        return spacer;
      }
      if (block.type === 'list') {
        const list = documentRef.createElement(block.ordered ? 'ol' : 'ul');
        block.items.forEach((tokens) => {
          const item = documentRef.createElement('li');
          appendInlineTokens(item, tokens, documentRef);
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

  const api = {
    editorToMarkdown,
    parseInlineMarkdown,
    parseMarkdown,
    renderMarkdownInto,
    serializeMarkdownBlocks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SafeMarkdown = api;
})(typeof window !== 'undefined' ? window : globalThis);
