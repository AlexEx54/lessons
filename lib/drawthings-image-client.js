'use strict';

const DEFAULT_NEGATIVE_PROMPT = [
  'low resolution', 'low quality', 'deformed limbs', 'deformed fingers',
  'oversaturated', 'waxy skin', 'blurry text', 'distorted text', 'watermark', 'logo',
].join(', ');

const DEFAULT_CONFIG = Object.freeze({
  width: 512,
  height: 512,
  batchCount: 1,
  batchSize: 1,
  seedMode: 2,
  sampler: 17,
  strength: 1,
  sharpness: 0,
  tiledDecoding: false,
  tiledDiffusion: false,
  guidanceScale: 1,
  loras: [{ file: 'qwen_image_2512_lightning_4_step_v1.0_lora_f16.ckpt', weight: 1 }],
  controls: [],
  clipSkip: 1,
  maskBlur: 1.5,
  shift: 3,
  resolutionDependentShift: false,
  preserveOriginalAfterInpaint: true,
  model: 'qwen_image_2512_q6p.ckpt',
  steps: 4,
  hiresFix: false,
  teaCache: false,
  causalInference: 0,
});

function configuredGenerationConfig(env = process.env) {
  let override = {};
  if (env.DRAWTHINGS_CONFIG_JSON) {
    try {
      override = JSON.parse(env.DRAWTHINGS_CONFIG_JSON);
    } catch (cause) {
      throw new Error(`DRAWTHINGS_CONFIG_JSON содержит некорректный JSON: ${cause.message}`);
    }
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      throw new Error('DRAWTHINGS_CONFIG_JSON должен содержать JSON-объект.');
    }
  }
  const config = { ...DEFAULT_CONFIG, ...override };
  if (env.DRAWTHINGS_MODEL) config.model = env.DRAWTHINGS_MODEL;
  if (env.DRAWTHINGS_LORA) {
    config.loras = [{
      file: env.DRAWTHINGS_LORA,
      weight: Number.isFinite(Number(env.DRAWTHINGS_LORA_WEIGHT))
        ? Number(env.DRAWTHINGS_LORA_WEIGHT)
        : 1,
    }];
  }
  return { ...config, width: 512, height: 512, batchCount: 1, batchSize: 1 };
}

function createDrawThingsImageClient({ env = process.env } = {}) {
  // Loaded lazily so an unavailable optional service never prevents the app from starting.
  // dt-grpc-ts currently publishes its source only from GitHub, so tsx provides a
  // pinned runtime loader until the package starts shipping the documented dist build.
  require('tsx/cjs');
  const sourceEntry = require('node:path').join(
    __dirname, '..', 'node_modules', 'dt-grpc-ts', 'src', 'index.ts',
  );
  const { DTService, buildRequest, getCredentials } = require(sourceEntry);
  const generatedEntry = require('node:path').join(
    __dirname, '..', 'node_modules', 'dt-grpc-ts', 'src', 'generated', 'index.ts',
  );
  const { ImageGenerationServiceClient } = require(generatedEntry);
  const address = env.DRAWTHINGS_GRPC_ADDRESS || '127.0.0.1:17859';
  const timeout = Number.isFinite(Number(env.DRAWTHINGS_CONNECT_TIMEOUT_MS))
    ? Math.max(250, Number(env.DRAWTHINGS_CONNECT_TIMEOUT_MS))
    : 2000;
  const grpcClient = new ImageGenerationServiceClient(address, getCredentials(), {
    'grpc.max_receive_message_length': Infinity,
    'grpc.max_send_message_length': Infinity,
    // The Draw Things certificate is issued to localhost. The production reverse
    // tunnel is intentionally reached as 127.0.0.1, so preserve that TLS authority.
    'grpc.ssl_target_name_override': 'localhost',
    'grpc.default_authority': 'localhost',
  });
  const service = new DTService(grpcClient);
  service.defaultTimeout = timeout;
  service.retries = 1;
  const config = configuredGenerationConfig(env);
  const negativePrompt = env.DRAWTHINGS_NEGATIVE_PROMPT || DEFAULT_NEGATIVE_PROMPT;

  return {
    async available() {
      await service.echo('easyclass-lesson-generator');
      return true;
    },
    async generate(prompt, signal) {
      const request = buildRequest(config, prompt, negativePrompt);
      const images = await service.generateImage(request, {
        abortSignal: signal,
        progress: false,
      });
      if (!images.length) throw new Error('Draw Things не вернул изображение.');
      const image = images[0];
      if (image.width !== 512 || image.height !== 512) {
        throw new Error(`Draw Things вернул изображение ${image.width}×${image.height} вместо 512×512.`);
      }
      return {
        buffer: await image.sharp().png().toBuffer(),
        width: image.width,
        height: image.height,
      };
    },
    close() {
      service.client.close();
    },
  };
}

module.exports = {
  DEFAULT_CONFIG,
  DEFAULT_NEGATIVE_PROMPT,
  configuredGenerationConfig,
  createDrawThingsImageClient,
};
