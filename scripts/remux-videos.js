#!/usr/bin/env node
'use strict';
// Moves the MP4 index to the start of uploaded videos, so browsers can start playback without walking
// or downloading the whole file. Lists affected files by default; --apply rewrites them in place.
// Run as the service user: sudo -u teachplatform node scripts/remux-videos.js /var/lib/teach_platform/draft-assets --apply

const fs = require('node:fs');
const path = require('node:path');
const { needsFaststart, moveIndexToStart } = require('../lib/video-assets.js');

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const [directory, ...rest] = args.filter(arg => arg !== '--apply');
  if (!directory || rest.length) throw new Error('Использование: node scripts/remux-videos.js <DRAFT_ASSETS_DIR> [--apply]');
  // Draft videos live in <draftId>/, published copies in _videos/.
  const files = fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isDirectory())
    .flatMap(entry => fs.readdirSync(path.join(directory, entry.name)).filter(name => name.endsWith('.mp4')).map(name => path.join(directory, entry.name, name)));
  let affected = 0;
  for (const file of files) {
    if (!await needsFaststart(file)) continue;
    affected += 1;
    const before = fs.statSync(file).size;
    if (!apply) { console.log(`нужна перепаковка: ${file} (${before} байт)`); continue; }
    await moveIndexToStart(file);
    console.log(`перепаковано: ${file} (${before} → ${fs.statSync(file).size} байт)`);
  }
  console.log(`Проверено файлов: ${files.length}, ${apply ? 'перепаковано' : 'нужна перепаковка'}: ${affected}.${!apply && affected ? ' Запустите с --apply.' : ''}`);
}

main().catch(error => { console.error(`Ошибка: ${error.message}`); process.exitCode = 1; });
