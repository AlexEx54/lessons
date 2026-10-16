'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { safeNextPath } = require('../lib/auth.js');
const { openDatabase } = require('../lib/db.js');
const { hashPassword, verifyPassword } = require('../lib/password.js');
const { createSession, findUserBySessionToken } = require('../lib/session-store.js');
const { createUser, findOrCreateYandexUser, findUserByEmail } = require('../lib/user-store.js');

test('auth migrations are repeatable and create the expected tables', () => {
  const database = openDatabase(':memory:');
  assert.deepEqual(
    database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(row => row.name),
    [
      'class_assets', 'class_guest_sessions', 'class_live_state', 'class_notes', 'class_sessions', 'classes',
      'lesson_draft_generations', 'lesson_draft_image_generations', 'lesson_drafts', 'lesson_templates',
      'library_assets', 'library_lessons', 'pending_registrations',
      'schema_migrations', 'sessions', 'sqlite_sequence', 'users', 'video_call_attachments', 'video_call_messages', 'video_calls',
    ],
  );
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get().count, 22);
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

test('yandex users are created once, linked by email and never accept an empty password', async () => {
  const database = openDatabase(':memory:');

  const created = findOrCreateYandexUser({ id: '101', email: 'new@yandex.ru', displayName: 'Анна' }, database);
  assert.equal(created.email, 'new@yandex.ru');
  assert.equal(created.display_name, 'Анна');
  assert.equal(created.role, 'teacher');
  assert.equal(created.yandex_id, '101');
  assert.equal(await verifyPassword('', created.password_hash), false);

  const again = findOrCreateYandexUser({ id: '101', email: 'renamed@yandex.ru', displayName: 'Аня' }, database);
  assert.equal(again.id, created.id);
  assert.equal(again.email, 'new@yandex.ru');

  const passwordUser = createUser({
    email: 'teacher@example.com',
    displayName: 'Мария',
    passwordHash: await hashPassword('long-password-123'),
  }, database);
  const linked = findOrCreateYandexUser({ id: '202', email: 'teacher@example.com', displayName: 'Maria' }, database);
  assert.equal(linked.id, passwordUser.id);
  assert.equal(linked.display_name, 'Мария');
  assert.equal(linked.yandex_id, '202');
  assert.equal(await verifyPassword('long-password-123', linked.password_hash), true);

  assert.equal(findOrCreateYandexUser({ id: '303', email: 'teacher@example.com', displayName: 'Другая' }, database), null);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM users').get().count, 2);
  database.close();
});

test('next path stays local and is safe for the Location header', () => {
  assert.equal(safeNextPath('/library/new?tab=1#top'), '/library/new?tab=1#top');
  assert.equal(safeNextPath('/app?q=тест'), '/app?q=%D1%82%D0%B5%D1%81%D1%82');
  assert.equal(safeNextPath('/library/%D1%83%D1%80%D0%BE%D0%BA'), '/library/%D1%83%D1%80%D0%BE%D0%BA');
  for (const unsafe of [
    null, '', 'app', 'https://evil.com', '//evil.com', '/\\evil.com', '//a b', '/\\%zz',
    '/app\r\nSet-Cookie: x=1', '/app\u0001', '/app\u007f',
  ]) {
    assert.equal(safeNextPath(unsafe), '/app', JSON.stringify(unsafe));
  }
});
