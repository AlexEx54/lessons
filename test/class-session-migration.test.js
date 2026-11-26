'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { applyMigrations } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');

test('one-off classes are dropped for permanent classes while the library and drafts stay intact', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;`);
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name) && name < '015').sort()) {
    db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, '2026-09-30');
  }
  const user = createUser({ email: 'migration@test.local', displayName: 'Teacher', role: 'admin', passwordHash: 'unused' }, db);
  // Raw SQL: the draft store writes columns that later migrations add.
  db.prepare(`INSERT INTO lesson_drafts (id, owner_admin_id, topic, template_id, created_at, updated_at)
    VALUES ('kept', ?, 'Kept', 'general', '2026-09-01', '2026-09-01')`).run(user.id);
  // Migration 031 removes the seeded preview cards; a published lesson stays.
  db.prepare(`INSERT INTO library_lessons (id, title, age, level, category, description, skills_json, duration, cover,
    is_available, content_json, revision, updated_at)
    VALUES ('published', 'Published', '9-11', 'A1', 'General English', 'Kept', '[]', '45 мин', '', 1, '{}', 1, '2026-09-01')`).run();
  const asset = `${'a'.repeat(64)}.png`;
  db.prepare('INSERT INTO library_assets VALUES (?, ?, ?)').run('published', asset, Buffer.from('image'));
  db.prepare(`INSERT INTO classes (id, owner_id, request_key, request_json, invite_token, name, library_lesson_id, library_revision,
    title, level, duration, cover, content_json, time_zone, created_at)
    VALUES ('old', ?, 'key', '{}', 'token', 'Анна', 'published', 1, 'Lesson', 'A1', '50 мин', '', '{}', 'UTC', '2026-09-01')`).run(user.id);
  db.prepare("INSERT INTO class_assets VALUES ('old', ?, ?)").run(asset, Buffer.from('copy'));
  db.prepare("INSERT INTO class_guest_sessions VALUES ('hash', 'old', ?)").run(Date.now() + 60000);
  db.prepare("INSERT INTO class_live_state VALUES ('old', '{}')").run();
  db.prepare("INSERT INTO class_notes VALUES ('old', ?, 1, '2026-09-01')").run(Buffer.from('notes'));
  // Migration 017 converts badges to codes; that is covered by the library tests.
  // Migration 031 drops the availability flag; migration 033 adds empty program fields.
  const library = (assets = 'library_assets') => [db.prepare("SELECT * FROM library_lessons WHERE id = 'published'").all().map(({ badge, is_available, grammar_point, topic, season, ...lesson }) => lesson), db.prepare(`SELECT * FROM ${assets} ORDER BY lesson_id, file_name`).all()];
  const libraryBefore = library();
  applyMigrations(db);
  applyMigrations(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 33);
  for (const table of ['classes', 'class_sessions', 'class_assets', 'class_guest_sessions', 'class_live_state', 'class_notes']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  }
  assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE name IN ('class_live_commands', 'class_guest_sessions_legacy')").get(), undefined);
  // Migration 030 keeps the old file bytes aside until they are moved to disk.
  assert.deepEqual(library('legacy_library_assets'), libraryBefore);
  assert.equal(db.prepare('SELECT id FROM lesson_drafts').get().id, 'kept');
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
