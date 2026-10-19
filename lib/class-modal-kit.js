const fs = require('fs');
const path = require('path');

// Everything the «Новое занятие» window needs, so every page that offers it loads the same set.
const STYLESHEETS = Object.freeze(['/assets/week-grid.css', '/assets/slot-picker.css', '/assets/class-modal.css']);
const SCRIPTS = Object.freeze([
  '/assets/class-invite.js',
  '/assets/schedule-calendar.js',
  '/assets/week-grid.js',
  '/assets/slot-picker.js',
  '/assets/class-modal.js',
]);
const MARKUP_PATHS = Object.freeze([path.join(__dirname, 'class-modal.html'), path.join(__dirname, 'slot-picker.html')]);

async function renderClassModalKit() {
  const markup = await Promise.all(MARKUP_PATHS.map(markupPath => fs.promises.readFile(markupPath, 'utf8')));
  return {
    stylesheets: STYLESHEETS.map(href => `  <link rel="stylesheet" href="${href}" />`).join('\n'),
    markup: markup.map(part => part.trim()).join('\n'),
    scripts: SCRIPTS.map(src => `  <script src="${src}" defer></script>`).join('\n'),
  };
}

module.exports = { renderClassModalKit };
