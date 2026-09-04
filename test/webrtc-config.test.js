'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { getIceServers } = require('../lib/webrtc-config.js');

test('ICE configuration includes STUN and creates coturn REST credentials', () => {
  const servers = getIceServers('teacher/test', {
    WEBRTC_STUN_URLS: 'stun:one.example.test:3478, stun:two.example.test:3478',
    WEBRTC_TURN_URLS: 'turn:turn.example.test:3478?transport=udp,turn:turn.example.test:3478?transport=tcp',
    WEBRTC_TURN_SHARED_SECRET: 'shared-secret',
    WEBRTC_TURN_CREDENTIAL_TTL_SECONDS: '3600',
  });

  assert.deepEqual(servers[0].urls, ['stun:one.example.test:3478', 'stun:two.example.test:3478']);
  assert.equal(servers[1].urls.length, 2);
  assert.match(servers[1].username, /^\d+:teachertest$/);
  assert.equal(servers[1].credentialType, 'password');
  assert.equal(
    servers[1].credential,
    crypto.createHmac('sha1', 'shared-secret').update(servers[1].username).digest('base64'),
  );
});
