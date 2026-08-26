'use strict';

const { STAGE_BLUEPRINTS } = require('./synthetic-lesson.js');
const { normalizeMarkdownCard } = require('../assets/components/markdown-card.js');
const { normalizeTaskPrompt } = require('../assets/components/task-prompt.js');
const { normalizeTeacherNote } = require('../assets/components/teacher-note.js');
const { normalizeThisOrThat } = require('../assets/components/this-or-that.js');

const OPENROUTER_MODEL = 'google/gemini-3.7-flash';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;

const WARM_UP_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'teacherNotes', 'yourTurnInstruction', 'choices', 'followUpQuestions', 'possibleLanguage',
  ],
  properties: {
    teacherNotes: { type: 'string', minLength: 1 },
    yourTurnInstruction: { type: 'string', minLength: 1 },
    choices: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['options'],
        properties: {
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['caption', 'imagePrompt'],
              properties: {
                caption: { type: 'string', minLength: 1 },
                imagePrompt: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
    },
    followUpQuestions: { type: 'string', minLength: 1 },
    possibleLanguage: { type: 'string', minLength: 1 },
  },
});

function createLessonSkeleton(topic) {
  const normalizedTopic = String(topic || '').trim();
  return {
    schemaVersion: 'lesson-draft-v1',
    meta: {
      topic: normalizedTopic,
      title: normalizedTopic,
      level: 'A2',
      lessonNumber: 1,
      durationMinutes: 50,
      generatedBy: `openrouter:${OPENROUTER_MODEL}`,
    },
    stages: STAGE_BLUEPRINTS.map((stage, index) => {
      const skeletonStage = {
        id: stage.id,
        title: stage.title,
        durationMinutes: stage.durationMinutes,
        icon: stage.icon,
        number: index + 1,
        content: [],
      };
      if (stage.id === 'warm-up') skeletonStage.subtitle = 'This or That?';
      return skeletonStage;
    }),
  };
}

function buildWarmUpContent(generated) {
  if (!generated || typeof generated !== 'object') throw new Error('Gemini вернул пустой Warm-Up.');
  if (!Array.isArray(generated.choices) || generated.choices.length !== 4) {
    throw new Error('Warm-Up должен содержать четыре пары This or That.');
  }

  const teacherNote = {
    type: 'teacherNote',
    id: 'warm-up-teacher-note',
    text: String(generated.teacherNotes || '').trim(),
  };
  const yourTurn = {
    type: 'markdownCard',
    id: 'warm-up-your-turn-card',
    title: 'Your turn!',
    text: String(generated.yourTurnInstruction || '').trim(),
    icon: 'chat',
    accentColor: '#1EAD58',
    studentVisibility: 'always',
  };
  const thisOrThat = {
    type: 'thisOrThat',
    id: 'warm-up-this-or-that',
    items: generated.choices.map((item, itemIndex) => ({
      id: `warm-up-choice-${itemIndex + 1}`,
      options: (Array.isArray(item?.options) ? item.options : []).map((option, optionIndex) => ({
        id: `warm-up-choice-${itemIndex + 1}-${optionIndex === 0 ? 'a' : 'b'}`,
        caption: String(option?.caption || '').trim(),
        imagePrompt: String(option?.imagePrompt || '').trim(),
      })),
    })),
  };
  const followUp = {
    type: 'taskPrompt',
    id: 'warm-up-follow-up-prompt',
    variant: 'followUp',
    title: 'Follow-up questions:',
    text: String(generated.followUpQuestions || '').trim(),
    support: {
      title: 'Possible language:',
      text: String(generated.possibleLanguage || '').trim(),
    },
  };

  normalizeTeacherNote(teacherNote);
  normalizeMarkdownCard(yourTurn);
  normalizeThisOrThat(thisOrThat);
  normalizeTaskPrompt(followUp);
  return [teacherNote, yourTurn, thisOrThat, followUp];
}

function applyWarmUpToSkeleton(skeleton, generated) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const stage = lesson.stages.find(candidate => candidate.id === 'warm-up');
  if (!stage) throw new Error('В шаблоне отсутствует стадия Warm-Up.');
  stage.content = buildWarmUpContent(generated);
  return lesson;
}

function warmUpMessages(topic) {
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable content for a five-minute Warm-Up in the existing This or That template.',
      'Teacher notes must be in Russian and may include a short English phrase introduced with **Say:**.',
      'All student-facing copy, captions, questions, possible language, and image prompts must be in natural A2 English.',
      'Create exactly four engaging This or That pairs with exactly two clearly contrasting options in each pair.',
      'Every imagePrompt must describe a child-friendly square educational illustration with no text.',
      'Keep every activity directly connected to the lesson topic. Do not mention the previous summer/gaming lesson unless it is the requested topic.',
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

async function generateWarmUp({
  topic,
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  signal,
  onDelta,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw Object.assign(new Error('OPENROUTER_API_KEY не настроен.'), { statusCode: 503 });
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
      model: OPENROUTER_MODEL,
      messages: warmUpMessages(topic),
      reasoning: { effort: 'high', exclude: false },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'easyclass_warm_up',
          strict: true,
          schema: WARM_UP_RESPONSE_SCHEMA,
        },
      },
      max_completion_tokens: 16000,
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
    throw Object.assign(new Error(`Gemini вернул некорректный JSON: ${cause.message}`), { streamed });
  }
  buildWarmUpContent(generated);
  return { ...streamed, generated };
}

module.exports = {
  GENERATION_TIMEOUT_MS,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
  WARM_UP_RESPONSE_SCHEMA,
  applyWarmUpToSkeleton,
  buildWarmUpContent,
  createLessonSkeleton,
  generateWarmUp,
  normalizeUsage,
  parseOpenRouterStream,
  warmUpMessages,
};
