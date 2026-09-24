'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { hashPassword } = require('../lib/password.js');
const { createUser } = require('../lib/user-store.js');

const ROOT = path.join(__dirname, '..');

async function waitForServer(url, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode != null) throw new Error(`Server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) return;
    } catch (_error) {
      // Server is still starting.
    }
    await new Promise(resolve => setTimeout(resolve, 50));
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

test('template two creation and editing update the answer key atomically', async t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'teach-platform-drafts-'));
  const databasePath = path.join(temporaryDirectory, 'app.sqlite');
  const database = openDatabase(databasePath);
  const password = 'correct-password';
  const passwordHash = await hashPassword(password);
  const firstAdmin = createUser({
    email: 'admin-one@example.com', displayName: 'Admin One', passwordHash, role: 'admin',
  }, database);
  createUser({
    email: 'admin-two@example.com', displayName: 'Admin Two', passwordHash, role: 'admin',
  }, database);
  createUser({
    email: 'teacher@example.com', displayName: 'Teacher', passwordHash,
  }, database);
  database.close();

  const port = 21000 + Math.floor(Math.random() * 10000);
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
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  t.after(() => {
    child.kill('SIGTERM');
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });
  await waitForServer(baseUrl, child);


  const cookie = await login(baseUrl, 'admin-one@example.com', password);
  const otherCookie = await login(baseUrl, 'admin-two@example.com', password);
  const params = { topic: 'Superheroes', grammarTopic: 'Adjectives', template: 'template-2',
    ageGroup: '12-14', level: 'A2', model: 'google/gemini-3.7-flash', synthetic: true };
  const create = body => fetch(`${baseUrl}/api/lesson-drafts`, {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await create({ ...params, synthetic: false })).status, 400);
  const response = await create(params);
  assert.equal(response.status, 201);
  const draft = (await response.json()).draft;
  assert.equal(draft.template, 'template-2');
  assert.equal(draft.imageGeneration.total, 0);
  assert.ok(draft.content.stages.slice(5).every(s => s.content === null));
  assert.equal(draft.content.stages[3].id, 'watch-and-interact');
  assert.equal(draft.content.stages[3].number, 4);
  const [watchNote, prediction, video, discussion] = draft.content.stages[3].content;
  assert.equal(watchNote.type, 'teacherNote');
  assert.equal(prediction.mode, 'guess');
  assert.equal(video.type, 'videoPlayer');
  for (const [component, route, changes] of [
    [prediction, 'multiple-choice', { title: 'Updated prediction', instruction: prediction.instruction,
      items: [{ ...prediction.items[0], options: ['A superhero', 'A lizard', 'A teenager'] }] }],
    [discussion, 'markdown-cards', { title: discussion.title,
      sections: discussion.sections.map(section => ({ ...section, text: section.text + ' More.' })) }],
  ]) {
    const edited = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/${route}/${component.id}`, {
      method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
    });
    assert.equal(edited.status, 200);
    const saved = (await edited.json()).draft.content.stages[3].content.find(item => item.id === component.id);
    assert.deepEqual(saved, { ...component, ...changes });
  }
  const grammar = draft.content.stages.find(stage => stage.id === 'grammar-presentation').content;
  const grammarTask = grammar[5];
  const grammarPatch = body => fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/checkbox-choice/${grammarTask.id}`, {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const grammarChanges = { title: grammarTask.title, instruction: grammarTask.instruction, items: structuredClone(grammarTask.items) };
  grammarChanges.items[0].options.reverse();
  const grammarSavedResponse = await grammarPatch(grammarChanges);
  assert.equal(grammarSavedResponse.status, 200);
  const grammarSaved = (await grammarSavedResponse.json()).draft.content.stages[4].content;
  assert.equal(grammarSaved[6].sections[1].text, 'Correct sentences: 3, 5, 6, 8.');
  assert.match(grammarSaved[6].sections[2].text, /^1\. After “got used to”/);
  assert.deepEqual(grammarSaved[6].sections[0], grammar[6].sections[0]);
  for (const mutate of [
    item => { item.answers.pop(); },
    item => { item.options.splice(item.options.indexOf('They got used to wake up early.'), 1); },
  ]) {
    const invalid = structuredClone(grammarChanges);
    mutate(invalid.items[0]);
    assert.equal((await grammarPatch(invalid)).status, 400);
  }
  const grammarKeyPatch = sections => fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/markdown-cards/${grammar[6].id}`, {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: grammar[6].title, sections }),
  });
  const sections = structuredClone(grammarSaved[6].sections);
  sections[1].text = 'Incorrect key';
  assert.equal((await grammarKeyPatch(sections)).status, 409);
  sections[1].text = grammarSaved[6].sections[1].text;
  sections[2].text = 'Custom teacher explanations.';
  assert.equal((await grammarKeyPatch(sections)).status, 200);
  const titleOnly = await grammarPatch({ ...grammarChanges, title: 'Check the sentences' });
  assert.equal(titleOnly.status, 200);
  const titleOnlyContent = (await titleOnly.json()).draft.content.stages[4].content;
  assert.equal(titleOnlyContent[6].sections[2].text, 'Custom teacher explanations.');
  assert.deepEqual(titleOnlyContent[5].items, grammarSaved[5].items);
  const vocabulary = draft.content.stages[2].content;
  assert.deepEqual(vocabulary.map(c => c.type), ['teacherNote', 'markdownCard', 'storyCards', 'multipleChoice', 'dropdownChoice', 'dragWordsInText', 'gapFill', 'personalizedQuestions', 'markdownCard']);
  const meanings = vocabulary[3];
  const context = vocabulary[4];
  assert.equal(meanings.variant, 'compact');
  assert.equal(meanings.items.length, 10);
  assert.ok(meanings.items.every(item => item.options.length === 2 && item.options.includes(item.answer)));
  assert.equal(meanings.items.filter(item => item.options[0] === item.answer).length, 5);
  assert.equal(context.choices.length, 8);
  const { normalizeDropdownChoice } = require('../assets/components/dropdown-choice.js');
  assert.deepEqual(normalizeDropdownChoice(context), context);
  assert.match(vocabulary[0].blocks[1].text, /Task 3/);
  assert.match(vocabulary[0].blocks[1].text, /Task 4/);
  assert.match(vocabulary[0].blocks[1].text, /Task 5/);
  assert.equal(vocabulary[5].words.length, 6);
  assert.equal(vocabulary[6].gaps.length, 10);
  assert.equal(vocabulary[6].studentVisibility, 'controlled');
  assert.equal(vocabulary[7].items.length, 4);
  assert.equal(vocabulary[8].studentVisibility, 'always');
  for (const [component, route, changes] of [
    [meanings, 'multiple-choice', { title: 'Updated meanings', instruction: meanings.instruction, items: meanings.items }],
    [context, 'dropdown-choice', { title: 'Updated context', instruction: context.instruction, text: context.text, choices: context.choices, accentColor: context.accentColor }],
    [vocabulary[5], 'drag-words-in-text', { title: 'Updated drag words', instruction: vocabulary[5].instruction, words: vocabulary[5].words, text: vocabulary[5].text }],
    [vocabulary[6], 'gap-fill', { title: 'Updated extra task', instruction: vocabulary[6].instruction, text: vocabulary[6].text, gaps: vocabulary[6].gaps }],
    [vocabulary[7], 'personalized-questions', { title: 'Updated questions', instruction: vocabulary[7].instruction, items: vocabulary[7].items }],
  ]) {
    const edited = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/${route}/${component.id}`, {
      method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(changes),
    });
    assert.equal(edited.status, 200);
    const savedComponent = (await edited.json()).draft.content.stages[2].content.find(c => c.id === component.id);
    assert.deepEqual(savedComponent, { ...component, ...changes });
  }
  const stories = draft.content.stages[2].content[2];
  assert.equal(stories.type, 'storyCards');
  assert.equal(stories.items.length, 4);
  const storyPatch = (body, auth = cookie) => fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/story-cards/${stories.id}`, {
    method: 'PATCH', headers: { Cookie: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const storyChanges = { title: 'Read our heroes’ stories.', items: structuredClone(stories.items) };
  storyChanges.items[0].text = 'I have **curly hair**.';
  storyChanges.items[0].backgroundColor = '#FFEEDD';
  assert.equal((await storyPatch(storyChanges, otherCookie)).status, 404);
  const storyResponse = await storyPatch(storyChanges);
  assert.equal(storyResponse.status, 200);
  const storySaved = (await storyResponse.json()).draft.content.stages[2].content[2];
  assert.equal(storySaved.title, storyChanges.title);
  assert.deepEqual(storySaved.items, storyChanges.items);
  assert.equal((await storyPatch({ ...storyChanges, items: [] })).status, 400);
  const storyRead = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}`, { headers: { Cookie: cookie } });
  assert.deepEqual((await storyRead.json()).draft.content.stages[2].content[2], storySaved);
  const exercise = draft.content.stages[0].content[1];
  const endpoint = `${baseUrl}/api/lesson-drafts/${draft.id}/odd-one-out/${exercise.id}`;
  const patch = (body, auth = cookie) => fetch(endpoint, {
    method: 'PATCH', headers: { Cookie: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const changes = { title: exercise.title, instruction: exercise.instruction, items: exercise.items };
  assert.equal((await patch(changes, otherCookie)).status, 404);
  changes.items[0].options[3] = 'powerful';
  changes.items[0].answer = 'powerful';
  const savedResponse = await patch(changes);
  assert.equal(savedResponse.status, 200);
  const saved = (await savedResponse.json()).draft.content.stages[0].content;
  assert.equal(saved[1].items[0].answer, 'powerful');
  assert.match(saved[2].text, /\*\*powerful\*\*/);
  assert.equal(saved[2].studentVisibility, 'teacherOnly');
  const keyEdit = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/markdown-cards/${saved[2].id}`, {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Wrong key', text: 'Wrong answer' }),
  });
  assert.equal(keyEdit.status, 409);
  const invalid = structuredClone(changes);
  invalid.items[0].answer = 'missing';
  assert.equal((await patch(invalid)).status, 400);
  const read = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}`, { headers: { Cookie: cookie } });
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).draft.content.stages[0].content, saved);
  const fact = draft.content.stages[1].content[1];
  const factEndpoint = `${baseUrl}/api/lesson-drafts/${draft.id}/fact-or-myth/${fact.id}`;
  const factChanges = { title: fact.title, instruction: fact.instruction, items: structuredClone(fact.items) };
  const saveFact = (body, auth = cookie) => fetch(factEndpoint, { method: 'PATCH',
    headers: { Cookie: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await saveFact(factChanges, otherCookie)).status, 404);
  factChanges.items[0].text = 'Batman has got a pink cape.';
  factChanges.items[0].answer = 'myth';
  factChanges.items[0].explanation = 'He has got a black cape.';
  const factResponse = await saveFact(factChanges);
  assert.equal(factResponse.status, 200);
  const factSaved = (await factResponse.json()).draft.content.stages[1].content;
  assert.match(factSaved[3].text, /1\. \*\*MYTH\*\* — He has got a black cape/);
  assert.match(factSaved[3].text, /GUESS/);
  const factKeyEdit = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/markdown-cards/${factSaved[3].id}`, {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Wrong key', text: 'Wrong answer' }),
  });
  assert.equal(factKeyEdit.status, 409);
  factChanges.items[3].answer = 'fact';
  assert.equal((await saveFact(factChanges)).status, 400);
  const factRead = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}`, { headers: { Cookie: cookie } });
  assert.deepEqual((await factRead.json()).draft.content.stages[1].content, factSaved);

});
