'use strict';

// OpenRouter transport for lesson generation: one strict-JSON request per stage.
// What each stage asks and how its answer becomes lesson content lives in the
// template definitions (lib/templates/, lib/template-controls/).

const OPENROUTER_MODEL = 'google/gemini-3.7-flash';
const DEEPSEEK_FLASH_VISION_MODEL = 'deepseek/deepseek-v4-flash-vision-exp';
const LESSON_MODEL_OPTIONS = Object.freeze({
  [OPENROUTER_MODEL]: 'Gemini 3.7 Flash',
  [DEEPSEEK_FLASH_VISION_MODEL]: 'DeepSeek V4 Flash Vision Exp · High Reasoning',
});
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

const LESSON_METADATA_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['coverImagePrompt'],
  properties: {
    coverImagePrompt: { type: 'string', minLength: 1 },
  },
});

function learnerProfileInstructions({ ageGroup = '12-14', level = 'A2' } = {}) {
  return [
    'Target learner:',
    `- CEFR level: ${level}`,
    `- Age: ${ageGroup}`,
    'Student-facing and teacher-facing lesson language difficulty must follow the CEFR level.',
    'Topics, situations, and tone must be appropriate for the age.',
    'The learner profile does not change image-generation prompts; follow each section’s image requirements.',
  ].join('\n');
}

function buildLessonMetadata(generated) {
  if (!generated || typeof generated !== 'object') {
    throw new Error('Gemini вернул пустые метаданные урока.');
  }
  const coverImagePrompt = String(generated.coverImagePrompt || '').trim();
  if (!coverImagePrompt) {
    throw new Error('Метаданные урока должны содержать промпт для обложки.');
  }
  return { coverImagePrompt };
}

function applyLessonMetadataToSkeleton(skeleton, generated) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const metadata = buildLessonMetadata(generated);
  lesson.meta.coverImagePrompt = metadata.coverImagePrompt;
  return lesson;
}

function lessonMetadataMessages(topic, learnerProfile) {
  return [{
    role: 'system',
    content: [
      learnerProfileInstructions(learnerProfile),
      'You create visual metadata for one-to-one English lessons.',
      'Create coverImagePrompt for the lesson as a whole, based only on the supplied Lesson topic.',
      'Write a vivid, attractive English image-generation prompt for a landscape 16:10 lesson-library cover that communicates the topic at a glance.',
      'Use a polished contemporary educational illustration style suitable for teenagers, with one clear focal scene and a composition that works as a finished cover without an overlaid title. Avoid childish or preschool aesthetics.',
      'Do not reserve empty space for a title. Explicitly require no visible or readable text, letters, numbers, logos, or watermarks.',
      'Return JSON matching the supplied schema and nothing else.',
    ].join('\n'),
  }, {
    role: 'user',
    content: `Lesson topic: ${String(topic || '').trim()}`,
  }];
}

function reasoningText(delta) {
  if (typeof delta?.reasoning === 'string' && delta.reasoning) return delta.reasoning;
  if (!Array.isArray(delta?.reasoning_details)) return '';
  return delta.reasoning_details.map(detail => {
    if (detail?.type === 'reasoning.text') return detail.text || '';
    if (detail?.type === 'reasoning.summary') return detail.summary || '';
    return '';
  }).join('');
}

function normalizeUsage(usage) {
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
  return {
    cost: typeof usage?.cost === 'number' ? usage.cost : null,
    promptTokens: Number.isInteger(usage?.prompt_tokens) ? usage.prompt_tokens : null,
    completionTokens: Number.isInteger(usage?.completion_tokens) ? usage.completion_tokens : null,
    reasoningTokens: Number.isInteger(reasoningTokens) ? reasoningTokens : null,
  };
}

async function parseOpenRouterStream(response, onDelta = () => {}) {
  if (!response.body) throw new Error('OpenRouter не вернул поток данных.');
  const decoder = new TextDecoder();
  let buffer = '';
  let reasoning = '';
  let output = '';
  let usage = normalizeUsage(null);
  let providerGenerationId = '';

  function consumeEvent(rawEvent) {
    const data = rawEvent.split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return;
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch (cause) {
      throw new Error(`OpenRouter вернул некорректное SSE-событие: ${cause.message}`);
    }
    if (chunk.error) throw new Error(chunk.error.message || 'OpenRouter завершил поток с ошибкой.');
    if (typeof chunk.id === 'string' && chunk.id) providerGenerationId = chunk.id;
    if (chunk.usage) usage = normalizeUsage(chunk.usage);
    const delta = chunk.choices?.[0]?.delta || {};
    const nextReasoning = reasoningText(delta);
    const nextOutput = typeof delta.content === 'string' ? delta.content : '';
    reasoning += nextReasoning;
    output += nextOutput;
    if (nextReasoning || nextOutput || chunk.usage) {
      onDelta({
        reasoningDelta: nextReasoning,
        outputDelta: nextOutput,
        reasoning,
        output,
        usage,
        providerGenerationId,
      });
    }
  }

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';
    events.forEach(consumeEvent);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);
  return { reasoning, output, usage, providerGenerationId };
}

async function generateStructuredSection({
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  model,
  signal,
  onDelta,
  fetchImpl = fetch,
  messages,
  schemaName,
  schema,
  validate,
  sectionName,
}) {
  if (!apiKey) throw Object.assign(new Error('OPENROUTER_API_KEY не настроен.'), { statusCode: 503 });
  if (!LESSON_MODEL_OPTIONS[model]) throw new Error('Модель генерации не задана или не поддерживается.');
  const timeoutSignal = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://easyclass.app',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'EasyClass',
    },
    body: JSON.stringify({
      model,
      messages,
      reasoning: { effort: 'high', exclude: false },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
      provider: { require_parameters: true },
      max_tokens: 60000,
      stream: true,
    }),
    signal: combinedSignal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error?.message || payload?.error || `OpenRouter вернул HTTP ${response.status}.`;
    throw new Error(String(message));
  }
  const streamed = await parseOpenRouterStream(response, onDelta);
  let generated;
  try {
    generated = JSON.parse(streamed.output);
  } catch (cause) {
    throw Object.assign(new Error(`Модель генерации вернула некорректный JSON для ${sectionName}: ${cause.message}`), { streamed });
  }
  validate(generated);
  return { ...streamed, generated };
}

async function generateLessonMetadata({
  topic,
  ageGroup,
  level,
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  model,
  signal,
  onDelta,
  fetchImpl = fetch,
}) {
  return generateStructuredSection({
    apiKey,
    baseUrl,
    model,
    signal,
    onDelta,
    fetchImpl,
    messages: lessonMetadataMessages(topic, { ageGroup, level }),
    schemaName: 'easyclass_lesson_metadata',
    schema: LESSON_METADATA_RESPONSE_SCHEMA,
    validate: buildLessonMetadata,
    sectionName: 'Lesson Metadata',
  });
}

module.exports = {
  LESSON_MODEL_OPTIONS,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
  applyLessonMetadataToSkeleton,
  generateLessonMetadata,
  generateStructuredSection,
  learnerProfileInstructions,
  parseOpenRouterStream,
};
