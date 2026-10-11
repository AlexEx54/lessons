'use strict';

const { findUserBySessionToken } = require('./session-store.js');

const COOKIE_NAME = 'teach_session';
const YANDEX_STATE_COOKIE = 'yandex_oauth_state';
const YANDEX_STATE_PATH = '/api/auth/yandex';
const YANDEX_STATE_TTL_SECONDS = 10 * 60;

function parseCookies(header) {
  const cookies = {};
  String(header || '').split(';').forEach(part => {
    const separator = part.indexOf('=');
    if (separator < 1) return;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    try {
      cookies[name] = decodeURIComponent(value);
    } catch (_error) {
      cookies[name] = value;
    }
  });
  return cookies;
}

function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[COOKIE_NAME] || '';
}

function getAuthenticatedUser(req, database) {
  return findUserBySessionToken(getSessionToken(req), database);
}

function cookieParts(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'HttpOnly', 'SameSite=Lax', `Path=${options.path || '/'}`];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function sessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return cookieParts(COOKIE_NAME, token, { maxAge });
}

function clearSessionCookie() {
  return cookieParts(COOKIE_NAME, '', { maxAge: 0 });
}

// SameSite=Lax still sends the cookie on the top-level redirect back from Yandex.
function yandexStateCookie(state, next) {
  return cookieParts(YANDEX_STATE_COOKIE, `${state} ${next}`, {
    maxAge: YANDEX_STATE_TTL_SECONDS,
    path: YANDEX_STATE_PATH,
  });
}

function clearYandexStateCookie() {
  return cookieParts(YANDEX_STATE_COOKIE, '', { maxAge: 0, path: YANDEX_STATE_PATH });
}

function getYandexState(req) {
  const value = parseCookies(req.headers.cookie)[YANDEX_STATE_COOKIE] || '';
  const separator = value.indexOf(' ');
  if (separator < 1) return { state: '', next: '' };
  return { state: value.slice(0, separator), next: value.slice(separator + 1) };
}

module.exports = {
  COOKIE_NAME,
  clearSessionCookie,
  clearYandexStateCookie,
  getAuthenticatedUser,
  getSessionToken,
  getYandexState,
  parseCookies,
  sessionCookie,
  yandexStateCookie,
};
