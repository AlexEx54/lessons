const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { loadDotEnv } = require('./lib/env.js');

loadDotEnv(path.join(__dirname, '.env'));

const { buildLessonHtml, getLessonTitle } = require('./lib/lesson-build.js');
const { renderAppPage } = require('./lib/app-shell.js');
const { validateLesson } = require('./lib/lesson-validate.js');
const {
  clearSessionCookie,
  getAuthenticatedUser,
  getSessionToken,
  sessionCookie,
} = require('./lib/auth.js');
const { getDatabase } = require('./lib/db.js');
const { hashPassword, verifyPassword } = require('./lib/password.js');
const { createSession, deleteSession } = require('./lib/session-store.js');
const { createUser, findUserByEmail, normalizeEmail, publicUser } = require('./lib/user-store.js');
const {
  createLessonId,
  deleteLesson,
  listLessons,
  readLessonHtml,
  readLessonJson,
  saveLesson,
} = require('./lib/lesson-store.js');
const {
  completeLessonDraft,
  createLessonDraft,
  deleteLessonDraft,
  findLessonDraft,
  listLessonDrafts,
  updateTaskPrompt,
  updateTeacherNote,
  updateThisOrThatImage,
} = require('./lib/lesson-draft-store.js');
const { createSyntheticLesson } = require('./lib/synthetic-lesson.js');
const {
  generateLessonJson,
  getGeneratorConfig,
} = require('./lib/openrouter-lesson.js');

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const ROOT = __dirname;
const DRAFT_ASSETS_DIR = path.resolve(process.env.DRAFT_ASSETS_DIR || path.join(ROOT, 'data', 'draft-assets'));
const database = getDatabase();

const clientsByRoom = new Map();
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 256;
const MAX_DRAFT_IMAGE_BYTES = 5 * 1024 * 1024;
const DRAFT_IMAGE_TYPES = Object.freeze({
  'image/jpeg': { extension: '.jpg', matches: buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: '.png', matches: buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: '.webp', matches: buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
});

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

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders,
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

async function serveAppPage(pageId, res, context = {}) {
  try {
    const html = await renderAppPage(pageId, context);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  } catch (error) {
    console.error(`Cannot render app page "${pageId}":`, error);
    json(res, 500, { error: 'Cannot render app page.' });
  }
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

function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let settled = false;
    req.on('data', chunk => {
      if (settled) return;
      length += chunk.length;
      if (length > maxBytes) {
        settled = true;
        const error = new Error('Изображение превышает 5 МБ.');
        error.statusCode = 413;
        reject(error);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function requireTeacherAuth(req, res) {
  const user = getAuthenticatedUser(req, database);
  if (!user) {
    json(res, 401, { error: 'Требуется вход в кабинет преподавателя.' });
    return null;
  }
  return user;
}

function requireAdminAuth(req, res) {
  const user = requireTeacherAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    json(res, 403, { error: 'Раздел доступен только администратору.' });
    return null;
  }
  return user;
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function loginRedirect(pathname) {
  return `/login?next=${encodeURIComponent(pathname)}`;
}

function getLessonIdFromPath(pathname, prefix, suffix = '') {
  if (!pathname.startsWith(prefix)) return '';
  if (suffix && !pathname.endsWith(suffix)) return '';
  const end = suffix ? pathname.length - suffix.length : pathname.length;
  return decodeURIComponent(pathname.slice(prefix.length, end)).trim();
}

function getTeacherNoteRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/teacher-notes\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      noteId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getTaskPromptRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/task-prompts\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      promptId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getThisOrThatImageRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/this-or-that\/([^/]+)\/items\/([^/]+)\/options\/([^/]+)\/image$/);
  if (!match) return null;
  try {
    const values = match.slice(1).map(value => decodeURIComponent(value).trim());
    if (values.some(value => !value)) return null;
    return { draftId: values[0], componentId: values[1], itemId: values[2], optionId: values[3] };
  } catch (_error) {
    return null;
  }
}

function draftAssetPath(draftId, fileName) {
  if (!/^[a-f0-9-]{36}$/i.test(draftId) || !/^[a-f0-9-]{36}\.(?:jpg|png|webp)$/i.test(fileName)) return null;
  const draftDirectory = path.join(DRAFT_ASSETS_DIR, draftId);
  const absolute = path.join(draftDirectory, fileName);
  return absolute.startsWith(`${draftDirectory}${path.sep}`) ? absolute : null;
}

function assetFileFromUrl(value) {
  const match = String(value || '').match(/^\/api\/lesson-draft-assets\/([a-f0-9-]{36})\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/i);
  return match ? draftAssetPath(match[1], match[2]) : null;
}

function publicError(error) {
  const payload = { type: 'error', message: error.message || 'Unexpected error.' };
  if (Array.isArray(error.details)) payload.details = error.details;
  return payload;
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'GET' && (pathname === '/login' || pathname === '/login.html')) {
    if (getAuthenticatedUser(req, database)) {
      redirect(res, '/app');
      return;
    }
    serveStatic('/login.html', res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/login') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      json(res, 400, { error: error.message || 'Некорректный запрос.' });
      return;
    }

    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH || !password) {
      json(res, 400, { error: 'Укажите корректные email и пароль.' });
      return;
    }

    const storedUser = findUserByEmail(email, database);
    const valid = storedUser && storedUser.status === 'active'
      ? await verifyPassword(password, storedUser.password_hash)
      : false;
    if (!valid) {
      json(res, 401, { error: 'Неверный email или пароль.' });
      return;
    }

    const session = createSession(storedUser.id, database);
    json(res, 200, { user: publicUser(storedUser) }, {
      'Set-Cookie': sessionCookie(session.token, session.expiresAt),
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/register') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      json(res, 400, { error: error.message || 'Некорректный запрос.' });
      return;
    }

    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!displayName || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
      json(res, 400, { error: `Имя должно содержать от 1 до ${MAX_DISPLAY_NAME_LENGTH} символов.` });
      return;
    }
    if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
      json(res, 400, { error: 'Укажите корректный email.' });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      json(res, 400, {
        error: `Пароль должен содержать от ${MIN_PASSWORD_LENGTH} до ${MAX_PASSWORD_LENGTH} символов.`,
      });
      return;
    }
    if (body.termsAccepted !== true) {
      json(res, 400, { error: 'Необходимо принять условия регистрации.' });
      return;
    }
    if (findUserByEmail(email, database)) {
      json(res, 409, { error: 'Аккаунт с таким email уже существует.' });
      return;
    }

    let user;
    try {
      user = createUser({
        displayName,
        email,
        passwordHash: await hashPassword(password),
      }, database);
    } catch (error) {
      if (error.code === 'ERR_SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(error.message)) {
        json(res, 409, { error: 'Аккаунт с таким email уже существует.' });
        return;
      }
      console.error('Cannot register user:', error);
      json(res, 500, { error: 'Не удалось создать аккаунт.' });
      return;
    }

    const session = createSession(user.id, database);
    json(res, 201, { user }, {
      'Set-Cookie': sessionCookie(session.token, session.expiresAt),
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/auth/me') {
    const user = getAuthenticatedUser(req, database);
    if (!user) {
      json(res, 401, { error: 'Требуется вход в кабинет преподавателя.' });
      return;
    }
    json(res, 200, { user });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/logout') {
    deleteSession(getSessionToken(req), database);
    res.writeHead(204, {
      'Cache-Control': 'no-store',
      'Set-Cookie': clearSessionCookie(),
    });
    res.end();
    return;
  }

  if (req.method === 'GET' && (pathname === '/app' || pathname === '/dashboard.html')) {
    const user = getAuthenticatedUser(req, database);
    if (!user) {
      redirect(res, loginRedirect('/app'));
      return;
    }
    await serveAppPage('home', res, { user });
    return;
  }

  if (req.method === 'GET' && (pathname === '/lesson-drafts' || pathname === '/lesson-drafts/')) {
    const user = getAuthenticatedUser(req, database);
    if (!user) {
      redirect(res, loginRedirect('/lesson-drafts'));
      return;
    }
    if (user.role !== 'admin') {
      json(res, 403, { error: 'Раздел доступен только администратору.' });
      return;
    }
    await serveAppPage('lessonDrafts', res, { user });
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/lesson-drafts/') && pathname.endsWith('/edit')) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    const draftId = getLessonIdFromPath(pathname, '/lesson-drafts/', '/edit');
    if (!findLessonDraft(draftId, user.id, database)) {
      json(res, 404, { error: 'Черновик урока не найден.' });
      return;
    }
    serveStatic('/lesson-editor.html', res);
    return;
  }

  if (req.method === 'GET' && (
    pathname === '/generator' || pathname === '/generator/' || pathname === '/generator.html'
  )) {
    // Deprecated legacy surface: intentionally preserved as a working reference
    // for the future generator, but not linked from current product flows.
    if (!getAuthenticatedUser(req, database)) {
      redirect(res, loginRedirect('/generator'));
      return;
    }
    serveStatic('/generator.html', res);
    return;
  }

  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    serveStatic('/index.html', res);
    return;
  }

  if (req.method === 'GET' && pathname === '/library.html') {
    await serveAppPage('library', res, { user: getAuthenticatedUser(req, database) });
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    json(res, 200, { ok: true, rooms: clientsByRoom.size });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/home-content') {
    if (!requireTeacherAuth(req, res)) return;
    json(res, 200, homeContentMock);
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/lesson-draft-assets/')) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    const match = pathname.match(/^\/api\/lesson-draft-assets\/([^/]+)\/([^/]+)$/);
    let draftId = '';
    let fileName = '';
    try {
      draftId = match ? decodeURIComponent(match[1]) : '';
      fileName = match ? decodeURIComponent(match[2]) : '';
    } catch (_error) {
      // Invalid encoded path is handled as not found below.
    }
    const absolute = draftAssetPath(draftId, fileName);
    if (!absolute || !findLessonDraft(draftId, user.id, database)) {
      json(res, 404, { error: 'Изображение не найдено.' });
      return;
    }
    fs.readFile(absolute, (error, data) => {
      if (error) {
        json(res, 404, { error: 'Изображение не найдено.' });
        return;
      }
      res.writeHead(200, { 'Content-Type': getContentType(absolute), 'Cache-Control': 'private, max-age=3600' });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/generator/config') {
    // Legacy generator API. Keep compatible while /generator is retained as a reference.
    if (!requireTeacherAuth(req, res)) return;
    json(res, 200, getGeneratorConfig());
    return;
  }

  if (req.method === 'POST' && pathname === '/api/lesson-drafts') {
    const user = requireAdminAuth(req, res);
    if (!user) return;

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      json(res, 400, { error: error.message || 'Некорректный запрос.' });
      return;
    }

    const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
    const template = typeof body.template === 'string' ? body.template.trim() : '';
    if (!topic || topic.length > 120) {
      json(res, 400, { error: 'Тема должна содержать от 1 до 120 символов.' });
      return;
    }
    if (template !== 'template-1') {
      json(res, 400, { error: 'Выбран неизвестный шаблон урока.' });
      return;
    }

    try {
      const pendingDraft = createLessonDraft({ ownerAdminId: user.id, topic, template }, database);
      const lesson = createSyntheticLesson(topic);
      const draft = completeLessonDraft(pendingDraft.id, user.id, lesson, database);
      json(res, 201, { draft, lessonUrl: `/lesson-drafts/${encodeURIComponent(draft.id)}/edit` });
    } catch (error) {
      console.error('Cannot create lesson draft:', error);
      json(res, 500, { error: 'Не удалось создать черновик урока.' });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/lesson-drafts') {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    json(res, 200, { drafts: listLessonDrafts(user.id, database) });
    return;
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && pathname.startsWith('/api/lesson-drafts/')) {
    const imageRoute = getThisOrThatImageRouteParams(pathname);
    if (imageRoute) {
      const user = requireAdminAuth(req, res);
      if (!user) return;
      let newFile = null;
      try {
        if (!/^[a-f0-9-]{36}$/i.test(imageRoute.draftId)) {
          const error = new Error('Некорректный идентификатор черновика.');
          error.statusCode = 400;
          throw error;
        }
        let imageSrc = null;
        if (req.method === 'PUT') {
          const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
          const imageType = DRAFT_IMAGE_TYPES[contentType];
          if (!imageType) {
            const error = new Error('Разрешены только JPEG, PNG и WebP.');
            error.statusCode = 415;
            throw error;
          }
          const buffer = await readRawBody(req, MAX_DRAFT_IMAGE_BYTES);
          if (!buffer.length || !imageType.matches(buffer)) {
            const error = new Error('Содержимое файла не соответствует формату изображения.');
            error.statusCode = 415;
            throw error;
          }
          const fileName = `${crypto.randomUUID()}${imageType.extension}`;
          newFile = draftAssetPath(imageRoute.draftId, fileName);
          if (!newFile) throw new Error('Некорректный путь изображения.');
          fs.mkdirSync(path.dirname(newFile), { recursive: true });
          const temporaryFile = `${newFile}.tmp-${crypto.randomUUID()}`;
          fs.writeFileSync(temporaryFile, buffer, { flag: 'wx' });
          fs.renameSync(temporaryFile, newFile);
          imageSrc = `/api/lesson-draft-assets/${encodeURIComponent(imageRoute.draftId)}/${encodeURIComponent(fileName)}`;
        }
        const result = updateThisOrThatImage({
          id: imageRoute.draftId,
          ownerAdminId: user.id,
          componentId: imageRoute.componentId,
          itemId: imageRoute.itemId,
          optionId: imageRoute.optionId,
          imageSrc,
        }, database);
        const previousFile = assetFileFromUrl(result.previousImageSrc);
        if (previousFile && previousFile !== newFile) fs.rmSync(previousFile, { force: true });
        json(res, 200, { draft: result.draft });
      } catch (error) {
        if (newFile) fs.rmSync(newFile, { force: true });
        json(res, error.statusCode || 500, { error: error.message || 'Не удалось сохранить изображение.' });
      }
      return;
    }
  }

  if (req.method === 'PATCH' && pathname.startsWith('/api/lesson-drafts/')) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    const teacherNoteRoute = getTeacherNoteRouteParams(pathname);
    const taskPromptRoute = getTaskPromptRouteParams(pathname);
    if ((!teacherNoteRoute || !teacherNoteRoute.draftId || !teacherNoteRoute.noteId)
      && (!taskPromptRoute || !taskPromptRoute.draftId || !taskPromptRoute.promptId)) {
      json(res, 404, { error: 'Редактируемый компонент не найден.' });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (error) {
      json(res, 400, { error: error.message || 'Некорректный запрос.' });
      return;
    }

    try {
      const draft = teacherNoteRoute
        ? updateTeacherNote({
          id: teacherNoteRoute.draftId,
          ownerAdminId: user.id,
          noteId: teacherNoteRoute.noteId,
          text: body.text,
        }, database)
        : updateTaskPrompt({
          id: taskPromptRoute.draftId,
          ownerAdminId: user.id,
          promptId: taskPromptRoute.promptId,
          title: body.title,
          text: body.text,
          support: body.support,
        }, database);
      json(res, 200, { draft });
    } catch (error) {
      json(res, error.statusCode || 500, { error: error.message || 'Не удалось сохранить компонент.' });
    }
    return;
  }

  if (req.method === 'DELETE' && pathname.startsWith('/api/lesson-drafts/')) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    const draftId = getLessonIdFromPath(pathname, '/api/lesson-drafts/');
    try {
      deleteLessonDraft(draftId, user.id, database);
      if (/^[a-f0-9-]{36}$/i.test(draftId)) {
        fs.rmSync(path.join(DRAFT_ASSETS_DIR, draftId), { recursive: true, force: true });
      }
      json(res, 200, { ok: true });
    } catch (error) {
      json(res, error.statusCode || 500, { error: error.message || 'Не удалось удалить черновик.' });
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/lesson-drafts/')) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    const draftId = getLessonIdFromPath(pathname, '/api/lesson-drafts/');
    const draft = findLessonDraft(draftId, user.id, database);
    if (!draft) {
      json(res, 404, { error: 'Черновик урока не найден.' });
      return;
    }
    json(res, 200, { draft });
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
    // Legacy generator API. New lesson creation must not depend on this endpoint.
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

  if (req.method === 'GET' && pathname.startsWith('/assets/')) {
    serveStatic(pathname, res);
    return;
  }

  if (req.method === 'GET') {
    json(res, 404, { error: 'Not found' });
    return;
  }

  json(res, 405, { error: 'Method not allowed' });
});

server.listen(PORT, HOST, () => {
  console.log(`Lesson server running on http://${HOST}:${PORT}`);
});
