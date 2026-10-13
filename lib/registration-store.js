'use strict';

const crypto = require('crypto');
const { getDatabase } = require('./db.js');
const { createUser, normalizeEmail } = require('./user-store.js');

const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

// The token salts the code hash, so a leaked table does not reveal codes by trying all million values.
function hashCode(token, code) {
  return sha256(`${token}:${code}`);
}

function createRegistrationCode() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

function codeTimestamps() {
  const now = Date.now();
  return { sentAt: new Date(now).toISOString(), expiresAt: new Date(now + CODE_TTL_MS).toISOString() };
}

// An expired registration counts as absent: its code can no longer be confirmed.
function findPendingRegistration(email, database = getDatabase()) {
  return database.prepare('SELECT * FROM pending_registrations WHERE email = ? AND expires_at > ?')
    .get(normalizeEmail(email), new Date().toISOString()) || null;
}

function findPendingRegistrationByToken(token, database = getDatabase()) {
  if (typeof token !== 'string' || !token) return null;
  return database.prepare('SELECT * FROM pending_registrations WHERE token_hash = ? AND expires_at > ?')
    .get(sha256(token), new Date().toISOString()) || null;
}

function secondsUntilResend(pending) {
  if (!pending) return 0;
  return Math.max(0, Math.ceil((Date.parse(pending.sent_at) + RESEND_COOLDOWN_MS - Date.now()) / 1000));
}

// Called after the code email is sent, so a failed delivery leaves no trace and no cooldown.
// Returns the token that the submitting browser needs to confirm or resend the code.
function savePendingRegistration({ email, displayName, passwordHash, code }, database = getDatabase()) {
  const token = crypto.randomBytes(24).toString('base64url');
  const { sentAt, expiresAt } = codeTimestamps();
  database.prepare('DELETE FROM pending_registrations WHERE expires_at <= ?').run(sentAt);
  database.prepare(`
    INSERT INTO pending_registrations (
      email, token_hash, display_name, password_hash, code_hash, attempts, sent_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT (email) DO UPDATE SET
      token_hash = excluded.token_hash,
      display_name = excluded.display_name,
      password_hash = excluded.password_hash,
      code_hash = excluded.code_hash,
      attempts = 0,
      sent_at = excluded.sent_at,
      expires_at = excluded.expires_at
  `).run(
    normalizeEmail(email),
    sha256(token),
    String(displayName || '').trim(),
    passwordHash,
    hashCode(token, code),
    sentAt,
    expiresAt,
  );
  return token;
}

function renewRegistrationCode(token, code, database = getDatabase()) {
  const { sentAt, expiresAt } = codeTimestamps();
  database.prepare(`
    UPDATE pending_registrations SET code_hash = ?, attempts = 0, sent_at = ?, expires_at = ? WHERE token_hash = ?
  `).run(hashCode(token, code), sentAt, expiresAt, sha256(token));
}

// Returns { user } on success or { error } with one of: missing, attempts, invalid, exists.
function confirmRegistration(token, code, database = getDatabase()) {
  const pending = findPendingRegistrationByToken(token, database);
  if (!pending) return { error: 'missing' };
  if (pending.attempts >= MAX_CODE_ATTEMPTS) return { error: 'attempts' };

  const expected = Buffer.from(pending.code_hash, 'hex');
  const actual = Buffer.from(hashCode(token, String(code)), 'hex');
  if (!crypto.timingSafeEqual(expected, actual)) {
    database.prepare('UPDATE pending_registrations SET attempts = attempts + 1 WHERE email = ?').run(pending.email);
    return { error: pending.attempts + 1 >= MAX_CODE_ATTEMPTS ? 'attempts' : 'invalid' };
  }

  database.exec('BEGIN IMMEDIATE');
  try {
    const user = createUser({
      email: pending.email,
      passwordHash: pending.password_hash,
      displayName: pending.display_name,
    }, database);
    database.prepare('DELETE FROM pending_registrations WHERE email = ?').run(pending.email);
    database.exec('COMMIT');
    return { user };
  } catch (error) {
    database.exec('ROLLBACK');
    // The email may have been taken meanwhile, e.g. by signing in with Yandex.
    if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(error.message)) {
      return { error: 'exists' };
    }
    throw error;
  }
}

module.exports = {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  RESEND_COOLDOWN_MS,
  confirmRegistration,
  createRegistrationCode,
  findPendingRegistration,
  findPendingRegistrationByToken,
  renewRegistrationCode,
  savePendingRegistration,
  secondsUntilResend,
};
