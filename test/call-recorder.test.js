'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/call-recorder.js'), 'utf8');

function setup(options = {}) {
  const events = [], nodes = [], recorders = [], videos = [];
  let tick;
  const track = kind => ({ kind, enabled: true, readyState: 'live', stop() { this.readyState = 'ended'; } });
  const local = track('video'), remote = track('video'), mic = track('audio');
  const mixed = track('audio'), captured = track('video');
  let sources = { localVideo: local, remoteVideo: remote, audio: [mic] };
  class Stream {
    constructor(tracks = []) { this.tracks = tracks; }
    getTracks() { return this.tracks; }
    getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
    getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
    addTrack(t) { this.tracks.push(t); }
  }
  const file = {
    async write(data) { events.push(`write:${data.name}`); if (options.write) await options.write(data); },
    async close() { events.push('close'); },
    async abort() { events.push('abort'); },
  };
  class Recorder {
    static isTypeSupported() { return true; }
    constructor(stream) { this.stream = stream; this.state = 'inactive'; recorders.push(this); }
    start() { this.state = 'recording'; }
    emit(name, size = 4) { this.ondataavailable({ data: { name, size } }); }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => { this.emit('last'); this.onstop(); });
    }
  }
  class AudioContext {
    async resume() {}
    async close() { events.push('audio-close'); }
    createMediaStreamDestination() { return { stream: new Stream([mixed]) }; }
    createMediaStreamSource(stream) {
      const node = { track: stream.getTracks()[0], connect() {}, disconnect() { this.disconnected = true; } };
      nodes.push(node); return node;
    }
  }
  const window = { isSecureContext: true, MediaRecorder: Recorder, AudioContext,
    async showSaveFilePicker() {
      if (options.cancel) throw new DOMException('cancel', 'AbortError');
      return { async createWritable() { events.push('open'); return file; } };
    },
  };
  vm.runInNewContext(source, { window, MediaRecorder: Recorder, AudioContext, MediaStream: Stream,
    DOMException, HTMLCanvasElement: { prototype: { captureStream() {} } },
    setInterval(fn) { tick = fn; return 1; }, clearInterval() { events.push('clear'); },
    document: { createElement(type) {
      if (type === 'video') {
        const video = { readyState: 2, videoWidth: 640, videoHeight: 480, async play() {}, pause() {} };
        videos.push(video); return video;
      }
      return { getContext: () => ({ fillRect() {}, fillText() {}, drawImage() {} }),
        captureStream: () => new Stream([captured]) };
    } },
  });
  return { api: window.CallRecorder, start: () => window.CallRecorder.start({ getSources: () => sources }),
    events, nodes, recorders, local, remote, mic, mixed, captured, videos,
    setSources(next) { sources = next; tick(); },
  };
}

test('writes chunks in order, drains final chunk and closes before completion', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const s = setup({ write: data => data.name === 'first' ? gate : undefined });
  const session = await s.start();
  s.recorders[0].emit('first');
  s.recorders[0].emit('second');
  const done = session.stop();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(s.events.filter(e => e.startsWith('write:')), ['write:first']);
  assert.equal(s.events.includes('close'), false);
  release(); await done;
  assert.deepEqual(s.events.filter(e => e.startsWith('write:') || e === 'close'),
    ['write:first', 'write:second', 'write:last', 'close']);
  assert.equal(s.local.readyState, 'live');
  assert.equal(s.mic.readyState, 'live');
  assert.equal(s.captured.readyState, 'ended');
  assert.equal(s.mixed.readyState, 'ended');
});

test('disk failure stops recording, aborts and rejects without claiming saved', async () => {
  const s = setup({ write: async () => { throw new Error('disk full'); } });
  const session = await s.start();
  const failed = assert.rejects(session.finished, /disk full/);
  s.recorders[0].emit('first');
  await failed;
  assert.ok(s.events.includes('abort'));
  assert.equal(s.events.includes('close'), false);
  assert.equal(s.mic.readyState, 'live');
});

test('oversized pending data stops safely instead of accumulating unbounded memory', async () => {
  const s = setup(); const session = await s.start();
  const failed = assert.rejects(session.finished, /Диск не успевает/);
  s.recorders[0].emit('large', 33 * 1024 * 1024);
  await failed;
  assert.equal(s.events.some(e => e.startsWith('write:')), false);
});

test('screen audio and reconnected sources replace inputs without replacing output tracks', async () => {
  const s = setup(); const session = await s.start();
  const originalOutput = s.recorders[0].stream.getTracks().slice();
  const screenAudio = { kind: 'audio', readyState: 'live' };
  s.setSources({ localVideo: s.local, remoteVideo: null, audio: [screenAudio, screenAudio], localScreen: true });
  assert.equal(s.nodes[0].disconnected, true);
  assert.equal(s.nodes.length, 2);
  assert.equal(s.videos[1].srcObject, null);
  assert.deepEqual(s.recorders[0].stream.getTracks(), originalOutput);
  await session.stop();
});

test('picker cancellation opens no file and starts no recorder', async () => {
  const s = setup({ cancel: true });
  await assert.rejects(s.start(), { name: 'AbortError' });
  assert.equal(s.recorders.length, 0);
  assert.deepEqual(s.events, []);
});

test('call ending while picker is open prevents recording', async () => {
  const s = setup();
  await assert.rejects(s.api.start({ canStart: () => false }), { name: 'AbortError' });
  assert.equal(s.recorders.length, 0);
  assert.deepEqual(s.events, []);
});

test('repeated stop calls share the same completion', async () => {
  const s = setup(); const session = await s.start();
  assert.equal(session.stop(), session.stop());
  await session.finished;
  assert.equal(s.events.filter(e => e === 'close').length, 1);
});
