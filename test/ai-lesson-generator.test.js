'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  OPENROUTER_MODEL,
  applyWarmUpToSkeleton,
  buildWarmUpContent,
  createLessonSkeleton,
  generateWarmUp,
  parseOpenRouterStream,
  warmUpMessages,
} = require('../lib/ai-lesson-generator.js');

const GENERATED_WARM_UP = Object.freeze({
  teacherNotes: '- Покажите варианты и попросите коротко объяснить выбор.\n\n**Say:** “Which space trip would you choose?”',
  yourTurnInstruction: 'Choose one option in each pair and explain your choice.',
  choices: Array.from({ length: 4 }, (_value, index) => ({
    options: [{
      caption: `Space option ${index + 1}A`,
      imagePrompt: `Square child-friendly educational illustration of space option ${index + 1}A, no text.`,
    }, {
      caption: `Space option ${index + 1}B`,
      imagePrompt: `Square child-friendly educational illustration of space option ${index + 1}B, no text.`,
    }],
  })),
  followUpQuestions: 'Which option was the most exciting? Why?',
  possibleLanguage: 'I would choose… because…',
});

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

test('AI lesson skeleton keeps nine stages and hides future topic-specific subtitles', () => {
  const lesson = createLessonSkeleton('  Space travel  ');
  assert.equal(lesson.meta.topic, 'Space travel');
  assert.equal(lesson.meta.generatedBy, `openrouter:${OPENROUTER_MODEL}`);
  assert.equal(lesson.stages.length, 9);
  assert.ok(lesson.stages.every(stage => Array.isArray(stage.content) && stage.content.length === 0));
  assert.equal(lesson.stages[0].subtitle, 'This or That?');
  assert.ok(lesson.stages.slice(1).every(stage => stage.subtitle === undefined));
});

test('generated Warm-Up is mapped onto fixed compatible components', () => {
  const content = buildWarmUpContent(GENERATED_WARM_UP);
  assert.deepEqual(content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'thisOrThat', 'taskPrompt',
  ]);
  assert.equal(content[2].items.length, 4);
  assert.ok(content[2].items.every(item => item.options.length === 2));
  assert.equal(content[2].items[0].id, 'warm-up-choice-1');
  assert.equal(content[2].items[0].options[1].id, 'warm-up-choice-1-b');
  const lesson = applyWarmUpToSkeleton(createLessonSkeleton('Space travel'), GENERATED_WARM_UP);
  assert.equal(lesson.stages[0].content.length, 4);
  assert.ok(lesson.stages.slice(1).every(stage => stage.content.length === 0));
});

test('generated Warm-Up rejects a damaged This or That shape', () => {
  assert.throws(() => buildWarmUpContent({ ...GENERATED_WARM_UP, choices: [] }), /четыре пары/);
  const damaged = JSON.parse(JSON.stringify(GENERATED_WARM_UP));
  damaged.choices[0].options.pop();
  assert.throws(() => buildWarmUpContent(damaged), /exactly two options/);
});

test('Warm-Up prompt requires three teacher-note bullets and a separate Say paragraph', () => {
  const messages = warmUpMessages('Space travel');
  const systemPrompt = messages.find(message => message.role === 'system').content;
  assert.match(systemPrompt, /exactly three Markdown bullet points followed by a separate Say paragraph/);
  assert.match(systemPrompt, /briefly explain the purpose of the lead-in question/);
  assert.match(systemPrompt, /exact question for the learner in natural A2 English/);
  assert.match(systemPrompt, /summarize the main Warm-Up topic/);
  assert.match(systemPrompt, /one word or short phrases/);
  assert.match(systemPrompt, /what kind of answer the teacher should accept/);
  assert.match(systemPrompt, /ready-to-say opening phrase in natural A2 English/);
  assert.match(systemPrompt, /\*\*Say:\*\* \*English opening phrase\*/);
  assert.match(systemPrompt, /Say paragraph must not be a bullet point/);
  assert.match(systemPrompt, /only the English opening phrase after \*\*Say:\*\* must be italic/);
  assert.match(systemPrompt, /without presenting its topic as the topic of the whole lesson/);
  assert.match(systemPrompt, /Today we will talk about/);
  assert.doesNotMatch(systemPrompt, /summer\/gaming/);
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

test('generateWarmUp sends the selected model, high reasoning, and strict schema', async () => {
  let requestBody;
  const response = streamingResponse([
    `data: ${JSON.stringify({ id: 'gen-2', choices: [{ delta: { reasoning: 'Ready.' } }] })}`,
    `data: ${JSON.stringify({ id: 'gen-2', choices: [{ delta: { content: JSON.stringify(GENERATED_WARM_UP) } }] })}`,
    'data: {"id":"gen-2","choices":[{"delta":{}}],"usage":{"cost":0.01}}',
    'data: [DONE]',
  ]);
  const result = await generateWarmUp({
    topic: 'Space travel',
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.test/api/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      requestBody = JSON.parse(options.body);
      return response;
    },
  });
  assert.equal(requestBody.model, OPENROUTER_MODEL);
  assert.deepEqual(requestBody.reasoning, { effort: 'high', exclude: false });
  assert.equal(requestBody.response_format.type, 'json_schema');
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(requestBody.stream, true);
  assert.equal(result.generated.choices.length, 4);
});
