'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { openDatabase } = require('../lib/db.js');
const { hashPassword, verifyPassword } = require('../lib/password.js');
const { createSession, findUserBySessionToken } = require('../lib/session-store.js');
const { createUser, findUserByEmail } = require('../lib/user-store.js');

test('auth migrations are repeatable and create the expected tables', () => {
  const database = openDatabase(':memory:');
  assert.deepEqual(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name),
    [
      'lesson_draft_generations', 'lesson_draft_image_generations', 'lesson_drafts',
      'schema_migrations', 'sessions', 'users',
    ],
  );
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 7);
  assert.ok(database.prepare(
    "SELECT 1 FROM pragma_table_info('lesson_drafts') WHERE name = 'grammar_topic'",
  ).get());
  assert.ok(database.prepare(
    "SELECT 1 FROM pragma_table_info('lesson_drafts') WHERE name = 'student_age_group'",
  ).get());
  assert.ok(database.prepare(
    "SELECT 1 FROM pragma_table_info('lesson_drafts') WHERE name = 'student_level'",
  ).get());
  assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  database.close();
});

test('admin role migration preserves existing users and sessions', () => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-migration-'));
  const databasePath = path.join(temporaryDirectory, 'app.sqlite');
  const legacyDatabase = new DatabaseSync(databasePath);
  const initialMigration = fs.readFileSync(
    path.join(__dirname, '..', 'migrations', '001-auth.sql'),
    'utf8',
  );

  legacyDatabase.exec(initialMigration);
  legacyDatabase.exec(`
    CREATE TABLE schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT;
    INSERT INTO schema_migrations (name, applied_at) VALUES ('001-auth.sql', '2026-01-01T00:00:00.000Z');
    INSERT INTO users (
      id, email, password_hash, display_name, role, status, created_at, updated_at
    ) VALUES (
      'legacy-user', 'legacy@example.com', 'hash', 'Legacy', 'teacher', 'active',
      '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'
    );
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (
      'legacy-token', 'legacy-user', '2026-01-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z'
    );
  `);
  legacyDatabase.close();

  const migratedDatabase = openDatabase(databasePath);
  assert.equal(migratedDatabase.prepare('SELECT role FROM users WHERE id = ?').get('legacy-user').role, 'teacher');
  assert.equal(
    migratedDatabase.prepare('SELECT user_id FROM sessions WHERE token_hash = ?').get('legacy-token').user_id,
    'legacy-user',
  );
  assert.doesNotThrow(() => migratedDatabase.prepare(`
    INSERT INTO users (
      id, email, password_hash, display_name, role, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'admin-user', 'admin@example.com', 'hash', 'Admin', 'admin', 'active',
    '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z',
  ));
  assert.deepEqual(migratedDatabase.prepare('PRAGMA foreign_key_check').all(), []);
  migratedDatabase.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('password hashing accepts the correct password and rejects another one', async () => {
  const encoded = await hashPassword('long-password-123');
  assert.equal(await verifyPassword('long-password-123', encoded), true);
  assert.equal(await verifyPassword('wrong-password', encoded), false);
});

test('users are normalized and can be resolved through a session', async () => {
  const database = openDatabase(':memory:');
  const user = createUser({
    email: '  Teacher@Example.COM ',
    displayName: 'Мария',
    passwordHash: await hashPassword('long-password-123'),
  }, database);

  assert.equal(user.email, 'teacher@example.com');
  assert.equal(user.role, 'teacher');
  assert.equal(findUserByEmail('TEACHER@example.com', database).id, user.id);
  assert.throws(() => createUser({
    email: 'teacher@example.com',
    displayName: 'Дубликат',
    passwordHash: 'unused',
  }, database), /UNIQUE/);

  const session = createSession(user.id, database);
  assert.deepEqual(findUserBySessionToken(session.token, database), user);
  database.close();
});

test('users can be created as admins and invalid roles are rejected', async () => {
  const database = openDatabase(':memory:');
  const admin = createUser({
    email: 'admin@example.com',
    displayName: 'Администратор',
    passwordHash: await hashPassword('long-password-123'),
    role: 'admin',
  }, database);

  assert.equal(admin.role, 'admin');
  assert.throws(() => createUser({
    email: 'unknown@example.com',
    displayName: 'Unknown',
    passwordHash: 'unused',
    role: 'owner',
  }, database), /Ожидается teacher или admin/);
  database.close();
});
