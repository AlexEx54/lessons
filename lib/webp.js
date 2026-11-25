'use strict';

const sharp = require('sharp');

const WEBP_QUALITY = 90;
const MAX_IMAGE_SIDE = 1600;

// Lesson pictures are kept as WebP: the same picture as PNG weighs about ten times more.
async function toWebp(buffer) {
  try {
    return await sharp(buffer)
      .rotate() // applies the EXIF orientation of phone photos before the metadata is dropped
      .resize({ width: MAX_IMAGE_SIDE, height: MAX_IMAGE_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch {
    throw Object.assign(new Error('Не удалось прочитать изображение.'), { statusCode: 415 });
  }
}

module.exports = { MAX_IMAGE_SIDE, WEBP_QUALITY, toWebp };
