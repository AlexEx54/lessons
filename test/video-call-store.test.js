'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const {
  clearVideoCallHistory,
  createVideoCall,
  endVideoCall,
  findOwnedVideoCall,
  findVideoCallByGuestToken,
  listVideoCalls,
  rotateVideoCallGuestToken,
  setVideoCallActive,
  setVideoCallWaiting,
} = require('../lib/video-call-store.js');

function fixture() {
  const database = openDatabase(':memory:');
  const admin = createUser({
    email: 'admin@example.com',
    displayName: 'Admin',
    passwordHash: 'test-hash',
    role: 'admin',
  }, database);
  const otherAdmin = createUser({
    email: 'other@example.com',
    displayName: 'Other',
    passwordHash: 'test-hash',
    role: 'admin',
  }, database);
  return { admin, database, otherAdmin };
}

test('video call belongs to its admin and guest access uses an opaque token', t => {
  const { admin, database, otherAdmin } = fixture();
  t.after(() => database.close());

  const created = createVideoCall({ ownerAdminId: admin.id }, database);
  assert.equal(created.status, 'waiting');
  assert.ok(created.guestToken.length >= 40);
  assert.equal(findOwnedVideoCall(created.id, otherAdmin.id, database), null);
  assert.equal(findVideoCallByGuestToken('wrong-token', database), null);
  assert.equal(findVideoCallByGuestToken(created.guestToken, database).id, created.id);
  assert.equal(listVideoCalls(admin.id, database).length, 1);
  assert.equal(
    database.prepare('SELECT guest_token_hash FROM video_calls WHERE id = ?').get(created.id).guest_token_hash,
    require('../lib/video-call-store.js').tokenHash(created.guestToken),
  );
});

test('rotating an invite revokes the old link and ending closes the room', t => {
  const { admin, database } = fixture();
  t.after(() => database.close());

  const created = createVideoCall({ ownerAdminId: admin.id }, database);
  const replacement = rotateVideoCallGuestToken(created.id, admin.id, database);
  assert.ok(replacement);
  assert.equal(findVideoCallByGuestToken(created.guestToken, database), null);
  assert.equal(findVideoCallByGuestToken(replacement, database).id, created.id);

  setVideoCallActive(created.id, database);
  assert.equal(findOwnedVideoCall(created.id, admin.id, database).status, 'active');
  setVideoCallWaiting(created.id, database);
  assert.equal(findOwnedVideoCall(created.id, admin.id, database).status, 'waiting');
  assert.ok(findOwnedVideoCall(created.id, admin.id, database).startedAt);

  const ended = endVideoCall(created.id, admin.id, database);
  assert.equal(ended.status, 'ended');
  assert.ok(ended.endedAt);
  assert.equal(rotateVideoCallGuestToken(created.id, admin.id, database), null);
});

test('clearing history removes only ended and expired calls of their owner', t => {
  const { admin, otherAdmin, database } = fixture();
  t.after(() => database.close());

  const past = createVideoCall({ ownerAdminId: admin.id }, database);
  endVideoCall(past.id, admin.id, database);
  const live = createVideoCall({ ownerAdminId: admin.id }, database);
  const foreignPast = createVideoCall({ ownerAdminId: otherAdmin.id }, database);
  endVideoCall(foreignPast.id, otherAdmin.id, database);

  const { deletedCount, deletedIds } = clearVideoCallHistory(admin.id, database);
  assert.equal(deletedCount, 1);
  assert.deepEqual(deletedIds, [past.id]);
  assert.deepEqual(listVideoCalls(admin.id, database).map(call => call.id), [live.id]);
  assert.equal(listVideoCalls(otherAdmin.id, database).length, 1);
});
