'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
async function receiveVideo(req, destination) {
  if (Number(req.headers['content-length']) > MAX_VIDEO_BYTES) throw fail('Видео должно быть не больше 300 МБ.', 413);
  let size = 0;
  const limit = new Transform({ transform(chunk, encoding, callback) {
    size += chunk.length;
    callback(size > MAX_VIDEO_BYTES ? fail('Видео должно быть не больше 300 МБ.', 413) : null, chunk);
  } });
  // Keep the request alive on validation errors so the caller can return JSON.
  req.pipe(limit);
  const aborted = () => limit.destroy(fail('Загрузка прервана.'));
  req.on('aborted', aborted);
  req.on('error', aborted);
  try {
    await pipeline(limit, fs.createWriteStream(destination, { flags: 'wx' }));
    const handle = await fs.promises.open(destination, 'r');
    const header = Buffer.alloc(12);
    try { await handle.read(header, 0, 12, 0); } finally { await handle.close(); }
    if (header.toString('ascii', 4, 8) !== 'ftyp' || header.toString('ascii', 8, 12) === 'qt  ') throw fail('Разрешены только файлы MP4.', 415);
    let result;
    try {
      result = await promisify(execFile)(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-protocol_whitelist', 'file', '-show_streams', '-show_format', '-of', 'json', destination], { timeout: 30000, maxBuffer: 1024 * 1024 });
    } catch (error) {
      if (error.code === 'ENOENT') throw fail('На сервере не настроена проверка видео (ffprobe).', 503);
      throw fail('Не удалось прочитать MP4. Загрузите видео H.264/AAC.', 415);
    }
    const info = JSON.parse(result.stdout);
    const videos = info.streams?.filter(s => s.codec_type === 'video') || [];
    const audio = info.streams?.filter(s => s.codec_type === 'audio') || [];
    if (!info.format?.format_name?.split(',').includes('mp4') || videos.length !== 1 || videos[0].codec_name !== 'h264' || audio.some(s => s.codec_name !== 'aac') || !(Number(info.format.duration) > 0)) {
      throw fail('Разрешено MP4 с видео H.264 и звуком AAC.', 415);
    }
    return { durationMs: Math.round(Number(info.format.duration) * 1000) };
  } finally {
    req.off('aborted', aborted);
    req.off('error', aborted);
    req.unpipe(limit);
    req.resume();
  }
}
function publishedVideoPath(directory, descriptor) {
  const { videoFile } = JSON.parse(Buffer.from(descriptor).toString());
  if (!/^[a-f0-9]{64}\.mp4$/.test(videoFile)) throw fail('Некорректная ссылка на видео.');
  return path.join(directory, '_videos', videoFile);
}
module.exports = { MAX_VIDEO_BYTES, receiveVideo, publishedVideoPath };
