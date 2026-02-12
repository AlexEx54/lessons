const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const ROOT = __dirname;

const clientsByRoom = new Map();

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'text/plain; charset=utf-8';
}

function safePathname(inputPath) {
  const normalized = path.normalize(inputPath).replace(/^([.][.][/\\])+/, '');
  return normalized;
}

function serveStatic(reqPath, res) {
  const target = reqPath === '/' ? 'index.html' : safePathname(reqPath.slice(1));
  const absolute = path.join(ROOT, target);

  if (!absolute.startsWith(ROOT)) {
    json(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(absolute, (err, data) => {
    if (err) {
      json(res, 404, { error: 'Not found' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': getContentType(absolute),
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
}

function addClient(roomId, client) {
  if (!clientsByRoom.has(roomId)) {
    clientsByRoom.set(roomId, new Set());
  }
  clientsByRoom.get(roomId).add(client);
}

function removeClient(roomId, client) {
  const room = clientsByRoom.get(roomId);
  if (!room) return;
  room.delete(client);
  if (room.size === 0) {
    clientsByRoom.delete(roomId);
  }
}

function broadcast(roomId, payload, senderId) {
  const room = clientsByRoom.get(roomId);
  if (!room) return;

  const wire = `event: lesson\ndata: ${JSON.stringify(payload)}\n\n`;

  room.forEach((client) => {
    if (client.id === senderId) return;
    client.res.write(wire);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        const parsed = raw ? JSON.parse(raw) : {};
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    json(res, 200, { ok: true, rooms: clientsByRoom.size });
    return;
  }

  if (req.method === 'GET' && pathname === '/events') {
    const roomId = (requestUrl.searchParams.get('room') || '').trim();
    const clientId = (requestUrl.searchParams.get('clientId') || '').trim();
    const role = (requestUrl.searchParams.get('role') || '').trim();

    if (!roomId || !clientId || !role) {
      json(res, 400, { error: 'room, clientId and role are required' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const client = { id: clientId, role, res };
    addClient(roomId, client);

    res.write(`event: lesson\ndata: ${JSON.stringify({ type: 'system_join', roomId, role, at: Date.now() })}\n\n`);

    const keepAlive = setInterval(() => {
      res.write(': ping\n\n');
    }, 20000);

    req.on('close', () => {
      clearInterval(keepAlive);
      removeClient(roomId, client);
    });

    return;
  }

  if (req.method === 'POST' && pathname === '/event') {
    try {
      const body = await readJsonBody(req);
      const roomId = typeof body.roomId === 'string' ? body.roomId.trim() : '';
      const senderId = typeof body.senderId === 'string' ? body.senderId.trim() : '';
      const role = typeof body.role === 'string' ? body.role.trim() : '';
      const type = typeof body.type === 'string' ? body.type.trim() : '';
      const payload = body.payload && typeof body.payload === 'object' ? body.payload : {};

      if (!roomId || !senderId || !role || !type) {
        json(res, 400, { error: 'roomId, senderId, role and type are required' });
        return;
      }

      broadcast(roomId, {
        type,
        roomId,
        role,
        senderId,
        payload,
        at: Date.now(),
      }, senderId);

      json(res, 200, { ok: true });
    } catch (error) {
      json(res, 400, { error: error.message || 'Bad request' });
    }
    return;
  }

  if (req.method === 'GET') {
    serveStatic(pathname, res);
    return;
  }

  json(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, HOST, () => {
  console.log(`Lesson server running on http://${HOST}:${PORT}`);
});
