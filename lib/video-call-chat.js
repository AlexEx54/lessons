'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { DEFAULT_DB_PATH } = require('./db.js');
const { getAuthenticatedUser } = require('./auth.js');
const { findOwnedVideoCall, findVideoCallByGuestToken, tokenHash } = require('./video-call-store.js');
const MAX_FILE = 25 * 1024 * 1024;
const MAX_CALL = 250 * 1024 * 1024;
const UUID = /^[a-f0-9-]{36}$/i;
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function reply(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function imageMime(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (/^GIF8[79]a/.test(bytes.toString('ascii', 0, 6))) return 'image/gif';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return 'application/octet-stream';
}
function createVideoCallChat({ database, broadcast = () => {}, directory = process.env.VIDEO_CALL_FILES_DIR || path.join(path.dirname(process.env.APP_DB_PATH || DEFAULT_DB_PATH), 'video-call-files') }) {
  fs.mkdirSync(directory, { recursive: true });
  function filePath(callId, id) { return path.join(directory, callId, id); }
  function cleanup() {
    const cutoff = new Date(Date.now() - 24 * 3600_000).toISOString();
    for (const row of database.prepare('SELECT * FROM video_call_attachments WHERE message_id IS NULL AND created_at < ?').all(cutoff)) {
      fs.rmSync(filePath(row.call_id, row.id), { force: true });
      database.prepare('DELETE FROM video_call_attachments WHERE id = ?').run(row.id);
    }
    for (const entry of fs.readdirSync(directory)) {
      if (UUID.test(entry) && !database.prepare('SELECT 1 FROM video_calls WHERE id = ?').get(entry)) {
        fs.rmSync(path.join(directory, entry), { recursive: true, force: true });
      }
    }
  }
  cleanup();
  const timer = setInterval(() => { try { cleanup(); } catch (error) { console.error('Chat cleanup failed', error.message); } }, 3600_000);
  timer.unref();
  function attachments(id) {
    return database.prepare('SELECT id, name, size, mime FROM video_call_attachments WHERE message_id = ? ORDER BY rowid').all(id);
  }
  function message(row) {
    return { id: row.id, clientId: row.client_id, role: row.sender_role, name: row.sender_name,
      text: row.body, createdAt: row.created_at, attachments: attachments(row.id) };
  }
  function authorize(req, isGuest, reference) {
    if (isGuest) {
      const call = findVideoCallByGuestToken(reference, database);
      if (!call) fail(404, 'Чат не найден или ссылка недействительна.');
      return { call, role: 'guest', key: tokenHash(reference) };
    }
    const user = getAuthenticatedUser(req, database);
    if (user?.role !== 'admin') fail(403, 'Требуется вход преподавателя.');
    const call = findOwnedVideoCall(reference, user.id, database);
    if (!call) fail(404, 'Чат не найден.');
    return { call, role: 'teacher', key: user.id, name: user.displayName || 'Преподаватель' };
  }
  function writable(callId) {
    const row = database.prepare('SELECT status, expires_at FROM video_calls WHERE id = ?').get(callId);
    if (!row || !['waiting', 'active'].includes(row.status) || row.expires_at <= new Date().toISOString()) {
      fail(409, 'Звонок завершён. Чат доступен только для чтения.');
    }
  }
  async function handle(req, res, url) {
    const match = url.pathname.match(/^\/api\/(public\/)?video-calls\/([^/]+)\/chat(?:\/(attachments)(?:\/([^/]+))?)?$/);
    if (!match) return false;
    try {
      if (req.method !== 'GET' && (req.headers['sec-fetch-site'] === 'cross-site' ||
        (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host))) fail(403, 'Недопустимый источник запроса.');
      const auth = authorize(req, Boolean(match[1]), decodeURIComponent(match[2]));
      const { call, role, key } = auth;
      if (req.method === 'GET' && !match[3]) {
        const after = Number(url.searchParams.get('after') || 0);
        if (!Number.isSafeInteger(after) || after < 0) fail(400, 'Некорректная позиция истории.');
        const rows = database.prepare('SELECT * FROM video_call_messages WHERE call_id = ? AND id > ? ORDER BY id LIMIT 101').all(call.id, after);
        reply(res, 200, { call, messages: rows.slice(0, 100).map(message), hasMore: rows.length > 100 });
      } else if (req.method === 'GET' && match[4]) {
        const row = database.prepare('SELECT * FROM video_call_attachments WHERE id = ? AND call_id = ? AND message_id IS NOT NULL AND ready = 1').get(match[4], call.id);
        if (!row) fail(404, 'Файл не найден.');
        const file = await fs.promises.open(filePath(call.id, row.id), 'r').catch(() => null);
        if (!file) fail(404, 'Файл не найден.');
        const inline = row.mime.startsWith('image/') && !url.searchParams.has('download');
        res.writeHead(200, { 'Content-Type': row.mime, 'Content-Length': row.size,
          'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encodeURIComponent(row.name).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16))}`,
          'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
          'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' });
        await pipeline(file.createReadStream(), res);
      } else if (req.method === 'DELETE' && match[4]) {
        const row = database.prepare('SELECT * FROM video_call_attachments WHERE id = ? AND call_id = ? AND sender_key = ? AND message_id IS NULL AND ready = 1').get(match[4], call.id, key);
        if (!row) fail(404, 'Черновик вложения не найден.');
        fs.rmSync(filePath(call.id, row.id), { force: true });
        database.prepare('DELETE FROM video_call_attachments WHERE id = ?').run(row.id);
        reply(res, 200, { deleted: true });
      } else if (req.method === 'POST' && match[3] && !match[4]) {
        writable(call.id);
        const size = Number(req.headers['content-length']);
        if (!Number.isSafeInteger(size) || size < 1 || size > MAX_FILE) fail(413, 'Файл должен быть не пустым и не больше 25 МБ.');
        const pending = database.prepare('SELECT COUNT(*) AS n FROM video_call_attachments WHERE call_id = ? AND sender_key = ? AND message_id IS NULL').get(call.id, key).n;
        if (pending >= 20) fail(429, 'Слишком много незавершённых загрузок. Попробуйте позднее.');
        const used = database.prepare('SELECT COALESCE(SUM(size), 0) AS size FROM video_call_attachments WHERE call_id = ?').get(call.id).size;
        if (used + size > MAX_CALL) fail(413, 'Достигнут лимит 250 МБ на звонок.');
        const name = String(url.searchParams.get('name') || 'Файл').replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 180);
        const id = randomUUID();
        fs.mkdirSync(path.join(directory, call.id), { recursive: true });
        // Reserve quota before awaiting the stream, including concurrent uploads.
        database.prepare('INSERT INTO video_call_attachments (id, call_id, sender_key, name, size, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, call.id, key, name, size, new Date().toISOString());
        let received = 0, prefix = Buffer.alloc(0);
        const guard = new Transform({ transform(chunk, encoding, callback) {
          received += chunk.length;
          if (received > size) return callback(Object.assign(new Error('Размер файла превышен.'), { status: 413 }));
          if (prefix.length < 12) prefix = Buffer.concat([prefix, chunk.subarray(0, 12 - prefix.length)]);
          callback(null, chunk);
        } });
        try {
          await pipeline(req, guard, fs.createWriteStream(filePath(call.id, id), { flags: 'wx' }));
          if (received !== size) fail(400, 'Файл загружен не полностью.');
          writable(call.id);
          database.prepare('UPDATE video_call_attachments SET ready = 1, mime = ? WHERE id = ?').run(imageMime(prefix), id);
          reply(res, 201, { id, name, size });
        } catch (error) {
          database.prepare('DELETE FROM video_call_attachments WHERE id = ?').run(id);
          await fs.promises.rm(filePath(call.id, id), { force: true });
          throw error;
        }
      } else if (req.method === 'POST' && !match[3]) {
        const chunks = []; let length = 0;
        for await (const chunk of req) {
          length += chunk.length;
          if (length > 64 * 1024) fail(413, 'Сообщение слишком длинное.');
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(400, 'Некорректное сообщение.'); }
        if (!input || !UUID.test(input.clientId || '')) fail(400, 'Некорректный идентификатор отправки.');
        const previous = database.prepare('SELECT * FROM video_call_messages WHERE call_id = ? AND sender_key = ? AND client_id = ?').get(call.id, key, input.clientId);
        if (previous) { reply(res, 200, { message: message(previous) }); return true; }
        writable(call.id);
        const text = typeof input.text === 'string' ? input.text.trim() : '';
        const ids = input.attachments || [];
        if (text.length > 10000 || !Array.isArray(ids) || ids.length > 5 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string') || (!text && !ids.length)) fail(400, 'Нужен текст до 10 000 символов или до 5 вложений.');
        const count = database.prepare('SELECT COUNT(*) AS n FROM video_call_messages WHERE call_id = ? AND sender_key = ? AND created_at > ?').get(call.id, key, new Date(Date.now() - 60000).toISOString()).n;
        if (count >= 60) fail(429, 'Слишком много сообщений. Попробуйте через минуту.');
        database.exec('BEGIN IMMEDIATE');
        let row;
        try {
          for (const id of ids) {
            if (!database.prepare('SELECT 1 FROM video_call_attachments WHERE id = ? AND call_id = ? AND sender_key = ? AND message_id IS NULL AND ready = 1').get(id, call.id, key)) fail(400, 'Вложение недоступно. Загрузите файл повторно.');
          }
          const name = role === 'teacher' ? auth.name : String(input.name || 'Ученик').trim().slice(0, 60) || 'Ученик';
          const result = database.prepare('INSERT INTO video_call_messages (call_id, sender_role, sender_key, sender_name, client_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(call.id, role, key, name, input.clientId, text, new Date().toISOString());
          for (const id of ids) database.prepare('UPDATE video_call_attachments SET message_id = ? WHERE id = ?').run(result.lastInsertRowid, id);
          row = database.prepare('SELECT * FROM video_call_messages WHERE id = ?').get(result.lastInsertRowid);
          database.exec('COMMIT');
        } catch (error) { database.exec('ROLLBACK'); throw error; }
        const saved = message(row);
        broadcast(call.id, { type: 'chat-message', message: saved });
        reply(res, 201, { message: saved });
      } else fail(405, 'Метод не поддерживается.');
    } catch (error) {
      if (!res.headersSent && !res.destroyed) reply(res, error.status || 500, { error: error.status ? error.message : 'Не удалось выполнить операцию с чатом.' });
      else if (!res.destroyed) res.destroy();
      if (!error.status && error.code !== 'ERR_STREAM_PREMATURE_CLOSE' && error.code !== 'ECONNRESET') console.error('Video chat error:', error.message);
    }
    return true;
  }
  return { handle, cleanup, close: () => clearInterval(timer) };
}
module.exports = { createVideoCallChat, MAX_FILE, MAX_CALL };
