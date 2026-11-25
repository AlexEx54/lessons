#!/usr/bin/env node
'use strict';
// Moves lesson files from the old asset tables (migration 030 renamed them to legacy_*) and from
// draft-assets/_videos to media/ next to the database. PNG and JPG pictures become WebP, and the
// lessons and sessions are rewritten to the new names. Prints a report by default; --apply moves the
// files, rewrites the references, drops the old tables and compacts the database.
// Stop the service first and run as its user:
// sudo -u teachplatform node scripts/migrate-media.js /var/lib/teach_platform/app.sqlite /var/lib/teach_platform/draft-assets --apply

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { openDatabase } = require('../lib/db.js');
const { mediaPath, storeMedia } = require('../lib/media-store.js');
const { toWebp } = require('../lib/webp.js');

const ASSET_URL = /\/api\/(library|sessions)\/([a-z0-9-]+)\/assets\/([a-f0-9]{64}\.(?:jpg|png|webp|mp3|wav|m4a|mp4))/gi;
const OWNERS = [
  { kind: 'library', table: 'library_lessons', refs: 'library_assets', column: 'lesson_id' },
  { kind: 'sessions', table: 'class_sessions', refs: 'class_assets', column: 'session_id' },
];

const hasLegacyTables = database => database.prepare(
  "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('legacy_library_assets', 'legacy_class_assets')").get().n === 2;

// Every asset URL in a lesson or session, with the lesson or session it points to.
function readReferences(database) {
  const references = [];
  for (const owner of OWNERS) {
    for (const row of database.prepare(`SELECT id, cover, content_json FROM ${owner.table}`).all()) {
      for (const [, kind, id, name] of `${row.cover}\n${row.content_json ?? ''}`.matchAll(ASSET_URL)) {
        references.push({ owner, id: row.id, kind, urlId: id, name });
      }
    }
  }
  return references;
}

// Old names are the hash of the stored bytes, so one old name maps to one new name everywhere.
async function moveFile(database, name, videosDirectory, mediaDirectory, apply) {
  const row = database.prepare(`SELECT data FROM legacy_library_assets WHERE file_name = ?
    UNION ALL SELECT data FROM legacy_class_assets WHERE file_name = ? LIMIT 1`).get(name, name);
  if (!row) return null;
  const extension = path.extname(name).slice(1);
  if (extension === 'mp4') {
    // The row holds only a pointer; the video lives in _videos under the same name and keeps it.
    const source = path.join(videosDirectory, JSON.parse(Buffer.from(row.data).toString()).videoFile);
    if (!fs.existsSync(source)) return null;
    if (apply) await storeMedia(mediaDirectory, name, source);
    return { name, before: 0, after: 0 };
  }
  const original = Buffer.from(row.data);
  let data = original, newExtension = extension;
  if (extension === 'png' || extension === 'jpg') {
    try { data = await toWebp(original); newExtension = 'webp'; }
    catch { console.warn(`Не удалось перевести в WebP, остаётся как есть: ${name}`); }
  }
  const newName = `${crypto.createHash('sha256').update(data).digest('hex')}.${newExtension}`;
  if (apply) await storeMedia(mediaDirectory, newName, data);
  return { name: newName, before: original.length, after: data.length };
}

async function migrateMedia({ database, mediaDirectory, videosDirectory, apply = false, log = console.log }) {
  if (!hasLegacyTables(database)) {
    log('Старых таблиц с файлами нет: перенос уже выполнен.');
    return { migrated: false };
  }
  const references = readReferences(database);
  // The routes check the file against the lesson or session in the URL, so it has to be the owner itself.
  const foreign = references.filter(reference => reference.kind !== reference.owner.kind || reference.urlId !== reference.id);
  for (const reference of foreign) log(`Ссылка на чужой файл: ${reference.owner.table} ${reference.id} → /api/${reference.kind}/${reference.urlId}/assets/${reference.name}`);
  if (foreign.length) throw new Error('Есть ссылки на файлы другого урока или занятия, перенос остановлен.');
  const names = [...new Set(references.map(reference => reference.name))].sort();
  const renamed = new Map(), missing = new Set();
  let before = 0, after = 0;
  for (const name of names) {
    // A name with no old row is either already in media/ (published after the deploy) or was broken before.
    if (fs.existsSync(mediaPath(mediaDirectory, name))) continue;
    const moved = await moveFile(database, name, videosDirectory, mediaDirectory, apply);
    if (!moved) { missing.add(name); continue; }
    renamed.set(name, moved.name);
    before += moved.before;
    after += moved.after;
  }
  const legacyBytes = database.prepare(`SELECT (SELECT COALESCE(SUM(LENGTH(data)), 0) FROM legacy_library_assets)
    + (SELECT COALESCE(SUM(LENGTH(data)), 0) FROM legacy_class_assets) AS n`).get().n;
  const megabytes = bytes => `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  log(`Ссылок на файлы: ${references.length}, разных файлов: ${names.length}, переносится: ${renamed.size}.`);
  log(`Картинки и аудио: ${megabytes(before)} → ${megabytes(after)}. Старые таблицы занимают ${megabytes(legacyBytes)}.`);
  for (const name of missing) log(`Нет файла, ссылка уже была битой: ${name}`);
  if (!apply) {
    log('Это пробный прогон, ничего не изменено. Для переноса добавьте --apply.');
    return { migrated: false, references: references.length, files: renamed.size, missing: missing.size, before, after };
  }

  const rename = text => text.replace(ASSET_URL, (url, kind, id, name) => `/api/${kind}/${id}/assets/${renamed.get(name) ?? name}`);
  database.exec('BEGIN IMMEDIATE');
  try {
    // References are read again under the lock, so nothing published meanwhile is lost.
    for (const owner of OWNERS) {
      const update = database.prepare(`UPDATE ${owner.table} SET cover = ?, content_json = ? WHERE id = ?`);
      const insert = database.prepare(`INSERT OR IGNORE INTO ${owner.refs} (${owner.column}, file_name) VALUES (?, ?)`);
      for (const row of database.prepare(`SELECT id, cover, content_json FROM ${owner.table}`).all()) {
        const cover = rename(row.cover), content = row.content_json === null ? null : rename(row.content_json);
        if (cover !== row.cover || content !== row.content_json) update.run(cover, content, row.id);
        for (const [, , , name] of `${cover}\n${content ?? ''}`.matchAll(ASSET_URL)) {
          if (missing.has(name)) continue;
          if (!fs.existsSync(mediaPath(mediaDirectory, name))) throw new Error(`Файл не перенесён: ${name}`);
          insert.run(row.id, name);
        }
      }
    }
    database.exec('DROP TABLE legacy_library_assets; DROP TABLE legacy_class_assets;');
    database.exec('COMMIT');
  } catch (error) { database.exec('ROLLBACK'); throw error; }
  database.exec('VACUUM');
  log(`Перенесено файлов: ${renamed.size}. Старые таблицы удалены, база сжата.`);
  return { migrated: true, references: references.length, files: renamed.size, missing: missing.size, before, after };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const [databasePath, draftAssetsDirectory, ...rest] = args.filter(arg => arg !== '--apply');
  if (!databasePath || !draftAssetsDirectory || rest.length) {
    throw new Error('Использование: node scripts/migrate-media.js <APP_DB_PATH> <DRAFT_ASSETS_DIR> [--apply]');
  }
  const database = openDatabase(path.resolve(databasePath));
  try {
    const sizeBefore = fs.statSync(databasePath).size;
    await migrateMedia({
      database, apply,
      mediaDirectory: path.join(path.dirname(path.resolve(databasePath)), 'media'),
      videosDirectory: path.join(path.resolve(draftAssetsDirectory), '_videos'),
    });
    if (apply) console.log(`Размер базы: ${(sizeBefore / 1024 / 1024).toFixed(1)} → ${(fs.statSync(databasePath).size / 1024 / 1024).toFixed(1)} МБ.`);
  } finally { database.close(); }
}

if (require.main === module) main().catch(error => { console.error(`Ошибка: ${error.message}`); process.exitCode = 1; });

module.exports = { migrateMedia };
