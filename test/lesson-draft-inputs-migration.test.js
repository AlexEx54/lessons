'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { applyMigrations } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { findLessonDraft } = require('../lib/lesson-draft-store.js');

test('draft topics move into inputs_json and the old columns go', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;`);
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name) && name < '023').sort()) {
    db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, '2026-10-17');
  }
  const user = createUser({ email: 'migration@test.local', displayName: 'Admin', role: 'admin', passwordHash: 'unused' }, db);
  const insert = db.prepare(`INSERT INTO lesson_drafts (id, owner_admin_id, topic, warm_up_topic, grammar_topic, template_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'template-1', '2026-10-01', '2026-10-01')`);
  insert.run('typed', user.id, 'Travel', 'Holidays', 'Past Simple');
  insert.run('empty', user.id, 'Space', null, null);

  applyMigrations(db);

  assert.deepEqual(findLessonDraft('typed', user.id, db).inputs, { topic: 'Travel', warmUpTopic: 'Holidays', grammarTopic: 'Past Simple' });
  assert.deepEqual(findLessonDraft('empty', user.id, db).inputs, { topic: 'Space', warmUpTopic: 'Space', grammarTopic: 'Space' });
  const columns = db.prepare("SELECT name FROM pragma_table_info('lesson_drafts')").all().map(row => row.name);
  assert.ok(columns.includes('inputs_json'));
  assert.ok(!columns.includes('warm_up_topic') && !columns.includes('grammar_topic'));
});
