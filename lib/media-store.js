'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Lesson files live on disk next to the database, one copy per content;
// library lessons and class sessions only refer to them by name.
const MEDIA_NAME = /^[a-f0-9]{64}\.(?:jpg|png|webp|mp3|wav|m4a|mp4)$/;

function mediaPath(directory, name) {
  if (!MEDIA_NAME.test(name)) throw new Error(`Некорректное имя файла: ${name}`);
  // Folders by the first two letters keep each directory small.
  return path.join(directory, name.slice(0, 2), name);
}

// A name always stands for the same bytes, so a file already on disk is kept as is.
// `source` is the bytes or the path of a file to copy.
async function storeMedia(directory, name, source) {
  const target = mediaPath(directory, name);
  if (fs.existsSync(target)) return name;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    if (Buffer.isBuffer(source)) await fs.promises.writeFile(temporary, source, { flag: 'wx' });
    else await fs.promises.copyFile(source, temporary, fs.constants.COPYFILE_EXCL);
    await fs.promises.rename(temporary, target);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
  return name;
}

function saveMedia(directory, data, extension) {
  return storeMedia(directory, `${crypto.createHash('sha256').update(data).digest('hex')}.${extension}`, data);
}

// Removes files that no lesson or session refers to any more. It runs at startup,
// before a publication can write a file whose reference is not committed yet.
function sweepUnusedMedia(directory, database) {
  const used = new Set(database.prepare('SELECT file_name FROM library_assets UNION SELECT file_name FROM class_assets')
    .all().map(row => row.file_name));
  let folders;
  try { folders = fs.readdirSync(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return 0; throw error; }
  let removed = 0;
  for (const folder of folders.filter(entry => entry.isDirectory())) {
    for (const file of fs.readdirSync(path.join(directory, folder.name), { withFileTypes: true })) {
      if (!file.isFile() || used.has(file.name)) continue;
      fs.rmSync(path.join(directory, folder.name, file.name));
      removed++;
    }
  }
  return removed;
}

module.exports = { mediaPath, saveMedia, storeMedia, sweepUnusedMedia };
