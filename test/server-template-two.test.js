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
  // Exercise the reusable component on an explicit fixture, independently of template 2.
  const builder = require('../lib/sentence-builder-example.js').createSentenceBuilderExample();
  const builderContent = structuredClone(draft.content);
  builderContent.stages[7].content.splice(1, 0, builder);
  const fixtureDb = openDatabase(databasePath);
  fixtureDb.prepare('UPDATE lesson_drafts SET content_json = ? WHERE id = ?').run(JSON.stringify(builderContent), draft.id);
  fixtureDb.close();
  const builderChanges = { title: 'Build with the cat', instruction: builder.instruction,
    hintsEnabled: false, completionText: 'Well done!', items: [builder.items[2], builder.items[0]] };
  const builderPatch = (body, auth = cookie) => fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/sentence-builder/${builder.id}`, {
    method: 'PATCH', headers: { Cookie: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await builderPatch(builderChanges, otherCookie)).status, 404);
  assert.equal((await builderPatch({ ...builderChanges, items: [] })).status, 400);
  assert.equal((await builderPatch({ ...builderChanges, injected: true })).status, 400);
  const builderSaved = await builderPatch(builderChanges);
  assert.equal(builderSaved.status, 200);
  assert.deepEqual((await builderSaved.json()).draft.content.stages[7].content[1], { ...builder, ...builderChanges });
  assert.equal((await builderPatch({ ...builderChanges, hintsEnabled: 'yes' })).status, 400);
  const builderReloaded = await (await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}`, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(builderReloaded.draft.content.stages[7].content[1], { ...builder, ...builderChanges });
  const communication = draft.content.stages[6].content[2];
  const communicationPatch = (items, auth = cookie) => fetch(
    `${baseUrl}/api/lesson-drafts/${draft.id}/guided-communication-cards/${communication.id}`,
    { method: 'PATCH', headers: { Cookie: auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
  assert.equal((await communicationPatch(communication.items, otherCookie)).status, 404);
  assert.equal((await communicationPatch(communication.items.slice(1))).status, 400);
  const communicationItems = structuredClone(communication.items);
  communicationItems[0].task.questions[0] = 'What is your **hero** called?';
  const communicationSaved = await communicationPatch(communicationItems);
  assert.equal(communicationSaved.status, 200);
  assert.deepEqual((await communicationSaved.json()).draft.content.stages[6].content[2].items, communicationItems);

  assert.deepEqual(draft.content.stages[5].content.map(component => component.type),
    ['teacherNote', 'dropdownChoice', 'markdownCard', 'gapFill', 'markdownCard', 'sentenceCorrection', 'markdownCard', 'sentenceMatching',
      'gapFill', 'markdownCard', 'cardRow']);
  const [extraTask, extraKey, supportRow] = draft.content.stages[5].content.slice(-3);
  assert.equal(extraTask.studentVisibility, 'controlled');
  assert.equal(extraTask.gaps.length, 10);
  assert.equal(extraTask.fieldSize, 'wide');
  assert.equal(extraKey.studentVisibility, 'teacherOnly');
  assert.deepEqual(supportRow.items.map(item => item.title), ['Writing Support', 'Support', 'Challenge']);
  const correction = draft.content.stages[5].content[5];
  const correctionChanges = { title: correction.title, instruction: correction.instruction, items: structuredClone(correction.items) };
  correctionChanges.items[0].answers = ['Leo used to play games.', 'Leo used to play video games.'];
  const correctionPatch = (body, auth = cookie, componentId = correction.id) => fetch(
    `${baseUrl}/api/lesson-drafts/${draft.id}/sentence-correction/${componentId}`,
    { method: 'PATCH', headers: { Cookie: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await correctionPatch(correctionChanges, otherCookie)).status, 404);
  assert.equal((await correctionPatch(correctionChanges, cookie, 'missing')).status, 404);
  assert.equal((await correctionPatch({ ...correctionChanges, items: [] })).status, 400);
  assert.equal((await correctionPatch({ ...correctionChanges, items: correctionChanges.items.map((item, i) => i ? item : { ...item, id: 'new-id' }) })).status, 400);
  const correctionResponse = await correctionPatch(correctionChanges);
  assert.equal(correctionResponse.status, 200);
  const savedCorrectionDraft = (await correctionResponse.json()).draft;
  const savedCorrection = savedCorrectionDraft.content.stages[5].content[5];
  const savedCorrectionKey = savedCorrectionDraft.content.stages[5].content[6];
  assert.deepEqual(savedCorrection.items, correctionChanges.items);
  assert.equal(savedCorrectionKey.title, 'Answer key');
  assert.equal(savedCorrectionKey.studentVisibility, 'teacherOnly');
  assert.match(savedCorrectionKey.sections[0].text, /Leo used to play games\. \/ Leo used to play video games\./);
  const keyPatch = await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/markdown-cards/${savedCorrectionKey.id}`, {
    method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Wrong', sections: savedCorrectionKey.sections }),
  });
  assert.equal(keyPatch.status, 409);
  const failedCorrection = structuredClone(correctionChanges);
  failedCorrection.items[0].answers = [];
  assert.equal((await correctionPatch(failedCorrection)).status, 400);
  const reloadedCorrection = await (await fetch(`${baseUrl}/api/lesson-drafts/${draft.id}`, { headers: { Cookie: cookie } })).json();
  assert.deepEqual(reloadedCorrection.draft.content.stages[5].content.slice(5), savedCorrectionDraft.content.stages[5].content.slice(5));
  const matching = draft.content.stages[5].content.find(item => item.type === 'sentenceMatching');
  const matchingChanges = { title: matching.title, instruction: matching.instruction, items: structuredClone(matching.items) };
  matchingChanges.items[0].right = 'play board games every evening.';
  const matchingPatch = (body, auth = cookie) => fetch(`${baseUrl}/api/lesson-drafts/${draft.id}/sentence-matching/${matching.id}`, {
    method: 'PATCH', headers: { Cookie: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  assert.equal((await matchingPatch(matchingChanges, otherCookie)).status, 404);
  assert.equal((await matchingPatch({ ...matchingChanges, items: [] })).status, 400);
  assert.equal((await matchingPatch({ ...matchingChanges, items: [...matchingChanges.items].reverse() })).status, 400);
  const matchingResponse = await matchingPatch(matchingChanges);
  assert.equal(matchingResponse.status, 200);
  const matchingContent = (await matchingResponse.json()).draft.content.stages[5].content;
  assert.deepEqual(matchingContent.find(item => item.id === matching.id).items, matchingChanges.items);
  assert.equal(matchingContent.some(item => item.id === `${matching.id}-answer-key`), false);
  assert.deepEqual(draft.content.stages[7].content,
    require('../lib/synthetic-lesson.js').createSyntheticLesson('Demo').stages.find(stage => stage.id === 'wrap-up').content);
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
