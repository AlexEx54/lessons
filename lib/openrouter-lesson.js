'use strict';

const fs = require('fs');
const path = require('path');

const PROMPT_PATH = path.join(__dirname, '..', 'docs', 'lesson-generator-copy-paste-prompt.md');
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';
const DEFAULT_REASONING_EFFORT = 'xhigh';
const DEFAULT_USD_RUB_RATE = 83;

let cachedPromptTemplate = null;

function numberFromEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getGeneratorConfig() {
  return {
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    reasoningEffort: process.env.OPENROUTER_REASONING_EFFORT || DEFAULT_REASONING_EFFORT,
    usdRubRate: numberFromEnv('USD_RUB_RATE', DEFAULT_USD_RUB_RATE),
    authRequired: Boolean(process.env.TEACHER_ADMIN_TOKEN),
    apiKeyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  };
}

function getPromptTemplate() {
  if (cachedPromptTemplate) return cachedPromptTemplate;
  const raw = fs.readFileSync(PROMPT_PATH, 'utf8');
  const match = raw.match(/```text\n([\s\S]*?)\n```/);
  cachedPromptTemplate = match ? match[1] : raw;
  return cachedPromptTemplate;
}

function buildLessonPrompt({ topic, targetGrammar }) {
  return getPromptTemplate()
    .replaceAll('{{WRITE_TOPIC_HERE}}', topic)
    .replaceAll('{{OPTIONAL_TARGET_GRAMMAR_OR_EMPTY}}', targetGrammar || '');
}

function textFromValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(part => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object') return part.text || part.content || '';
      return '';
    }).join('');
  }
  if (typeof value === 'object') return value.text || value.content || '';
  return '';
}

function extractReasoning(delta) {
  if (!delta || typeof delta !== 'object') return '';
  let text = textFromValue(delta.reasoning) || textFromValue(delta.reasoning_content);

  if (Array.isArray(delta.reasoning_details)) {
    delta.reasoning_details.forEach(item => {
      if (!item || typeof item !== 'object') return;
      text += textFromValue(item.text);
      text += textFromValue(item.summary);
      if (item.type === 'reasoning.encrypted' && !item.text && !item.summary) {
        text += '[reasoning block redacted]';
      }
    });
  }

  return text;
}

function parseSseEvent(rawEvent) {
  const data = [];
  rawEvent.split(/\r?\n/).forEach(line => {
    if (!line || line.startsWith(':')) return;
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  });
  return data.join('\n');
}

function extractJsonObject(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) {
    throw new Error('Модель не вернула JSON. Внутренний поток пришел, но финальный JSON-ответ оказался пустым.');
  }

  try {
    return JSON.parse(trimmed);
  } catch (firstError) {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch (secondError) {
        throw firstError;
      }
    }
    throw firstError;
  }
}

function calculateCost(usage) {
  const config = getGeneratorConfig();
  const promptTokens = Number(usage && usage.prompt_tokens) || 0;
  const completionTokens = Number(usage && usage.completion_tokens) || 0;
  const totalTokens = Number(usage && usage.total_tokens) || (promptTokens + completionTokens);
  const reasoningTokens = Number(
    usage &&
    usage.completion_tokens_details &&
    usage.completion_tokens_details.reasoning_tokens
  ) || 0;

  const reportedCost = Number(usage && usage.cost);
  const hasReportedCost = Number.isFinite(reportedCost) && reportedCost >= 0;
  const usd = hasReportedCost ? Number(reportedCost.toFixed(6)) : null;
  const rub = hasReportedCost ? Number((reportedCost * config.usdRubRate).toFixed(2)) : null;

  return {
    usd,
    rub,
    source: hasReportedCost ? 'openrouter-usage' : 'unknown',
    promptTokens,
    completionTokens,
    reasoningTokens,
    totalTokens,
  };
}

async function generateLessonJson({ topic, targetGrammar, onEvent }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    const error = new Error('OPENROUTER_API_KEY is not configured.');
    error.statusCode = 500;
    throw error;
  }

  const config = getGeneratorConfig();
  const prompt = buildLessonPrompt({ topic, targetGrammar });
  const body = {
    model: config.model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    response_format: { type: 'json_object' },
    reasoning: { effort: config.reasoningEffort, exclude: false },
    temperature: 0.2,
  };

  if (onEvent) onEvent({ type: 'status', message: `Запрос отправлен в ${config.model}...` });

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:8787',
      'X-Title': process.env.OPENROUTER_APP_TITLE || 'Teach Platform Lesson Generator',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    const error = new Error(`OpenRouter request failed (${response.status}): ${text || response.statusText}`);
    error.statusCode = response.status || 502;
    throw error;
  }

  const generationId = response.headers.get('x-generation-id') || '';
  if (generationId && onEvent) onEvent({ type: 'status', message: `Generation id: ${generationId}` });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let usage = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');

    let splitAt = buffer.indexOf('\n\n');
    while (splitAt >= 0) {
      const rawEvent = buffer.slice(0, splitAt);
      buffer = buffer.slice(splitAt + 2);
      splitAt = buffer.indexOf('\n\n');

      const data = parseSseEvent(rawEvent);
      if (!data || data === '[DONE]') continue;

      let payload;
      try {
        payload = JSON.parse(data);
      } catch (error) {
        continue;
      }

      if (payload.error) {
        throw new Error(payload.error.message || 'OpenRouter stream error.');
      }

      if (payload.usage) {
        usage = payload.usage;
        if (onEvent) onEvent({ type: 'usage', usage, cost: calculateCost(usage) });
      }

      const choice = payload.choices && payload.choices[0];
      const delta = choice && choice.delta;
      const chunk = textFromValue(delta && delta.content);
      const reasoning = extractReasoning(delta);

      if (reasoning && onEvent) onEvent({ type: 'reasoning', text: reasoning });
      if (chunk) {
        content += chunk;
        if (onEvent && content.length % 4000 < chunk.length) {
          onEvent({ type: 'status', message: `Получено ${content.length} символов JSON...` });
        }
      }
    }
  }

  if (buffer.trim()) {
    const data = parseSseEvent(buffer);
    if (data && data !== '[DONE]') {
      try {
        const payload = JSON.parse(data);
        const delta = payload.choices && payload.choices[0] && payload.choices[0].delta;
        content += textFromValue(delta && delta.content);
        if (payload.usage) usage = payload.usage;
      } catch (error) {
        // Ignore incomplete final SSE fragments.
      }
    }
  }

  const lesson = extractJsonObject(content);
  return {
    lesson,
    generationId,
    usage,
    cost: calculateCost(usage || {}),
    model: config.model,
    reasoningEffort: config.reasoningEffort,
  };
}

module.exports = {
  buildLessonPrompt,
  calculateCost,
  generateLessonJson,
  getGeneratorConfig,
};
