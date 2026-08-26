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

test('AI draft streams Warm-Up, trace, and exact OpenRouter cost into review', async t => {
  const openRouter = http.createServer((req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/v1/chat/completions');
    assert.equal(req.headers.authorization, 'Bearer integration-key');
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      assert.equal(payload.model, 'google/gemini-3.7-flash');
      assert.equal(payload.reasoning.effort, 'high');
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ id: 'gen-integration', choices: [{ delta: { reasoning: 'Planning the A2 activity.' } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: 'gen-integration', choices: [{ delta: { content: JSON.stringify(WARM_UP) } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({
        id: 'gen-integration',
        choices: [{ delta: {} }],
        usage: {
          prompt_tokens: 220,
          completion_tokens: 140,
          completion_tokens_details: { reasoning_tokens: 60 },
          cost: 0.023456,
        },
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
    body: JSON.stringify({ topic: 'Travel choices', template: 'template-1', synthetic: false }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).draft;
  assert.equal(created.status, 'generating');
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
  assert.equal(ready.generation.status, 'completed');
  assert.equal(ready.generation.costUsd, 0.023456);
  assert.deepEqual(ready.content.stages[0].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'thisOrThat', 'taskPrompt',
  ]);
  assert.ok(ready.content.stages.slice(1).every(stage => stage.content.length === 0));

  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/generation-stream`)).status, 401);
  const traceResponse = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/generation-stream`, {
    headers: { Cookie: cookie },
  });
  assert.equal(traceResponse.status, 200);
  const trace = await traceResponse.text();
  assert.match(trace, /event: snapshot/);
  assert.match(trace, /Planning the A2 activity/);
  assert.match(trace, /0\.023456/);
  assert.match(trace, /event: done/);
});
