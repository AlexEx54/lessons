'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { applyMigrations } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createLessonDraft } = require('../lib/lesson-draft-store.js');

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
  const draft = createLessonDraft({ ownerAdminId: user.id, topic: 'Kept', template: 'general' }, db);
  const asset = `${'a'.repeat(64)}.png`;
  db.prepare('INSERT INTO library_assets VALUES (?, ?, ?)').run('superhero', asset, Buffer.from('image'));
  db.prepare(`INSERT INTO classes (id, owner_id, request_key, request_json, invite_token, name, library_lesson_id, library_revision,
    title, level, duration, cover, content_json, time_zone, created_at)
    VALUES ('old', ?, 'key', '{}', 'token', 'Анна', 'superhero', 1, 'Lesson', 'A1', '50 мин', '', '{}', 'UTC', '2026-09-01')`).run(user.id);
  db.prepare("INSERT INTO class_assets VALUES ('old', ?, ?)").run(asset, Buffer.from('copy'));
  db.prepare("INSERT INTO class_guest_sessions VALUES ('hash', 'old', ?)").run(Date.now() + 60000);
  db.prepare("INSERT INTO class_live_state VALUES ('old', '{}')").run();
  db.prepare("INSERT INTO class_notes VALUES ('old', ?, 1, '2026-09-01')").run(Buffer.from('notes'));
  const library = () => [db.prepare('SELECT * FROM library_lessons ORDER BY id').all(), db.prepare('SELECT * FROM library_assets ORDER BY lesson_id, file_name').all()];
  const libraryBefore = library();
  applyMigrations(db);
  applyMigrations(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 15);
  for (const table of ['classes', 'class_sessions', 'class_assets', 'class_guest_sessions', 'class_live_state', 'class_notes']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  }
  assert.equal(db.prepare("SELECT 1 FROM sqlite_schema WHERE name IN ('class_live_commands', 'class_guest_sessions_legacy')").get(), undefined);
  assert.deepEqual(library(), libraryBefore);
  assert.equal(db.prepare('SELECT id FROM lesson_drafts').get().id, draft.id);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
