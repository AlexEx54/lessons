'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCallMedia, fakeTrack, FakeMediaStream } = require('./helpers/call-media.js');

// Starts preparing media with a getUserMedia whose answer the test controls.
function setup() {
  let answer, requests = 0;
  const tracks = { audio: fakeTrack('audio'), video: fakeTrack('video') };
  const room = createCallMedia({ mediaDevices: {
    getUserMedia: () => { requests++; return new Promise((resolve, reject) => { answer = { resolve, reject }; }); },
  } });
  const preparing = room.media.prepare();
  return Object.assign(room, { tracks, preparing, stream: new FakeMediaStream([tracks.audio, tracks.video]),
    answer: () => answer, requests: () => requests });
}

test('tracks granted after the join are sent and announced once the browser answers', async () => {
  const room = setup();
  assert.equal(room.media.preparation.state, 'pending');
  room.answer().resolve(room.stream);
  await room.preparing;
  assert.deepEqual(room.calls, ['audio', 'video', 'media-state']);
  assert.equal(room.sentAudio[0], room.tracks.audio);
  assert.equal(room.sentVideo[0], room.tracks.video);
  assert.equal(room.media.preparation.state, 'granted');
  assert.equal(room.events[0].event, 'media-prepared');
  assert.equal(room.events[0].state, 'granted');
  assert.ok(Number.isInteger(room.events[0].mediaWaitMs));
});

test('a browser without media access joins with everything off', async () => {
  const room = createCallMedia();
  await room.media.prepare();
  assert.equal(room.media.preparation.state, 'unsupported');
  assert.deepEqual({ ...room.media.sentState() }, { audio: false, video: false, screen: false });
  assert.match(room.media.snapshot().error, /не поддерживает/);
});

test('a refused prompt is diagnosed and still updates the peer that already joined', async () => {
  const room = setup();
  room.answer().reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' }));
  await room.preparing;
  assert.equal(room.media.preparation.state, 'failed');
  assert.deepEqual({ ...room.media.sentState() }, { audio: false, video: false, screen: false });
  assert.equal(room.media.snapshot().camera, false);
  assert.equal(room.events[0].errorName, 'NotAllowedError');
  assert.equal(room.calls.at(-1), 'media-state');
});

test('toggles during the prompt change the choice without opening a second camera', async () => {
  const room = setup();
  await room.media.toggle('video');
  await room.media.toggle('audio');
  await room.media.toggle('audio');
  assert.deepEqual(room.calls, []);
  assert.equal(room.media.snapshot().camera, false);
  assert.equal(room.media.snapshot().microphone, true);
  room.answer().resolve(room.stream);
  await room.preparing;
  assert.equal(room.requests(), 1);
  assert.equal(room.tracks.video.enabled, false);
  assert.equal(room.tracks.audio.enabled, true);
  assert.equal(room.media.sentState().video, false);
  assert.equal(room.sentVideo.at(-1), null);
});

test('a camera granted after leaving is released at once and never sent', async () => {
  const room = setup();
  room.media.stop();
  room.answer().resolve(room.stream);
  await room.preparing;
  assert.equal(room.tracks.video.readyState, 'ended');
  assert.equal(room.tracks.audio.readyState, 'ended');
  assert.deepEqual(room.calls, []);
  assert.equal(room.media.previewTrack(), null);
});
