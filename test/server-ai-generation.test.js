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
const {
  GENERATED_TARGET_VOCABULARY,
} = require('./fixtures/generated-target-vocabulary.js');
const { GENERATED_READING } = require('./fixtures/generated-reading.js');
const { GENERATED_LISTENING } = require('./fixtures/generated-listening.js');
const {
  GENERATED_GRAMMAR_PRESENTATION,
} = require('./fixtures/generated-grammar-presentation.js');
const { GENERATED_GRAMMAR_FOCUS } = require('./fixtures/generated-grammar-focus.js');
const { GENERATED_GUIDED_SPEAKING } = require('./fixtures/generated-guided-speaking.js');

const ROOT = path.join(__dirname, '..');

const WARM_UP = {
  teacherNotes: '- Ask the learner to choose an option and give a reason.\n\n**Say:** “Which journey would you choose?”',
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

const LESSON_METADATA = {
  coverImagePrompt: 'Vivid landscape 16:10 educational illustration of a young traveler choosing between a city bus and a bicycle, polished child-friendly style, one clear focal scene, no visible text, letters, numbers, logos, or watermarks.',
};

const LEAD_IN = {
  teacherNotes: [
    'Read the text together with the learner and invite them to answer the questions.',
    '- Explain that **on the go** means busy or moving from place to place.',
    '- If the answer to question 3 is short, ask: *Why do you think so?*',
    '- After the answers, ask: *Can you guess what our lesson is about?*',
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

const WRAP_UP = {
  teacherNotes: {
    signsOfSuccess: 'The learner recalls travel phrases and uses the Past Simple accurately.',
    struggleSupport: 'Review key phrases and give one Past Simple model sentence.',
    positiveEnding: 'Say: “Well done! You can talk about past travel choices clearly.”',
  },
  threePrompt: 'Name three words or phrases you remember about travel choices.',
  twoPrompt: 'Create two Past Simple sentences about a journey.',
  twoCues: [
    'Say where you travelled and how you got there.',
    'Explain one travel choice you made and why.',
  ],
  onePrompt: 'Can you describe a past journey and explain your best travel choice?',
  possibleLanguage: ['I travelled to…', 'I booked a ticket because…', 'The best option was…'],
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

test('AI draft sequentially streams lesson metadata and nine sections into review', async t => {
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
      assert.match(payload.messages[0].content, /CEFR level: B1/);
      assert.match(payload.messages[0].content, /Age: 9-11/);
      const generated = [
        LESSON_METADATA, WARM_UP, LEAD_IN, GENERATED_TARGET_VOCABULARY, GENERATED_READING, GENERATED_LISTENING,
        GENERATED_GRAMMAR_PRESENTATION, GENERATED_GRAMMAR_FOCUS, GENERATED_GUIDED_SPEAKING,
        WRAP_UP,
      ][requestIndex];
      const usage = [{
          prompt_tokens: 60,
          completion_tokens: 30,
          completion_tokens_details: { reasoning_tokens: 10 },
          cost: 0.005,
        }, {
          prompt_tokens: 220,
          completion_tokens: 140,
          completion_tokens_details: { reasoning_tokens: 60 },
          cost: 0.023456,
        }, {
          prompt_tokens: 120,
          completion_tokens: 80,
          completion_tokens_details: { reasoning_tokens: 30 },
          cost: 0.01,
        }, {
          prompt_tokens: 300,
          completion_tokens: 200,
          completion_tokens_details: { reasoning_tokens: 70 },
          cost: 0.03,
        }, {
          prompt_tokens: 180,
          completion_tokens: 130,
          completion_tokens_details: { reasoning_tokens: 40 },
          cost: 0.04,
        }, {
          prompt_tokens: 160,
          completion_tokens: 110,
          completion_tokens_details: { reasoning_tokens: 35 },
          cost: 0.05,
        }, {
          prompt_tokens: 140,
          completion_tokens: 90,
          completion_tokens_details: { reasoning_tokens: 25 },
          cost: 0.06,
        }, {
          prompt_tokens: 100,
          completion_tokens: 70,
          completion_tokens_details: { reasoning_tokens: 20 },
          cost: 0.07,
        }, {
          prompt_tokens: 80,
          completion_tokens: 60,
          completion_tokens_details: { reasoning_tokens: 15 },
          cost: 0.08,
        }, {
          prompt_tokens: 70,
          completion_tokens: 50,
          completion_tokens_details: { reasoning_tokens: 12 },
          cost: 0.09,
        }][requestIndex];
      if (requestIndex === 0) {
        assert.equal(payload.messages[1].content, 'Lesson topic: Travel choices');
      } else if (requestIndex === 1) {
        assert.equal(payload.messages[1].content, 'Lesson topic: City transport');
      } else if (requestIndex < 4) {
        assert.equal(payload.messages[1].content, 'Lesson topic: Travel choices');
      } else if (requestIndex < 6) {
        assert.match(payload.messages[1].content, /^Lesson topic: Travel choices\nGrammar topic: Past Simple/m);
        assert.match(payload.messages[1].content, /Target Vocabulary: \["book a ticket"/);
      } else if (requestIndex === 6) {
        assert.equal(payload.messages[1].content, 'Lesson topic: Travel choices\nGrammar topic: Past Simple');
      } else if (requestIndex === 7) {
        assert.match(payload.messages[1].content, /^Lesson topic: Travel choices\nGrammar topic: Past Simple/m);
        assert.match(payload.messages[1].content, /Target Vocabulary: \["book a ticket"/);
      } else if (requestIndex === 8) {
        assert.match(payload.messages[1].content, /^Lesson topic: Travel choices/m);
        assert.match(payload.messages[1].content, /Target Vocabulary: \["book a ticket"/);
        assert.doesNotMatch(payload.messages[1].content, /Grammar topic/);
      } else {
        assert.match(payload.messages[1].content, /^Lesson topic: Travel choices\nGrammar topic: Past Simple/m);
        assert.match(payload.messages[1].content, /Target Vocabulary: \["book a ticket"/);
      }
      assert.equal(payload.response_format.json_schema.name, [
        'easyclass_lesson_metadata', 'easyclass_warm_up', 'easyclass_lead_in', 'easyclass_target_vocabulary', 'easyclass_reading',
        'easyclass_listening', 'easyclass_grammar_presentation', 'easyclass_grammar_focus',
        'easyclass_guided_speaking', 'easyclass_wrap_up',
      ][requestIndex]);
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
      topic: 'Travel choices', warmUpTopic: '  City transport  ', grammarTopic: 'Past Simple',
      ageGroup: '9-11', level: 'B1', template: 'template-1', synthetic: false,
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).draft;
  assert.equal(created.status, 'generating');
  assert.equal(created.warmUpTopic, 'City transport');
  assert.equal(created.ageGroup, '9-11');
  assert.equal(created.level, 'B1');
  assert.equal(created.generation.mode, 'ai');
  assert.equal(created.generation.model, 'google/gemini-3.7-flash');
  assert.equal(created.content.stages.length, 9);
  assert.ok(created.content.stages.every(stage => stage.content.length === 0));
  assert.deepEqual(created.content.stages.slice(0, 3).map(stage => stage.subtitle), [
    'This or That?',
    'Explore the Topic',
    'Learn New Words',
  ]);
  assert.ok(created.content.stages.slice(3).every(stage => stage.subtitle === undefined));

  let ready;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, { headers: { Cookie: cookie } });
    ready = (await response.json()).draft;
    if (ready.status !== 'generating') break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.equal(ready.status, 'review');
  assert.equal(openRouterRequestCount, 10);
  assert.equal(ready.generation.status, 'completed');
  assert.ok(Math.abs(ready.generation.costUsd - 0.458456) < 1e-12);
  assert.equal(ready.content.meta.topic, 'Travel choices');
  assert.equal(ready.content.meta.ageGroup, '9-11');
  assert.equal(ready.content.meta.level, 'B1');
  assert.equal(ready.content.meta.title, 'Travel choices');
  assert.equal(ready.content.meta.coverImagePrompt, LESSON_METADATA.coverImagePrompt);
  assert.ok(['pending', 'running', 'unavailable'].includes(ready.imageGeneration.status));
  assert.equal(ready.imageGeneration.total, 23);
  assert.deepEqual(ready.content.stages[0].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'thisOrThat', 'taskPrompt',
  ]);
  assert.deepEqual(ready.content.stages[1].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'illustratedTextPanel', 'textPanel', 'markdownCard',
  ]);
  assert.deepEqual(ready.content.stages[2].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'matchWords', 'markdownCard', 'dropdownChoice',
    'markdownCard', 'fillInBlanks', 'personalizedQuestions', 'markdownCard', 'describeAndGuess',
  ]);
  assert.equal(ready.content.stages[2].content[2].items.length, 10);
  assert.match(ready.content.stages[2].content[0].blocks[0].text, /Используйте эти онлайн-словари/);
  assert.deepEqual(ready.content.stages[3].content.map(component => component.type), [
    'teacherNote', 'textReading', 'multipleChoice', 'multipleChoice', 'markdownCard',
  ]);
  assert.equal(ready.content.stages[3].content[1].title, GENERATED_READING.title);
  assert.equal(ready.content.stages[3].content[3].items.length, 5);
  assert.deepEqual(ready.content.stages[4].content.map(component => component.type), [
    'teacherNote', 'audioPlayer', 'checkboxChoice', 'audioPlayer', 'multipleChoice', 'markdownCard',
  ]);
  assert.equal(ready.content.stages[4].content[1].script, GENERATED_LISTENING.script);
  assert.equal(ready.content.stages[4].content[3].script, GENERATED_LISTENING.script);
  assert.equal(ready.content.stages[4].content[2].items.length, 2);
  assert.equal(ready.content.stages[4].content[4].items.length, 5);
  assert.deepEqual(ready.content.stages[5].content.map(component => component.type), [
    'teacherNote', 'textPanel', 'textPanel', 'dragWordsInText', 'markdownCard',
    'dropdownChoice', 'markdownCard',
  ]);
  assert.equal(ready.content.stages[5].content[5].choices.length, 5);
  assert.deepEqual(ready.content.stages[6].content.map(component => component.type), [
    'teacherNote', 'dropdownChoice', 'markdownCard', 'gapFill', 'markdownCard',
    'miniSituation', 'cardRow',
  ]);
  assert.equal(ready.content.stages[6].content[1].choices.length, 8);
  assert.equal(ready.content.stages[6].content[3].gaps.length, 9);
  assert.deepEqual(ready.content.stages[7].content.map(component => component.type), [
    'teacherNote', 'textPanel', 'howToPlay', 'guidedRoleCards', 'speakingSupport', 'markdownCard',
  ]);
  assert.equal(ready.content.stages[7].content[2].id, 'guided-speaking-how-to-play');
  assert.match(ready.content.stages[7].content[3].roles.teacher.sections.secret, /book a ticket/);
  assert.deepEqual(ready.content.stages[8].content.map(component => component.type), [
    'teacherNote', 'threeTwoOne', 'selfAssessment', 'markdownCard',
  ]);
  assert.match(ready.content.stages[8].content[0].text, /Past Simple accurately/);
  assert.equal(
    ready.content.stages[8].content[2].title,
    'Self-assessment: How do you feel about today’s lesson?',
  );
  assert.equal(ready.content.stages[8].content[3].text, WRAP_UP.possibleLanguage.join(' / '));

  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/generation-stream`)).status, 401);
  const traceResponse = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/generation-stream`, {
    headers: { Cookie: cookie },
  });
  assert.equal(traceResponse.status, 200);
  const trace = await traceResponse.text();
  assert.match(trace, /event: snapshot/);
  assert.match(trace, /=== Lesson Metadata ===/);
  assert.match(trace, /=== Warm-Up ===/);
  assert.match(trace, /=== Lead-In ===/);
  assert.match(trace, /=== Target Vocabulary ===/);
  assert.match(trace, /=== Reading ===/);
  assert.match(trace, /=== Listening ===/);
  assert.match(trace, /=== Grammar Presentation ===/);
  assert.match(trace, /=== Grammar Focus ===/);
  assert.match(trace, /=== Guided Speaking ===/);
  assert.match(trace, /=== Wrap-Up ===/);
  assert.match(trace, /Planning section 1/);
  assert.match(trace, /Planning section 2/);
  assert.match(trace, /Planning section 3/);
  assert.match(trace, /Planning section 4/);
  assert.match(trace, /Planning section 5/);
  assert.match(trace, /Planning section 6/);
  assert.match(trace, /Planning section 7/);
  assert.match(trace, /Planning section 8/);
  assert.match(trace, /Planning section 9/);
  assert.match(trace, /Planning section 10/);
  assert.match(trace, /book a ticket/);
  assert.match(trace, /0\.45845/);
  assert.match(trace, /"promptTokens":1430/);
  assert.match(trace, /"completionTokens":960/);
  assert.match(trace, /"reasoningTokens":317/);
  assert.match(trace, /event: done/);
});

test('retry reuses validated sections and regenerates only an invalid Wrap-Up', async t => {
  let openRouterRequestCount = 0;
  const openRouter = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const payload = JSON.parse(body);
      const requestIndex = openRouterRequestCount;
      openRouterRequestCount += 1;
      if (requestIndex < 9) {
        if (requestIndex === 0) {
          assert.equal(payload.messages[1].content, 'Lesson topic: Travel choices');
        } else if (requestIndex === 1) {
          assert.equal(payload.messages[1].content, 'Lesson topic: Warm-up transport');
        } else if (requestIndex < 4) {
          assert.equal(payload.messages[1].content, 'Lesson topic: Travel choices');
        } else if (requestIndex < 6) {
          assert.match(payload.messages[1].content, /^Lesson topic: Travel choices\nGrammar topic: Past Simple/m);
          assert.match(payload.messages[1].content, /Target Vocabulary/);
        } else if (requestIndex === 6) {
          assert.equal(payload.messages[1].content, 'Lesson topic: Travel choices\nGrammar topic: Past Simple');
        } else if (requestIndex === 7) {
          assert.match(payload.messages[1].content, /^Lesson topic: Travel choices\nGrammar topic: Past Simple/m);
          assert.match(payload.messages[1].content, /Target Vocabulary/);
        } else {
          assert.match(payload.messages[1].content, /^Lesson topic: Travel choices/m);
          assert.match(payload.messages[1].content, /Target Vocabulary/);
          assert.doesNotMatch(payload.messages[1].content, /Grammar topic/);
        }
        assert.equal(payload.response_format.json_schema.name, [
          'easyclass_lesson_metadata', 'easyclass_warm_up', 'easyclass_lead_in', 'easyclass_target_vocabulary', 'easyclass_reading',
          'easyclass_listening', 'easyclass_grammar_presentation', 'easyclass_grammar_focus',
          'easyclass_guided_speaking',
        ][requestIndex]);
        const generated = [
          LESSON_METADATA, WARM_UP, LEAD_IN, GENERATED_TARGET_VOCABULARY, GENERATED_READING, GENERATED_LISTENING,
          GENERATED_GRAMMAR_PRESENTATION, GENERATED_GRAMMAR_FOCUS, GENERATED_GUIDED_SPEAKING,
        ][requestIndex];
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ id: `gen-section-${requestIndex}`, choices: [{ delta: { reasoning: `Section ${requestIndex + 1} complete.` } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: `gen-section-${requestIndex}`, choices: [{ delta: { content: JSON.stringify(generated) } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: `gen-section-${requestIndex}`, choices: [{ delta: {} }], usage: { cost: [0.004, 0.005, 0.006, 0.007, 0.008, 0.009, 0.01, 0.011, 0.012][requestIndex] } })}\n\n`);
        res.end('data: [DONE]\n\n');
        return;
      }
      assert.match(payload.messages[1].content, /^Lesson topic: Travel choices\nGrammar topic: Past Simple/m);
      assert.match(payload.messages[1].content, /Target Vocabulary/);
      assert.equal(payload.response_format.json_schema.name, 'easyclass_wrap_up');
      if (requestIndex === 9) {
        const invalidWrapUp = { ...WRAP_UP, possibleLanguage: ['I travelled to…'] };
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(`data: ${JSON.stringify({ id: 'gen-invalid-wrap-up', choices: [{ delta: { content: JSON.stringify(invalidWrapUp) } }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: 'gen-invalid-wrap-up', choices: [{ delta: {} }], usage: { cost: 0.014 } })}\n\n`);
        res.end('data: [DONE]\n\n');
        return;
      }
      assert.equal(requestIndex, 10);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(`data: ${JSON.stringify({ id: 'gen-wrap-up-retry', choices: [{ delta: { content: JSON.stringify(WRAP_UP) } }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: 'gen-wrap-up-retry', choices: [{ delta: {} }], usage: { cost: 0.013 } })}\n\n`);
      res.end('data: [DONE]\n\n');
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
      topic: 'Travel choices', warmUpTopic: 'Warm-up transport', grammarTopic: 'Past Simple', template: 'template-1', synthetic: false,
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
  assert.equal(openRouterRequestCount, 10);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.generation.status, 'failed');
  assert.ok(Math.abs(failed.generation.costUsd - 0.086) < 1e-12);
  assert.match(failed.errorMessage, /Possible language/);
  assert.ok(failed.content.stages.every(stage => stage.content.length === 0));
  assert.equal(failed.imageGeneration, null);

  const traceResponse = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/generation-stream`, {
    headers: { Cookie: cookie },
  });
  assert.equal(traceResponse.status, 200);
  const trace = await traceResponse.text();
  assert.match(trace, /=== Lesson Metadata ===/);
  assert.match(trace, /=== Warm-Up ===/);
  assert.match(trace, /=== Lead-In ===/);
  assert.match(trace, /=== Target Vocabulary ===/);
  assert.match(trace, /=== Reading ===/);
  assert.match(trace, /=== Listening ===/);
  assert.match(trace, /=== Grammar Presentation ===/);
  assert.match(trace, /=== Grammar Focus ===/);
  assert.match(trace, /=== Guided Speaking ===/);
  assert.match(trace, /=== Wrap-Up ===/);
  assert.match(trace, /I travelled to/);
  assert.match(trace, /Possible language/);
  assert.match(trace, /event: generation-error/);

  const retryResponse = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/retry`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(retryResponse.status, 202);
  assert.equal((await retryResponse.json()).draft.status, 'generating');

  let recovered;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, { headers: { Cookie: cookie } });
    recovered = (await response.json()).draft;
    if (recovered.status !== 'generating') break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.equal(openRouterRequestCount, 11);
  assert.equal(recovered.status, 'review');
  assert.equal(recovered.generation.status, 'completed');
  assert.ok(Math.abs(recovered.generation.costUsd - 0.099) < 1e-12);
  assert.deepEqual(recovered.content.stages[8].content.map(component => component.type), [
    'teacherNote', 'threeTwoOne', 'selfAssessment', 'markdownCard',
  ]);
});
