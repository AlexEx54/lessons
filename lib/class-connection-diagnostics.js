'use strict';
const crypto = require('node:crypto');
const processSalt = crypto.randomBytes(32);
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);
const events = new Set(['socket-open', 'visibility', 'pagehide', 'pageshow', 'online', 'offline']);
const causes = { 4000: 'client-heartbeat-timeout', 4001: 'replaced', 4003: 'slot-taken', 4004: 'access-unavailable', 4008: 'rate-limit', 4009: 'notes-save-failed' };

// Metadata only: never log cookies, guest identities, note updates or exercise answers.
function observeClassConnection(socket, channel, log = console.info, now = Date.now) {
  const openedAt = now();
  const { access, request } = socket;
  const query = new URL(request.url, 'http://localhost').searchParams;
  const requestedId = query.get('connection');
  const pageSession = query.get('pageSession');
  const context = {
    channel, sessionId: access.sessionId, role: access.role,
    connectionId: uuid(requestedId) ? requestedId : crypto.randomUUID(),
    participant: crypto.createHmac('sha256', processSalt).update(access.identity).digest('hex').slice(0, 16),
    ...(uuid(pageSession) ? { pageSession } : {}),
  };
  socket.diagnosticConnectionId = context.connectionId;
  let accepted = false, lastPongAt = openedAt, lastClientEvent, count = 0, windowAt = openedAt, suppressed = 0;
  const emit = data => log('[class-connection]', JSON.stringify({ ...context, ...data }));
  emit({ event: 'open', userAgent: String(request.headers['user-agent'] || '').slice(0, 256) });
  socket.on('pong', () => { lastPongAt = now(); });
  socket.on('error', error => emit({ event: 'socket-error', code: /^[A-Z0-9_]{1,64}$/.test(error.code || '') ? error.code : 'unknown' }));
  socket.on('close', code => emit({
    event: 'close', code, accepted,
    cause: socket.diagnosticCloseCause || causes[code] || (code === 1000 ? 'normal-close' : 'transport-closed'),
    durationMs: now() - openedAt, lastPongAgeMs: now() - lastPongAt,
    ...(lastClientEvent ? { lastClientEvent } : {}), suppressed,
  }));
  return {
    accept(previous) {
      accepted = true;
      emit({ event: 'accepted', ...(previous ? { replacedConnectionId: previous.diagnosticConnectionId } : {}) });
    },
    client(message) {
      if (message?.type !== 'diagnostic') return false;
      if (now() - windowAt >= 60000) { count = 0; windowAt = now(); }
      if (!events.has(message.event)) return true;
      const details = {};
      for (const key of ['hidden', 'online', 'persisted']) if (typeof message[key] === 'boolean') details[key] = message[key];
      if (['navigate', 'reload', 'back_forward', 'prerender'].includes(message.navigationType)) details.navigationType = message.navigationType;
      if (Number.isInteger(message.previousCloseCode) && message.previousCloseCode >= 1000 && message.previousCloseCode <= 4999) details.previousCloseCode = message.previousCloseCode;
      lastClientEvent = { event: message.event, at: now(), ...details };
      // Retain the latest lifecycle event for the close record even after the log budget is exhausted.
      if (++count > 24) { suppressed++; return true; }
      emit({ event: 'client', clientEvent: message.event, ...details });
      return true;
    },
  };
}
module.exports = { observeClassConnection };
