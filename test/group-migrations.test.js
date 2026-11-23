'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { applyMigrations } = require('../lib/db.js');

// A database with the migrations before `first` applied, so a test can seed the old shape and then migrate.
function migratedBefore(t, first) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;');
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name) && name < first).sort()) {
    db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, '2026-11-23');
  }
  return db;
}

test("an individual class's homework and self-assessment move under personal.student", t => {
  const db = migratedBefore(t, '028');
  const writing = { text: 'Done.', status: 'checked', review: { score: 5, comment: '' } };
  // The rows stand alone: the migration reads only the state.
  db.exec('PRAGMA foreign_keys = OFF');
  const insert = db.prepare('INSERT INTO class_live_state VALUES (?, ?)');
  insert.run('both', JSON.stringify({ activeStageId: 'a', selections: {}, writings: { h: writing }, selfAssessments: { s: 'withHelp' } }));
  insert.run('assessed', JSON.stringify({ activeStageId: 'a', selections: {}, selfAssessments: { s: 'independent' } }));
  insert.run('untouched', JSON.stringify({ activeStageId: 'a', selections: { x: { y: 'z' } } }));

  applyMigrations(db);

  const states = Object.fromEntries(db.prepare('SELECT session_id, state_json FROM class_live_state').all()
    .map(row => [row.session_id, JSON.parse(row.state_json)]));
  assert.deepEqual(states, {
    both: { activeStageId: 'a', selections: {}, personal: { student: { writings: { h: writing }, selfAssessments: { s: 'withHelp' } } } },
    assessed: { activeStageId: 'a', selections: {}, personal: { student: { selfAssessments: { s: 'independent' } } } },
    untouched: { activeStageId: 'a', selections: { x: { y: 'z' } } },
  });
});

test("an individual class's student keeps their chat messages and files on any device", t => {
  const db = migratedBefore(t, '029');
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec(`INSERT INTO classes (id, owner_id, name, invite_token, is_group, created_at) VALUES ('one', 'u', 'Маша', 't1', 0, 'x'), ('group', 'u', 'B1', 't2', 1, 'x');
    INSERT INTO class_sessions (id, class_id, request_key, request_json, library_revision, title, level, duration, cover, content_json, scheduled_at, time_zone, created_at)
      VALUES ('s1', 'one', 'r1', '{}', 1, 't', 'l', 'd', 'c', '{}', 'x', 'z', 'x'), ('s2', 'group', 'r2', '{}', 1, 't', 'l', 'd', 'c', '{}', 'x', 'z', 'x');`);
  const message = db.prepare(`INSERT INTO class_session_messages (session_id, sender_role, sender_key, sender_name, client_id, body, created_at)
    VALUES (?, ?, ?, 'n', ?, 'b', 'x')`);
  message.run('s1', 'student', 'laptop', 'c1');
  message.run('s1', 'student', 'phone', 'c2');
  message.run('s1', 'teacher', 'u', 'c3');
  message.run('s2', 'student', 'masha-id', 'c4');
  db.exec(`INSERT INTO class_session_attachments (id, session_id, message_id, sender_key, name, size, created_at)
    VALUES ('f1', 's1', 1, 'laptop', 'a', 1, 'x'), ('f2', 's1', 3, 'u', 'b', 1, 'x'), ('f3', 's2', 4, 'masha-id', 'c', 1, 'x');`);

  applyMigrations(db);

  assert.deepEqual(db.prepare('SELECT sender_key FROM class_session_messages ORDER BY id').all().map(row => row.sender_key), ['student', 'student', 'u', 'masha-id']);
  assert.deepEqual(db.prepare('SELECT sender_key FROM class_session_attachments ORDER BY id').all().map(row => row.sender_key), ['student', 'u', 'masha-id']);
});
