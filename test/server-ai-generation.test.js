'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { hashPassword } = require('../lib/password.js');
const { createUser } = require('../lib/user-store.js');

const ROOT = path.join(__dirname, '..');

const WARM_UP = {
  teacherNotes: '- Попросите ученика выбрать вариант и назвать причину.\n\n**Say:** “Which journey would you choose?”',
  yourTurnInstruction: 'Choose one option and explain your answer.',
  choices: Array.from({ length: 4 }, (_value, index) => ({
    options: [{
      caption: `Journey ${index + 1}A`,
      imagePrompt: `Square child-friendly educational travel illustration ${index + 1}A, no text.`,
    }, {
      caption: `Journey ${index + 1}B`,
      imagePrompt: `Square child-friendly educational travel illustration ${index + 1}B, no text.`,
    }],
  })),
  followUpQuestions: 'Which journey looks more exciting? Why?',
  possibleLanguage: 'I would choose… because…',
};

const LEAD_IN = {
  teacherNotes: [
    'Прочитайте текст вместе с учеником и предложите ему ответить на вопросы.',
    '- Объясните фразу **on the go** — в дороге или во время движения.',
    '- Если ответ на третий вопрос короткий, спросите: *Why do you think so?*',
    '- После ответов спросите: *Can you guess what our lesson is about?*',
    '',
    '**Say:** *We are going to talk about travel choices.*',
  ].join('\n'),
  message: '**@CityMia:** I am always on the go. Today I took the bus, but cycling looked more fun!',
  leadingImagePrompt: 'Child-friendly circular city traveler avatar, educational illustration, no text.',
  trailingImagePrompt: 'Child-friendly small bicycle symbol, educational illustration, no text.',
  questions: [
    'How did Mia travel today?',
    'Which type of transport looked more fun?',
    'How do you usually travel around your city?',
  ],
  suggestedAnswers: [
    'Mia took the bus.',
    'Cycling looked more fun.',
    'I usually take the bus because it is quick.',
  ],
};

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      if ((await fetch(`${url}/health`)).ok) return;
    } catch (_error) {
      // Starting.
    }
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error('Server did not become ready.');
}

async function login(baseUrl, email, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get('set-cookie').split(';')[0];
}

test('AI draft sequentially streams Warm-Up and Lead-In with aggregate usage into review', async t => {
  let openRouterRequestCount = 0;
  const openRouter = http.createServer((req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/v1/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer integration-key');
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      const requestIndex = openRouterRequestCount;
      openRouterRequestCount += 1;
      assert.equal(payload.model, 'google/gemini-3.7-flash');
      assert.equal(payload.reasoning.effort, 'high');
      const generated = requestIndex === 0 ? WARM_UP : LEAD_IN;
      const usage = requestIndex === 0
        ? {
          prompt_tokens: 220,
          completion_tokens: 140,
          completion_tokens_details: { reasoning_tokens: 60 },
          cost: 0.023456,
        }
        : {
          prompt_tokens: 120,
          completion_tokens: 80,
          completion_tokens_details: { reasoning_tokens: 30 },
          cost: 0.01,
        };
      assert.equal(payload.messages[1].content, requestIndex === 0
        ? 'Lesson topic: City transport'
        : 'Lesson topic: Travel choices');
      assert.equal(payload.response_format.json_schema.name, requestIndex === 0
        ? 'easyclass_warm_up'
        : 'easyclass_lead_in');
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ id: `gen-integration-${requestIndex}`, choices: [{ delta: { reasoning: `Planning section ${requestIndex + 1}.` } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: `gen-integration-${requestIndex}`, choices: [{ delta: { content: JSON.stringify(generated) } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({
        id: `gen-integration-${requestIndex}`,
        choices: [{ delta: {} }],
        usage,
      })}\n\n`);
      res.end('data: [DONE]\n\n');
    });
  });
  const openRouterPort = await listen(openRouter);
  t.after(() => openRouter.close());

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-ai-'));
  const databasePath = path.join(temporaryDirectory, 'app.sqlite');
  const database = openDatabase(databasePath);
  const password = 'correct-password';
  const passwordHash = await hashPassword(password);
  createUser({
    email: 'ai-admin@example.com', displayName: 'AI Admin', passwordHash, role: 'admin',
  }, database);
  database.close();

  const port = 31000 + Math.floor(Math.random() * 10000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      APP_DB_PATH: databasePath,
      HOST: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'test',
      DRAFT_ASSETS_DIR: path.join(temporaryDirectory, 'draft-assets'),
      OPENROUTER_API_KEY: 'integration-key',
      OPENROUTER_BASE_URL: `http://127.0.0.1:${openRouterPort}/api/v1`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);
  const cookie = await login(baseUrl, 'ai-admin@example.com', password);

  const createdResponse = await fetch(`${baseUrl}/api/lesson-drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      topic: 'Travel choices', warmUpTopic: '  City transport  ', template: 'template-1', synthetic: false,
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).draft;
  assert.equal(created.status, 'generating');
  assert.equal(created.warmUpTopic, 'City transport');
  assert.equal(created.generation.mode, 'ai');
  assert.equal(created.generation.model, 'google/gemini-3.7-flash');
  assert.equal(created.content.stages.length, 9);
  assert.ok(created.content.stages.every(stage => stage.content.length === 0));
  assert.ok(created.content.stages.slice(1).every(stage => stage.subtitle === undefined));

  let ready;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, { headers: { Cookie: cookie } });
    ready = (await response.json()).draft;
    if (ready.status !== 'generating') break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.equal(ready.status, 'review');
  assert.equal(openRouterRequestCount, 2);
  assert.equal(ready.generation.status, 'completed');
  assert.equal(ready.generation.costUsd, 0.033456);
  assert.equal(ready.content.meta.topic, 'Travel choices');
  assert.equal(ready.content.meta.title, 'Travel choices');
  assert.ok(['pending', 'running', 'unavailable'].includes(ready.imageGeneration.status));
  assert.equal(ready.imageGeneration.total, 10);
  assert.deepEqual(ready.content.stages[0].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'thisOrThat', 'taskPrompt',
  ]);
  assert.deepEqual(ready.content.stages[1].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'illustratedTextPanel', 'textPanel', 'markdownCard',
  ]);
  assert.equal(ready.content.stages[1].content[0].text, LEAD_IN.teacherNotes);
  assert.equal(ready.content.stages[1].content[3].text.split('\n').length, 3);
  assert.ok(ready.content.stages.slice(2).every(stage => stage.content.length === 0));

  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/generation-stream`)).status, 401);
  const traceResponse = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/generation-stream`, {
    headers: { Cookie: cookie },
  });
  assert.equal(traceResponse.status, 200);
  const trace = await traceResponse.text();
  assert.match(trace, /event: snapshot/);
  assert.match(trace, /=== Warm-Up ===/);
  assert.match(trace, /=== Lead-In ===/);
  assert.match(trace, /Planning section 1/);
  assert.match(trace, /Planning section 2/);
  assert.match(trace, /on the go/);
  assert.match(trace, /0\.033456/);
  assert.match(trace, /"promptTokens":340/);
  assert.match(trace, /"completionTokens":220/);
  assert.match(trace, /"reasoningTokens":90/);
  assert.match(trace, /event: done/);
});

test('Lead-In failure keeps the AI draft atomic and marks the whole generation failed', async t => {
  let openRouterRequestCount = 0;
  const openRouter = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      const requestIndex = openRouterRequestCount;
      openRouterRequestCount += 1;
      if (requestIndex === 0) {
        assert.equal(payload.messages[1].content, 'Lesson topic: Warm-up transport');
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ id: 'gen-warm-up', choices: [{ delta: { reasoning: 'Warm-Up complete.' } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: 'gen-warm-up', choices: [{ delta: { content: JSON.stringify(WARM_UP) } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: 'gen-warm-up', choices: [{ delta: {} }], usage: { cost: 0.005 } })}\n\n`);
        res.end('data: [DONE]\n\n');
        return;
      }
      assert.equal(payload.messages[1].content, 'Lesson topic: Travel choices');
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Lead-In provider failed.' } }));
    });
  });
  const openRouterPort = await listen(openRouter);
  t.after(() => openRouter.close());

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-ai-failure-'));
  const databasePath = path.join(temporaryDirectory, 'app.sqlite');
  const database = openDatabase(databasePath);
  const password = 'correct-password';
  const passwordHash = await hashPassword(password);
  createUser({
    email: 'ai-failure@example.com', displayName: 'AI Failure', passwordHash, role: 'admin',
  }, database);
  database.close();

  const port = 31000 + Math.floor(Math.random() * 10000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      APP_DB_PATH: databasePath,
      HOST: '127.0.0.1',
      PORT: String(port),
      NODE_ENV: 'test',
      DRAFT_ASSETS_DIR: path.join(temporaryDirectory, 'draft-assets'),
      OPENROUTER_API_KEY: 'integration-key',
      OPENROUTER_BASE_URL: `http://127.0.0.1:${openRouterPort}/api/v1`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);
  const cookie = await login(baseUrl, 'ai-failure@example.com', password);

  const createdResponse = await fetch(`${baseUrl}/api/lesson-drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      topic: 'Travel choices', warmUpTopic: 'Warm-up transport', template: 'template-1', synthetic: false,
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).draft;

  let failed;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, { headers: { Cookie: cookie } });
    failed = (await response.json()).draft;
    if (failed.status !== 'generating') break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.equal(openRouterRequestCount, 2);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.generation.status, 'failed');
  assert.equal(failed.generation.costUsd, 0.005);
  assert.match(failed.errorMessage, /Lead-In provider failed/);
  assert.ok(failed.content.stages.every(stage => stage.content.length === 0));
  assert.equal(failed.imageGeneration, null);

  const traceResponse = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/generation-stream`, {
    headers: { Cookie: cookie },
  });
  assert.equal(traceResponse.status, 200);
  const trace = await traceResponse.text();
  assert.match(trace, /=== Warm-Up ===/);
  assert.match(trace, /=== Lead-In ===/);
  assert.match(trace, /Lead-In provider failed/);
  assert.match(trace, /event: generation-error/);
});
