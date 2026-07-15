const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  });
}

loadDotEnv(path.join(__dirname, '.env'));

const { buildLessonHtml, getLessonTitle } = require('./lib/lesson-build.js');
const { validateLesson } = require('./lib/lesson-validate.js');
const {
  createLessonId,
  deleteLesson,
  listLessons,
  readLessonHtml,
  readLessonJson,
  saveLesson,
} = require('./lib/lesson-store.js');
const {
  generateLessonJson,
  getGeneratorConfig,
} = require('./lib/openrouter-lesson.js');

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const ROOT = __dirname;

const clientsByRoom = new Map();

// Временный серверный источник лент главной. Контракт можно сохранить при
// подключении CMS/БД: клиент уже получает и главную ленту, и рекомендации шага 2 по API.
const homeContentMock = {
  libraryLessons: [
    {
      id: 'travel-and-transport',
      level: 'A2',
      title: 'Путешествия и транспорт',
      description: 'Лексика и разговорные ситуации для поездок и перемещений.',
      lessonCount: 12,
      duration: '30–45 мин.',
      coverSrc: '/assets/images/lesson-travel.png',
      isNew: true,
    },
    {
      id: 'work-and-technology',
      level: 'B1',
      title: 'Работа и технологии',
      description: 'Профессиональная лексика и коммуникация в офисе.',
      lessonCount: 10,
      duration: '30–45 мин.',
      coverSrc: '/assets/images/lesson-work-tech.png',
      isNew: true,
    },
    {
      id: 'everyday-communication',
      level: 'B2',
      title: 'Повседневное общение',
      description: 'Фразы и диалоги на каждый день для уверенного общения.',
      lessonCount: 15,
      duration: '30–45 мин.',
      coverSrc: '/assets/images/lesson-communication.png',
      isNew: true,
    },
    {
      id: 'discussion-and-argumentation',
      level: 'C1',
      title: 'Дискуссии и аргументация',
      description: 'Развитие навыков обсуждения и выражения мнения.',
      lessonCount: 8,
      duration: '30–45 мин.',
      coverSrc: '/assets/images/lesson-discussion.png',
      isNew: true,
    },
  ],
  onboardingRecommendations: [
    {
      id: 'placement-test',
      level: 'A1–B2',
      title: 'Тест на определение уровня',
      subtitle: 'Placement Test',
      description: 'Идеальный старт для нового ученика',
      coverSrc: '/assets/images/recommendation-placement.png',
    },
    {
      id: 'general-english-b1',
      level: 'B1',
      title: 'General English B1',
      subtitle: 'Первый урок',
      coverSrc: '/assets/images/recommendation-general-english.png',
    },
    {
      id: 'travel-and-transport-b1',
      level: 'B1–B2',
      title: 'Travel & Transport',
      popular: true,
      coverSrc: '/assets/images/recommendation-travel.png',
    },
    {
      id: 'english-for-it',
      level: 'B2',
      title: 'English for IT',
      subtitle: 'Английский для IT-специалистов',
      coverSrc: '/assets/images/recommendation-it.png',
    },
  ],
};

function json(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function ndjson(res, payload) {
  res.write(`${JSON.stringify(payload)}\n`);
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
  let target;
  if (reqPath === '/') {
    target = 'index.html';
  } else if (reqPath === '/generator' || reqPath === '/generator/') {
    target = 'generator.html';
  } else {
    target = safePathname(reqPath.slice(1));
  }
  const absolute = path.join(ROOT, target);

  if (!absolute.startsWith(ROOT) || target === 'data' || target.startsWith(`data${path.sep}`) || target.startsWith('data/')) {
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

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function requireTeacherAuth(req, res) {
  const expected = process.env.TEACHER_ADMIN_TOKEN;
  if (!expected) {
    json(res, 503, { error: 'TEACHER_ADMIN_TOKEN is not configured.' });
    return false;
  }
  if (getBearerToken(req) !== expected) {
    json(res, 401, { error: 'Invalid teacher token.' });
    return false;
  }
  return true;
}

function getLessonIdFromPath(pathname, prefix, suffix = '') {
  if (!pathname.startsWith(prefix)) return '';
  if (suffix && !pathname.endsWith(suffix)) return '';
  const end = suffix ? pathname.length - suffix.length : pathname.length;
  return decodeURIComponent(pathname.slice(prefix.length, end)).trim();
}

function publicError(error) {
  const payload = { type: 'error', message: error.message || 'Unexpected error.' };
  if (Array.isArray(error.details)) payload.details = error.details;
  return payload;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'GET' && pathname === '/health') {
    json(res, 200, { ok: true, rooms: clientsByRoom.size });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/home-content') {
    json(res, 200, homeContentMock);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/generator/config') {
    json(res, 200, getGeneratorConfig());
    return;
  }

  if (req.method === 'GET' && pathname === '/api/lessons') {
    try {
      json(res, 200, { lessons: await listLessons() });
    } catch (error) {
      json(res, 500, { error: error.message || 'Cannot read lessons.' });
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/lessons/') && pathname.endsWith('/json')) {
    const lessonId = getLessonIdFromPath(pathname, '/api/lessons/', '/json');
    try {
      json(res, 200, await readLessonJson(lessonId));
    } catch (error) {
      json(res, error.statusCode || 404, { error: error.message || 'Lesson not found.' });
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/lesson/')) {
    const lessonId = getLessonIdFromPath(pathname, '/lesson/');
    try {
      const html = await readLessonHtml(lessonId);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(html);
    } catch (error) {
      json(res, error.statusCode || 404, { error: error.message || 'Lesson not found.' });
    }
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/lessons/')) {
    if (!requireTeacherAuth(req, res)) return;
    const lessonId = getLessonIdFromPath(pathname, '/api/lessons/');
    try {
      await deleteLesson(lessonId);
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, error.statusCode || 500, { error: error.message || 'Cannot delete lesson.' });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/lessons/generate') {
    if (!requireTeacherAuth(req, res)) return;

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      json(res, 400, { error: error.message || 'Bad request' });
      return;
    }

    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const targetGrammar = typeof body.targetGrammar === 'string' ? body.targetGrammar.trim() : '';

    if (!topic) {
      json(res, 400, { error: 'topic is required.' });
      return;
    }
    if (topic.length > 240 || targetGrammar.length > 800) {
      json(res, 400, { error: 'topic or targetGrammar is too long.' });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    try {
      ndjson(res, { type: 'status', message: 'Starting lesson generation...' });
      const generated = await generateLessonJson({
        topic,
        targetGrammar,
        onEvent: event => ndjson(res, event),
      });

      ndjson(res, { type: 'status', message: 'Validating generated lesson JSON...' });
      const validation = validateLesson(generated.lesson);
      if (validation.errors.length) {
        const error = new Error('Generated lesson did not pass validation.');
        error.details = validation.errors;
        throw error;
      }

      ndjson(res, { type: 'status', message: 'Building standalone lesson page...' });
      const html = buildLessonHtml(generated.lesson);
      const id = createLessonId((generated.lesson.meta && generated.lesson.meta.topic) || topic);
      const title = getLessonTitle(generated.lesson);
      const cost = generated.cost || {};
      const meta = await saveLesson({
        lesson: generated.lesson,
        html,
        metadata: {
          id,
          title,
          topic: (generated.lesson.meta && generated.lesson.meta.topic) || topic,
          targetGrammar: (generated.lesson.meta && generated.lesson.meta.targetGrammar) || targetGrammar,
          model: generated.model,
          reasoningEffort: generated.reasoningEffort,
          generationId: generated.generationId,
          costUsd: cost.usd,
          costRub: cost.rub,
          costSource: cost.source,
          usage: {
            promptTokens: cost.promptTokens,
            completionTokens: cost.completionTokens,
            reasoningTokens: cost.reasoningTokens,
            totalTokens: cost.totalTokens,
          },
          validationWarnings: validation.warnings,
        },
      });

      ndjson(res, { type: 'complete', lesson: meta });
      res.end();
    } catch (error) {
      ndjson(res, publicError(error));
      res.end();
    }
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
