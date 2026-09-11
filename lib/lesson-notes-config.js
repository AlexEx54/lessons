'use strict';
function isNotesLink(value) {
  if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020]/.test(value)) return false;
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
}
const starterOptions = {
  heading: false, blockquote: false, code: false, codeBlock: false,
  horizontalRule: false, orderedList: false, strike: false,
  link: { autolink: false, linkOnPaste: true, openOnClick: false, defaultProtocol: 'https', isAllowedUri: isNotesLink },
  underline: false, undoRedo: false, trailingNode: false,
};
module.exports = { starterOptions, isNotesLink };
