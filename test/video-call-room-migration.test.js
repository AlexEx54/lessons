'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { applyMigrations } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');

test('one-off video calls are dropped with their chats for permanent rooms', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;`);
  const directory = path.join(__dirname, '..', 'migrations');
  for (const name of fs.readdirSync(directory).filter(name => /^\d+.*\.sql$/.test(name) && name < '016').sort()) {
    db.exec(fs.readFileSync(path.join(directory, name), 'utf8'));
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(name, '2026-10-01');
  }
  const user = createUser({ email: 'calls@test.local', displayName: 'Teacher', role: 'admin', passwordHash: 'unused' }, db);
  db.prepare(`INSERT INTO video_calls (id, owner_admin_id, guest_token_hash, status, created_at, expires_at)
    VALUES ('old', ?, 'hash', 'ended', '2026-10-01', '2026-10-02')`).run(user.id);
  const message = db.prepare(`INSERT INTO video_call_messages (call_id, sender_role, sender_key, sender_name, client_id, body, created_at)
    VALUES ('old', 'guest', 'hash', 'Алина', 'client', 'Привет', '2026-10-01')`).run().lastInsertRowid;
  db.prepare(`INSERT INTO video_call_attachments (id, call_id, message_id, sender_key, name, size, ready, created_at)
    VALUES ('file', 'old', ?, 'hash', 'notes.pdf', 10, 1, '2026-10-01')`).run(message);

  applyMigrations(db);
  applyMigrations(db);
  for (const table of ['video_calls', 'video_call_messages', 'video_call_attachments']) {
    assert.equal(db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  }
  assert.deepEqual(db.prepare("SELECT name FROM pragma_table_info('video_calls') ORDER BY cid").all().map(row => row.name),
    ['id', 'owner_admin_id', 'name', 'invite_token', 'created_at', 'last_call_at']);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 1);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
});
