'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const http = require('node:http');
const { createLiveKit, TOKEN_TTL_SECONDS } = require('../lib/livekit.js');

const env = { LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret-of-at-least-32-characters!' };
const decode = token => {
  const [header, payload, signature] = token.split('.');
  const expected = crypto.createHmac('sha256', env.LIVEKIT_API_SECRET).update(`${header}.${payload}`).digest('base64url');
  assert.equal(signature, expected, 'signed with the secret');
  return [header, payload].map(part => JSON.parse(Buffer.from(part, 'base64url')));
};
// A webhook as LiveKit signs it: a bare JWT whose sha256 claim is the base64 hash of the body.
const webhook = (body, claims = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const part = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ iss: 'key', nbf: now, exp: now + 300,
    sha256: crypto.createHash('sha256').update(body).digest('base64'), ...claims })}`;
  return `${data}.${crypto.createHmac('sha256', env.LIVEKIT_API_SECRET).update(data).digest('base64url')}`;
};

test('without a key pair there is no LiveKit', () => {
  assert.equal(createLiveKit({}), null);
  assert.equal(createLiveKit({ LIVEKIT_API_KEY: 'key' }), null);
});

test('the browser connects to LiveKit itself locally and to the configured address in production', () => {
  assert.equal(createLiveKit(env).publicUrl, 'ws://127.0.0.1:7880');
  assert.equal(createLiveKit({ ...env, LIVEKIT_PUBLIC_URL: 'wss://www.example.ru' }).publicUrl, 'wss://www.example.ru');
});

test("a participant's token lets them into one room for ten minutes, with camera, microphone and screen", () => {
  const before = Math.floor(Date.now() / 1000);
  const token = createLiveKit(env).token({ room: 'session:1', identity: 'student-1', name: 'Маша', metadata: { role: 'student' } });
  const [header, claims] = decode(token);
  assert.deepEqual(header, { alg: 'HS256', typ: 'JWT' });
  assert.ok(claims.nbf >= before && claims.exp === claims.nbf + TOKEN_TTL_SECONDS);
  assert.deepEqual({ ...claims, nbf: 0, exp: 0 }, { iss: 'key', sub: 'student-1', name: 'Маша', metadata: '{"role":"student"}', nbf: 0, exp: 0,
    video: { room: 'session:1', roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true,
      canPublishSources: ['camera', 'microphone', 'screen_share'] } });
});

test('the room API is called over Twirp with a short-lived admin token', async t => {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      calls.push({ path: req.url, type: req.headers['content-type'], claims: decode(req.headers.authorization.replace(/^Bearer /, ''))[1], body: JSON.parse(body) });
      if (req.url.endsWith('/MutePublishedTrack')) { res.writeHead(412); res.end('{"code":"failed_precondition"}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"participants":[]}');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const livekit = createLiveKit({ ...env, LIVEKIT_URL: `http://127.0.0.1:${server.address().port}` });

  assert.deepEqual(await livekit.rooms('ListParticipants', { room: 'session:1' }), { participants: [] });
  const [call] = calls;
  assert.deepEqual([call.path, call.type, call.body], ['/twirp/livekit.RoomService/ListParticipants', 'application/json', { room: 'session:1' }]);
  assert.equal(call.claims.exp - call.claims.nbf, 60);
  assert.deepEqual([call.claims.iss, call.claims.video], ['key', { room: 'session:1', roomAdmin: true, roomCreate: true, roomList: true }]);

  // A refusal of LiveKit is an error with its answer.
  await assert.rejects(livekit.rooms('MutePublishedTrack', { room: 'session:1', identity: 'a', track_sid: 'TR_1', muted: false }),
    /LiveKit MutePublishedTrack: 412 \{"code":"failed_precondition"\}/);
});

test('a webhook is accepted only when LiveKit signed it with our key for exactly this body', () => {
  const livekit = createLiveKit(env);
  const body = JSON.stringify({ event: 'participant_joined', room: { name: 'session:1' } });
  assert.deepEqual(livekit.verifyWebhook(body, webhook(body)), JSON.parse(body));

  const refused = (raw, authorization) => assert.throws(() => livekit.verifyWebhook(raw, authorization), { statusCode: 401 });
  refused(body, undefined);
  refused(body, 'not-a-token');
  refused(body.replace('joined', 'left'), webhook(body));
  const forged = webhook(body).split('.');
  forged[2] = crypto.createHmac('sha256', 'another-secret').update(`${forged[0]}.${forged[1]}`).digest('base64url');
  refused(body, forged.join('.'));
  refused(body, webhook(body, { exp: Math.floor(Date.now() / 1000) - 120 }));
  refused(body, webhook(body, { nbf: Math.floor(Date.now() / 1000) + 120 }));
  refused(body, webhook(body, { iss: 'another-key' }));
});
