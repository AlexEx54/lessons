'use strict';

const crypto = require('node:crypto');
const { slug } = require('../assets/class-invite.js');

// A permanent invite link of a class or a video call room: a readable slug of its name and a secret.
const INVITE_TOKEN_PATTERN = '[a-z0-9][a-z0-9-]{0,47}-[a-f0-9]{48}';

function createInviteToken(name, fallback) {
  return `${slug(name, fallback)}-${crypto.randomBytes(24).toString('hex')}`;
}

module.exports = { INVITE_TOKEN_PATTERN, createInviteToken };
