(() => {
  'use strict';
  const pageSession = window.crypto.randomUUID();
  const sockets = new Map(), enabled = new WeakSet(), previousClose = new Map();
  function report(socket, event, extra = {}) {
    if (!enabled.has(socket) || socket.readyState !== WebSocket.OPEN) return;
    try {
      socket.send(JSON.stringify({ type: 'diagnostic', event,
        hidden: document.hidden, online: navigator.onLine, ...extra }));
    } catch { /* Diagnostics must never interrupt the lesson. */ }
  }
  // Registered before lesson teardown handlers so pagehide is sent before close().
  for (const event of ['pagehide', 'pageshow', 'online', 'offline']) {
    window.addEventListener(event, value => {
      for (const socket of sockets.keys()) report(socket, event,
        typeof value.persisted === 'boolean' ? { persisted: value.persisted } : {});
    });
  }
  document.addEventListener('visibilitychange', () => {
    for (const socket of sockets.keys()) report(socket, 'visibility');
  });
  window.ClassConnectionDiagnostics = {
    url(path) {
      const url = new URL(path, window.location.href);
      url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('pageSession', pageSession);
      url.searchParams.set('connection', window.crypto.randomUUID());
      return url.href;
    },
    attach(socket, channel) {
      sockets.set(socket, channel);
      // A cached client may meet an older server after rollback. Older notes servers
      // reject unknown messages, so send nothing until the server opts in.
      socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (enabled.has(socket) || !['snapshot', 'hello'].includes(message.type) || message.connectionDiagnostics !== true) return;
        enabled.add(socket);
        report(socket, 'socket-open', {
          navigationType: performance.getEntriesByType('navigation')[0]?.type,
          previousCloseCode: previousClose.get(channel),
        });
      });
      socket.addEventListener('close', event => {
        if (sockets.delete(socket)) previousClose.set(channel, event.code);
      });
    },
    // The page gave up on a silent socket; its close event may arrive long after the replacement opens.
    abandon(socket) {
      if (!sockets.has(socket)) return;
      previousClose.set(sockets.get(socket), 4000);
      sockets.delete(socket);
    },
  };
})();
