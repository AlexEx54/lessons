'use strict';

const crypto = require('crypto');

const DEFAULT_STUN_URL = 'stun:stun.l.google.com:19302';

function csv(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
}

function getIceServers(identity = 'participant', env = process.env) {
  const iceServers = [];
  const stunUrls = csv(env.WEBRTC_STUN_URLS || DEFAULT_STUN_URL);
  if (stunUrls.length > 0) iceServers.push({ urls: stunUrls });

  const turnUrls = csv(env.WEBRTC_TURN_URLS);
  const sharedSecret = String(env.WEBRTC_TURN_SHARED_SECRET || '');
  if (turnUrls.length === 0 || !sharedSecret) return iceServers;

  const configuredTtl = Number.parseInt(env.WEBRTC_TURN_CREDENTIAL_TTL_SECONDS || '3600', 10);
  const ttlSeconds = Number.isInteger(configuredTtl)
    ? Math.max(300, Math.min(86400, configuredTtl))
    : 3600;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const safeIdentity = String(identity || 'participant').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48)
    || 'participant';
  const username = `${expiresAt}:${safeIdentity}`;
  const credential = crypto.createHmac('sha1', sharedSecret).update(username).digest('base64');
  iceServers.push({ urls: turnUrls, username, credential, credentialType: 'password' });
  return iceServers;
}

module.exports = { DEFAULT_STUN_URL, getIceServers };
