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

test('lesson draft pages and APIs are admin-only and owner-isolated', async t => {
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

  const guestPage = await fetch(`${baseUrl}/lesson-drafts`, { redirect: 'manual' });
  assert.equal(guestPage.status, 302);
  assert.equal(guestPage.headers.get('location'), '/login?next=%2Flesson-drafts');
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts`)).status, 401);

  const teacherCookie = await login(baseUrl, 'teacher@example.com', password);
  assert.equal((await fetch(`${baseUrl}/lesson-drafts`, {
    headers: { Cookie: teacherCookie },
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts`, {
    headers: { Cookie: teacherCookie },
  })).status, 403);

  const firstAdminCookie = await login(baseUrl, 'admin-one@example.com', password);
  const adminPage = await fetch(`${baseUrl}/lesson-drafts`, {
    headers: { Cookie: firstAdminCookie },
  });
  assert.equal(adminPage.status, 200);
  assert.match(await adminPage.text(), /Черновики уроков/);

  for (const body of [
    { topic: '   ', template: 'template-1' },
    { topic: 'Topic', template: 'template-unknown' },
    { topic: 'x'.repeat(121), template: 'template-1' },
  ]) {
    const invalid = await fetch(`${baseUrl}/api/lesson-drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
      body: JSON.stringify(body),
    });
    assert.equal(invalid.status, 400);
  }

  const createdResponse = await fetch(`${baseUrl}/api/lesson-drafts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      topic: '  Travel English  ',
      template: 'template-1',
      ownerAdminId: 'attempted-owner-override',
    }),
  });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).draft;
  assert.equal(created.ownerAdminId, firstAdmin.id);
  assert.equal(created.topic, 'Travel English');
  assert.equal(created.status, 'review');
  assert.equal(created.content.schemaVersion, 'lesson-draft-v1');
  assert.equal(created.content.meta.topic, 'Travel English');
  assert.equal(created.content.meta.durationMinutes, 50);
  assert.equal(created.content.stages.length, 9);
  assert.deepEqual(created.content.stages.map(stage => stage.number), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(created.content.stages[0].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'thisOrThat', 'taskPrompt',
  ]);
  assert.equal(created.content.stages[0].content[0].id, 'warm-up-teacher-note');
  assert.deepEqual(created.content.stages[0].content.filter(component => component.type === 'taskPrompt').map(component => component.variant), ['followUp']);
  assert.deepEqual(created.content.stages[1].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'illustratedTextPanel', 'textPanel', 'markdownCard',
  ]);
  assert.deepEqual(created.content.stages[2].content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'matchWords', 'markdownCard', 'dropdownChoice', 'markdownCard', 'fillInBlanks',
    'personalizedQuestions', 'markdownCard', 'describeAndGuess',
  ]);
  assert.equal(created.content.stages[2].subtitle, 'Summer + Gaming Words');
  assert.equal(created.content.stages[2].content[0].blocks.length, 3);
  assert.deepEqual(created.content.stages[2].content[3], {
    type: 'markdownCard',
    id: 'target-vocabulary-extra-explanation-card',
    title: '1. Words That Need Extra Explanation',
    text: '- **go offline / go AFK** — explain that AFK = “away from keyboard”.\n- **level up** — usually used in games; means “reach the next level” and become stronger or better.\n- **get stuck** — explain with examples: in a game (can’t move forward) or in real life (have a problem).\n- **beat a game / a boss** — clarify: “beat a boss” = win against a very strong enemy.\n- **spend time outdoors** — “outdoors” = outside, in nature or outside the house.',
    icon: 'book',
    accentColor: '#6545F5',
    studentVisibility: 'teacherOnly',
  });
  const targetVocabularyDropdown = created.content.stages[2].content[4];
  assert.equal(targetVocabularyDropdown.id, 'target-vocabulary-context-dropdown');
  assert.equal(targetVocabularyDropdown.segments, undefined);
  assert.equal(targetVocabularyDropdown.choices.length, 8);
  assert.match(targetVocabularyDropdown.text, /\[\[hang-out-context\]\]/);
  assert.deepEqual(created.content.stages[2].content[5], {
    type: 'markdownCard',
    id: 'target-vocabulary-context-answer-key',
    title: 'Answer Key',
    text: '1. **to hang out (with friends)**\n2. **to go offline / go AFK**\n3. **to beat a game / a boss**\n4. **to level up**\n5. **to get stuck**\n6. **to spend time outdoors**\n7. **to try something new**\n8. **to stay up late**',
    icon: 'check',
    accentColor: '#20A85B',
    studentVisibility: 'teacherOnly',
  });
  assert.deepEqual(created.content.stages[2].content[6].items.map(item => item.answer), [
    'chill out', 'spend time outdoors', 'get stuck', 'hangs out', 'beat', 'go offline',
  ]);
  assert.equal(created.content.stages[2].content[7].id, 'target-vocabulary-personalized-questions');
  assert.equal(created.content.stages[2].content[7].items.length, 4);
  assert.deepEqual(created.content.stages[2].content[8], {
    type: 'markdownCard',
    id: 'target-vocabulary-sentence-starters-card',
    title: 'Support: Sentence Starters',
    text: 'Use these starters if you need help answering.\n\n- **I usually like to ...**\n- **One time I ...**\n- **I feel ... when ...**',
    icon: 'chat',
    accentColor: '#20A85B',
    studentVisibility: 'always',
  });
  assert.deepEqual(created.content.stages[3].content.map(component => component.type), [
    'teacherNote', 'textReading', 'multipleChoice', 'multipleChoice', 'markdownCard',
  ]);
  assert.equal(created.content.stages[3].content[2].id, 'reading-gist-quiz');
  assert.equal(created.content.stages[3].content[3].items.length, 5);
  assert.equal(created.content.stages[3].content[3].items[4].explanation, undefined);
  assert.equal(created.content.stages[3].content[4].id, 'reading-answer-key');
  assert.equal(created.content.stages[3].subtitle, 'Read the text');
  assert.equal(created.content.stages[3].content[0].id, 'reading-teacher-note');
  assert.equal(created.content.stages[3].content[1].title, 'My Exchange Week Surprise');
  assert.equal(created.content.stages[3].content[1].subtitle, 'by ClaryNomad16 · Posted Aug 20');
  assert.ok(created.content.stages[3].content[1].headerImage.imagePrompt);
  assert.ok(created.content.stages[3].content[1].textImage.imagePrompt);
  assert.equal(created.content.stages[3].content[1].headerImage.imageSrc, undefined);
  assert.equal(created.content.stages[3].content[1].textImage.imageSrc, undefined);
  assert.deepEqual(created.content.stages[4].content.map(component => component.type), [
    'teacherNote', 'audioPlayer', 'checkboxChoice', 'audioPlayer', 'multipleChoice', 'markdownCard',
  ]);
  assert.equal(created.content.stages[4].content[0].id, 'listening-teacher-note');
  assert.equal(created.content.stages[4].content[1].id, 'listening-audio');
  assert.equal(created.content.stages[4].content[1].title, 'Listen to the audio');
  assert.equal(created.content.stages[4].content[1].audioSrc, undefined);
  assert.equal(created.content.stages[4].content[2].id, 'listening-gist-quiz');
  assert.equal(created.content.stages[4].content[3].id, 'listening-audio-again');
  assert.equal(created.content.stages[4].content[3].title, 'Listen to the audio one more time');
  assert.equal(created.content.stages[4].content[3].script, created.content.stages[4].content[1].script);
  assert.equal(created.content.stages[4].content[4].id, 'listening-detail-quiz');
  assert.equal(created.content.stages[4].content[5].id, 'listening-answer-key');
  assert.equal(created.content.stages[4].subtitle, 'Listen to the audio');
  assert.equal(created.content.stages[5].id, 'grammar-presentation');
  assert.equal(created.content.stages[5].subtitle, 'Complete the Rule');
  assert.deepEqual(created.content.stages[5].content.map(component => component.id), [
    'grammar-presentation-teacher-note',
    'grammar-presentation-notice-rule',
    'grammar-presentation-concept-checking',
    'grammar-presentation-complete-the-rule',
    'grammar-presentation-quick-rule',
    'grammar-presentation-check-the-rule',
    'grammar-presentation-answer-key',
  ]);
  assert.equal(created.content.stages[5].content[1].showBorder, false);
  assert.equal(created.content.stages[5].content[2].accentColor, '#20A85B');
  assert.deepEqual(created.content.stages[5].content[4], {
    type: 'markdownCard',
    id: 'grammar-presentation-quick-rule',
    title: 'Quick Rule',
    layout: 'columns',
    sections: [{
      id: 'used-to',
      title: 'USED TO',
      text: '- **past habit** / state that is different now\n- **form:** subject + used to + base verb\n- **negative:** didn’t use to + base verb\n- **question:** Did you use to ...?\n- **example:** “I used to finish school at 2:30.”',
    }, {
      id: 'get-used-to',
      title: 'GET USED TO',
      text: '- become comfortable with something new\n- **form:** get / got / am getting used to + noun / verb-ing\n- **after “to”:** use a noun or -ing, not a base verb\n- **example:** “I got used to the workload after a few weeks.”',
    }],
    icon: 'bulb',
    accentColor: '#6545F5',
    studentVisibility: 'always',
  });
  assert.deepEqual(created.content.stages[5].content[5].choices.map(choice => choice.answer), [
    'used to', 'get used to', 'getting used to', 'used to', 'get used to',
  ]);
  assert.equal(created.content.stages[5].content[6].icon, 'check');
  assert.equal(created.content.stages[5].content[6].headingSize, 'large');
  assert.equal(created.content.stages[5].content[6].sections[1].headingSize, undefined);
  assert.equal(created.content.stages[6].id, 'grammar-focus');
  assert.deepEqual(created.content.stages[6].content.map(component => component.id), [
    'grammar-focus-teacher-note',
    'grammar-focus-choose-the-correct-options',
    'grammar-focus-answer-key',
    'grammar-focus-complete-the-gaps',
    'grammar-focus-complete-the-gaps-answer-key',
  ]);
  assert.deepEqual(created.content.stages[6].content[0].blocks.map(block => block.id), [
    'grammar-focus-transition-phrases',
    'grammar-focus-struggle-tips',
    'grammar-focus-correction-timing',
    'grammar-focus-free-practice-success',
  ]);
  assert.equal(created.content.stages[6].content[1].choices.length, 8);
  assert.equal(created.content.stages[6].content[1].accentColor, '#6545F5');
  assert.match(created.content.stages[6].content[1].title, /^\*\*Task 1/);
  assert.deepEqual(created.content.stages[6].content[1].choices.map(choice => choice.answer), [
    'used to', 'get used to', 'got used to', 'am getting used to',
    'use to', 'use to', 'get used to', 'used to',
  ]);
  assert.equal(created.content.stages[6].content[2].title, 'Answer Key & Explanations');
  assert.deepEqual(created.content.stages[6].content[2].sections.map(section => section.id), [
    'answers', 'short-explanations',
  ]);
  assert.equal(created.content.stages[6].content[2].studentVisibility, 'teacherOnly');
  assert.equal(created.content.stages[6].content[3].gaps.length, 9);
  assert.equal(created.content.stages[6].content[3].accentColor, '#6545F5');
  assert.match(created.content.stages[6].content[3].title, /^\*\*Task 2/);
  assert.equal(created.content.stages[6].content[4].title, 'Answer key');
  assert.deepEqual(created.content.stages[6].content[4].sections.map(section => section.id), [
    'answers-left', 'answers-right',
  ]);
  assert.ok(created.content.stages.slice(7).every(stage => stage.content === null));

  const editorPage = await fetch(`${baseUrl}/lesson-drafts/${created.id}/edit`, {
    headers: { Cookie: firstAdminCookie },
  });
  assert.equal(editorPage.status, 200);
  assert.match(await editorPage.text(), /id="lesson-stages"/);

  const fillInBlanksEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/fill-in-blanks/target-vocabulary-fill-in-blanks`;
  assert.equal((await fetch(fillInBlanksEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [] }),
  })).status, 401);
  const fillInBlanksUpdate = await fetch(fillInBlanksEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ items: [{
      id: 'fill-item-added', before: 'We can', answer: 'chill out', after: 'after class.',
    }] }),
  });
  assert.equal(fillInBlanksUpdate.status, 200);
  const savedFillInBlanks = (await fillInBlanksUpdate.json()).draft.content.stages[2].content[6];
  assert.equal(savedFillInBlanks.title, 'Task 3 · Fill in the Blanks');
  assert.deepEqual(savedFillInBlanks.items, [{
    id: 'fill-item-added', before: 'We can', answer: 'chill out', after: 'after class.',
  }]);

  const dragWordsEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}`
    + '/drag-words-in-text/grammar-presentation-complete-the-rule';
  assert.equal((await fetch(dragWordsEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guest', instruction: 'Guest', words: ['a', 'b'], text: 'A [[a]].' }),
  })).status, 401);
  const dragWordsUpdate = await fetch(dragWordsEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: ' Updated rule ',
      instruction: '  Place the words. ',
      words: ['past', 'now', 'future'],
      text: 'It was true in the [[past]], not [[now]].',
    }),
  });
  assert.equal(dragWordsUpdate.status, 200);
  const savedDragWords = (await dragWordsUpdate.json()).draft.content.stages[5].content[3];
  assert.deepEqual(savedDragWords, {
    type: 'dragWordsInText',
    id: 'grammar-presentation-complete-the-rule',
    title: 'Updated rule',
    instruction: 'Place the words.',
    words: ['past', 'now', 'future'],
    text: 'It was true in the [[past]], not [[now]].',
  });
  assert.equal((await fetch(dragWordsEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Broken', instruction: 'Broken', words: ['only'], text: 'No gap.' }),
  })).status, 400);

  const dropdownChoiceEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}`
    + '/dropdown-choice/grammar-presentation-check-the-rule';
  assert.equal((await fetch(dropdownChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guest', instruction: 'Guest', text: '[[one]]', choices: [] }),
  })).status, 401);
  const dropdownChoiceUpdate = await fetch(dropdownChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: ' **Updated dropdown** ',
      instruction: ' Choose one. ',
      text: '**1.** One [[first-choice]].\n**2.** Two [[second-choice]].',
      choices: [{ id: 'first-choice', options: ['used to', 'get used to'], answer: 'used to' },
        { id: 'second-choice', options: ['used to', 'get used to'], answer: 'used to' }],
    }),
  });
  assert.equal(dropdownChoiceUpdate.status, 200);
  const savedDropdownChoice = (await dropdownChoiceUpdate.json()).draft.content.stages[5].content[5];
  assert.equal(savedDropdownChoice.title, '**Updated dropdown**');
  assert.match(savedDropdownChoice.text, /^\*\*1\.\*\* One/);
  assert.equal(savedDropdownChoice.accentColor, '#17182D');
  assert.deepEqual(savedDropdownChoice.choices.map(choice => choice.answer), ['used to', 'used to']);

  const grammarFocusDropdown = created.content.stages[6].content[1];
  const grammarFocusDropdownEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}`
    + '/dropdown-choice/grammar-focus-choose-the-correct-options';
  const grammarFocusDropdownUpdate = await fetch(grammarFocusDropdownEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: '**Task 1. Updated title.**',
      instruction: grammarFocusDropdown.instruction,
      text: grammarFocusDropdown.text,
      choices: grammarFocusDropdown.choices,
    }),
  });
  assert.equal(grammarFocusDropdownUpdate.status, 200);
  const savedGrammarFocusDropdown = (await grammarFocusDropdownUpdate.json()).draft.content.stages[6].content[1];
  assert.equal(savedGrammarFocusDropdown.title, '**Task 1. Updated title.**');
  assert.equal(savedGrammarFocusDropdown.accentColor, '#6545F5');

  const grammarFocusGapFill = created.content.stages[6].content[3];
  const grammarFocusGapFillEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}`
    + '/gap-fill/grammar-focus-complete-the-gaps';
  const grammarFocusGapFillUpdate = await fetch(grammarFocusGapFillEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: '**Task 2. Updated title.**',
      instruction: grammarFocusGapFill.instruction,
      text: grammarFocusGapFill.text,
      gaps: grammarFocusGapFill.gaps,
    }),
  });
  assert.equal(grammarFocusGapFillUpdate.status, 200);
  const savedGrammarFocusGapFill = (await grammarFocusGapFillUpdate.json()).draft.content.stages[6].content[3];
  assert.equal(savedGrammarFocusGapFill.title, '**Task 2. Updated title.**');
  assert.equal(savedGrammarFocusGapFill.accentColor, '#6545F5');
  assert.equal(savedGrammarFocusGapFill.gaps.length, 9);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/gap-fill/missing-gap`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: 'Missing', instruction: 'Missing', text: '[[missing]]',
      gaps: [{ id: 'missing', answer: 'one' }],
    }),
  })).status, 404);
  assert.equal((await fetch(dropdownChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: 'Legacy', instruction: 'Legacy',
      segments: [{ type: 'text', text: 'Old' }],
    }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/dropdown-choice/missing-choice`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: 'Missing', instruction: 'Missing', text: '[[missing]]',
      choices: [{ id: 'missing', options: ['one', 'two'], answer: 'one' }],
    }),
  })).status, 404);

  const personalizedQuestionsEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}`
    + '/personalized-questions/target-vocabulary-personalized-questions';
  assert.equal((await fetch(personalizedQuestionsEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guest', instruction: 'Guest', items: [] }),
  })).status, 401);
  assert.equal((await fetch(personalizedQuestionsEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ title: 'Teacher', instruction: 'Teacher', items: [] }),
  })).status, 403);
  const personalizedQuestionsUpdate = await fetch(personalizedQuestionsEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      type: 'markdownCard',
      id: 'attempted-id-change',
      title: ' Updated questions ',
      instruction: ' Speak freely. ',
      items: [{ id: 'second-question', question: 'Do you **play games**?', followUp: 'Which ones?' },
        { id: 'first-question', question: 'Do you go outside?', followUp: 'With whom?' }],
    }),
  });
  assert.equal(personalizedQuestionsUpdate.status, 200);
  const savedPersonalizedQuestions = (await personalizedQuestionsUpdate.json()).draft.content.stages[2].content[7];
  assert.deepEqual(savedPersonalizedQuestions, {
    type: 'personalizedQuestions',
    id: 'target-vocabulary-personalized-questions',
    title: 'Updated questions',
    instruction: 'Speak freely.',
    items: [{ id: 'second-question', question: 'Do you **play games**?', followUp: 'Which ones?' },
      { id: 'first-question', question: 'Do you go outside?', followUp: 'With whom?' }],
  });
  assert.equal((await fetch(personalizedQuestionsEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Questions', instruction: 'Speak.', items: [] }),
  })).status, 400);

  const describeAndGuessEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}`
    + '/describe-and-guess/target-vocabulary-describe-and-guess';
  const describeAndGuessUpdate = await fetch(describeAndGuessEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: 'Updated extra task',
      instruction: 'Describe and guess.',
      items: [{ id: 'describe-level-up', text: 'level up' }],
      howToPlay: { title: 'Game rules', steps: ['Pick a word.', 'Explain it.'], tip: 'Use examples.' },
    }),
  });
  assert.equal(describeAndGuessUpdate.status, 200);
  const savedDescribeAndGuess = (await describeAndGuessUpdate.json()).draft.content.stages[2].content[9];
  assert.deepEqual(savedDescribeAndGuess, {
    type: 'describeAndGuess',
    id: 'target-vocabulary-describe-and-guess',
    title: 'Updated extra task',
    instruction: 'Describe and guess.',
    items: [{ id: 'describe-level-up', text: 'level up' }],
    howToPlay: { title: 'Game rules', steps: ['Pick a word.', 'Explain it.'], tip: 'Use examples.' },
  });
  const multipleChoiceEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/multiple-choice/reading-gist-quiz`;
  assert.equal((await fetch(multipleChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guest', instruction: 'Guest', items: [] }),
  })).status, 401);
  assert.equal((await fetch(multipleChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ title: 'Teacher', instruction: 'Teacher', items: [] }),
  })).status, 403);
  const multipleChoiceUpdate = await fetch(multipleChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      type: 'markdownCard',
      id: 'attempted-id-change',
      title: ' Updated gist ',
      instruction: ' Choose carefully. ',
      items: [{
        id: 'main-idea',
        question: 'What is the main idea?',
        options: ['Wrong', 'Right'],
        answer: 'Right',
        explanation: '   ',
      }],
    }),
  });
  assert.equal(multipleChoiceUpdate.status, 200);
  const savedMultipleChoice = (await multipleChoiceUpdate.json()).draft.content.stages[3].content[2];
  assert.deepEqual(savedMultipleChoice, {
    type: 'multipleChoice',
    id: 'reading-gist-quiz',
    title: 'Updated gist',
    instruction: 'Choose carefully.',
    items: [{
      id: 'main-idea',
      question: 'What is the main idea?',
      options: ['Wrong', 'Right'],
      answer: 'Right',
    }],
  });
  assert.equal((await fetch(multipleChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Quiz', instruction: 'Choose.', items: [] }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/multiple-choice/missing-choice`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: 'Quiz', instruction: 'Choose.',
      items: [{ id: 'one', question: 'Question?', options: ['A', 'B'], answer: 'A' }],
    }),
  })).status, 404);
  const checkboxChoiceEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/checkbox-choice/listening-gist-quiz`;
  assert.equal((await fetch(checkboxChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guest', instruction: 'Guest', items: [] }),
  })).status, 401);
  assert.equal((await fetch(checkboxChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ title: 'Teacher', instruction: 'Teacher', items: [] }),
  })).status, 403);
  const checkboxChoiceUpdate = await fetch(checkboxChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      type: 'markdownCard',
      id: 'attempted-id-change',
      title: ' Updated gist ',
      instruction: ' Choose carefully. ',
      items: [{
        id: 'conversation-place',
        question: 'Where does it happen?',
        options: ['Home', 'Camp office', 'Bus'],
        answers: ['Bus', 'Home'],
      }],
    }),
  });
  assert.equal(checkboxChoiceUpdate.status, 200);
  const savedCheckboxChoice = (await checkboxChoiceUpdate.json()).draft.content.stages[4].content[2];
  assert.deepEqual(savedCheckboxChoice, {
    type: 'checkboxChoice',
    id: 'listening-gist-quiz',
    title: 'Updated gist',
    instruction: 'Choose carefully.',
    items: [{
      id: 'conversation-place',
      question: 'Where does it happen?',
      options: ['Home', 'Camp office', 'Bus'],
      answers: ['Home', 'Bus'],
    }],
  });
  assert.equal((await fetch(checkboxChoiceEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Quiz', instruction: 'Choose.', items: [] }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/checkbox-choice/missing-checkbox`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: 'Quiz', instruction: 'Choose.',
      items: [{ id: 'one', question: 'Question?', options: ['A', 'B'], answers: ['A'] }],
    }),
  })).status, 404);

  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/personalized-questions/missing-questions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: 'Questions', instruction: 'Speak.',
      items: [{ id: 'question-one', question: 'Question?', followUp: 'Why?' }],
    }),
  })).status, 404);

  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Guest edit' }),
  })).status, 401);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ text: 'Teacher edit' }),
  })).status, 403);

  const noteUpdateResponse = await fetch(
    `${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
      body: JSON.stringify({ text: '**Saved**\n\n- First\n- Second' }),
    },
  );
  assert.equal(noteUpdateResponse.status, 200);
  const noteUpdate = (await noteUpdateResponse.json()).draft;
  assert.equal(noteUpdate.content.stages[0].content[0].text, '**Saved**\n\n- First\n- Second');
  assert.equal(noteUpdate.content.meta.title, 'Travel English');
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: '   ' }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/missing-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: 'Missing' }),
  })).status, 404);

  const compositeNoteResponse = await fetch(
    `${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/target-vocabulary-teacher-note`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
      body: JSON.stringify({
        text: 'My extra note',
        retainedBlockIds: [
          'target-vocabulary-pronunciation-check',
          'target-vocabulary-extra-phrases',
        ],
      }),
    },
  );
  assert.equal(compositeNoteResponse.status, 200);
  const compositeNote = (await compositeNoteResponse.json()).draft.content.stages[2].content[0];
  assert.equal(compositeNote.text, 'My extra note');
  assert.deepEqual(compositeNote.blocks.map(block => block.id), [
    'target-vocabulary-pronunciation-check',
    'target-vocabulary-extra-phrases',
  ]);

  assert.equal((await fetch(
    `${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/target-vocabulary-teacher-note`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
      body: JSON.stringify({ text: 'Tamper', retainedBlockIds: ['injected-block'] }),
    },
  )).status, 400);

  const markdownCardEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/markdown-cards/lead-in-suggested-answers-card`;
  const quickRuleEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/markdown-cards/grammar-presentation-quick-rule`;
  assert.equal((await fetch(markdownCardEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guest', text: 'Guest edit' }),
  })).status, 401);
  assert.equal((await fetch(markdownCardEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ title: 'Teacher', text: 'Teacher edit' }),
  })).status, 403);
  const markdownCardUpdate = await fetch(markdownCardEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: '  Updated answers  ',
      text: '  1. **Updated answer**\n2. Personal answer.  ',
      id: 'attempted-id-change',
      type: 'textPanel',
      icon: 'book',
      accentColor: '#000000',
      studentVisibility: 'always',
    }),
  });
  assert.equal(markdownCardUpdate.status, 200);
  const savedMarkdownCard = (await markdownCardUpdate.json()).draft.content.stages[1].content[4];
  assert.deepEqual(savedMarkdownCard, {
    type: 'markdownCard',
    id: 'lead-in-suggested-answers-card',
    title: 'Updated answers',
    text: '1. **Updated answer**\n2. Personal answer.',
    icon: 'check',
    accentColor: '#1EAD58',
    studentVisibility: 'controlled',
  });
  assert.equal((await fetch(markdownCardEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Title', text: '   ' }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/markdown-cards/missing-card`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Missing', text: 'Missing' }),
  })).status, 404);

  const quickRuleUpdate = await fetch(quickRuleEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: ' Quick Rule Updated ',
      sections: [
        { id: 'get-used-to', title: 'GET USED TO', text: '- Updated adaptation rule' },
        { id: 'section-3', title: 'REMEMBER', text: '- A new section' },
      ],
      layout: 'stacked',
      icon: 'check',
      accentColor: '#000000',
      studentVisibility: 'teacherOnly',
    }),
  });
  assert.equal(quickRuleUpdate.status, 200);
  const savedQuickRule = (await quickRuleUpdate.json()).draft.content.stages[5].content[4];
  assert.deepEqual(savedQuickRule, {
    type: 'markdownCard', id: 'grammar-presentation-quick-rule', title: 'Quick Rule Updated',
    layout: 'columns',
    sections: [
      { id: 'get-used-to', title: 'GET USED TO', text: '- Updated adaptation rule' },
      { id: 'section-3', title: 'REMEMBER', text: '- A new section' },
    ],
    icon: 'bulb', accentColor: '#6545F5', studentVisibility: 'always',
  });
  assert.equal((await fetch(quickRuleEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Wrong shape', text: 'Cannot replace sections' }),
  })).status, 400);

  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/task-prompts/warm-up-follow-up-prompt`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guest', text: 'Edit', support: null }),
  })).status, 401);
  const promptUpdateResponse = await fetch(
    `${baseUrl}/api/lesson-drafts/${created.id}/task-prompts/warm-up-follow-up-prompt`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
      body: JSON.stringify({
        title: 'Next questions:',
        text: '**Why?**',
        support: { title: 'Useful language:', text: 'I think…' },
        variant: 'yourTurn',
        id: 'attempted-id-change',
      }),
    },
  );
  assert.equal(promptUpdateResponse.status, 200);
  const promptUpdate = (await promptUpdateResponse.json()).draft;
  const savedPrompt = promptUpdate.content.stages[0].content[3];
  assert.equal(savedPrompt.id, 'warm-up-follow-up-prompt');
  assert.equal(savedPrompt.variant, 'followUp');
  assert.equal(savedPrompt.title, 'Next questions:');
  assert.deepEqual(savedPrompt.support, { title: 'Useful language:', text: 'I think…' });
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/task-prompts/warm-up-follow-up-prompt`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Next questions:', text: 'Question', support: { title: '', text: '' } }),
  })).status, 400);

  const imageEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/this-or-that/warm-up-this-or-that/items/summer-choice-one/options/minecraft-house/image`;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from('test-image'),
  ]);
  assert.equal((await fetch(imageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png,
  })).status, 401);
  assert.equal((await fetch(imageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: teacherCookie }, body: png,
  })).status, 403);
  assert.equal((await fetch(imageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'text/plain', Cookie: firstAdminCookie }, body: png,
  })).status, 415);
  assert.equal((await fetch(imageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: Buffer.from('not-png'),
  })).status, 415);
  const imageUpdateResponse = await fetch(imageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: png,
  });
  assert.equal(imageUpdateResponse.status, 200);
  const imageDraft = (await imageUpdateResponse.json()).draft;
  const savedImageSrc = imageDraft.content.stages[0].content[2].items[0].options[0].imageSrc;
  assert.match(savedImageSrc, new RegExp(`^/api/lesson-draft-assets/${created.id}/[a-f0-9-]+\\.png$`));
  assert.equal((await fetch(`${baseUrl}${savedImageSrc}`)).status, 401);
  const imageAssetResponse = await fetch(`${baseUrl}${savedImageSrc}`, { headers: { Cookie: firstAdminCookie } });
  assert.equal(imageAssetResponse.status, 200);
  assert.deepEqual(Buffer.from(await imageAssetResponse.arrayBuffer()), png);
  const secondAdminCookieBeforeDelete = await login(baseUrl, 'admin-two@example.com', password);
  assert.equal((await fetch(`${baseUrl}${savedImageSrc}`, { headers: { Cookie: secondAdminCookieBeforeDelete } })).status, 404);
  const imageDeleteResponse = await fetch(imageEndpoint, { method: 'DELETE', headers: { Cookie: firstAdminCookie } });
  assert.equal(imageDeleteResponse.status, 200);
  assert.equal((await imageDeleteResponse.json()).draft.content.stages[0].content[2].items[0].options[0].imageSrc, undefined);
  assert.equal((await fetch(`${baseUrl}${savedImageSrc}`, { headers: { Cookie: firstAdminCookie } })).status, 404);

  const matchWordsImageEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/match-words/target-vocabulary-match-words/items/hang-out/image`;
  assert.equal((await fetch(matchWordsImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png,
  })).status, 401);
  const matchWordsImageResponse = await fetch(matchWordsImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: png,
  });
  assert.equal(matchWordsImageResponse.status, 200);
  const matchWordsImageSrc = (await matchWordsImageResponse.json()).draft.content.stages[2].content[2].items[0].imageSrc;
  assert.match(matchWordsImageSrc, new RegExp(`^/api/lesson-draft-assets/${created.id}/[a-f0-9-]+\\.png$`));
  assert.equal((await fetch(matchWordsImageEndpoint, { method: 'DELETE', headers: { Cookie: firstAdminCookie } })).status, 200);
  assert.equal((await fetch(`${baseUrl}${matchWordsImageSrc}`, { headers: { Cookie: firstAdminCookie } })).status, 404);

  const panelEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/illustrated-text-panels/lead-in-gamer-message`;
  assert.equal((await fetch(panelEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Guest', backgroundColor: '#FFFFFF' }),
  })).status, 401);
  assert.equal((await fetch(panelEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ text: 'Teacher', backgroundColor: '#FFFFFF' }),
  })).status, 403);
  const panelUpdateResponse = await fetch(panelEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: '**Updated panel**', backgroundColor: '#abcdef', id: 'ignored' }),
  });
  assert.equal(panelUpdateResponse.status, 200);
  const savedPanel = (await panelUpdateResponse.json()).draft.content.stages[1].content[2];
  assert.equal(savedPanel.id, 'lead-in-gamer-message');
  assert.equal(savedPanel.text, '**Updated panel**');
  assert.equal(savedPanel.backgroundColor, '#ABCDEF');
  assert.equal((await fetch(panelEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: 'Text', backgroundColor: '#fff' }),
  })).status, 400);

  const plainPanelEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/text-panels/lead-in-discussion-questions`;
  const plainPanelUpdateResponse = await fetch(plainPanelEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: '1. Updated question\n2. Another question', backgroundColor: '#fefefe' }),
  });
  assert.equal(plainPanelUpdateResponse.status, 200);
  const savedPlainPanel = (await plainPanelUpdateResponse.json()).draft.content.stages[1].content[3];
  assert.equal(savedPlainPanel.id, 'lead-in-discussion-questions');
  assert.equal(savedPlainPanel.text, '1. Updated question\n2. Another question');
  assert.equal(savedPlainPanel.backgroundColor, '#FEFEFE');
  assert.equal(savedPlainPanel.accentColor, undefined);
  assert.equal(savedPlainPanel.showBorder, undefined);
  const styledPlainPanelResponse = await fetch(plainPanelEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      text: 'Styled question',
      backgroundColor: '#ffffff',
      accentColor: '#20a85b',
      showBorder: false,
    }),
  });
  assert.equal(styledPlainPanelResponse.status, 200);
  const styledPlainPanel = (await styledPlainPanelResponse.json()).draft.content.stages[1].content[3];
  assert.equal(styledPlainPanel.accentColor, '#20A85B');
  assert.equal(styledPlainPanel.showBorder, false);
  assert.equal((await fetch(plainPanelEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: 'Invalid', backgroundColor: '#FFFFFF', accentColor: '#123', showBorder: true }),
  })).status, 400);
  assert.equal((await fetch(plainPanelEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: 'Invalid', backgroundColor: '#FFFFFF', accentColor: '#6545F5', showBorder: 'no' }),
  })).status, 400);

  const panelImageEndpoint = `${panelEndpoint}/pictures/leading/image`;
  assert.equal((await fetch(panelImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png,
  })).status, 401);
  assert.equal((await fetch(panelImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: teacherCookie }, body: png,
  })).status, 403);
  const panelImageResponse = await fetch(panelImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: png,
  });
  assert.equal(panelImageResponse.status, 200);
  const panelImageSrc = (await panelImageResponse.json()).draft.content.stages[1].content[2].leadingPicture.imageSrc;
  assert.match(panelImageSrc, new RegExp(`^/api/lesson-draft-assets/${created.id}/[a-f0-9-]+\\.png$`));
  assert.equal((await fetch(`${baseUrl}${panelImageSrc}`, { headers: { Cookie: firstAdminCookie } })).status, 200);
  const panelImageDeleteResponse = await fetch(panelImageEndpoint, {
    method: 'DELETE', headers: { Cookie: firstAdminCookie },
  });
  assert.equal(panelImageDeleteResponse.status, 200);
  assert.equal((await panelImageDeleteResponse.json()).draft.content.stages[1].content[2].leadingPicture.imageSrc, undefined);
  assert.equal((await fetch(`${baseUrl}${panelImageSrc}`, { headers: { Cookie: firstAdminCookie } })).status, 404);

  const textReadingEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/text-readings/reading-text`;
  assert.equal((await fetch(textReadingEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Guest', subtitle: 'Guest', text: 'Guest' }),
  })).status, 401);
  assert.equal((await fetch(textReadingEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: teacherCookie },
    body: JSON.stringify({ title: 'Teacher', subtitle: 'Teacher', text: 'Teacher' }),
  })).status, 403);
  const textReadingUpdateResponse = await fetch(textReadingEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: '  My Updated Exchange  ',
      subtitle: '   ',
      text: '  **Updated** reading text.  ',
      id: 'ignored',
      type: 'textPanel',
    }),
  });
  assert.equal(textReadingUpdateResponse.status, 200);
  const savedTextReading = (await textReadingUpdateResponse.json()).draft.content.stages[3].content[1];
  assert.equal(savedTextReading.id, 'reading-text');
  assert.equal(savedTextReading.title, 'My Updated Exchange');
  assert.equal(savedTextReading.subtitle, undefined);
  assert.equal(savedTextReading.text, '**Updated** reading text.');
  assert.ok(savedTextReading.headerImage.imagePrompt);
  assert.ok(savedTextReading.textImage.imagePrompt);
  assert.equal((await fetch(textReadingEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: '', text: 'Text' }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/text-readings/missing-reading`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Missing', text: 'Missing' }),
  })).status, 404);

  const textReadingImageEndpoint = `${textReadingEndpoint}/pictures/text/image`;
  assert.equal((await fetch(textReadingImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png,
  })).status, 401);
  assert.equal((await fetch(textReadingImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: teacherCookie }, body: png,
  })).status, 403);
  const textReadingImageResponse = await fetch(textReadingImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: png,
  });
  assert.equal(textReadingImageResponse.status, 200);
  const firstTextReadingImageSrc = (await textReadingImageResponse.json()).draft.content.stages[3].content[1].textImage.imageSrc;
  assert.match(firstTextReadingImageSrc, new RegExp(`^/api/lesson-draft-assets/${created.id}/[a-f0-9-]+\\.png$`));
  assert.equal((await fetch(`${baseUrl}${firstTextReadingImageSrc}`, { headers: { Cookie: firstAdminCookie } })).status, 200);
  const secondTextReadingImageResponse = await fetch(textReadingImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: Buffer.concat([png, Buffer.from('-replacement')]),
  });
  assert.equal(secondTextReadingImageResponse.status, 200);
  const secondTextReadingImageSrc = (await secondTextReadingImageResponse.json()).draft.content.stages[3].content[1].textImage.imageSrc;
  assert.notEqual(secondTextReadingImageSrc, firstTextReadingImageSrc);
  assert.equal((await fetch(`${baseUrl}${firstTextReadingImageSrc}`, { headers: { Cookie: firstAdminCookie } })).status, 404);
  const textReadingImageDeleteResponse = await fetch(textReadingImageEndpoint, {
    method: 'DELETE', headers: { Cookie: firstAdminCookie },
  });
  assert.equal(textReadingImageDeleteResponse.status, 200);
  assert.equal((await textReadingImageDeleteResponse.json()).draft.content.stages[3].content[1].textImage.imageSrc, undefined);
  assert.equal((await fetch(`${baseUrl}${secondTextReadingImageSrc}`, { headers: { Cookie: firstAdminCookie } })).status, 404);

  const textReadingHeaderImageEndpoint = `${textReadingEndpoint}/pictures/header/image`;
  const textReadingHeaderResponse = await fetch(textReadingHeaderImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: png,
  });
  assert.equal(textReadingHeaderResponse.status, 200);
  const textReadingHeaderImageSrc = (await textReadingHeaderResponse.json()).draft.content.stages[3].content[1].headerImage.imageSrc;
  assert.match(textReadingHeaderImageSrc, new RegExp(`^/api/lesson-draft-assets/${created.id}/[a-f0-9-]+\\.png$`));
  assert.equal((await fetch(textReadingHeaderImageEndpoint, {
    method: 'DELETE', headers: { Cookie: firstAdminCookie },
  })).status, 200);

  const audioPlayerEndpoint = `${baseUrl}/api/lesson-drafts/${created.id}/audio-player/listening-audio`;
  const audioPlayerUpdateResponse = await fetch(audioPlayerEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Play the dialogue' }),
  });
  assert.equal(audioPlayerUpdateResponse.status, 200);
  const savedAudioPlayer = (await audioPlayerUpdateResponse.json()).draft.content.stages[4].content[1];
  assert.equal(savedAudioPlayer.title, 'Play the dialogue');
  assert.ok(savedAudioPlayer.script.includes('AFK Summer'));
  assert.equal(savedAudioPlayer.audioSrc, undefined);
  assert.equal((await fetch(audioPlayerEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: '' }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/audio-player/missing-audio`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Missing' }),
  })).status, 404);

  const audioEndpoint = `${audioPlayerEndpoint}/audio`;
  const mp3 = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assert.equal((await fetch(audioEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'audio/mpeg' }, body: mp3,
  })).status, 401);
  assert.equal((await fetch(audioEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'audio/mpeg', Cookie: teacherCookie }, body: mp3,
  })).status, 403);
  assert.equal((await fetch(audioEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: png,
  })).status, 415);
  const audioUploadResponse = await fetch(audioEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'audio/mpeg', Cookie: firstAdminCookie }, body: mp3,
  });
  assert.equal(audioUploadResponse.status, 200);
  const firstAudioSrc = (await audioUploadResponse.json()).draft.content.stages[4].content[1].audioSrc;
  assert.match(firstAudioSrc, new RegExp(`^/api/lesson-draft-assets/${created.id}/[a-f0-9-]+\\.mp3$`));
  const audioFileResponse = await fetch(`${baseUrl}${firstAudioSrc}`, { headers: { Cookie: firstAdminCookie } });
  assert.equal(audioFileResponse.status, 200);
  assert.equal(audioFileResponse.headers.get('content-type'), 'audio/mpeg');
  assert.equal(audioFileResponse.headers.get('accept-ranges'), 'bytes');
  const audioHeadResponse = await fetch(`${baseUrl}${firstAudioSrc}`, {
    method: 'HEAD', headers: { Cookie: firstAdminCookie },
  });
  assert.equal(audioHeadResponse.status, 200);
  assert.equal(audioHeadResponse.headers.get('accept-ranges'), 'bytes');
  const audioRangeResponse = await fetch(`${baseUrl}${firstAudioSrc}`, {
    headers: { Cookie: firstAdminCookie, Range: 'bytes=0-3' },
  });
  assert.equal(audioRangeResponse.status, 206);
  assert.equal(audioRangeResponse.headers.get('content-range'), `bytes 0-3/${mp3.length}`);
  assert.equal(Buffer.from(await audioRangeResponse.arrayBuffer()).equals(mp3.subarray(0, 4)), true);
  const secondAudioResponse = await fetch(audioEndpoint, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/mpeg', Cookie: firstAdminCookie },
    body: Buffer.concat([mp3, Buffer.from('-replacement')]),
  });
  assert.equal(secondAudioResponse.status, 200);
  const secondAudioSrc = (await secondAudioResponse.json()).draft.content.stages[4].content[1].audioSrc;
  assert.notEqual(secondAudioSrc, firstAudioSrc);
  assert.equal((await fetch(`${baseUrl}${firstAudioSrc}`, { headers: { Cookie: firstAdminCookie } })).status, 404);
  const audioDeleteResponse = await fetch(audioEndpoint, {
    method: 'DELETE', headers: { Cookie: firstAdminCookie },
  });
  assert.equal(audioDeleteResponse.status, 200);
  assert.equal((await audioDeleteResponse.json()).draft.content.stages[4].content[1].audioSrc, undefined);
  assert.equal((await fetch(`${baseUrl}${secondAudioSrc}`, { headers: { Cookie: firstAdminCookie } })).status, 404);

  const ownList = await fetch(`${baseUrl}/api/lesson-drafts`, {
    headers: { Cookie: firstAdminCookie },
  });
  assert.deepEqual((await ownList.json()).drafts.map(draft => draft.id), [created.id]);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    headers: { Cookie: firstAdminCookie },
  })).status, 200);

  const secondAdminCookie = secondAdminCookieBeforeDelete;
  const secondList = await fetch(`${baseUrl}/api/lesson-drafts`, {
    headers: { Cookie: secondAdminCookie },
  });
  assert.deepEqual((await secondList.json()).drafts, []);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    headers: { Cookie: secondAdminCookie },
  })).status, 404);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: secondAdminCookie },
    body: JSON.stringify({ text: 'Foreign edit' }),
  })).status, 404);
  assert.equal((await fetch(markdownCardEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: secondAdminCookie },
    body: JSON.stringify({ title: 'Foreign', text: 'Foreign edit' }),
  })).status, 404);
  assert.equal((await fetch(`${baseUrl}/lesson-drafts/${created.id}/edit`, {
    headers: { Cookie: secondAdminCookie },
  })).status, 404);

  const foreignDelete = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    method: 'DELETE',
    headers: { Cookie: secondAdminCookie },
  });
  assert.equal(foreignDelete.status, 404);

  const statusDatabase = openDatabase(databasePath);
  statusDatabase.prepare("UPDATE lesson_drafts SET status = 'published' WHERE id = ?").run(created.id);
  statusDatabase.close();
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/teacher-notes/warm-up-teacher-note`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: 'Published edit' }),
  })).status, 409);
  assert.equal((await fetch(personalizedQuestionsEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({
      title: 'Published questions', instruction: 'Speak.',
      items: [{ id: 'question-one', question: 'Question?', followUp: 'Why?' }],
    }),
  })).status, 409);
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}/task-prompts/warm-up-follow-up-prompt`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Published', text: 'Edit', support: null }),
  })).status, 409);
  assert.equal((await fetch(markdownCardEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Published', text: 'Published edit' }),
  })).status, 409);
  assert.equal((await fetch(panelEndpoint, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ text: 'Published', backgroundColor: '#FFFFFF' }),
  })).status, 409);
  assert.equal((await fetch(panelImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: png,
  })).status, 409);
  assert.equal((await fetch(textReadingEndpoint, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Cookie: firstAdminCookie },
    body: JSON.stringify({ title: 'Published', text: 'Published edit' }),
  })).status, 409);
  assert.equal((await fetch(textReadingImageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: png,
  })).status, 409);
  assert.equal((await fetch(imageEndpoint, {
    method: 'PUT', headers: { 'Content-Type': 'image/png', Cookie: firstAdminCookie }, body: png,
  })).status, 409);

  const ownDelete = await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    method: 'DELETE',
    headers: { Cookie: firstAdminCookie },
  });
  assert.equal(ownDelete.status, 200);
  assert.deepEqual(await ownDelete.json(), { ok: true });
  assert.equal((await fetch(`${baseUrl}/api/lesson-drafts/${created.id}`, {
    headers: { Cookie: firstAdminCookie },
  })).status, 404);
});
