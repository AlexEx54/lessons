'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { mediaPath } = require('../../lib/media-store.js');

// Puts a lesson file where the server started on this database looks for it.
function putMedia(databasePath, name, data) {
  const file = mediaPath(path.join(path.dirname(databasePath), 'media'), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

module.exports = { putMedia };
