(function initSafeMarkdown(root) {
  'use strict';

  const TEXT_SIZES = ['s', 'm', 'l', 'xl'];
  const TEXT_SIZE_SET = new Set(TEXT_SIZES);
  const SIZE_OPEN = /^\{(xl|[sml])\}/;
  const MUTED_OPEN = '{muted}';
  const MUTED_CLOSE = '{/muted}';
  const AUTO_LINK = /(?:https?:\/\/|www\.)[^\s<>]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?:\/[^\s<>]*)?/gi;
  const TRAILING_LINK_PUNCTUATION = /[.,!?;:)}\]»”"']+$/;

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
      const sizeMatch = source.slice(index).match(SIZE_OPEN);
      if (sizeMatch) {
        const size = sizeMatch[1];
        const open = sizeMatch[0];
        const close = `{/${size}}`;
        const closing = source.indexOf(close, index + open.length);
        if (closing > index + open.length) {
          tokens.push({
            type: 'size',
            size,
            children: parseInlineMarkdown(source.slice(index + open.length, closing)),
          });
          index = closing + close.length;
          continue;
        }
      }
      if (source.startsWith(MUTED_OPEN, index)) {
        const closing = source.indexOf(MUTED_CLOSE, index + MUTED_OPEN.length);
        if (closing > index + MUTED_OPEN.length) {
          tokens.push({
            type: 'tone',
            tone: 'muted',
            children: parseInlineMarkdown(source.slice(index + MUTED_OPEN.length, closing)),
          });
          index = closing + MUTED_CLOSE.length;
          continue;
        }
      }
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
      const unorderedMatch = line.match(/^\s*[-*]\s+(.+)$/);
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

  function readMdSize(node) {
    if (!node) return '';
    if (node.dataset && typeof node.dataset.mdSize === 'string') return node.dataset.mdSize;
    if (typeof node.getAttribute === 'function') {
      return node.getAttribute('data-md-size') || '';
    }
    return '';
  }

  function readMdTone(node) {
    if (!node) return '';
    if (node.dataset && typeof node.dataset.mdTone === 'string') return node.dataset.mdTone;
    if (typeof node.getAttribute === 'function') {
      return node.getAttribute('data-md-tone') || '';
    }
    return '';
  }

  function isSizeSpan(node) {
    return Boolean(
      node
      && node.nodeType === 1
      && String(node.tagName || '').toLowerCase() === 'span'
      && TEXT_SIZE_SET.has(readMdSize(node)),
    );
  }

  function appendAutoLinkedText(parent, value, documentRef) {
    let cursor = 0;
    AUTO_LINK.lastIndex = 0;
    for (const match of value.matchAll(AUTO_LINK)) {
      const start = match.index;
      const previous = start > 0 ? value[start - 1] : '';
      if (previous && /[\w@.-]/.test(previous)) continue;

      const matched = match[0];
      const visible = matched.replace(TRAILING_LINK_PUNCTUATION, '');
      if (!visible) continue;
      const href = /^https?:\/\//i.test(visible) ? visible : `https://${visible}`;
      let parsed;
      try {
        parsed = new URL(href);
      } catch (_error) {
        continue;
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) continue;

      if (start > cursor) parent.append(documentRef.createTextNode(value.slice(cursor, start)));
      const link = documentRef.createElement('a');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = visible;
      parent.append(link);
      cursor = start + visible.length;
    }
    if (cursor < value.length) parent.append(documentRef.createTextNode(value.slice(cursor)));
  }

  function appendInlineTokens(parent, tokens, documentRef, options = {}) {
    tokens.forEach((token) => {
      if (token.type === 'text') {
        if (options.linkify) appendAutoLinkedText(parent, token.value, documentRef);
        else parent.append(documentRef.createTextNode(token.value));
        return;
      }
      if (token.type === 'size') {
        const span = documentRef.createElement('span');
        span.setAttribute('data-md-size', token.size);
        appendInlineTokens(span, token.children, documentRef, options);
        parent.append(span);
        return;
      }
      if (token.type === 'tone' && token.tone === 'muted') {
        const span = documentRef.createElement('span');
        span.setAttribute('data-md-tone', 'muted');
        appendInlineTokens(span, token.children, documentRef, options);
        parent.append(span);
        return;
      }
      if (token.type === 'strongEmphasis') {
        const strong = documentRef.createElement('strong');
        const emphasis = documentRef.createElement('em');
        appendInlineTokens(emphasis, token.children, documentRef, options);
        strong.append(emphasis);
        parent.append(strong);
        return;
      }
      const element = documentRef.createElement(token.type === 'strong' ? 'strong' : 'em');
      appendInlineTokens(element, token.children, documentRef, options);
      parent.append(element);
    });
  }

  function serializeInlineTokens(tokens) {
    return tokens.map((token) => {
      if (token.type === 'text') return token.value;
      if (token.type === 'size') return `{${token.size}}${serializeInlineTokens(token.children)}{/${token.size}}`;
      if (token.type === 'tone' && token.tone === 'muted') {
        return `${MUTED_OPEN}${serializeInlineTokens(token.children)}${MUTED_CLOSE}`;
      }
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
    if (tag === 'span') {
      const tone = readMdTone(node);
      if (tone === 'muted' && value) return `${MUTED_OPEN}${value}${MUTED_CLOSE}`;
      const size = readMdSize(node);
      if (TEXT_SIZE_SET.has(size) && value) return `{${size}}${value}{/${size}}`;
    }
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

  function renderMarkdownInto(container, value, documentRef, spacerClass = 'markdown-spacer', options = {}) {
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
          appendInlineTokens(item, tokens, documentRef, options);
          list.append(item);
        });
        return list;
      }
      const paragraph = documentRef.createElement('p');
      appendInlineTokens(paragraph, block.children, documentRef, options);
      return paragraph;
    });
    container.replaceChildren(...rendered);
  }

  function unwrapSizeSpan(span) {
    const parent = span.parentNode;
    if (!parent) return;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
  }

  function unwrapSizeSpansIn(node) {
    const spans = [];
    function collect(current) {
      Array.from(current.childNodes || []).forEach((child) => {
        if (child.nodeType !== 1) return;
        collect(child);
        if (isSizeSpan(child)) spans.push(child);
      });
    }
    collect(node);
    spans.forEach(unwrapSizeSpan);
  }

  function findExactSizeSpan(documentRef, range, size) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === 3) node = node.parentNode;
    while (node && node.nodeType === 1) {
      if (isSizeSpan(node)) {
        if (readMdSize(node) !== size) return null;
        const spanRange = documentRef.createRange();
        spanRange.selectNodeContents(node);
        // Range.START_TO_START === 0, Range.END_TO_END === 2
        if (
          range.compareBoundaryPoints(0, spanRange) === 0
          && range.compareBoundaryPoints(2, spanRange) === 0
        ) {
          return node;
        }
        return null;
      }
      node = node.parentNode;
    }
    return null;
  }

  function applyTextSize(documentRef, size) {
    if (!documentRef || !TEXT_SIZE_SET.has(size)) return false;
    const selection = typeof documentRef.getSelection === 'function' ? documentRef.getSelection() : null;
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;

    const range = selection.getRangeAt(0);
    const exactSpan = findExactSizeSpan(documentRef, range, size);
    if (exactSpan) {
      unwrapSizeSpan(exactSpan);
      selection.removeAllRanges();
      return true;
    }

    const contents = range.extractContents();
    unwrapSizeSpansIn(contents);
    const span = documentRef.createElement('span');
    span.setAttribute('data-md-size', size);
    span.append(contents);
    range.insertNode(span);

    selection.removeAllRanges();
    const next = documentRef.createRange();
    next.selectNodeContents(span);
    selection.addRange(next);
    return true;
  }

  const api = {
    TEXT_SIZES,
    applyTextSize,
    editorToMarkdown,
    parseInlineMarkdown,
    parseMarkdown,
    renderMarkdownInto,
    serializeMarkdownBlocks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SafeMarkdown = api;
})(typeof window !== 'undefined' ? window : globalThis);
