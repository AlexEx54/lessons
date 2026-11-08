'use strict';
const { WebSocket } = require('ws');
const HEARTBEAT_MS = 15000;

// Protocol pings let the server drop dead clients, but browsers answer them without the page
// noticing. The application heartbeat gives the page a message to time out on, so it can
// replace a socket that died silently (e.g. after the router changed its IP) within seconds.
function startHeartbeat(webSocketServer, intervalMs = HEARTBEAT_MS) {
  webSocketServer.on('connection', socket => {
    socket.isAlive = true;
    socket.on('pong', () => { socket.isAlive = true; });
  });
  const timer = setInterval(() => {
    for (const socket of webSocketServer.clients) {
      if (!socket.isAlive) { socket.diagnosticCloseCause = 'heartbeat-timeout'; socket.terminate(); continue; }
      socket.isAlive = false;
      socket.ping();
      if (socket.readyState === WebSocket.OPEN) socket.send('{"type":"heartbeat"}');
    }
  }, intervalMs);
  timer.unref();
  webSocketServer.on('close', () => clearInterval(timer));
  return intervalMs;
}
module.exports = { HEARTBEAT_MS, startHeartbeat };
