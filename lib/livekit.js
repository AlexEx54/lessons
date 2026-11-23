'use strict';

const crypto = require('node:crypto');

// The group call runs on a self-hosted LiveKit server; the app talks to it without its SDK:
// it signs access tokens, calls the room API (Twirp over HTTP) and checks the webhooks LiveKit sends.
// Without a key pair in the environment there is no group call (`createLiveKit` returns null).
const TOKEN_TTL_SECONDS = 10 * 60; // LiveKit hands the client a fresh token every 5 minutes.
const CLOCK_SKEW_SECONDS = 60;

const base64url = value => Buffer.from(value).toString('base64url');
const sign = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('base64url');

function jwt(claims, secret) {
  const data = `${base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64url(JSON.stringify(claims))}`;
  return `${data}.${sign(data, secret)}`;
}

function unauthorized(message) {
  return Object.assign(new Error(message), { statusCode: 401 });
}

function createLiveKit(env = process.env) {
  const apiKey = env.LIVEKIT_API_KEY, apiSecret = env.LIVEKIT_API_SECRET;
  if (!apiKey || !apiSecret) return null;
  const url = env.LIVEKIT_URL || 'http://127.0.0.1:7880';

  function claims(ttl, fields) {
    const now = Math.floor(Date.now() / 1000);
    return { iss: apiKey, nbf: now, exp: now + ttl, ...fields };
  }

  return {
    // The address the browser connects to: the site itself in production (Caddy proxies /rtc), LiveKit directly locally.
    publicUrl: env.LIVEKIT_PUBLIC_URL || url.replace(/^http/, 'ws'),

    // A participant's pass into one room; every participant may share their camera, microphone and screen with its sound.
    token({ room, identity, name, metadata }) {
      return jwt(claims(TOKEN_TTL_SECONDS, { sub: identity, name, metadata: JSON.stringify(metadata), video: {
        room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true,
        canPublishSources: ['camera', 'microphone', 'screen_share', 'screen_share_audio'],
      } }), apiSecret);
    },

    // A call to the room API, e.g. rooms('ListParticipants', { room }). Deleting a room needs roomCreate, the rest roomAdmin.
    // A refusal is an error with LiveKit's status: 404 when the room or the participant does not exist.
    async rooms(method, body) {
      const token = jwt(claims(60, { video: { room: body.room, roomAdmin: true, roomCreate: true, roomList: true } }), apiSecret);
      const response = await fetch(`${url}/twirp/livekit.RoomService/${method}`, {
        method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw Object.assign(new Error(`LiveKit ${method}: ${response.status} ${await response.text()}`), { status: response.status });
      return response.json();
    },

    // The event of a webhook LiveKit signed with our key for exactly this body; anything else is refused with 401.
    verifyWebhook(rawBody, authorization) {
      const [header, payload, signature] = String(authorization || '').split('.');
      const expected = sign(`${header}.${payload}`, apiSecret);
      if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
        throw unauthorized('Неверная подпись.');
      }
      const { alg } = JSON.parse(Buffer.from(header, 'base64url'));
      const { iss, nbf = 0, exp, sha256 } = JSON.parse(Buffer.from(payload, 'base64url'));
      const now = Math.floor(Date.now() / 1000);
      if (alg !== 'HS256' || iss !== apiKey || !(exp + CLOCK_SKEW_SECONDS > now) || nbf - CLOCK_SKEW_SECONDS > now) throw unauthorized('Токен недействителен.');
      if (sha256 !== crypto.createHash('sha256').update(rawBody).digest('base64')) throw unauthorized('Тело не совпадает с подписью.');
      return JSON.parse(rawBody);
    },
  };
}

module.exports = { createLiveKit, TOKEN_TTL_SECONDS };
