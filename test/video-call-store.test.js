'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { INVITE_TOKEN_PATTERN } = require('../lib/invite-token.js');
const {
  createVideoCall,
  deleteVideoCall,
  findOwnedVideoCall,
  findVideoCallByInviteToken,
  listVideoCalls,
  markVideoCallStarted,
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

test('a room belongs to its admin and keeps one permanent invite link', t => {
  const { admin, database, otherAdmin } = fixture();
  t.after(() => database.close());

  const created = createVideoCall({ ownerAdminId: admin.id, name: '  Алина Петрова ' }, database);
  assert.equal(created.name, 'Алина Петрова');
  assert.equal(created.lastCallAt, null);
  assert.match(created.guestPath, new RegExp(`^/call/alina-petrova-[a-f0-9]{48}$`));
  assert.match(created.guestPath.slice('/call/'.length), new RegExp(`^${INVITE_TOKEN_PATTERN}$`));
  const token = created.guestPath.slice('/call/'.length);
  assert.equal(findOwnedVideoCall(created.id, otherAdmin.id, database), null);
  assert.equal(findVideoCallByInviteToken('wrong-token', database), null);
  assert.deepEqual(findVideoCallByInviteToken(token, database), { id: created.id }, 'the student never learns the room name');
  assert.equal(findOwnedVideoCall(created.id, admin.id, database).guestPath, created.guestPath);
  assert.match(createVideoCall({ ownerAdminId: admin.id, name: '🙂' }, database).guestPath, /^\/call\/room-[a-f0-9]{48}$/);
  for (const name of ['', '   ', 'a'.repeat(81), undefined]) {
    assert.throws(() => createVideoCall({ ownerAdminId: admin.id, name }, database), { statusCode: 400 });
  }
});

test('rooms are listed by their latest call and deleting a room revokes its link', t => {
  const { admin, otherAdmin, database } = fixture();
  t.after(() => database.close());

  const first = createVideoCall({ ownerAdminId: admin.id, name: 'Первый' }, database);
  const second = createVideoCall({ ownerAdminId: admin.id, name: 'Второй' }, database);
  const foreign = createVideoCall({ ownerAdminId: otherAdmin.id, name: 'Чужой' }, database);
  database.prepare("UPDATE video_calls SET created_at = '2026-01-01T00:00:00.000Z' WHERE id = ?").run(first.id);
  database.prepare("UPDATE video_calls SET created_at = '2026-01-02T00:00:00.000Z' WHERE id = ?").run(second.id);
  assert.deepEqual(listVideoCalls(admin.id, database).map(call => call.id), [second.id, first.id]);
  markVideoCallStarted(first.id, database);
  assert.ok(findOwnedVideoCall(first.id, admin.id, database).lastCallAt);
  assert.deepEqual(listVideoCalls(admin.id, database).map(call => call.id), [first.id, second.id]);

  assert.equal(deleteVideoCall(foreign.id, admin.id, database), false);
  assert.equal(deleteVideoCall(first.id, admin.id, database), true);
  assert.equal(findVideoCallByInviteToken(first.guestPath.slice('/call/'.length), database), null);
  assert.deepEqual(listVideoCalls(admin.id, database).map(call => call.id), [second.id]);
  assert.equal(listVideoCalls(otherAdmin.id, database).length, 1);
});
