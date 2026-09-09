'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('transport selection prefers worker tracks, then transferred streams, then canvas', async () => {
  const { chooseTransport } = await import('../assets/video-background-pipeline.mjs');
  const chromium = { MediaStreamTrackProcessor() {}, MediaStreamTrackGenerator() {} };
  assert.equal(chooseTransport({ native: true }, chromium), 'worker-track');
  assert.equal(chooseTransport({ native: false }, chromium), 'transferred-streams');
  assert.equal(chooseTransport({ native: false }, {}), 'canvas-worker');
});

function workerHarness() {
  const messages = [], closed = [], frames = [];
  const context = vm.createContext({
    self: { postMessage: message => messages.push(message), close() {} },
    performance: { now: () => 100 }, setTimeout: () => 1, clearTimeout() {},
    setInterval: () => 1, clearInterval() {},
    VideoFrame: class { constructor(_canvas, {timestamp}) { this.timestamp = timestamp; } close() { closed.push(this.timestamp); } },
    messages, closed, frames,
  });
  vm.runInContext(fs.readFileSync(require.resolve('../assets/video-background-worker.js'), 'utf8'), context);
  return context;
}

test('worker closes skipped input and output frames and awaits the writer before reading again', async () => {
  const ctx = workerHarness();
  let writes = 0, reads = 0, release;
  ctx.read = async () => {
    reads++;
    return { value: { timestamp: reads, close() { ctx.closed.push(`input-${this.timestamp}`); } } };
  };
  ctx.write = async () => { writes++; await new Promise(resolve => { release = resolve; }); };
  vm.runInContext(`
    reader = { read, cancel: async () => {} };
    writer = { write, abort: async () => {} };
    renderer = { process: () => true, canvas: {}, details: () => ({}) };
  `, ctx);
  const running = ctx.nativeLoop();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reads, 1);
  assert.equal(writes, 1);
  vm.runInContext('stopped = true', ctx);
  release();
  await running;
  assert.deepEqual(Array.from(ctx.closed), [1, 'input-1']);
});

test('worker releases a failed frame and emits failure instead of continuing unprocessed video', async () => {
  const ctx = workerHarness();
  vm.runInContext(`
    reader = { read: async () => ({ value: { close() { closed.push('input'); } } }), cancel: async () => {} };
    writer = { abort: async () => {} };
    renderer = { process() { throw new Error('segmentation failed'); }, close() {} };
  `, ctx);
  await ctx.nativeLoop();
  assert.deepEqual(Array.from(ctx.closed), ['input']);
  assert.ok(ctx.messages.some(message => message.type === 'failure' && /segmentation failed/.test(message.errorText)));
});

test('canvas transport requests another input only after output acknowledgement', () => {
  const ctx = workerHarness();
  vm.runInContext(`renderer = { process: () => true, canvas: { transferToImageBitmap: () => ({}) },
    details: () => ({}), interval: () => 40 };`, ctx);
  const before = ctx.messages.length;
  ctx.self.onmessage({data:{type:'frame',frame:{close(){ctx.closed.push('bitmap');}}}});
  assert.equal(ctx.messages.length, before + 1);
  assert.equal(ctx.messages.at(-1).type, 'frame');
  assert.deepEqual(Array.from(ctx.closed), ['bitmap']);
  assert.equal(vm.runInContext('emittedFrames',ctx), 0);
  ctx.self.onmessage({data:{type:'ack'}});
  assert.equal(vm.runInContext('emittedFrames',ctx), 1);
});

function pipelineHarness() {
  const workers = [], timers = new Map(), events = [];
  let sequence = 0;
  class Track {
    readyState = 'live'; stopped = 0;
    stop() { this.stopped++; this.readyState = 'ended'; }
    clone() { return new Track(); }
    getSettings() { return {width:640,height:480}; }
  }
  const camera = new Track();
  const context = vm.createContext({
    URL, DOMException, camera, events,
    Worker: class {
      messages = []; terminated = false;
      constructor() { workers.push(this); }
      postMessage(message) { this.messages.push(message); }
      terminate() { this.terminated = true; }
    },
    MediaStreamTrackProcessor: class { readable = {locked:false, cancel:async()=>{}}; },
    MediaStreamTrackGenerator: class extends Track { writable = {locked:false,abort:async()=>{}}; },
    setTimeout(callback) { timers.set(++sequence, callback); return sequence; },
    clearTimeout(id) { timers.delete(id); },
  });
  const source = fs.readFileSync(require.resolve('../assets/video-background-pipeline.mjs'), 'utf8')
    .replaceAll('export function', 'function').replaceAll('import.meta.url', "'http://localhost/assets/video-background-pipeline.mjs'");
  vm.runInContext(source + `\n session = createBackgroundPipeline({camera,
    config:{maxWidth:640,targetFps:18},onDiagnostic:(event,details)=>events.push({event,...details}),
    onFailure:error=>events.push({failure:error.message})});`, context);
  return {context, worker:workers[0], camera, timers};
}
const flush = () => new Promise(resolve=>setImmediate(resolve));

test('pipeline resolves only on processed readiness and stopping never stops original camera', async () => {
  const {context,worker,camera} = pipelineHarness();
  let ready = false;
  context.session.ready.then(()=>{ready=true;});
  worker.onmessage({data:{type:'capabilities',native:false,offscreen:true}});
  await flush();
  assert.equal(worker.messages[0].transport, 'transferred-streams');
  assert.equal(ready,false);
  worker.onmessage({data:{type:'ready',details:{delegate:'gpu'}}});
  await context.session.ready;
  const output = context.session.track;
  context.session.stop(); context.session.stop();
  assert.equal(output.stopped,1);
  assert.equal(camera.stopped,0);
  worker.onmessage({data:{type:'stopped'}});
  assert.equal(worker.terminated,true);
});

test('cancelled startup rejects promptly and disposes late worker frames and tracks', async () => {
  const {context,worker} = pipelineHarness();
  const rejection = assert.rejects(context.session.ready, {name:'AbortError'});
  context.session.stop();
  await rejection;
  let closed=0,stopped=0;
  worker.onmessage({data:{type:'frame',frame:{close(){closed++;}}}});
  worker.onmessage({data:{type:'track',track:{stop(){stopped++;}}}});
  await flush();
  assert.equal(closed,1); assert.equal(stopped,1);
  worker.onmessage({data:{type:'stopped'}});
});

test('startup errors reject once and worker errors after readiness invoke failure callback', async () => {
  const {context,worker} = pipelineHarness();
  worker.onmessage({data:{type:'capabilities',native:false,offscreen:true}});
  await flush();
  worker.onmessage({data:{type:'ready',details:{}}});
  await context.session.ready;
  worker.onerror({preventDefault(){},message:'GPU lost'});
  assert.ok(context.events.some(event=>event.failure==='GPU lost'));
  assert.equal(context.session.track.readyState,'ended');
  worker.onmessage({data:{type:'stopped'}});
  const other=pipelineHarness();
  const rejected=assert.rejects(other.context.session.ready,/не поддерживает/);
  other.worker.onmessage({data:{type:'capabilities',native:false,offscreen:false}});
  await rejected;
  other.worker.onmessage({data:{type:'stopped'}});
});
