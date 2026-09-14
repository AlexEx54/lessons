(function (root) {
  'use strict';

  function appendLinkedText(parent, source, documentRef = document) {
    const pattern = /\b(?:https?:\/\/|www\.)[^\s<>"'«»“”]+/gi;
    let offset = 0;
    for (const match of source.matchAll(pattern)) {
      // Avoid picking a URL out of another scheme or an email address.
      if (match.index > 0 && /[\p{L}\p{N}_@/:.\-]/u.test(source[match.index - 1])) continue;
      let label = match[0];
      while (label) {
        const previous = label;
        label = label.replace(/[.,!?;:]+$/, '');
        for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']]) {
          while (label.endsWith(close) && label.split(close).length > label.split(open).length) {
            label = label.slice(0, -1);
          }
        }
        if (label === previous) break;
      }
      let url;
      try { url = new URL(/^www\./i.test(label) ? `https://${label}` : label); }
      catch { continue; }
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) continue;
      parent.append(documentRef.createTextNode(source.slice(offset, match.index)));
      const link = documentRef.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = label;
      parent.append(link);
      offset = match.index + label.length;
    }
    parent.append(documentRef.createTextNode(source.slice(offset)));
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { appendLinkedText };
  else root.CallChatLinks = { appendLinkedText };
})(typeof window !== 'undefined' ? window : globalThis);
