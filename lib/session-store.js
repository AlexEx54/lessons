'use strict';

const crypto = require('crypto');
const { getDatabase } = require('./db.js');
const { publicUser } = require('./user-store.js');

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function deleteExpiredSessions(database = getDatabase()) {
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
}

function createSession(userId, database = getDatabase()) {
  deleteExpiredSessions(database);
  const token = crypto.randomBytes(32).toString('base64url');
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
  database.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(hashToken(token), userId, createdAt.toISOString(), expiresAt.toISOString());
  return { token, expiresAt };
}

function findUserBySessionToken(token, database = getDatabase()) {
  if (!token) return null;
  deleteExpiredSessions(database);
  const row = database.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND users.status = 'active'
  `).get(hashToken(token));
  return publicUser(row);
}

function deleteSession(token, database = getDatabase()) {
  if (!token) return;
  database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

module.exports = {
  SESSION_TTL_MS,
  createSession,
  deleteExpiredSessions,
  deleteSession,
  findUserBySessionToken,
  hashToken,
};
