'use strict';

const crypto = require('crypto');
const { getDatabase } = require('./db.js');
const { createInviteToken } = require('./invite-token.js');

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }

function presentVideoCall(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastCallAt: row.last_call_at,
    guestPath: `/call/${row.invite_token}`,
  };
}

// A video call is a permanent room for one student; its invite link never changes.
function createVideoCall({ ownerAdminId, name }, database = getDatabase()) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > 80) fail('Введите имя ученика (до 80 символов).');
  const id = crypto.randomUUID();
  database.prepare(`
    INSERT INTO video_calls (id, owner_admin_id, name, invite_token, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(id, ownerAdminId, trimmed, createInviteToken(trimmed, 'room'), new Date().toISOString());
  return findOwnedVideoCall(id, ownerAdminId, database);
}

// Rooms with the most recent call come first; new rooms count from their creation.
function listVideoCalls(ownerAdminId, database = getDatabase()) {
  return database.prepare(`
    SELECT * FROM video_calls
    WHERE owner_admin_id = ?
    ORDER BY COALESCE(last_call_at, created_at) DESC, id
  `).all(ownerAdminId).map(presentVideoCall);
}

function findOwnedVideoCall(id, ownerAdminId, database = getDatabase()) {
  return presentVideoCall(database.prepare(`
    SELECT * FROM video_calls WHERE id = ? AND owner_admin_id = ?
  `).get(id, ownerAdminId));
}

// The student only learns the room id, never the name the teacher gave it.
function findVideoCallByInviteToken(token, database = getDatabase()) {
  if (typeof token !== 'string' || !token) return null;
  const row = database.prepare('SELECT id FROM video_calls WHERE invite_token = ?').get(token);
  return row ? { id: row.id } : null;
}

function markVideoCallStarted(id, database = getDatabase()) {
  database.prepare('UPDATE video_calls SET last_call_at = ? WHERE id = ?').run(new Date().toISOString(), id);
}

// Messages and attachment rows cascade; the chat cleanup removes the files.
function deleteVideoCall(id, ownerAdminId, database = getDatabase()) {
  return database.prepare('DELETE FROM video_calls WHERE id = ? AND owner_admin_id = ?').run(id, ownerAdminId).changes > 0;
}

module.exports = {
  createVideoCall,
  deleteVideoCall,
  findOwnedVideoCall,
  findVideoCallByInviteToken,
  listVideoCalls,
  markVideoCallStarted,
};
