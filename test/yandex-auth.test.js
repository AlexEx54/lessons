'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { fetchYandexProfile, yandexAuthorizeUrl } = require('../lib/yandex-auth.js');

const CONFIG = Object.freeze({
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://easyclass.test/api/auth/yandex/callback',
});

function stubFetch(t, responses) {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const { status = 200, body } = responses.shift();
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

test('authorize url carries the client, redirect uri and state', () => {
  const url = new URL(yandexAuthorizeUrl(CONFIG, 'state-123'));
  assert.equal(url.origin + url.pathname, 'https://oauth.yandex.ru/authorize');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('client_id'), 'client-id');
  assert.equal(url.searchParams.get('redirect_uri'), CONFIG.redirectUri);
  assert.equal(url.searchParams.get('state'), 'state-123');
});

test('profile is read with the exchanged access token', async t => {
  const calls = stubFetch(t, [
    { body: { access_token: 'access-token', token_type: 'bearer' } },
    { body: { id: 4242, default_email: 'anna@yandex.ru', real_name: 'Анна Петрова', login: 'anna' } },
  ]);

  const profile = await fetchYandexProfile(CONFIG, 'auth-code');

  assert.deepEqual(profile, { id: '4242', email: 'anna@yandex.ru', displayName: 'Анна Петрова' });
  assert.equal(calls[0].url, 'https://oauth.yandex.ru/token');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(Object.fromEntries(calls[0].options.body), {
    grant_type: 'authorization_code',
    code: 'auth-code',
    client_id: 'client-id',
    client_secret: 'client-secret',
  });
  assert.equal(calls[1].url, 'https://login.yandex.ru/info?format=json');
  assert.equal(calls[1].options.headers.Authorization, 'OAuth access-token');
});

test('profile falls back to login and tolerates a missing email', async t => {
  stubFetch(t, [
    { body: { access_token: 'access-token' } },
    { body: { id: '7', login: 'phone-only' } },
  ]);
  assert.deepEqual(await fetchYandexProfile(CONFIG, 'auth-code'), { id: '7', email: '', displayName: 'phone-only' });
});

test('failed token exchange is reported without requesting the profile', async t => {
  const calls = stubFetch(t, [{ status: 400, body: { error: 'invalid_grant' } }]);
  await assert.rejects(fetchYandexProfile(CONFIG, 'stale-code'), /token exchange failed: HTTP 400 invalid_grant/);
  assert.equal(calls.length, 1);
});
