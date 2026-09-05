'use strict';

const crypto = require('crypto');
const { getDatabase } = require('./db.js');

const DEFAULT_CALL_TTL_HOURS = 24;

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

function publicVideoCall(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

function expireVideoCalls(database = getDatabase()) {
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE video_calls
    SET status = 'expired', ended_at = COALESCE(ended_at, ?)
    WHERE status IN ('waiting', 'active') AND expires_at <= ?
  `).run(now, now);
}

function resetInterruptedVideoCalls(database = getDatabase()) {
  expireVideoCalls(database);
  database.prepare(`
    UPDATE video_calls
    SET status = 'waiting'
    WHERE status = 'active' AND expires_at > ?
  `).run(new Date().toISOString());
}

function createVideoCall({ ownerAdminId, ttlHours = DEFAULT_CALL_TTL_HOURS }, database = getDatabase()) {
  const createdAt = new Date();
  const parsedTtl = Number(ttlHours);
  const safeTtlHours = Number.isFinite(parsedTtl)
    ? Math.max(1, Math.min(168, parsedTtl))
    : DEFAULT_CALL_TTL_HOURS;
  const call = {
    id: crypto.randomUUID(),
    guestToken: crypto.randomBytes(32).toString('base64url'),
    status: 'waiting',
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + safeTtlHours * 60 * 60 * 1000).toISOString(),
  };

  database.prepare(`
    INSERT INTO video_calls (
      id, owner_admin_id, guest_token_hash, status, created_at, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    call.id,
    ownerAdminId,
    tokenHash(call.guestToken),
    call.status,
    call.createdAt,
    call.expiresAt,
  );

  return call;
}

function rotateVideoCallGuestToken(id, ownerAdminId, database = getDatabase()) {
  const guestToken = crypto.randomBytes(32).toString('base64url');
  const result = database.prepare(`
    UPDATE video_calls
    SET guest_token_hash = ?
    WHERE id = ? AND owner_admin_id = ? AND status IN ('waiting', 'active') AND expires_at > ?
  `).run(tokenHash(guestToken), id, ownerAdminId, new Date().toISOString());
  return result.changes > 0 ? guestToken : null;
}

function listVideoCalls(ownerAdminId, database = getDatabase()) {
  expireVideoCalls(database);
  return database.prepare(`
    SELECT * FROM video_calls
    WHERE owner_admin_id = ?
    ORDER BY created_at DESC
  `).all(ownerAdminId).map(publicVideoCall);
}

function clearVideoCallHistory(ownerAdminId, database = getDatabase()) {
  expireVideoCalls(database);
  const deletedIds = database.prepare(`
    SELECT id FROM video_calls
    WHERE owner_admin_id = ? AND status IN ('ended', 'expired')
  `).all(ownerAdminId).map(row => row.id);
  const result = database.prepare(`
    DELETE FROM video_calls
    WHERE owner_admin_id = ? AND status IN ('ended', 'expired')
  `).run(ownerAdminId);
  return { deletedCount: result.changes, deletedIds };
}

function findOwnedVideoCall(id, ownerAdminId, database = getDatabase()) {
  expireVideoCalls(database);
  return publicVideoCall(database.prepare(`
    SELECT * FROM video_calls WHERE id = ? AND owner_admin_id = ?
  `).get(id, ownerAdminId));
}

function findVideoCallByGuestToken(token, database = getDatabase()) {
  if (!token) return null;
  expireVideoCalls(database);
  return publicVideoCall(database.prepare(`
    SELECT * FROM video_calls WHERE guest_token_hash = ?
  `).get(tokenHash(token)));
}

function setVideoCallActive(id, database = getDatabase()) {
  const now = new Date().toISOString();
  database.prepare(`
    UPDATE video_calls
    SET status = 'active', started_at = COALESCE(started_at, ?)
    WHERE id = ? AND status = 'waiting' AND expires_at > ?
  `).run(now, id, now);
}

function setVideoCallWaiting(id, database = getDatabase()) {
  database.prepare(`
    UPDATE video_calls
    SET status = 'waiting'
    WHERE id = ? AND status = 'active' AND expires_at > ?
  `).run(id, new Date().toISOString());
}

function endVideoCall(id, ownerAdminId, database = getDatabase()) {
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE video_calls
    SET status = 'ended', ended_at = ?
    WHERE id = ? AND owner_admin_id = ? AND status IN ('waiting', 'active')
  `).run(now, id, ownerAdminId);
  if (result.changes === 0) return findOwnedVideoCall(id, ownerAdminId, database);
  return findOwnedVideoCall(id, ownerAdminId, database);
}

module.exports = {
  DEFAULT_CALL_TTL_HOURS,
  clearVideoCallHistory,
  createVideoCall,
  endVideoCall,
  expireVideoCalls,
  findOwnedVideoCall,
  findVideoCallByGuestToken,
  listVideoCalls,
  publicVideoCall,
  resetInterruptedVideoCalls,
  rotateVideoCallGuestToken,
  setVideoCallActive,
  setVideoCallWaiting,
  tokenHash,
};
