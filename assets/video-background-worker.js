// Classic worker: MediaPipe's WASM loader uses importScripts internally.
'use strict';
let renderer, reader, writer, inputTrack, outputTrack;
let stopped = false, ready = false, timer, statsTimer;
let receivedFrames = 0, emittedFrames = 0, skippedFrames = 0, lastOutputAt = 0;
let transport, inputRequestedAt = 0;
const send = (type, details = {}, transfer = []) => self.postMessage({ type, ...details }, transfer);
const errorText = error => `${error?.name || 'Error'}: ${error?.message || error}`;

async function stop() {
  if (stopped) return;
  stopped = true;
  clearTimeout(timer);
  clearInterval(statsTimer);
  inputTrack?.stop();
  outputTrack?.stop();
  await Promise.allSettled([reader?.cancel(), writer?.abort()]);
  renderer?.close();
  send('stopped');
  self.close();
}
function fail(error) {
  if (stopped) return;
  send('failure', { errorText: errorText(error) });
  void stop();
}
function markOutput() {
  emittedFrames++;
  lastOutputAt = performance.now();
  if (!ready) {
    ready = true;
    send('ready', { details: renderer.details() });
  }
}
function requestInput() {
  if (stopped) return;
  const delay = Math.max(0, renderer.interval() - (performance.now() - inputRequestedAt));
  timer = setTimeout(() => { inputRequestedAt = performance.now(); send('pull'); }, delay);
}
async function nativeLoop() {
  try {
    while (!stopped) {
      const { done, value: frame } = await reader.read();
      if (done) {
        if (!stopped) throw new Error('Поток камеры завершился');
        break;
      }
      try {
        if (stopped) break;
        receivedFrames++;
        // Schedule by arrival time; retain camera timestamps on outgoing frames.
        if (!renderer.process(frame, performance.now())) { skippedFrames++; continue; }
        const output = new VideoFrame(renderer.canvas, { timestamp: frame.timestamp });
        try { await writer.write(output); } finally { output.close(); }
        if (!stopped) markOutput();
      } finally { frame.close(); }
    }
  } catch (error) { fail(error); }
}
async function initialize(data) {
  transport = data.transport;
  inputTrack = data.track;
  const { createEffectRenderer } = await import('./video-background-renderer.mjs');
  renderer = await createEffectRenderer({ ...data.config,
    onStats: details => send('stats', { details }),
    onDelegateFallback: error => send('diagnostic', { state: 'cpu-fallback', errorText: errorText(error) }),
  });
  if (stopped) { renderer.close(); return; }
  statsTimer = setInterval(() => {
    renderer.report();
    send('health', { details: { receivedFrames, emittedFrames, skippedFrames,
      lastFrameAgeMs: Math.round(performance.now() - (lastOutputAt || startedAt)) } });
  }, 10_000);
  if (transport === 'worker-track') {
    inputTrack = data.track;
    reader = new MediaStreamTrackProcessor({ track: inputTrack, maxBufferSize: 1 }).readable.getReader();
    const generator = new VideoTrackGenerator();
    outputTrack = generator.track;
    writer = generator.writable.getWriter();
    send('track', { track: outputTrack }, [outputTrack]);
    void nativeLoop();
  } else if (transport === 'transferred-streams') {
    reader = data.readable.getReader();
    writer = data.writable.getWriter();
    void nativeLoop();
  } else {
    requestInput();
  }
}
const startedAt = performance.now();
self.onmessage = ({ data }) => {
  if (data.type === 'stop') { void stop(); return; }
  if (stopped) { data.frame?.close(); return; }
  if (data.type === 'init') { void initialize(data).catch(fail); return; }
  if (data.type === 'visibility') { renderer?.visibility(data.hidden); return; }
  if (data.type === 'ack') { markOutput(); requestInput(); return; }
  if (data.type === 'empty') { requestInput(); return; }
  if (data.type === 'frame') {
    try {
      receivedFrames++;
      if (renderer.process(data.frame, performance.now())) {
        const frame = renderer.canvas.transferToImageBitmap();
        send('frame', { frame }, [frame]);
        // Next input is requested only after the output was consumed.
      } else { skippedFrames++; requestInput(); }
    } catch (error) { fail(error); }
    finally { data.frame.close(); }
  }
};
send('capabilities', { native: typeof MediaStreamTrackProcessor === 'function'
  && typeof VideoTrackGenerator === 'function' && typeof VideoFrame === 'function',
  offscreen: typeof OffscreenCanvas === 'function' });
