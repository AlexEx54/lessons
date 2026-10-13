'use strict';

const crypto = require('crypto');
const { getDatabase } = require('./db.js');

const USER_ROLES = Object.freeze(['teacher', 'admin']);
const MAX_DISPLAY_NAME_LENGTH = 80;
// Shown while the teacher has no uploaded avatar.
const DEFAULT_AVATARS = Object.freeze({
  female: '/assets/images/teacher-avatar-transparent.webp',
  male: '/assets/images/teacher-avatar-male.webp',
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeRole(role = 'teacher') {
  const normalizedRole = String(role || '').trim().toLowerCase();
  if (!USER_ROLES.includes(normalizedRole)) {
    throw new Error(`Недопустимая роль пользователя: ${role}. Ожидается teacher или admin.`);
  }
  return normalizedRole;
}

function publicUser(row) {
  if (!row) return null;
  const customAvatarUrl = row.avatar_file ? `/api/avatars/${row.avatar_file}` : null;
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    defaultAvatar: row.default_avatar,
    customAvatarUrl,
    avatarUrl: customAvatarUrl || DEFAULT_AVATARS[row.default_avatar],
  };
}

function findUserByEmail(email, database = getDatabase()) {
  return database.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email)) || null;
}

function findUserById(id, database = getDatabase()) {
  return database.prepare('SELECT * FROM users WHERE id = ?').get(id) || null;
}

function createUser({ email, passwordHash, displayName, role = 'teacher' }, database = getDatabase()) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(displayName || '').trim();
  const normalizedRole = normalizeRole(role);
  const timestamp = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash,
    displayName: normalizedName,
    role: normalizedRole,
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

function linkYandexId(userId, yandexId, database) {
  database.prepare('UPDATE users SET yandex_id = ?, updated_at = ? WHERE id = ?')
    .run(yandexId, new Date().toISOString(), userId);
  return findUserById(userId, database);
}

// Returns the stored row, or null when the email already belongs to another Yandex account.
// Users created here have an empty password_hash, which never passes verifyPassword.
function findOrCreateYandexUser({ id, email, displayName }, database = getDatabase()) {
  const linked = database.prepare('SELECT * FROM users WHERE yandex_id = ?').get(id);
  if (linked) return linked;

  const existing = findUserByEmail(email, database);
  if (existing) return existing.yandex_id ? null : linkYandexId(existing.id, id, database);

  const user = createUser({ email, passwordHash: '', displayName }, database);
  return linkYandexId(user.id, id, database);
}

module.exports = {
  DEFAULT_AVATARS,
  MAX_DISPLAY_NAME_LENGTH,
  USER_ROLES,
  createUser,
  findOrCreateYandexUser,
  findUserByEmail,
  findUserById,
  normalizeEmail,
  normalizeRole,
  publicUser,
};
