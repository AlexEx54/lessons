'use strict';

const { findUserBySessionToken } = require('./session-store.js');

const COOKIE_NAME = 'teach_session';

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

function cookieParts(token, options = {}) {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, 'HttpOnly', 'SameSite=Lax', 'Path=/'];
  if (options.maxAge != null) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function sessionCookie(token, expiresAt) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return cookieParts(token, { maxAge });
}

function clearSessionCookie() {
  return cookieParts('', { maxAge: 0 });
}

module.exports = {
  COOKIE_NAME,
  clearSessionCookie,
  getAuthenticatedUser,
  getSessionToken,
  parseCookies,
  sessionCookie,
};
