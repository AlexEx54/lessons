'use strict';

const { STAGE_BLUEPRINTS } = require('./synthetic-lesson.js');
const { normalizeMarkdownCard } = require('../assets/components/markdown-card.js');
const { normalizeTaskPrompt } = require('../assets/components/task-prompt.js');
const { normalizeTeacherNote } = require('../assets/components/teacher-note.js');
const { normalizeThisOrThat } = require('../assets/components/this-or-that.js');
const {
  normalizeIllustratedTextPanel,
  normalizeTextPanel,
} = require('../assets/components/text-panel.js');

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

const LEAD_IN_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'teacherNotes', 'message', 'leadingImagePrompt', 'trailingImagePrompt',
    'questions', 'suggestedAnswers',
  ],
  properties: {
    teacherNotes: { type: 'string', minLength: 1 },
    message: { type: 'string', minLength: 1 },
    leadingImagePrompt: { type: 'string', minLength: 1 },
    trailingImagePrompt: { type: 'string', minLength: 1 },
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1 },
    },
    suggestedAnswers: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1 },
    },
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

function buildLeadInContent(generated) {
  if (!generated || typeof generated !== 'object') throw new Error('Gemini вернул пустой Lead-In.');
  if (!Array.isArray(generated.questions) || generated.questions.length !== 3) {
    throw new Error('Lead-In должен содержать ровно три вопроса.');
  }
  if (!Array.isArray(generated.suggestedAnswers) || generated.suggestedAnswers.length !== 3) {
    throw new Error('Lead-In должен содержать ровно три suggested answers.');
  }

  const teacherNote = {
    type: 'teacherNote',
    id: 'lead-in-teacher-note',
    text: String(generated.teacherNotes || '').trim(),
  };
  const yourTurn = {
    type: 'markdownCard',
    id: 'lead-in-your-turn-card',
    title: 'Your turn!',
    text: 'Read the message and discuss it together.',
    icon: 'chat',
    accentColor: '#1EAD58',
    studentVisibility: 'always',
  };
  const message = {
    type: 'illustratedTextPanel',
    id: 'lead-in-gamer-message',
    text: String(generated.message || '').trim(),
    backgroundColor: '#252A38',
    leadingPicture: {
      imagePrompt: String(generated.leadingImagePrompt || '').trim(),
    },
    trailingPicture: {
      imagePrompt: String(generated.trailingImagePrompt || '').trim(),
    },
  };
  const questions = {
    type: 'textPanel',
    id: 'lead-in-discussion-questions',
    text: generated.questions
      .map((question, index) => `${index + 1}. ${String(question || '').trim()}`)
      .join('\n'),
    backgroundColor: '#FFFFFF',
  };
  const suggestedAnswers = {
    type: 'markdownCard',
    id: 'lead-in-suggested-answers-card',
    title: 'Suggested answers',
    text: generated.suggestedAnswers
      .map((answer, index) => `${index + 1}. ${String(answer || '').trim()}`)
      .join('\n'),
    icon: 'check',
    accentColor: '#1EAD58',
    studentVisibility: 'controlled',
  };

  normalizeTeacherNote(teacherNote);
  normalizeMarkdownCard(yourTurn);
  normalizeIllustratedTextPanel(message);
  normalizeTextPanel(questions);
  normalizeMarkdownCard(suggestedAnswers);
  return [teacherNote, yourTurn, message, questions, suggestedAnswers];
}

function applyLeadInToSkeleton(skeleton, generated) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const stage = lesson.stages.find(candidate => candidate.id === 'lead-in');
  if (!stage) throw new Error('В шаблоне отсутствует стадия Lead-In.');
  stage.content = buildLeadInContent(generated);
  return lesson;
}

function warmUpMessages(topic) {
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable content for a five-minute Warm-Up in the existing This or That template.',
      'Write teacherNotes as exactly three Markdown bullet points followed by a separate Say paragraph, in this order:',
      '1. In Russian, briefly explain the purpose of the lead-in question, then provide the exact question for the learner in natural A2 English; it must summarize the main Warm-Up topic and guide the learner toward the task.',
      '2. In Russian, explain whether the learner should answer with one word or short phrases.',
      '3. In Russian, state what kind of answer the teacher should accept.',
      'After the three bullet points, add a blank line and then give the teacher a ready-to-say opening phrase in natural A2 English using exactly this Markdown format: **Say:** *English opening phrase*.',
      'The Say paragraph must not be a bullet point; only the English opening phrase after **Say:** must be italic.',
      'The opening phrase must start the Warm-Up without presenting its topic as the topic of the whole lesson. Do not use phrases such as “Today we will talk about...”.',
      'All student-facing copy, captions, questions, possible language, and image prompts must be in natural A2 English.',
      'Create exactly four engaging This or That pairs with exactly two clearly contrasting options in each pair.',
      'Every imagePrompt must describe a child-friendly square educational illustration with no text.',
      'Keep every activity directly connected to the provided topic.',
      'Return JSON matching the supplied schema and nothing else.',
    ].join('\n'),
  }, {
    role: 'user',
    content: `Lesson topic: ${String(topic || '').trim()}`,
  }];
}

function leadInMessages(topic) {
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable content for a five-minute Lead-In in the existing template.',
      'Write teacherNotes as one Markdown string, following this exact content order:',
      '1. Start with this exact instruction in Russian: Прочитайте текст вместе с учеником и предложите ему ответить на вопросы.',
      '2. In Russian, list the one or two modern English phrases, idioms, or slang expressions from the message that the teacher should explain, and briefly explain their meaning.',
      '3. In Russian, tell the teacher that if the learner gives a one-word or very short answer to question 3, they must encourage the learner to develop their point of view; include a ready-to-say natural English follow-up question such as “Why do you think so?”.',
      '4. In Russian, tell the teacher to ask after all three answers whether the learner can guess the lesson topic; include a ready-to-say natural A2 English question.',
      '5. Finish with a ready-to-say natural A2 English lesson preview in the exact Markdown format **Say:** *English lesson preview*.',
      'The lesson preview must start with “We are going to...” and may mention only topic, vocabulary, or grammar goals explicitly present in the supplied Lesson topic. Never invent a grammar or vocabulary goal.',
      'The main message must be short, engaging, directly connected to the lesson topic, and lead naturally into it.',
      'Use mostly simple natural A2 English in the message, but include exactly one or two contemporary English phrases, idioms, or slang expressions. Those expressions must be the ones explained in teacherNotes.',
      'The message may start with a short sender name or social-media handle and may use light Markdown, but it must remain easy to read.',
      'Create exactly three student-facing questions in natural A2 English.',
      'Questions 1 and 2 must check comprehension of facts or meaning in the message and be answerable from the message itself.',
      'Question 3 must be personalized: connect the message to the learner’s own experience or opinion.',
      'Create exactly three suggestedAnswers in the same order. Answers 1 and 2 must answer from the message; answer 3 must be a plausible example personal answer, not “Personal answer”.',
      'Both image prompts must describe child-friendly educational illustrations with no text. The leading image should work as a sender/avatar image and the trailing image as a small thematic symbol related to the message.',
      'All student-facing copy and image prompts must be in English. Russian is allowed only in teacherNotes.',
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
    throw Object.assign(new Error(`Gemini вернул некорректный JSON для ${sectionName}: ${cause.message}`), { streamed });
  }
  validate(generated);
  return { ...streamed, generated };
}

async function generateWarmUp({
  topic,
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  signal,
  onDelta,
  fetchImpl = fetch,
}) {
  return generateStructuredSection({
    apiKey,
    baseUrl,
    signal,
    onDelta,
    fetchImpl,
    messages: warmUpMessages(topic),
    schemaName: 'easyclass_warm_up',
    schema: WARM_UP_RESPONSE_SCHEMA,
    validate: buildWarmUpContent,
    sectionName: 'Warm-Up',
  });
}

async function generateLeadIn({
  topic,
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  signal,
  onDelta,
  fetchImpl = fetch,
}) {
  return generateStructuredSection({
    apiKey,
    baseUrl,
    signal,
    onDelta,
    fetchImpl,
    messages: leadInMessages(topic),
    schemaName: 'easyclass_lead_in',
    schema: LEAD_IN_RESPONSE_SCHEMA,
    validate: buildLeadInContent,
    sectionName: 'Lead-In',
  });
}

module.exports = {
  GENERATION_TIMEOUT_MS,
  LEAD_IN_RESPONSE_SCHEMA,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
  WARM_UP_RESPONSE_SCHEMA,
  applyLeadInToSkeleton,
  applyWarmUpToSkeleton,
  buildLeadInContent,
  buildWarmUpContent,
  createLessonSkeleton,
  generateLeadIn,
  generateWarmUp,
  leadInMessages,
  normalizeUsage,
  parseOpenRouterStream,
  warmUpMessages,
};
