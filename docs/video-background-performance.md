# Video background performance measurements

Pipeline version 2 downsamples the background by 4 on each axis before applying
blur, keeps the foreground at output resolution, preserves the RAF scheduling
remainder, and requests completed canvas frames explicitly where supported.

## Reproduce

Reload the call page after deployment, join a call (prejoin has no signaling
socket for diagnostics), and keep the call tab visible. On the same machine and
browser, try no background, blur, and a replacement background for 2 minutes each.
Note wall-clock time, browser, and perceived smoothness/edge quality. No-effect
mode does not produce background processing statistics; use it as a visual
baseline. Repeat on the other participant's machine if possible.

The existing server log event `[video-call-diagnostic]` /
`background-effect-stats` is emitted approximately every 30 seconds while an
effect is running and the signaling socket is connected. `callId`, `role`, and
the `ice-config` user agent identify the participant/browser. `pipelineVersion: 2`
distinguishes this version from older measurements. No video or mask pixels are
logged.

New timing fields (rounded milliseconds per successfully processed frame):

- `averageSegmentationMs`: synchronous MediaPipe call outside the mask/composite
  callback, including task cleanup; includes preprocessing and synchronization,
  not just neural-network inference.
- `averageReadbackMs`: `getAsFloat32Array()` conversion/access; may include GPU
  synchronization and transfer.
- `averageMaskMs`: mask buffers, temporal/spatial processing and `putImageData`,
  excluding readback.
- `averageCompositeMs`: background rendering, foreground masking, final drawing
  and the request to capture the finished frame.
- `averageFrameMs`, `maxFrameMs`: total synchronous processing time; average now
  also includes task cleanup after the callback (older logs ended inside it).

Canvas timings measure main-thread submission/wait time, not GPU completion.
Rounded stage averages can differ slightly from the rounded total. `fps` counts
processed frames, not remote decoded frames or necessarily unique camera frames.
`processedFrames`, `sampleDurationMs`, and `hiddenFrames` help interpret throttled
or interrupted windows. A hidden interval may contain no processed frames, so
`hiddenFrames: 0` alone does not prove the tab stayed visible.

`targetFps` is 24 for desktop GPU, 18 for mobile GPU, and at most 15 for CPU.
`blurWidth`/`blurHeight` describe the small blur canvas; output and mask dimensions
retain their existing meanings. `delegate: gpu` reports the selected MediaPipe
backend, not a measurement of physical hardware acceleration.

The existing server limit of 100 diagnostic messages per WebSocket connection
still applies; use a freshly joined call for measurements. Long calls can exhaust
that quota. No-effect intervals, prejoin, disconnected sockets, and switching
an effect before 30 seconds may have no statistics.

Read production measurements with:

```sh
ssh -p 4537 root@144.31.76.176 'journalctl -u teach-platform.service --since "today" --no-pager -o cat' | rg 'background-effect-(stats|ready|failure)'
```
