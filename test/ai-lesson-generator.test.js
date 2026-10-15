'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  OPENROUTER_MODEL,
  applyLessonMetadataToSkeleton,
  generateLessonMetadata,
  generateStructuredSection,
  learnerProfileInstructions,
  parseOpenRouterStream,
} = require('../lib/ai-lesson-generator.js');

const DEEPSEEK_MODEL = 'deepseek/deepseek-v4-flash-vision-exp';
const COVER_PROMPT = 'Vivid landscape 16:10 educational illustration of a young space explorer looking toward Mars from a futuristic observatory, polished child-friendly style, one clear focal scene, no visible text, letters, numbers, logos, or watermarks.';

function streamingResponse(events) {
  const encoded = new TextEncoder().encode(events.join('\n\n') + '\n\n');
  const chunks = [encoded.slice(0, 17), encoded.slice(17, 53), encoded.slice(53)];
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const answerResponse = (id, answer) => streamingResponse([
  `data: ${JSON.stringify({ id, choices: [{ delta: { content: JSON.stringify(answer) } }] })}`,
  'data: [DONE]',
]);

// Runs generateLessonMetadata against a fake OpenRouter and returns the request it sent.
async function generateMetadata(answer, options = {}) {
  let request;
  const result = await generateLessonMetadata({
    topic: 'Space travel',
    model: OPENROUTER_MODEL,
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    fetchImpl: async (_url, fetchOptions) => {
      request = JSON.parse(fetchOptions.body);
      return answerResponse('gen-metadata', answer);
    },
    ...options,
  });
  return { request, result };
}

test('learner age and CEFR level are described without changing image requirements', () => {
  const profile = learnerProfileInstructions({ ageGroup: '9-11', level: 'B1' });
  assert.match(profile, /CEFR level: B1/);
  assert.match(profile, /Age: 9-11/);
  assert.match(profile, /learner profile does not change image-generation prompts/i);
});

test('Lesson Metadata generates and applies a standalone lesson cover prompt', async () => {
  const { request, result } = await generateMetadata({ coverImagePrompt: COVER_PROMPT }, { ageGroup: '9-11', level: 'B1' });
  const [system, user] = request.messages;
  assert.equal(user.content, 'Lesson topic: Space travel');
  assert.ok(system.content.startsWith(learnerProfileInstructions({ ageGroup: '9-11', level: 'B1' })));
  assert.match(system.content, /coverImagePrompt for the lesson as a whole/);
  assert.match(system.content, /landscape 16:10 lesson-library cover/);
  assert.match(system.content, /no visible or readable text/);
  assert.match(system.content, /suitable for teenagers/);
  assert.doesNotMatch(system.content, /child-friendly/i);
  assert.equal(request.response_format.json_schema.name, 'easyclass_lesson_metadata');
  assert.deepEqual(request.response_format.json_schema.schema.required, ['coverImagePrompt']);
  assert.equal(result.generated.coverImagePrompt, COVER_PROMPT);

  const skeleton = { meta: { title: 'Space travel' }, stages: [] };
  const lesson = applyLessonMetadataToSkeleton(skeleton, { coverImagePrompt: ` ${COVER_PROMPT} ` });
  assert.deepEqual(lesson.meta, { title: 'Space travel', coverImagePrompt: COVER_PROMPT });
  assert.equal(skeleton.meta.coverImagePrompt, undefined);

  await assert.rejects(generateMetadata({ coverImagePrompt: '' }), /промпт для обложки/);
});

test('OpenRouter SSE parser joins split reasoning, output, id, and usage chunks', async () => {
  const response = streamingResponse([
    'data: {"id":"gen-1","choices":[{"delta":{"reasoning":"Plan "}}]}',
    'data: {"id":"gen-1","choices":[{"delta":{"reasoning_details":[{"type":"reasoning.summary","summary":"carefully"}]}}]}',
    'data: {"id":"gen-1","choices":[{"delta":{"content":"{\\"ok\\":"}}]}',
    'data: {"id":"gen-1","choices":[{"delta":{"content":"true}"}}],"usage":{"prompt_tokens":100,"completion_tokens":50,"completion_tokens_details":{"reasoning_tokens":20},"cost":0.01234}}',
    'data: [DONE]',
  ]);
  const deltas = [];
  const result = await parseOpenRouterStream(response, delta => deltas.push(delta));
  assert.equal(result.reasoning, 'Plan carefully');
  assert.equal(result.output, '{"ok":true}');
  assert.equal(result.providerGenerationId, 'gen-1');
  assert.deepEqual(result.usage, {
    cost: 0.01234, promptTokens: 100, completionTokens: 50, reasoningTokens: 20,
  });
  assert.ok(deltas.length >= 4);
});

test('a structured section request sends the selected model, high reasoning, and strict schema', async () => {
  const schema = { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } };
  const messages = [{ role: 'system', content: 'Rules.' }, { role: 'user', content: 'Lesson topic: Space travel' }];
  let requestBody;
  const result = await generateStructuredSection({
    model: DEEPSEEK_MODEL,
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    messages,
    schemaName: 'easyclass_warm_up',
    schema,
    validate: generated => assert.equal(generated.ok, true),
    sectionName: 'Warm Up',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.test/api/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      requestBody = JSON.parse(options.body);
      return answerResponse('gen-2', { ok: true });
    },
  });
  assert.equal(requestBody.model, DEEPSEEK_MODEL);
  assert.deepEqual(requestBody.messages, messages);
  assert.deepEqual(requestBody.reasoning, { effort: 'high', exclude: false });
  assert.deepEqual(requestBody.response_format, {
    type: 'json_schema', json_schema: { name: 'easyclass_warm_up', strict: true, schema },
  });
  assert.deepEqual(requestBody.provider, { require_parameters: true });
  assert.equal(requestBody.stream, true);
  assert.deepEqual(result.generated, { ok: true });
  assert.equal(result.providerGenerationId, 'gen-2');
});

test('a structured section request rejects a missing model instead of falling back', async () => {
  await assert.rejects(generateMetadata({ coverImagePrompt: COVER_PROMPT }, {
    model: undefined,
    fetchImpl: async () => {
      throw new Error('OpenRouter must not be called without a model.');
    },
  }), /Модель генерации не задана/);
});
