'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'app.sqlite');
const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');
const FOREIGN_KEYS_OFF = '-- foreign_keys: off';

let sharedDatabase = null;

function migrationFiles() {
  return fs.readdirSync(MIGRATIONS_DIR)
    .filter(name => /^\d+[-_].+\.sql$/.test(name))
    .sort();
}

function applyMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    ) STRICT
  `);

  const hasMigration = database.prepare('SELECT 1 FROM schema_migrations WHERE name = ?');
  const recordMigration = database.prepare(
    'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)',
  );

  for (const name of migrationFiles()) {
    if (hasMigration.get(name)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, name), 'utf8');
    // A migration that rebuilds a referenced table turns foreign keys off, so that dropping
    // the old table does not cascade to the rows that refer to it; it must not add broken references.
    const foreignKeysOff = sql.startsWith(FOREIGN_KEYS_OFF);
    const foreignKeys = database.prepare('PRAGMA foreign_keys').get().foreign_keys;
    const brokenReferences = () => database.prepare('PRAGMA foreign_key_check').all().length;
    if (foreignKeysOff) database.exec('PRAGMA foreign_keys = OFF');
    database.exec('BEGIN IMMEDIATE');
    try {
      const brokenBefore = foreignKeysOff ? brokenReferences() : 0;
      database.exec(sql);
      if (foreignKeysOff && brokenReferences() > brokenBefore) throw new Error(`Migration ${name} breaks foreign keys.`);
      recordMigration.run(name, new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    } finally {
      if (foreignKeysOff) database.exec(`PRAGMA foreign_keys = ${foreignKeys}`);
    }
  }
}

function openDatabase(databasePath = process.env.APP_DB_PATH || DEFAULT_DB_PATH) {
  if (databasePath !== ':memory:') fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const database = new DatabaseSync(databasePath, { timeout: 5000 });
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  if (databasePath !== ':memory:') database.exec('PRAGMA journal_mode = WAL');
  applyMigrations(database);
  return database;
}

function getDatabase() {
  if (!sharedDatabase) sharedDatabase = openDatabase();
  return sharedDatabase;
}

function closeDatabase() {
  if (!sharedDatabase) return;
  sharedDatabase.close();
  sharedDatabase = null;
}

module.exports = { DEFAULT_DB_PATH, applyMigrations, closeDatabase, getDatabase, openDatabase };
