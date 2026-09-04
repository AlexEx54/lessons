const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { loadDotEnv } = require('./lib/env.js');

loadDotEnv(path.join(__dirname, '.env'));

const { renderAppPage } = require('./lib/app-shell.js');
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
  createVideoCall,
  endVideoCall,
  findOwnedVideoCall,
  findVideoCallByGuestToken,
  listVideoCalls,
  resetInterruptedVideoCalls,
  rotateVideoCallGuestToken,
} = require('./lib/video-call-store.js');
const { getIceServers } = require('./lib/webrtc-config.js');
const { createVideoCallSignaling } = require('./lib/video-call-signaling.js');
const {
  completeLessonDraft,
  createLessonDraft,
  deleteLessonDraft,
  failLessonDraft,
  findLessonDraft,
  listLessonDrafts,
  retryLessonDraft,
  updateAudioPlayer,
  updateAudioPlayerAudio,
  updateIllustratedTextPanel,
  updateIllustratedTextPanelImage,
  updateDescribeAndGuess,
  updateHowToPlay,
  updateGuidedRoleCards,
  updateSpeakingSupport,
  updateThreeTwoOne,
  updateSelfAssessment,
  updateFillInBlanks,
  updateDragWordsInText,
  updateDropdownChoice,
  updateGapFill,
  updateMiniSituation,
  updateMarkdownCard,
  updateMatchWordsImage,
  updateCheckboxChoice,
  updateMultipleChoice,
  updatePersonalizedQuestions,
  updateTaskPrompt,
  updateTeacherNote,
  updateTextReading,
  updateTextReadingImage,
  updateTextPanel,
  updateThisOrThatImage,
} = require('./lib/lesson-draft-store.js');
const { createSyntheticLesson } = require('./lib/synthetic-lesson.js');
const {
  completeLessonGeneration,
  createLessonGeneration,
  failInterruptedLessonGenerations,
  failLessonGeneration,
  findLessonGeneration,
  retryLessonGeneration,
  updateLessonGenerationStream,
} = require('./lib/lesson-generation-store.js');
const { recoverLessonGeneration } = require('./lib/lesson-generation-recovery.js');
const { stopInterruptedLessonImageGenerations } = require('./lib/lesson-image-generation-store.js');
const { LessonImageGenerator } = require('./lib/lesson-image-generator.js');
const {
  LESSON_MODEL_OPTIONS,
  OPENROUTER_BASE_URL,
  applyGrammarFocusToSkeleton,
  applyGrammarPresentationToSkeleton,
  applyGuidedSpeakingToSkeleton,
  applyLeadInToSkeleton,
  applyLessonMetadataToSkeleton,
  applyListeningToSkeleton,
  applyReadingToSkeleton,
  applyTargetVocabularyToSkeleton,
  applyWarmUpToSkeleton,
  applyWrapUpToSkeleton,
  createLessonSkeleton,
  generateGrammarFocus,
  generateGrammarPresentation,
  generateGuidedSpeaking,
  generateLeadIn,
  generateLessonMetadata,
  generateListening,
  generateReading,
  generateTargetVocabulary,
  generateWarmUp,
  generateWrapUp,
} = require('./lib/ai-lesson-generator.js');

const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const ROOT = __dirname;
const DRAFT_ASSETS_DIR = path.resolve(process.env.DRAFT_ASSETS_DIR || path.join(ROOT, 'data', 'draft-assets'));
const database = getDatabase();
const lessonImageGenerator = new LessonImageGenerator({
  database,
  assetsDirectory: DRAFT_ASSETS_DIR,
});
const generationControllers = new Map();
const generationSubscribers = new Map();
let videoCallSignaling = null;

resetInterruptedVideoCalls(database);

const interruptedGenerationIds = failInterruptedLessonGenerations(database);
if (interruptedGenerationIds.length > 0) {
  console.warn(`Marked ${interruptedGenerationIds.length} interrupted lesson generation(s) as failed.`);
}
const interruptedImageGenerationIds = stopInterruptedLessonImageGenerations(database);
if (interruptedImageGenerationIds.length > 0) {
  console.warn(`Stopped ${interruptedImageGenerationIds.length} interrupted image generation(s).`);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 10;
const MAX_PASSWORD_LENGTH = 256;
const MAX_DRAFT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DRAFT_AUDIO_BYTES = 20 * 1024 * 1024;
const DRAFT_IMAGE_TYPES = Object.freeze({
  'image/jpeg': { extension: '.jpg', matches: buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/png': { extension: '.png', matches: buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/webp': { extension: '.webp', matches: buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
});
const DRAFT_AUDIO_TYPES = Object.freeze({
  'audio/mpeg': {
    extension: '.mp3',
    matches: buffer => buffer.length >= 3 && (
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
      || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    ),
  },
  'audio/mp3': {
    extension: '.mp3',
    matches: buffer => buffer.length >= 3 && (
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
      || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    ),
  },
  'audio/wav': {
    extension: '.wav',
    matches: buffer => buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WAVE',
  },
  'audio/wave': {
    extension: '.wav',
    matches: buffer => buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WAVE',
  },
  'audio/x-wav': {
    extension: '.wav',
    matches: buffer => buffer.length >= 12
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WAVE',
  },
  'audio/mp4': {
    extension: '.m4a',
    matches: buffer => buffer.length >= 12
      && buffer.toString('ascii', 4, 8) === 'ftyp'
      && ['M4A ', 'M4B ', 'mp41', 'mp42', 'isom', 'MSNV'].includes(buffer.toString('ascii', 8, 12)),
  },
  'audio/x-m4a': {
    extension: '.m4a',
    matches: buffer => buffer.length >= 12
      && buffer.toString('ascii', 4, 8) === 'ftyp'
      && ['M4A ', 'M4B ', 'mp41', 'mp42', 'isom', 'MSNV'].includes(buffer.toString('ascii', 8, 12)),
  },
});

function writeGenerationEvent(res, event, payload) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function publishGenerationEvent(draftId, event, payload) {
  const subscribers = generationSubscribers.get(draftId);
  if (!subscribers) return;
  subscribers.forEach(res => writeGenerationEvent(res, event, payload));
}

function finishGenerationStreams(draftId, event, payload) {
  const subscribers = generationSubscribers.get(draftId);
  if (!subscribers) return;
  subscribers.forEach(res => {
    writeGenerationEvent(res, event, payload);
    res.end();
  });
  generationSubscribers.delete(draftId);
}

function publicGenerationSnapshot(generation) {
  return {
    mode: generation.mode,
    model: generation.model,
    status: generation.status,
    reasoning: generation.reasoning,
    output: generation.output,
    costUsd: generation.costUsd,
    promptTokens: generation.promptTokens,
    completionTokens: generation.completionTokens,
    reasoningTokens: generation.reasoningTokens,
    startedAt: generation.startedAt,
    completedAt: generation.completedAt,
    errorMessage: generation.errorMessage,
  };
}

function aggregateGenerationUsage(first = {}, second = {}) {
  function sumFinite(field, integer = false) {
    const values = [first[field], second[field]].filter(value => (
      integer ? Number.isInteger(value) : Number.isFinite(value)
    ));
    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) : null;
  }

  return {
    cost: sumFinite('cost'),
    promptTokens: sumFinite('promptTokens', true),
    completionTokens: sumFinite('completionTokens', true),
    reasoningTokens: sumFinite('reasoningTokens', true),
  };
}

async function runAiLessonGeneration({
  draftId,
  ownerAdminId,
  topic,
  warmUpTopic,
  grammarTopic,
  ageGroup,
  level,
  model,
  skeleton,
  recoveredSections = {},
  initialOutput = '',
  initialUsage = {},
}) {
  const controller = new AbortController();
  generationControllers.set(draftId, controller);
  let reasoning = '';
  let output = initialOutput;
  let usage = initialUsage;
  let completedUsage = initialUsage;
  let providerGenerationId = '';
  let flushTimer = null;
  let activeSection = 'Warm-Up';

  function flushStream() {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    updateLessonGenerationStream({ draftId, reasoning, output, providerGenerationId }, database);
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushStream, 500);
  }

  async function generateSection(sectionName, sectionTopic, generator) {
    activeSection = sectionName;
    const reasoningHeader = `${reasoning ? '\n\n' : ''}=== ${sectionName} ===\n`;
    const outputHeader = `${output ? '\n\n' : ''}=== ${sectionName} ===\n`;
    reasoning += reasoningHeader;
    output += outputHeader;
    publishGenerationEvent(draftId, 'reasoning', { delta: reasoningHeader });
    publishGenerationEvent(draftId, 'output', { delta: outputHeader });
    scheduleFlush();

    const result = await generator({
      topic: sectionTopic,
      ageGroup,
      level,
      apiKey: process.env.OPENROUTER_API_KEY,
      baseUrl: process.env.OPENROUTER_BASE_URL || OPENROUTER_BASE_URL,
      model,
      signal: controller.signal,
      onDelta: delta => {
        reasoning += delta.reasoningDelta || '';
        output += delta.outputDelta || '';
        usage = aggregateGenerationUsage(completedUsage, delta.usage);
        if (delta.providerGenerationId) providerGenerationId = delta.providerGenerationId;
        if (delta.reasoningDelta) {
          publishGenerationEvent(draftId, 'reasoning', { delta: delta.reasoningDelta });
        }
        if (delta.outputDelta) {
          publishGenerationEvent(draftId, 'output', { delta: delta.outputDelta });
        }
        if (Number.isFinite(usage.cost)) {
          publishGenerationEvent(draftId, 'usage', { costUsd: usage.cost });
        }
        scheduleFlush();
      },
    });
    completedUsage = aggregateGenerationUsage(completedUsage, result.usage);
    usage = completedUsage;
    if (result.providerGenerationId) providerGenerationId = result.providerGenerationId;
    flushStream();
    return result;
  }

  function recoverOrGenerate(key, sectionName, sectionTopic, generator) {
    if (Object.hasOwn(recoveredSections, key)) {
      return Promise.resolve({ generated: recoveredSections[key], usage: {} });
    }
    return generateSection(sectionName, sectionTopic, generator);
  }

  try {
    if (typeof model !== 'string' || !model.trim()) {
      throw new Error('Модель генерации не задана.');
    }
    const metadataResult = await recoverOrGenerate(
      'lessonMetadata', 'Lesson Metadata', topic, generateLessonMetadata,
    );
    const warmUpResult = await recoverOrGenerate('warmUp', 'Warm-Up', warmUpTopic, generateWarmUp);
    const leadInResult = await recoverOrGenerate('leadIn', 'Lead-In', topic, generateLeadIn);
    const targetVocabularyResult = await recoverOrGenerate(
      'targetVocabulary', 'Target Vocabulary', topic, generateTargetVocabulary,
    );
    const readingResult = await recoverOrGenerate(
      'reading',
      'Reading',
      topic,
      options => generateReading({
        ...options,
        grammarTopic,
        vocabularyItems: targetVocabularyResult.generated.vocabularyItems,
      }),
    );
    const listeningResult = await recoverOrGenerate(
      'listening',
      'Listening',
      topic,
      options => generateListening({
        ...options,
        grammarTopic,
        vocabularyItems: targetVocabularyResult.generated.vocabularyItems,
      }),
    );
    const grammarPresentationResult = await recoverOrGenerate(
      'grammarPresentation',
      'Grammar Presentation',
      topic,
      options => generateGrammarPresentation({ ...options, grammarTopic }),
    );
    const grammarFocusResult = await recoverOrGenerate(
      'grammarFocus',
      'Grammar Focus',
      topic,
      options => generateGrammarFocus({
        ...options,
        grammarTopic,
        vocabularyItems: targetVocabularyResult.generated.vocabularyItems,
      }),
    );
    const guidedSpeakingResult = await recoverOrGenerate(
      'guidedSpeaking',
      'Guided Speaking',
      topic,
      options => generateGuidedSpeaking({
        ...options,
        vocabularyItems: targetVocabularyResult.generated.vocabularyItems,
      }),
    );
    const wrapUpResult = await recoverOrGenerate(
      'wrapUp',
      'Wrap-Up',
      topic,
      options => generateWrapUp({
        ...options,
        grammarTopic,
        vocabularyItems: targetVocabularyResult.generated.vocabularyItems,
      }),
    );
    const lessonWithMetadata = applyLessonMetadataToSkeleton(skeleton, metadataResult.generated);
    const lessonWithWarmUp = applyWarmUpToSkeleton(lessonWithMetadata, warmUpResult.generated);
    const lessonWithLeadIn = applyLeadInToSkeleton(lessonWithWarmUp, leadInResult.generated);
    const lessonWithTargetVocabulary = applyTargetVocabularyToSkeleton(
      lessonWithLeadIn, targetVocabularyResult.generated,
    );
    const lessonWithReading = applyReadingToSkeleton(
      lessonWithTargetVocabulary,
      readingResult.generated,
      targetVocabularyResult.generated.vocabularyItems,
    );
    const lessonWithListening = applyListeningToSkeleton(
      lessonWithReading, listeningResult.generated,
    );
    const lessonWithGrammarPresentation = applyGrammarPresentationToSkeleton(
      lessonWithListening, grammarPresentationResult.generated,
    );
    const lessonWithGrammarFocus = applyGrammarFocusToSkeleton(
      lessonWithGrammarPresentation,
      grammarFocusResult.generated,
      targetVocabularyResult.generated.vocabularyItems,
    );
    const lessonWithGuidedSpeaking = applyGuidedSpeakingToSkeleton(
      lessonWithGrammarFocus,
      guidedSpeakingResult.generated,
      targetVocabularyResult.generated.vocabularyItems,
    );
    const lesson = applyWrapUpToSkeleton(lessonWithGuidedSpeaking, wrapUpResult.generated);
    database.exec('BEGIN IMMEDIATE');
    try {
      completeLessonDraft(draftId, ownerAdminId, lesson, database);
      completeLessonGeneration({
        draftId, reasoning, output, usage, providerGenerationId,
      }, database);
      lessonImageGenerator.initialize(draftId, lesson);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    lessonImageGenerator.enqueue(draftId, ownerAdminId);
    finishGenerationStreams(draftId, 'done', { status: 'completed', costUsd: usage.cost ?? null });
  } catch (error) {
    if (flushTimer) clearTimeout(flushTimer);
    if (!findLessonDraft(draftId, ownerAdminId, database)) return;
    const message = error?.name === 'TimeoutError'
      ? `Генерация ${activeSection} превысила лимит в пять минут.`
      : error.message || `Не удалось сгенерировать ${activeSection}.`;
    try {
      database.exec('BEGIN IMMEDIATE');
      failLessonDraft(draftId, ownerAdminId, message, database);
      failLessonGeneration({
        draftId, reasoning, output, usage, providerGenerationId, errorMessage: message,
      }, database);
      database.exec('COMMIT');
    } catch (storeError) {
      database.exec('ROLLBACK');
      console.error('Cannot persist failed lesson generation:', storeError);
    }
    finishGenerationStreams(draftId, 'generation-error', { status: 'failed', message, costUsd: usage.cost ?? null });
    console.error(`Cannot generate ${activeSection} for draft ${draftId}:`, error);
  } finally {
    if (flushTimer) clearTimeout(flushTimer);
    if (generationControllers.get(draftId) === controller) generationControllers.delete(draftId);
  }
}

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

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a') return 'audio/mp4';
  if (ext === '.wasm') return 'application/wasm';
  if (ext === '.tflite') return 'application/octet-stream';
  return 'text/plain; charset=utf-8';
}

function safePathname(inputPath) {
  const normalized = path.normalize(inputPath).replace(/^([.][.][/\\])+/, '');
  return normalized;
}

function serveStatic(reqPath, res) {
  const target = reqPath === '/' ? 'index.html' : safePathname(reqPath.slice(1));
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
      'Cache-Control': target.startsWith('assets/vendor/mediapipe-1.0.1/')
        ? 'public, max-age=31536000, immutable'
        : 'no-store',
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

function getMarkdownCardRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/markdown-cards\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getFillInBlanksRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/fill-in-blanks\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getDragWordsInTextRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/drag-words-in-text\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getDropdownChoiceRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/dropdown-choice\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getGapFillRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/gap-fill\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getMultipleChoiceRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/multiple-choice\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getCheckboxChoiceRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/checkbox-choice\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getPersonalizedQuestionsRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/personalized-questions\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getDescribeAndGuessRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/describe-and-guess\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getHowToPlayRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/how-to-play\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getGuidedRoleCardsRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/guided-role-cards\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getSpeakingSupportRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/speaking-support\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getThreeTwoOneRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/three-two-one\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getSelfAssessmentRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/self-assessment\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getTextPanelRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/text-panels\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      panelId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getIllustratedTextPanelRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/illustrated-text-panels\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      panelId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getMiniSituationRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/mini-situation\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getAudioPlayerRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/audio-player\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getAudioPlayerAudioRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/audio-player\/([^/]+)\/audio$/);
  if (!match) return null;
  try {
    const values = match.slice(1).map(value => decodeURIComponent(value).trim());
    if (values.some(value => !value)) return null;
    return { draftId: values[0], componentId: values[1] };
  } catch (_error) {
    return null;
  }
}

function getTextReadingRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/text-readings\/([^/]+)$/);
  if (!match) return null;
  try {
    return {
      draftId: decodeURIComponent(match[1]).trim(),
      componentId: decodeURIComponent(match[2]).trim(),
    };
  } catch (_error) {
    return null;
  }
}

function getTextReadingImageRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/text-readings\/([^/]+)\/pictures\/(header|text)\/image$/);
  if (!match) return null;
  try {
    const values = match.slice(1).map(value => decodeURIComponent(value).trim());
    if (values.some(value => !value)) return null;
    return { draftId: values[0], componentId: values[1], side: values[2] };
  } catch (_error) {
    return null;
  }
}

function getIllustratedTextPanelImageRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/illustrated-text-panels\/([^/]+)\/pictures\/(leading|trailing)\/image$/);
  if (!match) return null;
  try {
    const values = match.slice(1).map(value => decodeURIComponent(value).trim());
    if (values.some(value => !value)) return null;
    return { draftId: values[0], panelId: values[1], side: values[2] };
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

function getMatchWordsImageRouteParams(pathname) {
  const match = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/match-words\/([^/]+)\/items\/([^/]+)\/image$/);
  if (!match) return null;
  try {
    const values = match.slice(1).map(value => decodeURIComponent(value).trim());
    if (values.some(value => !value)) return null;
    return { draftId: values[0], componentId: values[1], itemId: values[2] };
  } catch (_error) {
    return null;
  }
}

function draftAssetPath(draftId, fileName) {
  if (!/^[a-f0-9-]{36}$/i.test(draftId) || !/^[a-f0-9-]{36}\.(?:jpg|png|webp|mp3|wav|m4a)$/i.test(fileName)) {
    return null;
  }
  const draftDirectory = path.join(DRAFT_ASSETS_DIR, draftId);
  const absolute = path.join(draftDirectory, fileName);
  return absolute.startsWith(`${draftDirectory}${path.sep}`) ? absolute : null;
}

function assetFileFromUrl(value) {
  const match = String(value || '').match(/^\/api\/lesson-draft-assets\/([a-f0-9-]{36})\/([a-f0-9-]{36}\.(?:jpg|png|webp|mp3|wav|m4a))$/i);
  return match ? draftAssetPath(match[1], match[2]) : null;
}

function parseByteRange(header, total) {
  const match = String(header || '').trim().match(/^bytes=(\d*)-(\d*)$/i);
  if (!match || total < 1) return null;
  const hasStart = match[1] !== '';
  const hasEnd = match[2] !== '';
  if (!hasStart && !hasEnd) return null;
  let start;
  let end;
  if (!hasStart) {
    start = Math.max(0, total - Number(match[2]));
    end = total - 1;
  } else {
    start = Number(match[1]);
    end = hasEnd ? Number(match[2]) : total - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= total) {
    return null;
  }
  return { start, end: Math.min(end, total - 1) };
}

function sendDraftAsset(res, absolute, data, rangeHeader) {
  const contentType = getContentType(absolute);
  const total = data.length;
  const headers = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };
  if (!rangeHeader) {
    headers['Content-Length'] = total;
    res.writeHead(200, headers);
    res.end(data);
    return;
  }
  const range = parseByteRange(rangeHeader, total);
  if (!range) {
    res.writeHead(416, {
      'Content-Range': `bytes */${total}`,
      'Accept-Ranges': 'bytes',
    });
    res.end();
    return;
  }
  headers['Content-Range'] = `bytes ${range.start}-${range.end}/${total}`;
  headers['Content-Length'] = range.end - range.start + 1;
  res.writeHead(206, headers);
  res.end(data.subarray(range.start, range.end + 1));
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

  if (req.method === 'GET' && (pathname === '/video-calls' || pathname === '/video-calls/')) {
    const user = getAuthenticatedUser(req, database);
    if (!user) {
      redirect(res, loginRedirect('/video-calls'));
      return;
    }
    if (user.role !== 'admin') {
      json(res, 403, { error: 'Раздел доступен только администратору.' });
      return;
    }
    await serveAppPage('videoCalls', res, { user });
    return;
  }

  const teacherVideoCallPage = pathname.match(/^\/video-calls\/([^/]+)$/);
  if (req.method === 'GET' && teacherVideoCallPage) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    let callId = '';
    try { callId = decodeURIComponent(teacherVideoCallPage[1]); } catch (_error) { /* handled below */ }
    const call = findOwnedVideoCall(callId, user.id, database);
    if (!call) {
      json(res, 404, { error: 'Видеозвонок не найден.' });
      return;
    }
    serveStatic('/video-call-room.html', res);
    return;
  }

  const guestVideoCallPage = pathname.match(/^\/call\/([^/]+)$/);
  if (req.method === 'GET' && guestVideoCallPage) {
    let guestToken = '';
    try { guestToken = decodeURIComponent(guestVideoCallPage[1]); } catch (_error) { /* handled below */ }
    if (!findVideoCallByGuestToken(guestToken, database)) {
      json(res, 404, { error: 'Ссылка на видеозвонок недействительна.' });
      return;
    }
    serveStatic('/video-call-room.html', res);
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

  if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
    if (getAuthenticatedUser(req, database)) {
      redirect(res, '/app');
      return;
    }
    serveStatic('/index.html', res);
    return;
  }

  if (req.method === 'GET' && pathname === '/library.html') {
    await serveAppPage('library', res, { user: getAuthenticatedUser(req, database) });
    return;
  }

  if (req.method === 'GET' && pathname === '/health') {
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/home-content') {
    if (!requireTeacherAuth(req, res)) return;
    json(res, 200, homeContentMock);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/video-calls') {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    try {
      const call = createVideoCall({ ownerAdminId: user.id }, database);
      const guestPath = `/call/${encodeURIComponent(call.guestToken)}`;
      delete call.guestToken;
      json(res, 201, { call, guestPath });
    } catch (error) {
      console.error('Cannot create video call:', error);
      json(res, 500, { error: 'Не удалось создать видеозвонок.' });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/video-calls') {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    json(res, 200, { calls: listVideoCalls(user.id, database) });
    return;
  }

  const videoCallInviteRoute = pathname.match(/^\/api\/video-calls\/([^/]+)\/invite$/);
  if (req.method === 'POST' && videoCallInviteRoute) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    let callId = '';
    try { callId = decodeURIComponent(videoCallInviteRoute[1]); } catch (_error) { /* handled below */ }
    const guestToken = rotateVideoCallGuestToken(callId, user.id, database);
    if (!guestToken) {
      json(res, 409, { error: 'Звонок завершён или срок ссылки истёк.' });
      return;
    }
    json(res, 200, { guestPath: `/call/${encodeURIComponent(guestToken)}` });
    return;
  }

  const videoCallEndRoute = pathname.match(/^\/api\/video-calls\/([^/]+)\/end$/);
  if (req.method === 'POST' && videoCallEndRoute) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    let callId = '';
    try { callId = decodeURIComponent(videoCallEndRoute[1]); } catch (_error) { /* handled below */ }
    const call = endVideoCall(callId, user.id, database);
    if (!call) {
      json(res, 404, { error: 'Видеозвонок не найден.' });
      return;
    }
    videoCallSignaling?.closeRoom(callId);
    json(res, 200, { call });
    return;
  }

  const publicVideoCallApi = pathname.match(/^\/api\/public\/video-calls\/([^/]+)$/);
  if (req.method === 'GET' && publicVideoCallApi) {
    let guestToken = '';
    try { guestToken = decodeURIComponent(publicVideoCallApi[1]); } catch (_error) { /* handled below */ }
    const call = findVideoCallByGuestToken(guestToken, database);
    if (!call) {
      json(res, 404, { error: 'Ссылка на видеозвонок недействительна.' });
      return;
    }
    if (!['waiting', 'active'].includes(call.status)) {
      json(res, 410, { error: call.status === 'expired' ? 'Срок действия ссылки истёк.' : 'Видеозвонок завершён.' });
      return;
    }
    json(res, 200, {
      call,
      iceServers: getIceServers(`guest-${call.id.slice(0, 8)}`),
    });
    return;
  }

  const ownedVideoCallApi = pathname.match(/^\/api\/video-calls\/([^/]+)$/);
  if (req.method === 'GET' && ownedVideoCallApi) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    let callId = '';
    try { callId = decodeURIComponent(ownedVideoCallApi[1]); } catch (_error) { /* handled below */ }
    const call = findOwnedVideoCall(callId, user.id, database);
    if (!call) {
      json(res, 404, { error: 'Видеозвонок не найден.' });
      return;
    }
    if (!['waiting', 'active'].includes(call.status)) {
      json(res, 410, { error: call.status === 'expired' ? 'Срок действия ссылки истёк.' : 'Видеозвонок завершён.' });
      return;
    }
    json(res, 200, {
      call,
      iceServers: getIceServers(`teacher-${user.id.slice(0, 8)}`),
    });
    return;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/api/lesson-draft-assets/')) {
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
      json(res, 404, { error: 'Файл не найден.' });
      return;
    }
    fs.stat(absolute, (statError, stats) => {
      if (statError || !stats.isFile()) {
        json(res, 404, { error: 'Файл не найден.' });
        return;
      }
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Type': getContentType(absolute),
          'Content-Length': stats.size,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'private, max-age=3600',
        });
        res.end();
        return;
      }
      fs.readFile(absolute, (error, data) => {
        if (error) {
          json(res, 404, { error: 'Файл не найден.' });
          return;
        }
        sendDraftAsset(res, absolute, data, req.headers.range);
      });
    });
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
    const requestedWarmUpTopic = typeof body.warmUpTopic === 'string' ? body.warmUpTopic.trim() : '';
    const warmUpTopic = requestedWarmUpTopic || topic;
    const grammarTopic = typeof body.grammarTopic === 'string' ? body.grammarTopic.trim() : '';
    const ageGroup = body.ageGroup === undefined ? '12-14' : body.ageGroup;
    const level = body.level === undefined ? 'A2' : body.level;
    const template = typeof body.template === 'string' ? body.template.trim() : '';
    const model = typeof body.model === 'string' ? body.model.trim() : null;
    const synthetic = body.synthetic === true;
    if (!topic || topic.length > 120) {
      json(res, 400, { error: 'Тема должна содержать от 1 до 120 символов.' });
      return;
    }
    if (body.warmUpTopic !== undefined && typeof body.warmUpTopic !== 'string') {
      json(res, 400, { error: 'Тема Warm-Up должна быть строкой.' });
      return;
    }
    if (warmUpTopic.length > 120) {
      json(res, 400, { error: 'Тема Warm-Up должна содержать не более 120 символов.' });
      return;
    }
    if (!grammarTopic || grammarTopic.length > 120) {
      json(res, 400, { error: 'Тема Grammar должна содержать от 1 до 120 символов.' });
      return;
    }
    if (!['9-11', '12-14', '15-18'].includes(ageGroup)) {
      json(res, 400, { error: 'Выбрана неизвестная возрастная группа.' });
      return;
    }
    if (!['A1', 'A2', 'B1', 'B2'].includes(level)) {
      json(res, 400, { error: 'Выбран неизвестный уровень сложности.' });
      return;
    }
    if (template !== 'template-1') {
      json(res, 400, { error: 'Выбран неизвестный шаблон урока.' });
      return;
    }
    if (!model || !LESSON_MODEL_OPTIONS[model]) {
      json(res, 400, { error: 'Выбрана неизвестная модель генерации.' });
      return;
    }
    if (body.synthetic !== undefined && typeof body.synthetic !== 'boolean') {
      json(res, 400, { error: 'Режим синтетического урока должен быть логическим значением.' });
      return;
    }
    if (!synthetic && !process.env.OPENROUTER_API_KEY) {
      json(res, 503, { error: 'Нейрогенерация временно недоступна: OPENROUTER_API_KEY не настроен.' });
      return;
    }

    try {
      let draft;
      let pendingDraft;
      let lesson;
      database.exec('BEGIN IMMEDIATE');
      try {
        lesson = synthetic
          ? createSyntheticLesson(topic)
          : createLessonSkeleton(topic, { ageGroup, level, model });
        lesson.meta.ageGroup = ageGroup;
        lesson.meta.level = level;
        pendingDraft = createLessonDraft({
          ownerAdminId: user.id,
          topic,
          warmUpTopic,
          grammarTopic,
          ageGroup,
          level,
          template,
          content: synthetic ? undefined : lesson,
        }, database);
        createLessonGeneration({
          draftId: pendingDraft.id,
          mode: synthetic ? 'synthetic' : 'ai',
          model: synthetic ? null : model,
        }, database);
        if (synthetic) {
          completeLessonDraft(pendingDraft.id, user.id, lesson, database);
          completeLessonGeneration({
            draftId: pendingDraft.id,
            reasoning: 'Синтетический урок создан по локальному шаблону без обращения к нейросети.',
            output: JSON.stringify(lesson, null, 2),
            usage: { cost: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 },
          }, database);
          lessonImageGenerator.initialize(pendingDraft.id, lesson);
        }
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      draft = findLessonDraft(pendingDraft.id, user.id, database);
      json(res, 201, { draft, lessonUrl: `/lesson-drafts/${encodeURIComponent(draft.id)}/edit` });
      if (synthetic) {
        lessonImageGenerator.enqueue(draft.id, user.id);
      } else {
        setImmediate(() => {
          runAiLessonGeneration({
            draftId: draft.id,
            ownerAdminId: user.id,
            topic,
            warmUpTopic,
            grammarTopic,
            ageGroup,
            level,
            model,
            skeleton: lesson,
          });
        });
      }
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

  const lessonGenerationRetry = pathname.match(/^\/api\/lesson-drafts\/([^/]+)\/retry$/);
  if (req.method === 'POST' && lessonGenerationRetry) {
    const user = requireAdminAuth(req, res);
    if (!user) return;

    let draftId = '';
    try {
      draftId = decodeURIComponent(lessonGenerationRetry[1]);
      const draft = findLessonDraft(draftId, user.id, database);
      if (!draft) {
        json(res, 404, { error: 'Черновик урока не найден.' });
        return;
      }
      const generation = findLessonGeneration(draftId, database);
      if (!generation) {
        json(res, 404, { error: 'Журнал генерации не найден.' });
        return;
      }
      const model = typeof generation.model === 'string' ? generation.model.trim() : '';
      if (!model) {
        json(res, 409, { error: 'В журнале генерации не сохранена модель.' });
        return;
      }

      const skeleton = draft.content || createLessonSkeleton(draft.topic, {
        ageGroup: draft.ageGroup,
        level: draft.level,
        model,
      });
      const recovery = recoverLessonGeneration(generation.output, skeleton);
      if (Object.keys(recovery.recoveredSections).length < 10 && !process.env.OPENROUTER_API_KEY) {
        json(res, 503, { error: 'Нейрогенерация временно недоступна: OPENROUTER_API_KEY не настроен.' });
        return;
      }

      database.exec('BEGIN IMMEDIATE');
      try {
        retryLessonDraft(draftId, user.id, database);
        retryLessonGeneration({ draftId, output: recovery.validOutput }, database);
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }

      const retriedDraft = findLessonDraft(draftId, user.id, database);
      json(res, 202, { draft: retriedDraft });
      setImmediate(() => {
        runAiLessonGeneration({
          draftId,
          ownerAdminId: user.id,
          topic: draft.topic,
          warmUpTopic: draft.warmUpTopic,
          grammarTopic: draft.grammarTopic,
          ageGroup: draft.ageGroup,
          level: draft.level,
          model,
          skeleton,
          recoveredSections: recovery.recoveredSections,
          initialOutput: recovery.validOutput,
          initialUsage: {
            cost: generation.costUsd,
            promptTokens: generation.promptTokens,
            completionTokens: generation.completionTokens,
            reasoningTokens: generation.reasoningTokens,
          },
        });
      });
    } catch (error) {
      json(res, error.statusCode || 500, {
        error: error.message || 'Не удалось повторить генерацию.',
      });
    }
    return;
  }

  if (req.method === 'GET'
    && /^\/api\/lesson-drafts\/[^/]+\/generation-stream$/.test(pathname)) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    const draftId = getLessonIdFromPath(pathname, '/api/lesson-drafts/', '/generation-stream');
    const draft = findLessonDraft(draftId, user.id, database);
    if (!draft) {
      json(res, 404, { error: 'Черновик урока не найден.' });
      return;
    }
    const generation = findLessonGeneration(draftId, database);
    if (!generation) {
      json(res, 404, { error: 'Журнал генерации не найден.' });
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    writeGenerationEvent(res, 'snapshot', publicGenerationSnapshot(generation));
    if (generation.status !== 'running') {
      writeGenerationEvent(res, generation.status === 'completed' ? 'done' : 'generation-error', {
        status: generation.status,
        message: generation.errorMessage,
        costUsd: generation.costUsd,
      });
      res.end();
      return;
    }
    if (!generationSubscribers.has(draftId)) generationSubscribers.set(draftId, new Set());
    generationSubscribers.get(draftId).add(res);
    const heartbeat = setInterval(() => {
      if (!res.writableEnded && !res.destroyed) res.write(': heartbeat\n\n');
    }, 15000);
    req.on('close', () => {
      clearInterval(heartbeat);
      const subscribers = generationSubscribers.get(draftId);
      subscribers?.delete(res);
      if (subscribers?.size === 0) generationSubscribers.delete(draftId);
    });
    return;
  }

  const imageGenerationAction = pathname.match(
    /^\/api\/lesson-drafts\/([^/]+)\/image-generation\/(start|stop)$/,
  );
  if (req.method === 'POST' && imageGenerationAction) {
    const user = requireAdminAuth(req, res);
    if (!user) return;
    let draftId = '';
    try {
      draftId = decodeURIComponent(imageGenerationAction[1]);
      const action = imageGenerationAction[2];
      const draft = action === 'start'
        ? lessonImageGenerator.restart(draftId, user.id)
        : lessonImageGenerator.stop(draftId, user.id);
      json(res, 202, { draft });
    } catch (error) {
      json(res, error.statusCode || 500, {
        error: error.message || 'Не удалось изменить генерацию изображений.',
      });
    }
    return;
  }

  if ((req.method === 'PUT' || req.method === 'DELETE') && pathname.startsWith('/api/lesson-drafts/')) {
    const audioPlayerAudioRoute = getAudioPlayerAudioRouteParams(pathname);
    if (audioPlayerAudioRoute) {
      const user = requireAdminAuth(req, res);
      if (!user) return;
      let newFile = null;
      try {
        if (!/^[a-f0-9-]{36}$/i.test(audioPlayerAudioRoute.draftId)) {
          const error = new Error('Некорректный идентификатор черновика.');
          error.statusCode = 400;
          throw error;
        }
        let audioSrc = null;
        if (req.method === 'PUT') {
          const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
          const audioType = DRAFT_AUDIO_TYPES[contentType];
          if (!audioType) {
            const error = new Error('Разрешены только MP3, WAV и M4A.');
            error.statusCode = 415;
            throw error;
          }
          const buffer = await readRawBody(req, MAX_DRAFT_AUDIO_BYTES);
          if (!buffer.length || !audioType.matches(buffer)) {
            const error = new Error('Содержимое файла не соответствует формату аудио.');
            error.statusCode = 415;
            throw error;
          }
          const fileName = `${crypto.randomUUID()}${audioType.extension}`;
          newFile = draftAssetPath(audioPlayerAudioRoute.draftId, fileName);
          if (!newFile) throw new Error('Некорректный путь аудио.');
          fs.mkdirSync(path.dirname(newFile), { recursive: true });
          const temporaryFile = `${newFile}.tmp-${crypto.randomUUID()}`;
          fs.writeFileSync(temporaryFile, buffer, { flag: 'wx' });
          fs.renameSync(temporaryFile, newFile);
          audioSrc = `/api/lesson-draft-assets/${encodeURIComponent(audioPlayerAudioRoute.draftId)}/${encodeURIComponent(fileName)}`;
        }
        const result = updateAudioPlayerAudio({
          id: audioPlayerAudioRoute.draftId,
          ownerAdminId: user.id,
          componentId: audioPlayerAudioRoute.componentId,
          audioSrc,
        }, database);
        const previousFile = assetFileFromUrl(result.previousAudioSrc);
        if (previousFile && previousFile !== newFile) fs.rmSync(previousFile, { force: true });
        json(res, 200, { draft: result.draft });
      } catch (error) {
        if (newFile) fs.rmSync(newFile, { force: true });
        json(res, error.statusCode || 500, { error: error.message || 'Не удалось сохранить аудио.' });
      }
      return;
    }

    const thisOrThatImageRoute = getThisOrThatImageRouteParams(pathname);
    const matchWordsImageRoute = getMatchWordsImageRouteParams(pathname);
    const illustratedTextPanelImageRoute = getIllustratedTextPanelImageRouteParams(pathname);
    const textReadingImageRoute = getTextReadingImageRouteParams(pathname);
    const imageRoute = thisOrThatImageRoute || matchWordsImageRoute || illustratedTextPanelImageRoute || textReadingImageRoute;
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
        let result;
        if (thisOrThatImageRoute) {
          result = updateThisOrThatImage({
            id: imageRoute.draftId,
            ownerAdminId: user.id,
            componentId: imageRoute.componentId,
            itemId: imageRoute.itemId,
            optionId: imageRoute.optionId,
            imageSrc,
          }, database);
        } else if (matchWordsImageRoute) {
          result = updateMatchWordsImage({
            id: imageRoute.draftId,
            ownerAdminId: user.id,
            componentId: imageRoute.componentId,
            itemId: imageRoute.itemId,
            imageSrc,
          }, database);
        } else {
          if (textReadingImageRoute) {
            result = updateTextReadingImage({
              id: imageRoute.draftId,
              ownerAdminId: user.id,
              componentId: imageRoute.componentId,
              side: imageRoute.side,
              imageSrc,
            }, database);
          } else {
          result = updateIllustratedTextPanelImage({
            id: imageRoute.draftId,
            ownerAdminId: user.id,
            panelId: imageRoute.panelId,
            side: imageRoute.side,
            imageSrc,
          }, database);
          }
        }
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
    const markdownCardRoute = getMarkdownCardRouteParams(pathname);
    const fillInBlanksRoute = getFillInBlanksRouteParams(pathname);
    const dragWordsInTextRoute = getDragWordsInTextRouteParams(pathname);
    const dropdownChoiceRoute = getDropdownChoiceRouteParams(pathname);
    const gapFillRoute = getGapFillRouteParams(pathname);
    const multipleChoiceRoute = getMultipleChoiceRouteParams(pathname);
    const checkboxChoiceRoute = getCheckboxChoiceRouteParams(pathname);
    const personalizedQuestionsRoute = getPersonalizedQuestionsRouteParams(pathname);
    const describeAndGuessRoute = getDescribeAndGuessRouteParams(pathname);
    const howToPlayRoute = getHowToPlayRouteParams(pathname);
    const guidedRoleCardsRoute = getGuidedRoleCardsRouteParams(pathname);
    const speakingSupportRoute = getSpeakingSupportRouteParams(pathname);
    const threeTwoOneRoute = getThreeTwoOneRouteParams(pathname);
    const selfAssessmentRoute = getSelfAssessmentRouteParams(pathname);
    const textPanelRoute = getTextPanelRouteParams(pathname);
    const illustratedTextPanelRoute = getIllustratedTextPanelRouteParams(pathname);
    const textReadingRoute = getTextReadingRouteParams(pathname);
    const audioPlayerRoute = getAudioPlayerRouteParams(pathname);
    const miniSituationRoute = getMiniSituationRouteParams(pathname);
    if ((!teacherNoteRoute || !teacherNoteRoute.draftId || !teacherNoteRoute.noteId)
      && (!taskPromptRoute || !taskPromptRoute.draftId || !taskPromptRoute.promptId)
      && (!markdownCardRoute || !markdownCardRoute.draftId || !markdownCardRoute.componentId)
      && (!fillInBlanksRoute || !fillInBlanksRoute.draftId || !fillInBlanksRoute.componentId)
      && (!dragWordsInTextRoute || !dragWordsInTextRoute.draftId || !dragWordsInTextRoute.componentId)
      && (!dropdownChoiceRoute || !dropdownChoiceRoute.draftId || !dropdownChoiceRoute.componentId)
      && (!gapFillRoute || !gapFillRoute.draftId || !gapFillRoute.componentId)
      && (!multipleChoiceRoute || !multipleChoiceRoute.draftId || !multipleChoiceRoute.componentId)
      && (!checkboxChoiceRoute || !checkboxChoiceRoute.draftId || !checkboxChoiceRoute.componentId)
      && (!personalizedQuestionsRoute || !personalizedQuestionsRoute.draftId || !personalizedQuestionsRoute.componentId)
      && (!describeAndGuessRoute || !describeAndGuessRoute.draftId || !describeAndGuessRoute.componentId)
      && (!howToPlayRoute || !howToPlayRoute.draftId || !howToPlayRoute.componentId)
      && (!guidedRoleCardsRoute || !guidedRoleCardsRoute.draftId || !guidedRoleCardsRoute.componentId)
      && (!speakingSupportRoute || !speakingSupportRoute.draftId || !speakingSupportRoute.componentId)
      && (!threeTwoOneRoute || !threeTwoOneRoute.draftId || !threeTwoOneRoute.componentId)
      && (!selfAssessmentRoute || !selfAssessmentRoute.draftId || !selfAssessmentRoute.componentId)
      && (!textPanelRoute || !textPanelRoute.draftId || !textPanelRoute.panelId)
      && (!illustratedTextPanelRoute || !illustratedTextPanelRoute.draftId || !illustratedTextPanelRoute.panelId)
      && (!textReadingRoute || !textReadingRoute.draftId || !textReadingRoute.componentId)
      && (!audioPlayerRoute || !audioPlayerRoute.draftId || !audioPlayerRoute.componentId)
      && (!miniSituationRoute || !miniSituationRoute.draftId || !miniSituationRoute.componentId)) {
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
      let draft;
      if (teacherNoteRoute) {
        draft = updateTeacherNote({
          id: teacherNoteRoute.draftId,
          ownerAdminId: user.id,
          noteId: teacherNoteRoute.noteId,
          text: body.text,
          retainedBlockIds: body.retainedBlockIds,
          blocks: body.blocks,
        }, database);
      } else if (taskPromptRoute) {
        draft = updateTaskPrompt({
          id: taskPromptRoute.draftId,
          ownerAdminId: user.id,
          promptId: taskPromptRoute.promptId,
          title: body.title,
          text: body.text,
          support: body.support,
        }, database);
      } else if (markdownCardRoute) {
        draft = updateMarkdownCard({
          id: markdownCardRoute.draftId,
          ownerAdminId: user.id,
          componentId: markdownCardRoute.componentId,
          title: body.title,
          text: body.text,
          sections: body.sections,
        }, database);
      } else if (fillInBlanksRoute) {
        draft = updateFillInBlanks({
          id: fillInBlanksRoute.draftId,
          ownerAdminId: user.id,
          componentId: fillInBlanksRoute.componentId,
          items: body.items,
        }, database);
      } else if (dragWordsInTextRoute) {
        draft = updateDragWordsInText({
          id: dragWordsInTextRoute.draftId,
          ownerAdminId: user.id,
          componentId: dragWordsInTextRoute.componentId,
          title: body.title,
          instruction: body.instruction,
          words: body.words,
          text: body.text,
        }, database);
      } else if (dropdownChoiceRoute) {
        draft = updateDropdownChoice({
          id: dropdownChoiceRoute.draftId,
          ownerAdminId: user.id,
          componentId: dropdownChoiceRoute.componentId,
          title: body.title,
          instruction: body.instruction,
          text: body.text,
          choices: body.choices,
        }, database);
      } else if (gapFillRoute) {
        draft = updateGapFill({
          id: gapFillRoute.draftId,
          ownerAdminId: user.id,
          componentId: gapFillRoute.componentId,
          title: body.title,
          instruction: body.instruction,
          text: body.text,
          gaps: body.gaps,
        }, database);
      } else if (multipleChoiceRoute) {
        draft = updateMultipleChoice({
          id: multipleChoiceRoute.draftId,
          ownerAdminId: user.id,
          componentId: multipleChoiceRoute.componentId,
          title: body.title,
          instruction: body.instruction,
          items: body.items,
        }, database);
      } else if (checkboxChoiceRoute) {
        draft = updateCheckboxChoice({
          id: checkboxChoiceRoute.draftId,
          ownerAdminId: user.id,
          componentId: checkboxChoiceRoute.componentId,
          title: body.title,
          instruction: body.instruction,
          items: body.items,
        }, database);
      } else if (personalizedQuestionsRoute) {
        draft = updatePersonalizedQuestions({
          id: personalizedQuestionsRoute.draftId,
          ownerAdminId: user.id,
          componentId: personalizedQuestionsRoute.componentId,
          title: body.title,
          instruction: body.instruction,
          items: body.items,
        }, database);
      } else if (describeAndGuessRoute) {
        draft = updateDescribeAndGuess({
          id: describeAndGuessRoute.draftId,
          ownerAdminId: user.id,
          componentId: describeAndGuessRoute.componentId,
          title: body.title,
          instruction: body.instruction,
          items: body.items,
          howToPlay: body.howToPlay,
        }, database);
      } else if (howToPlayRoute) {
        draft = updateHowToPlay({
          id: howToPlayRoute.draftId,
          ownerAdminId: user.id,
          componentId: howToPlayRoute.componentId,
          title: body.title,
          steps: body.steps,
          tip: body.tip,
        }, database);
      } else if (guidedRoleCardsRoute) {
        draft = updateGuidedRoleCards({
          id: guidedRoleCardsRoute.draftId,
          ownerAdminId: user.id,
          componentId: guidedRoleCardsRoute.componentId,
          roles: body.roles,
        }, database);
      } else if (speakingSupportRoute) {
        draft = updateSpeakingSupport({
          id: speakingSupportRoute.draftId,
          ownerAdminId: user.id,
          componentId: speakingSupportRoute.componentId,
          title: body.title,
          sections: body.sections,
        }, database);
      } else if (threeTwoOneRoute) {
        draft = updateThreeTwoOne({
          id: threeTwoOneRoute.draftId,
          ownerAdminId: user.id,
          componentId: threeTwoOneRoute.componentId,
          steps: body.steps,
        }, database);
      } else if (selfAssessmentRoute) {
        draft = updateSelfAssessment({
          id: selfAssessmentRoute.draftId,
          ownerAdminId: user.id,
          componentId: selfAssessmentRoute.componentId,
          title: body.title,
        }, database);
      } else if (textPanelRoute) {
        draft = updateTextPanel({
          id: textPanelRoute.draftId,
          ownerAdminId: user.id,
          panelId: textPanelRoute.panelId,
          text: body.text,
          backgroundColor: body.backgroundColor,
          accentColor: body.accentColor,
          showBorder: body.showBorder,
        }, database);
      } else if (textReadingRoute) {
        draft = updateTextReading({
          id: textReadingRoute.draftId,
          ownerAdminId: user.id,
          componentId: textReadingRoute.componentId,
          title: body.title,
          subtitle: body.subtitle,
          text: body.text,
        }, database);
      } else if (audioPlayerRoute) {
        draft = updateAudioPlayer({
          id: audioPlayerRoute.draftId,
          ownerAdminId: user.id,
          componentId: audioPlayerRoute.componentId,
          title: body.title,
          script: body.script,
        }, database);
      } else if (miniSituationRoute) {
        draft = updateMiniSituation({
          id: miniSituationRoute.draftId,
          ownerAdminId: user.id,
          componentId: miniSituationRoute.componentId,
          title: body.title,
          instruction: body.instruction,
          sentenceCount: body.sentenceCount,
        }, database);
      } else {
        draft = updateIllustratedTextPanel({
          id: illustratedTextPanelRoute.draftId,
          ownerAdminId: user.id,
          panelId: illustratedTextPanelRoute.panelId,
          text: body.text,
          backgroundColor: body.backgroundColor,
        }, database);
      }
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
      lessonImageGenerator.remove(draftId);
      deleteLessonDraft(draftId, user.id, database);
      generationControllers.get(draftId)?.abort();
      finishGenerationStreams(draftId, 'generation-error', {
        status: 'failed', message: 'Черновик и его журнал были удалены.', costUsd: null,
      });
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

videoCallSignaling = createVideoCallSignaling({ server, database });

server.listen(PORT, HOST, () => {
  console.log(`EasyClass server running on http://${HOST}:${PORT}`);
});
