'use strict';

const crypto = require('crypto');
const { getDatabase } = require('./db.js');

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
  };
}

function findUserByEmail(email, database = getDatabase()) {
  return database.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) || null;
}

function findUserById(id, database = getDatabase()) {
  return database.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function createUser({ email, passwordHash, displayName }, database = getDatabase()) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(displayName || '').trim();
  const timestamp = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash,
    displayName: normalizedName,
    role: 'teacher',
    status: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  database.prepare(`
    INSERT INTO users (
      id, email, password_hash, display_name, role, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user.id,
    user.email,
    user.passwordHash,
    user.displayName,
    user.role,
    user.status,
    user.createdAt,
    user.updatedAt,
  );

  return publicUser(findUserById(user.id, database));
}

module.exports = { createUser, findUserByEmail, findUserById, normalizeEmail, publicUser };
