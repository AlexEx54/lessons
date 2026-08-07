'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const SCRYPT_OPTIONS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const KEY_LENGTH = 64;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(password), salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return [
    'scrypt',
    `N=${SCRYPT_OPTIONS.N},r=${SCRYPT_OPTIONS.r},p=${SCRYPT_OPTIONS.p}`,
    salt.toString('base64url'),
    Buffer.from(derived).toString('base64url'),
  ].join('$');
}

function parseParameters(value) {
  return Object.fromEntries(value.split(',').map(part => {
    const [key, raw] = part.split('=');
    return [key, Number(raw)];
  }));
}

async function verifyPassword(password, encoded) {
  try {
    const [algorithm, rawParameters, rawSalt, rawExpected] = String(encoded).split('$');
    if (algorithm !== 'scrypt' || !rawParameters || !rawSalt || !rawExpected) return false;
    const parameters = parseParameters(rawParameters);
    const expected = Buffer.from(rawExpected, 'base64url');
    const actual = await scrypt(String(password), Buffer.from(rawSalt, 'base64url'), expected.length, {
      N: parameters.N,
      r: parameters.r,
      p: parameters.p,
      maxmem: 64 * 1024 * 1024,
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch (_error) {
    return false;
  }
}

module.exports = { hashPassword, verifyPassword };
