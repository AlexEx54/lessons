(function initInlineGapText(root) {
  'use strict';

  function parseMarkedText(value, options) {
    const settings = options || {};
    const label = settings.label || 'Inline gap text';
    const source = typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '';
    if (!source) throw new Error(`${label} requires text.`);

    const parts = [];
    let lastIndex = 0;
    for (const match of source.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
      if (match.index > lastIndex) parts.push({ type: 'text', text: source.slice(lastIndex, match.index) });
      const token = match[1].trim().replace(/\s+/g, ' ');
      if (!token) throw new Error(`${label} does not allow empty gaps.`);
      if (/[\[\]\n\r]/.test(match[1])) throw new Error(`${label} gaps cannot contain brackets or line breaks.`);
      parts.push({ type: 'gap', token });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < source.length) parts.push({ type: 'text', text: source.slice(lastIndex) });
    if (parts.some(part => part.type === 'text' && /\[\[|\]\]/.test(part.text))) {
      throw new Error(`${label} text has unmatched gap markers.`);
    }

    const count = parts.filter(part => part.type === 'gap').length;
    const minimum = Number.isInteger(settings.minimum) ? settings.minimum : 1;
    const maximum = Number.isInteger(settings.maximum) ? settings.maximum : 12;
    if (count < minimum || count > maximum) {
      throw new Error(`${label} requires between ${minimum} and ${maximum} gaps.`);
    }
    return parts;
  }

  function serializeMarkedText(parts) {
    return parts
      .map(part => (part.type === 'gap' ? `[[${part.token}]]` : part.text))
      .join('')
      .replace(/^\s+|\s+$/g, '');
  }

  function compactParts(parts) {
    const compacted = [];
    (parts || []).forEach((part) => {
      if (!part) return;
      if (part.type === 'text') {
        if (!part.text) return;
        const previous = compacted[compacted.length - 1];
        if (previous?.type === 'text') previous.text += part.text;
        else compacted.push({ type: 'text', text: part.text });
        return;
      }
      compacted.push({ type: 'gap', token: String(part.token || '').trim().replace(/\s+/g, ' ') });
    });
    return compacted;
  }

  function splitParagraphs(parts) {
    const paragraphs = [[]];
    parts.forEach((part) => {
      if (part.type === 'gap') {
        paragraphs[paragraphs.length - 1].push(part);
        return;
      }
      part.text.split('\n\n').forEach((chunk, index) => {
        if (index > 0) paragraphs.push([]);
        if (chunk) paragraphs[paragraphs.length - 1].push({ type: 'text', text: chunk });
      });
    });
    return paragraphs.filter(paragraph => paragraph.length);
  }

  function appendTextWithBreaks(container, value, documentRef) {
    String(value || '').split('\n').forEach((line, index) => {
      if (index > 0) container.append(documentRef.createElement('br'));
      if (line) container.append(documentRef.createTextNode(line));
    });
  }

  const api = { appendTextWithBreaks, compactParts, parseMarkedText, serializeMarkedText, splitParagraphs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.InlineGapText = api;
})(typeof window !== 'undefined' ? window : globalThis);
