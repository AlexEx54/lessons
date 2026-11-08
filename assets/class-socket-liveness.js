(() => {
  'use strict';
  // A socket whose network path died (router redial, Wi-Fi switch, sleep) stays OPEN in the
  // browser for minutes: protocol pings are answered below the page and TCP keepalive is slow.
  // The server sends an application heartbeat, and a socket that misses two of them is
  // reported stale so the page can replace it instead of showing a connection that is gone.
  const MISSED_HEARTBEATS = 2, SLACK_MS = 5000;
  // A timer that fires this late means the page was frozen or throttled in the background.
  // Messages queued meanwhile may not be dispatched yet, so look again shortly instead of
  // treating the silence as a dead connection.
  const LATE_MS = 3000, SETTLE_MS = 2000, STALE_CODE = 4000;
  const watchers = new Set(), wakeListeners = new Set();
  function wake() {
    for (const watcher of watchers) watcher.settle();
    for (const listener of wakeListeners) listener();
  }
  window.addEventListener('online', wake);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  document.addEventListener('resume', wake);
  window.ClassSocketLiveness = {
    // A stale socket is closed and handed to onStale once; the page must stop using it.
    watch(socket, onStale) {
      let lastMessageAt = Date.now(), timeoutMs = 0, announced = false, timer, dueAt;
      const schedule = delay => {
        window.clearTimeout(timer);
        dueAt = Date.now() + delay;
        timer = window.setTimeout(check, delay);
      };
      const stop = () => { window.clearTimeout(timer); watchers.delete(watcher); };
      function check() {
        if (Date.now() - dueAt > LATE_MS) { schedule(SETTLE_MS); return; }
        const silentMs = Date.now() - lastMessageAt;
        if (silentMs < timeoutMs) { schedule(timeoutMs - silentMs); return; }
        stop();
        // Closing a dead socket waits for a handshake that never comes, so report it as lost now.
        window.ClassConnectionDiagnostics?.abandon(socket);
        socket.close(STALE_CODE, 'Нет сигнала от сервера');
        onStale();
      }
      const watcher = { settle: () => { if (timeoutMs) schedule(SETTLE_MS); } };
      socket.addEventListener('message', event => {
        lastMessageAt = Date.now();
        if (announced) return;
        announced = true;
        // The first message (snapshot or hello) announces the interval. Servers without the
        // heartbeat do not, and their sockets are not watched.
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!Number.isSafeInteger(message.heartbeatMs) || message.heartbeatMs <= 0) return;
        timeoutMs = message.heartbeatMs * MISSED_HEARTBEATS + SLACK_MS;
        watchers.add(watcher);
        schedule(timeoutMs);
      });
      socket.addEventListener('close', stop);
    },
    // Runs when the network returns or the tab becomes visible, so a pending reconnect can start now.
    onWake(listener) { wakeListeners.add(listener); },
  };
})();
