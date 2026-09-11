'use strict';
const { find } = require('linkifyjs');
const { isNotesLink } = require('./lesson-notes-config.js');
// Work with whole text blocks so formatting inside a URL does not split detection.
function linkNotesTransaction(state) {
  const type = state.schema.marks.link;
  const tr = state.tr;
  if (!type) return null;
  state.doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, '', '\ufffc');
    for (const link of find(text, { defaultProtocol: 'https' })) {
      if (link.type !== 'url' || !isNotesLink(link.href)) continue;
      const from = position + 1 + link.start, to = position + 1 + link.end;
      let identical = true;
      state.doc.nodesBetween(from, to, child => {
        if (child.isText && !child.marks.some(mark => mark.type === type && mark.attrs.href === link.href)) identical = false;
      });
      if (!identical) tr.addMark(from, to, type.create({ href: link.href }));
    }
    return false;
  });
  return tr.steps.length ? tr : null;
}
module.exports = { linkNotesTransaction };
