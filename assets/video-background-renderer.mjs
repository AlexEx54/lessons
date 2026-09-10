// Shared image processing, owned by one worker per effect session.
export async function createEffectRenderer(config) {
  const MEDIAPIPE_BASE = '/assets/vendor/mediapipe-1.0.1';
  const SEGMENTER_MODEL = config.model;
  const EFFECT_FRAME_INTERVAL_MS = 1000 / config.targetFps;
  const EFFECT_STATS_INTERVAL_MS = 30_000;
  const selectedBackground = config.mode;
  const document = { hidden: config.hidden };
  const backgroundImages = new Map();
  let segmenterDelegate = 'GPU';
  let segmenter;
  let effectSourceVideo;
  const acceptFrame = createFrameGate();
  const canvas = (w, h) => new OffscreenCanvas(w, h);
  const effectInputCanvas = canvas(config.width, config.height);
  const effectInputContext = effectInputCanvas.getContext('2d');
  const effectOutputCanvas = canvas(config.width, config.height);
  const effectForegroundCanvas = canvas(config.width, config.height);
  const effectMaskCanvas = canvas(1, 1);
  const effectBlurSourceCanvas = canvas(Math.ceil(config.width / 4), Math.ceil(config.height / 4));
  const effectBlurCanvas = canvas(effectBlurSourceCanvas.width, effectBlurSourceCanvas.height);
  const supportsCanvasFilter = 'filter' in effectBlurCanvas.getContext('2d');
  const sendDiagnostic = (_event, details) => config.onStats(details);
  const BLUR_DOWNSAMPLE = 4;
  const MASK_PROFILES = Object.freeze({
    blur: { low: 0.25, high: 0.65, feather: 1.2, erode: false },
    replacement: { low: 0.35, high: 0.72, feather: 0.8, erode: true },
  });
  let effectTemporalMask = null;
  let effectSpatialMask = null;
  let effectMaskPixels = null;
  let effectMaskImageData = null;
  let effectProcessedFrames = 0;
  let effectFrameTotalMs = 0;
  let effectStageTotals = { segmentation: 0, readback: 0, mask: 0, composite: 0 };
  let effectMaxFrameMs = 0;
  let effectHiddenFrames = 0;
  let effectStatsStartedAt = 0;
  function drawCover(context, source, width, height, overscan = 0) {
    const sourceWidth = source.displayWidth || source.videoWidth || source.naturalWidth || source.width;
    const sourceHeight = source.displayHeight || source.videoHeight || source.naturalHeight || source.height;
    if (!sourceWidth || !sourceHeight) return;
    const destinationWidth = width + overscan * 2;
    const destinationHeight = height + overscan * 2;
    const scale = Math.max(destinationWidth / sourceWidth, destinationHeight / sourceHeight);
    const cropWidth = destinationWidth / scale;
    const cropHeight = destinationHeight / scale;
    const sourceX = (sourceWidth - cropWidth) / 2;
    const sourceY = (sourceHeight - cropHeight) / 2;
    context.drawImage(
      source,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      -overscan,
      -overscan,
      destinationWidth,
      destinationHeight,
    );
  }


  function effectMode() {
    return selectedBackground === 'blur' ? 'blur' : 'replacement';
  }


  function effectDiagnosticDetails(extra = {}) {
    return {
      pipelineVersion: 4,
      targetFps: Math.round(1000 / effectFrameInterval()),
      blurWidth: selectedBackground === 'blur' ? (effectBlurCanvas?.width || 0) : 0,
      blurHeight: selectedBackground === 'blur' ? (effectBlurCanvas?.height || 0) : 0,
      model: SEGMENTER_MODEL.id,
      delegate: segmenterDelegate.toLowerCase(),
      mode: effectMode(),
      outputWidth: effectOutputCanvas?.width || 0,
      outputHeight: effectOutputCanvas?.height || 0,
      maskWidth: effectMaskCanvas?.width || 0,
      maskHeight: effectMaskCanvas?.height || 0,
      ...extra,
    };
  }


  function smoothstep(low, high, value) {
    const normalized = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return normalized * normalized * (3 - 2 * normalized);
  }


  function ensureMaskBuffers(width, height) {
    const length = width * height;
    if (effectTemporalMask?.length === length && effectMaskImageData) return;
    effectTemporalMask = null;
    effectSpatialMask = new Float32Array(length);
    effectMaskPixels = new Uint8ClampedArray(length * 4);
    for (let index = 0; index < length; index += 1) {
      const offset = index * 4;
      effectMaskPixels[offset] = 255;
      effectMaskPixels[offset + 1] = 255;
      effectMaskPixels[offset + 2] = 255;
    }
    effectMaskImageData = new ImageData(effectMaskPixels, width, height);
  }


  function stabilizeMask(values) {
    if (!effectTemporalMask) {
      effectTemporalMask = new Float32Array(values);
      return effectTemporalMask;
    }
    for (let index = 0; index < values.length; index += 1) {
      const previous = effectTemporalMask[index];
      const current = values[index];
      const response = Math.abs(current - previous) > 0.18 ? 0.7 : 0.3;
      effectTemporalMask[index] = previous + (current - previous) * response;
    }
    return effectTemporalMask;
  }


  function erodeUncertainEdges(values, width, height) {
    effectSpatialMask.set(values);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const center = values[index];
        if (center >= 0.88) continue;
        const neighborMinimum = Math.min(
          values[index - 1],
          values[index + 1],
          values[index - width],
          values[index + width],
        );
        effectSpatialMask[index] = center * 0.65 + neighborMinimum * 0.35;
      }
    }
    return effectSpatialMask;
  }


  function updateEffectMask(confidenceMask) {
    const { width, height } = confidenceMask;
    if (effectMaskCanvas.width !== width || effectMaskCanvas.height !== height) {
      effectMaskCanvas.width = width;
      effectMaskCanvas.height = height;
    }
    ensureMaskBuffers(width, height);
    const profile = MASK_PROFILES[effectMode()];
    const readbackStartedAt = performance.now();
    const rawValues = confidenceMask.getAsFloat32Array();
    const readbackMs = performance.now() - readbackStartedAt;
    let values = stabilizeMask(rawValues);
    if (profile.erode) values = erodeUncertainEdges(values, width, height);
    for (let index = 0; index < values.length; index += 1) {
      effectMaskPixels[index * 4 + 3] = Math.round(smoothstep(profile.low, profile.high, values[index]) * 255);
    }
    effectMaskCanvas.getContext('2d').putImageData(effectMaskImageData, 0, 0);
    return readbackMs;
  }


  function reportEffectStats(now) {
    if (!effectStatsStartedAt) effectStatsStartedAt = now;
    const elapsed = now - effectStatsStartedAt;
    if (elapsed < EFFECT_STATS_INTERVAL_MS) return;
    const count = Math.max(1, effectProcessedFrames);
    sendDiagnostic('background-effect-stats', effectDiagnosticDetails({
      state: 'running',
      fps: Math.round(effectProcessedFrames * 1000 / elapsed),
      averageFrameMs: Math.round(effectFrameTotalMs / count),
      averageSegmentationMs: Math.round(effectStageTotals.segmentation / count),
      averageReadbackMs: Math.round(effectStageTotals.readback / count),
      averageMaskMs: Math.round(effectStageTotals.mask / count),
      averageCompositeMs: Math.round(effectStageTotals.composite / count),
      maxFrameMs: Math.round(effectMaxFrameMs),
      hiddenFrames: effectHiddenFrames,
      processedFrames: effectProcessedFrames,
      sampleDurationMs: Math.round(elapsed),
    }));
    effectProcessedFrames = 0;
    effectFrameTotalMs = 0;
    effectStageTotals = { segmentation: 0, readback: 0, mask: 0, composite: 0 };
    effectMaxFrameMs = 0;
    effectHiddenFrames = 0;
    effectStatsStartedAt = now;
  }


  function renderEffectComposite(mask) {
    const output = effectOutputCanvas;
    const foreground = effectForegroundCanvas;
    const source = effectSourceVideo;
    if (!output || !foreground || !source) return;
    const outputContext = output.getContext('2d');
    const foregroundContext = foreground.getContext('2d');
    const width = output.width;
    const height = output.height;

    outputContext.clearRect(0, 0, width, height);
    if (selectedBackground === 'blur') {
      // Downsample BEFORE filtering: both the filter input and its destination
      // are small. Keep the foreground and final video at their original size.
      const smallSource = effectBlurSourceCanvas;
      const blurred = effectBlurCanvas;
      const smallContext = smallSource.getContext('2d');
      const blurContext = blurred.getContext('2d');
      const scale = blurred.width / width;
      smallContext.clearRect(0, 0, smallSource.width, smallSource.height);
      drawCover(smallContext, source, smallSource.width, smallSource.height);
      blurContext.clearRect(0, 0, blurred.width, blurred.height);
      blurContext.save();
      blurContext.filter = `blur(${18 * scale}px)`;
      drawCover(blurContext, smallSource, blurred.width, blurred.height, 24 * scale);
      blurContext.restore();
      if (!supportsCanvasFilter) {
        const pixels = blurContext.getImageData(0, 0, blurred.width, blurred.height);
        boxBlur(pixels.data, blurred.width, blurred.height, Math.max(1, Math.round(18 * scale)));
        blurContext.putImageData(pixels, 0, 0);
      }
      outputContext.imageSmoothingEnabled = true;
      outputContext.drawImage(blurred, 0, 0, width, height);
    } else {
      const image = backgroundImages.get(selectedBackground);
      if (image) drawCover(outputContext, image, width, height);
      else {
        outputContext.fillStyle = '#242136';
        outputContext.fillRect(0, 0, width, height);
      }
    }

    foregroundContext.clearRect(0, 0, width, height);
    foregroundContext.globalCompositeOperation = 'source-over';
    foregroundContext.filter = 'none';
    foregroundContext.imageSmoothingEnabled = true;
    foregroundContext.imageSmoothingQuality = 'high';
    drawCover(foregroundContext, source, width, height);
    foregroundContext.globalCompositeOperation = 'destination-in';
    foregroundContext.filter = `blur(${MASK_PROFILES[effectMode()].feather}px)`;
    drawCover(foregroundContext, mask, width, height);
    foregroundContext.globalCompositeOperation = 'source-over';
    foregroundContext.filter = 'none';
    outputContext.drawImage(foreground, 0, 0);
  }


  function effectFrameInterval() {
    return segmenterDelegate === 'CPU' ? Math.max(EFFECT_FRAME_INTERVAL_MS, 1000 / 15) : EFFECT_FRAME_INTERVAL_MS;
  }


  const { FilesetResolver, ImageSegmenter } = await import(`${MEDIAPIPE_BASE}/vision_bundle.mjs`);
  const vision = await FilesetResolver.forVisionTasks(`${MEDIAPIPE_BASE}/wasm`);
  const options = {
    canvas: canvas(1, 1),
    baseOptions: { modelAssetPath: `${MEDIAPIPE_BASE}/models/${SEGMENTER_MODEL.filename}`, delegate: 'GPU' },
    runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false,
  };
  try {
    segmenter = await ImageSegmenter.createFromOptions(vision, options);
  } catch (error) {
    config.onDelegateFallback?.(error);
    options.baseOptions.delegate = 'CPU';
    options.canvas = canvas(1, 1);
    segmenter = await ImageSegmenter.createFromOptions(vision, options);
    segmenterDelegate = 'CPU';
  }
  try {
    if (config.backgroundUrl) {
      const response = await fetch(config.backgroundUrl);
      if (!response.ok) throw new Error('Не удалось загрузить изображение фона');
      backgroundImages.set(selectedBackground, await createImageBitmap(await response.blob()));
    }
  } catch (error) { segmenter.close(); throw error; }

  return {
    canvas: effectOutputCanvas,
    details: () => effectDiagnosticDetails(),
    interval: effectFrameInterval,
    visibility(hidden) { reportEffectStats(performance.now()); document.hidden = hidden; },
    report() { reportEffectStats(performance.now()); },
    process(source, timestamp) {
      const interval = effectFrameInterval();
      if (!acceptFrame(timestamp, interval)) return false;
      effectSourceVideo = effectInputCanvas;
      const started = performance.now();
      if (!effectStatsStartedAt) effectStatsStartedAt = started;
      let readback = 0, mask = 0, composite = 0;
      try {
        // Bound segmentation and mask readback to the output size on every transport.
        // Keep the unprocessed camera track at its original resolution.
        effectInputContext.clearRect(0, 0, effectInputCanvas.width, effectInputCanvas.height);
        drawCover(effectInputContext, source, effectInputCanvas.width, effectInputCanvas.height);
        segmenter.segmentForVideo(effectInputCanvas, timestamp, result => {
          const confidence = result.confidenceMasks?.[0];
          if (!confidence) throw new Error('Модель не вернула маску человека');
          const maskStarted = performance.now();
          readback = updateEffectMask(confidence);
          const compositeStarted = performance.now();
          mask = compositeStarted - maskStarted - readback;
          renderEffectComposite(effectMaskCanvas);
          composite = performance.now() - compositeStarted;
        });
        const total = performance.now() - started;
        effectProcessedFrames++;
        effectFrameTotalMs += total;
        effectStageTotals.segmentation += Math.max(0, total - readback - mask - composite);
        effectStageTotals.readback += readback;
        effectStageTotals.mask += mask;
        effectStageTotals.composite += composite;
        effectMaxFrameMs = Math.max(effectMaxFrameMs, total);
        if (document.hidden) effectHiddenFrames++;
        reportEffectStats(performance.now());
        return true;
      } finally { effectSourceVideo = null; }
    },
    close() {
      segmenter.close();
      for (const image of backgroundImages.values()) image.close();
      backgroundImages.clear();
    },
  };
}

// Linear-time separable blur for browsers without Canvas2D.filter (notably Safari).
export function boxBlur(pixels, width, height, radius) {
  const temporary = new Uint8ClampedArray(pixels.length);
  const size = radius * 2 + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < height; y++) {
      for (let channel = 0; channel < 4; channel++) {
        let sum = 0;
        const at = x => (y * width + Math.max(0, Math.min(width - 1, x))) * 4 + channel;
        for (let x = -radius; x <= radius; x++) sum += pixels[at(x)];
        for (let x = 0; x < width; x++) {
          temporary[(y * width + x) * 4 + channel] = sum / size;
          sum += pixels[at(x + radius + 1)] - pixels[at(x - radius)];
        }
      }
    }
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 4; channel++) {
        let sum = 0;
        const at = y => (Math.max(0, Math.min(height - 1, y)) * width + x) * 4 + channel;
        for (let y = -radius; y <= radius; y++) sum += temporary[at(y)];
        for (let y = 0; y < height; y++) {
          pixels[(y * width + x) * 4 + channel] = sum / size;
          sum += temporary[at(y + radius + 1)] - temporary[at(y - radius)];
        }
      }
    }
  }
}

export function createFrameGate() {
  let last = 0;
  return (timestamp, interval) => {
    const elapsed = timestamp - last;
    if (elapsed < interval) return false;
    last = timestamp - (elapsed % interval);
    return true;
  };
}
