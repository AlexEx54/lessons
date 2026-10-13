'use strict';

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const SWEEP_THRESHOLD = 1000;

// Fixed-window counter kept in memory: a restart resets it, which is fine for abuse protection.
function createRateLimiter({ limit, windowMs }) {
  const windows = new Map();

  function sweep(now) {
    for (const [key, window] of windows) {
      if (window.resetAt <= now) windows.delete(key);
    }
  }

  return {
    // Counts one use and returns false once the key has used up its window.
    take(key) {
      const now = Date.now();
      if (windows.size > SWEEP_THRESHOLD) sweep(now);
      let window = windows.get(key);
      if (!window || window.resetAt <= now) {
        window = { count: 0, resetAt: now + windowMs };
        windows.set(key, window);
      }
      if (window.count >= limit) return false;
      window.count += 1;
      return true;
    },
  };
}

// Caddy sets X-Forwarded-For to the address it saw; the header is trusted only on connections from Caddy itself.
function clientIp(req) {
  const remote = req.socket.remoteAddress || '';
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
  return LOOPBACK_ADDRESSES.has(remote) && forwarded ? forwarded : remote;
}

module.exports = { clientIp, createRateLimiter };
