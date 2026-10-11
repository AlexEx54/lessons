'use strict';

const AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';
const TOKEN_URL = 'https://oauth.yandex.ru/token';
const PROFILE_URL = 'https://login.yandex.ru/info?format=json';
const REQUEST_TIMEOUT_MS = 10_000;

function yandexConfig() {
  const clientId = process.env.YANDEX_CLIENT_ID;
  const clientSecret = process.env.YANDEX_CLIENT_SECRET;
  const redirectUri = process.env.YANDEX_REDIRECT_URI;
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

function yandexAuthorizeUrl(config, state) {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
  });
  return url.href;
}

async function requestJson(url, options, step) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Yandex ${step} failed: HTTP ${response.status} ${payload.error || ''}`.trim());
  }
  return payload;
}

// The access token is used once to read the profile and is not stored.
async function fetchYandexProfile(config, code) {
  const token = await requestJson(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  }, 'token exchange');
  const profile = await requestJson(PROFILE_URL, {
    headers: { Authorization: `OAuth ${token.access_token}` },
  }, 'profile request');
  if (!profile.id) throw new Error('Yandex profile has no id.');

  return {
    id: String(profile.id),
    email: String(profile.default_email || ''),
    displayName: String(profile.real_name || profile.display_name || profile.login || '').trim(),
  };
}

module.exports = { fetchYandexProfile, yandexAuthorizeUrl, yandexConfig };
