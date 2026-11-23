'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { applyMigrations } = require('../lib/db.js');

test("an individual class's homework and self-assessment move under personal.student", t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec('CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;');
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name) && name < '028').sort()) {
    db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, '2026-11-23');
  }
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
