'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const { MAX_IMAGE_SIDE, toWebp } = require('../lib/webp.js');

const png = (width, height) => sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer();

test('toWebp shrinks large pictures to the maximum side and keeps small ones as they are', async () => {
  const large = await sharp(await toWebp(await png(3200, 1000))).metadata();
  assert.deepEqual([large.format, large.width, large.height], ['webp', MAX_IMAGE_SIDE, 500]);
  const small = await sharp(await toWebp(await png(512, 512))).metadata();
  assert.deepEqual([small.format, small.width, small.height], ['webp', 512, 512]);
});

test('toWebp turns a phone photo upright using its EXIF orientation', async () => {
  const rotated = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#ffffff' } })
    .jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const upright = await sharp(await toWebp(rotated)).metadata();
  assert.deepEqual([upright.width, upright.height], [20, 40]);
});

test('toWebp rejects bytes that are not a picture', async () => {
  await assert.rejects(toWebp(Buffer.from('not-an-image')), { statusCode: 415 });
});
