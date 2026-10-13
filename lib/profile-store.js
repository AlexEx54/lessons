'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDatabase } = require('./db.js');
const { DEFAULT_AVATARS, MAX_DISPLAY_NAME_LENGTH, findUserById, publicUser } = require('./user-store.js');

const AVATAR_FILE_PATTERN = /^[a-f0-9-]{36}\.(?:jpg|png|webp)$/;

function profileError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function updateProfile(userId, { displayName, defaultAvatar }, database = getDatabase()) {
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!name || name.length > MAX_DISPLAY_NAME_LENGTH) {
    throw profileError(`Имя должно содержать от 1 до ${MAX_DISPLAY_NAME_LENGTH} символов.`);
  }
  if (!Object.hasOwn(DEFAULT_AVATARS, defaultAvatar)) throw profileError('Выберите стандартную аватарку.');

  database.prepare('UPDATE users SET display_name = ?, default_avatar = ?, updated_at = ? WHERE id = ?')
    .run(name, defaultAvatar, new Date().toISOString(), userId);
  return publicUser(findUserById(userId, database));
}

// Every upload gets a new file name, so avatar URLs can be cached forever.
function setAvatarFile(userId, fileName, directory, database) {
  const previousFile = findUserById(userId, database)?.avatar_file;
  database.prepare('UPDATE users SET avatar_file = ?, updated_at = ? WHERE id = ?')
    .run(fileName, new Date().toISOString(), userId);
  if (previousFile) fs.rmSync(path.join(directory, previousFile), { force: true });
  return publicUser(findUserById(userId, database));
}

function replaceAvatar(userId, { buffer, extension }, directory, database = getDatabase()) {
  const fileName = `${crypto.randomUUID()}${extension}`;
  const target = path.join(directory, fileName);
  const temporaryFile = `${target}.tmp`;
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(temporaryFile, buffer, { flag: 'wx' });
  fs.renameSync(temporaryFile, target);
  return setAvatarFile(userId, fileName, directory, database);
}

function removeAvatar(userId, directory, database = getDatabase()) {
  return setAvatarFile(userId, null, directory, database);
}

function avatarFilePath(fileName, directory) {
  return AVATAR_FILE_PATTERN.test(fileName) ? path.join(directory, fileName) : null;
}

module.exports = { avatarFilePath, removeAvatar, replaceAvatar, updateProfile };
