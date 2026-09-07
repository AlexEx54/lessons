'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { applyMigrations } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createClass } = require('../lib/class-store.js');
const { joinClass } = require('../lib/class-session-store.js');

test('historical live schema upgrades without losing sessions or lesson state', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;`);
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name) && name < '012').sort()) {
    db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, '2026-09-07');
  }
  const user = createUser({ email: 'migration@test.local', displayName: 'Teacher', role: 'teacher', passwordHash: 'unused' }, db);
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(require('../lib/synthetic-lesson.js').createSyntheticLesson('Migration')));
  const lesson = createClass({ name: 'Migration', lessonId: 'superhero', expectedRevision: 1, requestKey: require('node:crypto').randomUUID() }, user.id, db);
  const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(lesson.id);
  const state = JSON.stringify({ activeStageId: 'warm-up', version: 7, selections: { choice: { item: 'option' } } });
  const expiry = Date.now() + 60000;
  db.prepare('INSERT INTO class_guest_sessions VALUES (?, ?, ?, ?)').run('old-token', lesson.id, row.invite_token, expiry);
  db.prepare('INSERT INTO class_live_state VALUES (?, ?)').run(lesson.id, state);
  db.prepare('INSERT INTO class_live_commands VALUES (?, ?)').run(lesson.id, 'command');
  applyMigrations(db);
  applyMigrations(db);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get().n, 12);
  assert.equal(db.prepare("SELECT applied_at FROM schema_migrations WHERE name = '011-class-live.sql'").get().applied_at, '2026-09-07');
  assert.deepEqual({ ...db.prepare('SELECT * FROM class_guest_sessions').get() }, { token_hash: 'old-token', class_id: lesson.id, expires_at: expiry });
  assert.equal(db.prepare('SELECT invite_token FROM class_guest_sessions_legacy').get().invite_token, row.invite_token);
  assert.equal(db.prepare('SELECT state_json FROM class_live_state').get().state_json, state);
  assert.equal(db.prepare('SELECT command_id FROM class_live_commands').get().command_id, 'command');
  assert.ok(joinClass({ headers: {} }, row.invite_token, db).cookie);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
