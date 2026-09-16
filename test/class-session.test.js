'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { WebSocket } = require('ws');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClass } = require('../lib/class-store.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { applyAction, authorizeClass, joinClass, sessionPayload } = require('../lib/class-session-store.js');

test('live class: guest authorization, actions, isolation, tab replacement and restart recovery', { timeout: 20000 }, async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'class-session-'));
  const databasePath = path.join(directory, 'app.sqlite');
  const db = openDatabase(databasePath);
  let server;
  const sockets = [];
  const stop = async () => {
    if (!server || server.exitCode !== null) return;
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  };
  t.after(async () => { sockets.forEach(socket => socket.terminate()); await stop(); db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const teacher = createUser({ email: 'live@test.local', displayName: 'Teacher', role: 'teacher', passwordHash: 'unused' }, db);
  const teacherCookie = `teach_session=${createSession(teacher.id, db).token}`;
  const content = createSyntheticLesson('Live lesson');
  const publicAsset = `${'c'.repeat(64)}.png`, privateAsset = `${'d'.repeat(64)}.png`, leadAsset = `${'e'.repeat(64)}.png`;
  const audioAsset = `${'f'.repeat(64)}.mp3`;
  const supportRow = content.stages.find(stage => stage.id === 'grammar-focus').content.find(item => item.type === 'cardRow');
  supportRow.items[1].studentVisibility = 'controlled';
  supportRow.items[2].studentVisibility = 'teacherOnly';
  const choice = content.stages[0].content.find(component => component.type === 'thisOrThat');
  choice.items[0].options[0].imageSrc = `/api/library/superhero/assets/${publicAsset}`;
  content.stages[1].content.find(c => c.type === 'illustratedTextPanel').leadingPicture.imageSrc = `/api/library/superhero/assets/${leadAsset}`;
  content.stages[1].content.push({ type: 'teacherNote', id: 'private-note', text: `/api/library/superhero/assets/${privateAsset}` });
  for (const audio of content.stages.find(stage => stage.id === 'listening').content.filter(component => component.type === 'audioPlayer')) {
    audio.audioSrc = `/api/library/superhero/assets/${audioAsset}`;
  }
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(content));
  for (const name of [publicAsset, privateAsset, leadAsset]) db.prepare('INSERT INTO library_assets VALUES (?, ?, ?)').run('superhero', name, Buffer.from('image'));
  db.prepare('INSERT INTO library_assets VALUES (?, ?, ?)').run('superhero', audioAsset, Buffer.from('audio'));
  const makeClass = () => createClass({ name: 'Live test', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID() }, teacher.id, db);
  const lesson = makeClass(), otherLesson = makeClass();
  const probe = require('node:net').createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  async function start() {
    server = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, APP_DB_PATH: databasePath, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'test' }, stdio: 'ignore' });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(base + '/health')).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Server did not start');
  }
  const get = (route, cookie) => fetch(base + route, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  async function guest() {
    const response = await get(lesson.invitePath);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), `${lesson.lessonPath}/student`);
    const header = response.headers.get('set-cookie');
    assert.match(header, /HttpOnly; SameSite=Lax/);
    return header.split(';')[0];
  }
  function connect(role, cookie, id = lesson.id, origin = base) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws/classes/${id}?role=${role}`, { headers: { Cookie: cookie || '', Origin: origin } });
    sockets.push(socket);
    const messages = [], waiters = [];
    socket.on('message', raw => {
      const message = JSON.parse(raw);
      const index = waiters.findIndex(waiter => waiter.type === message.type);
      if (index < 0) messages.push(message);
      else { const [waiter] = waiters.splice(index, 1); clearTimeout(waiter.timer); waiter.resolve(message); }
    });
    socket.next = type => {
      const index = messages.findIndex(message => message.type === type);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve, timer: setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2000) };
        waiters.push(waiter);
      });
    };
    return socket;
  }
  await start();
  const cookie = await guest(), secondCookie = await guest();
  const repeat = await get(lesson.invitePath, cookie);
  assert.equal(repeat.headers.get('set-cookie'), null);
  assert.equal((await get(`${lesson.lessonPath}/student`, cookie)).status, 200);
  assert.equal((await get(`${lesson.lessonPath}/student`)).status, 403);
  assert.equal((await get(`/api/classes/${lesson.id}/live?role=student`)).status, 403);
  assert.equal((await get(`/api/classes/${otherLesson.id}/live?role=student`, cookie)).status, 403);
  assert.equal((await get(`/api/classes/${lesson.id}/live?role=teacher`, cookie)).status, 403);
  assert.equal((await get(`/api/classes/${lesson.id}`, cookie)).status, 401);
  const studentPayload = await (await get(`/api/classes/${lesson.id}/live?role=student`, cookie)).json();
  assert.deepEqual(studentPayload.lesson.content.stages[0].content.map(component => component.type), ['markdownCard', 'thisOrThat', 'taskPrompt']);
  const initialWrapUp = studentPayload.lesson.content.stages.find(stage => stage.id === 'wrap-up');
  assert.deepEqual(initialWrapUp.content.map(component => component.type), ['threeTwoOne', 'selfAssessment', 'markdownCard']);
  assert.ok(!JSON.stringify(studentPayload).includes('teacherNote'));
  function assertGuidedStudent(payload) {
    assert.ok(payload.availableStageIds.includes('guided-speaking'));
    const guided = payload.lesson.content.stages.find(stage => stage.id === 'guided-speaking');
    assert.deepEqual(guided.content.map(item => item.type), ['textPanel', 'howToPlay', 'guidedRoleCards', 'speakingSupport', 'markdownCard']);
    const cards = guided.content.find(item => item.type === 'guidedRoleCards');
    assert.deepEqual(Object.keys(cards), ['type', 'id', 'presentation']);
    assert.deepEqual(Object.keys(cards.presentation.roles), ['student']);
    assert.equal(JSON.stringify(guided).includes('Bike rental closes'), false);
  }
  assertGuidedStudent(studentPayload);
  const teacherPayload = await (await get(`/api/classes/${lesson.id}/live?role=teacher`, teacherCookie)).json();
  assert.deepEqual(Object.keys(teacherPayload.lesson.content.stages.find(stage => stage.id === 'guided-speaking')
    .content.find(item => item.type === 'guidedRoleCards').presentation.roles), ['student', 'teacher']);
  const initialListening = studentPayload.lesson.content.stages.find(stage => stage.id === 'listening');
  assert.deepEqual(initialListening.content.map(component => component.type), ['audioPlayer', 'checkboxChoice', 'audioPlayer', 'multipleChoice']);
  assert.ok(initialListening.content.filter(component => component.type === 'audioPlayer').every(component => !Object.hasOwn(component.presentation, 'script')));
  assert.equal((await get(`/api/classes/${lesson.id}/assets/${publicAsset}`, cookie)).status, 200);
  assert.equal((await get(`/api/classes/${lesson.id}/assets/${privateAsset}`, cookie)).status, 404);
  assert.equal((await get(`/api/classes/${lesson.id}/assets/${leadAsset}`, cookie)).status, 200);
  assert.equal((await get(`/api/classes/${lesson.id}/assets/${audioAsset}`, cookie)).status, 200);
  assert.equal((await get(`/api/classes/${otherLesson.id}/assets/${publicAsset}`, cookie)).status, 401);
  for (const [role, auth, origin] of [['teacher', cookie, base], ['student', '', base], ['student', cookie, 'https://evil.test']]) {
    const denied = connect(role, auth, lesson.id, origin);
    const error = await new Promise(resolve => denied.once('error', resolve));
    assert.match(error.message, /403/);
  }
  const teacherSocket = connect('teacher', teacherCookie);
  assert.equal((await teacherSocket.next('snapshot')).state.version, 0);
  const studentSocket = connect('student', cookie);
  assertGuidedStudent(await studentSocket.next('snapshot'));
  const action = { type: 'select-option', stageId: 'warm-up', componentId: choice.id, itemId: choice.items[0].id, optionId: choice.items[0].options[0].id, expectedVersion: 0 };
  studentSocket.send(JSON.stringify(action));
  const first = (await teacherSocket.next('action')).state;
  assert.equal(first.version, 1);
  assert.equal(first.selections[choice.id][choice.items[0].id], action.optionId);
  assert.deepEqual((await studentSocket.next('action')).state, first);
  studentSocket.send(JSON.stringify(action));
  assert.equal((await studentSocket.next('action-error')).state.version, 1);
  studentSocket.send(JSON.stringify({ ...action, expectedVersion: 1, optionId: 'missing' }));
  assert.equal((await studentSocket.next('action-error')).state.version, 1);
  studentSocket.send(JSON.stringify({ type: 'select-stage', stageId: 'warm-up' }));
  assert.match((await studentSocket.next('action-error')).error, /преподаватель/);
  teacherSocket.send(JSON.stringify({ ...action, expectedVersion: 0 }));
  assert.equal((await teacherSocket.next('action-error')).state.version, 1);
  const duplicate = connect('student', secondCookie);
  assert.equal((await once(duplicate, 'close'))[0], 4003);
  const replaced = once(studentSocket, 'close');
  const replacement = connect('student', cookie);
  assert.deepEqual((await replacement.next('snapshot')).state, first);
  assert.equal((await replaced)[0], 4001);
  teacherSocket.send(JSON.stringify({ ...action, expectedVersion: 1, optionId: choice.items[0].options[1].id }));
  const second = (await replacement.next('action')).state;
  assert.equal(second.version, 2);
  assert.equal(second.selections[choice.id][choice.items[0].id], choice.items[0].options[1].id);
  assert.deepEqual((await teacherSocket.next('action')).state, second);
  // Persisted data contains current state, not an attempt log.
  const { _layouts, ...persisted } = JSON.parse(db.prepare('SELECT state_json FROM class_live_state WHERE class_id = ?').get(lesson.id).state_json);
  assert.ok(Object.keys(_layouts).length);
  assert.deepEqual(persisted, second);
  const answersId = 'lead-in-suggested-answers-card';
  const sendTeacher = async action => {
    teacherSocket.send(JSON.stringify(action));
    const teacherMessage = await teacherSocket.next('action');
    const studentMessage = await replacement.next('action');
    assert.equal(studentMessage.actorRole, 'teacher');
    assert.deepEqual(studentMessage.state, teacherMessage.state);
    assert.ok(!JSON.stringify(studentMessage.lesson).includes('teacherNote'));
    return studentMessage;
  };
  const lead = await sendTeacher({ type: 'select-stage', stageId: 'lead-in', expectedVersion: 2 });
  assert.equal(lead.state.activeStageId, 'lead-in');
  assert.deepEqual(lead.lesson.content.stages[1].content.map(c => c.type), ['markdownCard', 'illustratedTextPanel', 'textPanel']);
  const visibility = { type: 'set-visibility', stageId: 'lead-in', componentId: answersId, visible: true, expectedVersion: 3 };
  replacement.send(JSON.stringify(visibility));
  assert.match((await replacement.next('action-error')).error, /преподаватель/);
  const shown = await sendTeacher(visibility);
  assert.ok(shown.lesson.content.stages[1].content.some(c => c.id === answersId));
  const hidden = await sendTeacher({ ...visibility, visible: false, expectedVersion: 4 });
  assert.ok(!JSON.stringify(hidden.lesson).includes(answersId));
  await sendTeacher({ ...visibility, expectedVersion: 5 });
  const back = await sendTeacher({ type: 'select-stage', stageId: 'warm-up', expectedVersion: 6 });
  assert.deepEqual(back.state.selections, second.selections);
  let final = await sendTeacher({ type: 'select-stage', stageId: 'lead-in', expectedVersion: 7 });
  assert.equal(final.state.visibleCards[answersId], true);
  final = await sendTeacher({ type: 'select-stage', stageId: 'target-vocabulary', expectedVersion: final.state.version });
  const vocab = final.lesson.content.stages.find(stage => stage.id === 'target-vocabulary');
  const sourceVocab = content.stages.find(stage => stage.id === 'target-vocabulary');
  assert.deepEqual(vocab.content.map(c => c.type), ['matchWords', 'dropdownChoice', 'fillInBlanks', 'personalizedQuestions', 'markdownCard']);
  const sourceMatch = sourceVocab.content.find(c => c.type === 'matchWords');
  const matchComponent = vocab.content.find(c => c.type === 'matchWords');
  const dropdown = vocab.content.find(c => c.type === 'dropdownChoice');
  const fill = vocab.content.find(c => c.type === 'fillInBlanks');
  const publicJson = JSON.stringify(final);
  assert.ok(!JSON.stringify(vocab).includes('imagePrompt'));
  assert.ok(!JSON.stringify(vocab).includes('"answer":'));
  assert.ok(!publicJson.includes('_layouts'));
  const layoutBefore = JSON.stringify(vocab.content);
  const firstWord = matchComponent.presentation.items.find(item => item.term === sourceMatch.items[0].term);
  assert.ok(!matchComponent.presentation.targets.some(item => item.id === firstWord.id));
  assert.equal(matchComponent.presentation.answerKey[firstWord.id], matchComponent.presentation.targets[0].id);
  const sendStudent = async action => {
    replacement.send(JSON.stringify({ stageId: 'target-vocabulary', expectedVersion: final.state.version, ...action }));
    const student = await replacement.next('action');
    const teacher = await teacherSocket.next('action');
    assert.deepEqual(student.state, teacher.state);
    final = student;
    return student;
  };
  const matchAction = { componentId: matchComponent.id, itemId: firstWord.id };
  await sendStudent({ ...matchAction, type: 'select-word' });
  assert.equal(final.state.exercises[matchComponent.id].selectedId, firstWord.id);
  await sendStudent({ ...matchAction, type: 'match-word', targetId: matchComponent.presentation.targets[1].id, attemptId: 'wrong-attempt', correct: true });
  assert.equal(final.state.exercises[matchComponent.id].attempt.correct, false);
  assert.deepEqual(final.state.exercises[matchComponent.id].matches, {});
  final = await sendTeacher({ stageId: final.state.activeStageId, expectedVersion: final.state.version, ...matchAction, type: 'match-word', targetId: matchComponent.presentation.targets[0].id, attemptId: 'correct-attempt' });
  assert.equal(final.state.exercises[matchComponent.id].attempt.id, 'correct-attempt');
  assert.equal(final.state.exercises[matchComponent.id].matches[firstWord.id], matchComponent.presentation.targets[0].id);
  const sourceChoice = sourceVocab.content.find(c => c.type === 'dropdownChoice').choices[0];
  await sendStudent({ type: 'choose-word', componentId: dropdown.id, itemId: sourceChoice.id, value: sourceChoice.options.find(value => value !== sourceChoice.answer) });
  assert.equal(final.state.exercises[dropdown.id].answers[sourceChoice.id].status, 'wrong');
  final = await sendTeacher({ stageId: final.state.activeStageId, expectedVersion: final.state.version, type: 'choose-word', componentId: dropdown.id, itemId: sourceChoice.id, value: sourceChoice.answer });
  assert.equal(final.state.exercises[dropdown.id].answers[sourceChoice.id].status, 'correct');
  teacherSocket.send(JSON.stringify({ type: 'choose-word', stageId: 'target-vocabulary', componentId: dropdown.id, itemId: sourceChoice.id, value: sourceChoice.answer, expectedVersion: final.state.version }));
  assert.match((await teacherSocket.next('action-error')).error, /уже верный/);
  const sourceFill = sourceVocab.content.find(c => c.type === 'fillInBlanks').items[0];
  await sendStudent({ type: 'type-answer', componentId: fill.id, itemId: sourceFill.id, value: 'unfinished' });
  assert.equal(final.state.exercises[fill.id].answers[sourceFill.id].value, 'unfinished');
  assert.equal(final.state.exercises[fill.id].answers[sourceFill.id].status, 'pending');
  final = await sendTeacher({ stageId: final.state.activeStageId, expectedVersion: final.state.version, type: 'type-answer', componentId: fill.id, itemId: sourceFill.id, value: `  ${sourceFill.answer.toUpperCase()}  ` });
  assert.equal(final.state.exercises[fill.id].answers[sourceFill.id].status, 'correct');
  const game = sourceVocab.content.find(c => c.type === 'describeAndGuess');
  const visibilityAction = { type: 'set-visibility', stageId: 'target-vocabulary', componentId: game.id, visible: true };
  final = await sendTeacher({ ...visibilityAction, expectedVersion: final.state.version });
  assert.ok(final.lesson.content.stages[2].content.some(c => c.id === game.id));
  await sendStudent({ type: 'set-crossed', componentId: game.id, itemId: game.items[0].id, crossed: true });
  final = await sendTeacher({ type: 'set-crossed', stageId: 'target-vocabulary', componentId: game.id, itemId: game.items[0].id, crossed: false, expectedVersion: final.state.version });
  assert.equal(final.state.exercises[game.id].crossed[game.items[0].id], false);
  final = await sendTeacher({ ...visibilityAction, visible: false, expectedVersion: final.state.version });
  assert.equal(JSON.stringify(final.lesson.content.stages[2].content), layoutBefore);
  final = await sendTeacher({ type: 'select-stage', stageId: 'reading', expectedVersion: final.state.version });
  const reading = final.lesson.content.stages.find(stage => stage.id === 'reading');
  assert.deepEqual(reading.content.map(c => c.type), ['textReading', 'multipleChoice', 'multipleChoice']);
  for (const quiz of reading.content.filter(c => c.type === 'multipleChoice')) {
    const item = quiz.presentation.items[0];
    const answerAction = { stageId: 'reading', type: 'choose-option', componentId: quiz.id, itemId: item.id };
    await sendStudent({ ...answerAction, value: item.options.find(value => value !== item.answer), status: 'correct' });
    assert.equal(final.state.exercises[quiz.id].answers[item.id].status, 'wrong');
    final = await sendTeacher({ stageId: final.state.activeStageId, expectedVersion: final.state.version, ...answerAction, value: item.answer });
    assert.equal(final.state.exercises[quiz.id].answers[item.id].status, 'correct');
    teacherSocket.send(JSON.stringify({ ...answerAction, value: item.answer, expectedVersion: final.state.version }));
    assert.match((await teacherSocket.next('action-error')).error, /уже верный/);
    replacement.send(JSON.stringify({ ...answerAction, value: item.options[0], expectedVersion: final.state.version }));
    assert.match((await replacement.next('action-error')).error, /уже верный/);
  }
  final = await sendTeacher({ type: 'select-stage', stageId: 'listening', expectedVersion: final.state.version });
  const listening = final.lesson.content.stages.find(stage => stage.id === 'listening');
  const sourceListening = content.stages.find(stage => stage.id === 'listening');
  assert.deepEqual(listening.content.map(component => component.type), ['audioPlayer', 'checkboxChoice', 'audioPlayer', 'multipleChoice']);
  const audio = listening.content.find(component => component.type === 'audioPlayer');
  const sourceAudio = sourceListening.content.find(component => component.id === audio.id);
  assert.equal(audio.presentation.audioSrc, `/api/classes/${lesson.id}/assets/${audioAsset}`);
  assert.equal(Object.hasOwn(audio.presentation, 'script'), false);
  final = await sendTeacher({
    type: 'set-visibility', stageId: 'listening', componentId: audio.id,
    visible: true, expectedVersion: final.state.version,
  });
  const revealedAudio = final.lesson.content.stages.find(stage => stage.id === 'listening').content.find(component => component.id === audio.id);
  assert.equal(revealedAudio.presentation.script, sourceAudio.script);
  const otherAudio = final.lesson.content.stages.find(stage => stage.id === 'listening').content.find(component => component.type === 'audioPlayer' && component.id !== audio.id);
  assert.equal(Object.hasOwn(otherAudio.presentation, 'script'), false, 'each transcript has independent visibility');
  replacement.send(JSON.stringify({
    type: 'set-visibility', stageId: 'listening', componentId: otherAudio.id,
    visible: true, expectedVersion: final.state.version,
  }));
  assert.match((await replacement.next('action-error')).error, /преподаватель/);

  const gist = listening.content.find(component => component.type === 'checkboxChoice');
  const sourceGist = sourceListening.content.find(component => component.id === gist.id);
  const gistItem = sourceGist.items[0];
  const wrongGist = gistItem.options.find(value => !gistItem.answers.includes(value));
  await sendStudent({ stageId: 'listening', type: 'choose-option', componentId: gist.id, itemId: gistItem.id, value: wrongGist });
  assert.equal(final.state.exercises[gist.id].answers[gistItem.id].status, 'wrong');
  final = await sendTeacher({ expectedVersion: final.state.version, stageId: 'listening', type: 'choose-option', componentId: gist.id, itemId: gistItem.id, value: gistItem.answers[0] });
  assert.equal(final.state.exercises[gist.id].answers[gistItem.id].status, 'correct');
  assert.deepEqual(final.state.exercises[gist.id].answers[gistItem.id].values, [wrongGist, gistItem.answers[0]]);
  teacherSocket.send(JSON.stringify({
    stageId: 'listening', type: 'choose-option', componentId: gist.id, itemId: gistItem.id,
    value: gistItem.answers[0], expectedVersion: final.state.version,
  }));
  assert.match((await teacherSocket.next('action-error')).error, /уже верный/);

  const detail = listening.content.find(component => component.type === 'multipleChoice');
  const detailItem = detail.presentation.items[0];
  await sendStudent({
    stageId: 'listening', type: 'choose-option', componentId: detail.id, itemId: detailItem.id,
    value: detailItem.options.find(value => value !== detailItem.answer),
  });
  assert.equal(final.state.exercises[detail.id].answers[detailItem.id].status, 'wrong');
  await sendStudent({
    stageId: 'listening', type: 'choose-option', componentId: detail.id, itemId: detailItem.id,
    value: detailItem.answer,
  });
  assert.equal(final.state.exercises[detail.id].answers[detailItem.id].status, 'correct');
  final = await sendTeacher({ type: 'select-stage', stageId: 'grammar-presentation', expectedVersion: final.state.version });
  const grammar = final.lesson.content.stages.find(stage => stage.id === 'grammar-presentation');
  assert.deepEqual(grammar.content.map(item => item.type), ['textPanel', 'textPanel', 'dragWordsInText', 'markdownCard', 'dropdownChoice']);
  const dragRule = grammar.content.find(item => item.type === 'dragWordsInText');
  await sendStudent({ stageId: grammar.id, type: 'select-word', componentId: dragRule.id, itemId: 'future' });
  assert.equal(final.state.exercises[dragRule.id].selectedId, 'future');
  await sendStudent({ stageId: grammar.id, type: 'place-word', componentId: dragRule.id, itemId: 'gap-1', value: 'future', attemptId: 'wrong-rule' });
  assert.equal(final.state.exercises[dragRule.id].attempt.correct, false);
  final = await sendTeacher({ expectedVersion: final.state.version, stageId: grammar.id, type: 'place-word', componentId: dragRule.id, itemId: 'gap-1', value: 'base verb', attemptId: 'right-rule' });
  assert.equal(final.state.exercises[dragRule.id].placed['gap-1'], 'base verb');
  const ruleDropdown = grammar.content.find(item => item.type === 'dropdownChoice');
  await sendStudent({ stageId: grammar.id, type: 'choose-word', componentId: ruleDropdown.id,
    itemId: ruleDropdown.presentation.choices[0].id, value: ruleDropdown.presentation.answerKey[ruleDropdown.presentation.choices[0].id] });
  assert.equal(final.state.exercises[ruleDropdown.id].answers[ruleDropdown.presentation.choices[0].id].status, 'correct');
  final = await sendTeacher({ type: 'select-stage', stageId: 'grammar-focus', expectedVersion: final.state.version });
  const focus = final.lesson.content.stages.find(stage => stage.id === 'grammar-focus');
  assert.deepEqual(focus.content.map(item => item.type), ['dropdownChoice', 'gapFill', 'miniSituation', 'cardRow']);
  const gapFill = focus.content.find(item => item.type === 'gapFill');
  const gap = gapFill.presentation.gaps[0];
  final = await sendTeacher({ expectedVersion: final.state.version, stageId: focus.id, type: 'type-answer', componentId: gapFill.id, itemId: gap.id, value: gap.answer });
  assert.equal(final.state.exercises[gapFill.id].answers[gap.id].status, 'correct');
  await sendStudent({ stageId: focus.id, type: 'type-answer', componentId: gapFill.id, itemId: gap.id, value: 'unfinished' });
  assert.equal(final.state.exercises[gapFill.id].answers[gap.id].status, 'pending');
  const mini = focus.content.find(item => item.type === 'miniSituation');
  final = await sendTeacher({ expectedVersion: final.state.version, stageId: focus.id, type: 'type-answer', componentId: mini.id, itemId: 'sentence-1', value: 'I am learning.' });
  assert.deepEqual(final.state.exercises[mini.id].answers['sentence-1'], { value: 'I am learning.' });
  const row = focus.content.find(item => item.type === 'cardRow');
  assert.equal(row.presentation.items.length, 1);
  final = await sendTeacher({ type: 'set-visibility', stageId: focus.id, componentId: supportRow.items[1].id,
    visible: true, expectedVersion: final.state.version });
  const currentRow = () => final.lesson.content.stages.find(stage => stage.id === focus.id).content.find(item => item.id === row.id);
  assert.equal(currentRow().presentation.items.length, 2);
  assert.equal(JSON.stringify(currentRow()).includes(supportRow.items[2].text), false);
  replacement.send(JSON.stringify({ type: 'set-visibility', stageId: focus.id, componentId: supportRow.items[1].id,
    visible: false, expectedVersion: final.state.version }));
  assert.match((await replacement.next('action-error')).error, /преподаватель/);
  teacherSocket.send(JSON.stringify({ type: 'set-visibility', stageId: focus.id, componentId: supportRow.items[2].id,
    visible: true, expectedVersion: final.state.version }));
  assert.match((await teacherSocket.next('action-error')).error, /видимость/);

  final = await sendTeacher({ type: 'select-stage', stageId: 'guided-speaking', expectedVersion: final.state.version });
  assertGuidedStudent(final);
  for (const socket of [teacherSocket, replacement]) {
    socket.send(JSON.stringify({ type: 'flip-card', stageId: 'guided-speaking', componentId: 'guided-speaking-role-cards',
      expectedVersion: final.state.version }));
    const rejected = await socket.next('action-error');
    assert.match(rejected.error, /не поддерживает/);
    assert.equal(rejected.state.version, final.state.version);
  }
  final = await sendTeacher({ type: 'select-stage', stageId: 'wrap-up', expectedVersion: final.state.version });
  const wrapUp = final.lesson.content.stages.find(stage => stage.id === 'wrap-up');
  assert.deepEqual(wrapUp.content.map(component => component.type), ['threeTwoOne', 'selfAssessment', 'markdownCard']);
  assert.equal(JSON.stringify(wrapUp).includes('Signs of success'), false);
  const assessment = wrapUp.content.find(component => component.type === 'selfAssessment');
  await sendStudent({ stageId: 'wrap-up', type: 'select-assessment', componentId: assessment.id, selectedId: 'withHelp' });
  assert.equal(final.state.selfAssessments[assessment.id], 'withHelp');
  final = await sendTeacher({ stageId: 'wrap-up', type: 'select-assessment', componentId: assessment.id,
    selectedId: 'independent', expectedVersion: final.state.version });
  assert.equal(final.state.selfAssessments[assessment.id], 'independent');
  const exerciseProgress = structuredClone(final.state.exercises);
  final = await sendTeacher({ type: 'select-stage', stageId: 'lead-in', expectedVersion: final.state.version });
  final = await sendTeacher({ type: 'select-stage', stageId: 'target-vocabulary', expectedVersion: final.state.version });
  assert.deepEqual(final.state.exercises, exerciseProgress);
  sockets.forEach(socket => socket.terminate());
  await stop();
  await start();
  const restored = connect('student', cookie);
  const snapshot = await restored.next('snapshot');
  assert.deepEqual(snapshot.state, final.state);
  assertGuidedStudent(snapshot);
  assert.equal(JSON.stringify(snapshot.lesson.content.stages[2].content), layoutBefore);
  assert.ok(snapshot.lesson.content.stages[1].content.some(c => c.id === answersId));
  const restoredListening = snapshot.lesson.content.stages.find(stage => stage.id === 'listening');
  assert.equal(restoredListening.content.find(component => component.id === audio.id).presentation.script, sourceAudio.script);
  assert.equal(Object.hasOwn(restoredListening.content.find(component => component.id === otherAudio.id).presentation, 'script'), false);
  const access = authorizeClass({ headers: { cookie } }, lesson.id, db, 'student');
  assert.throws(() => applyAction(access, { ...action, expectedVersion: 2, stageId: 'lead-in' }, db), { statusCode: 409 });
  const reordered = structuredClone(content);
  reordered.stages.reverse();
  db.prepare('UPDATE classes SET content_json = ? WHERE id = ?').run(JSON.stringify(reordered), otherLesson.id);
  const otherAccess = { role: 'teacher', classId: otherLesson.id, ownerId: teacher.id };
  assert.equal(sessionPayload(otherAccess, db).state.activeStageId, 'wrap-up');
  applyAction(otherAccess, { type: 'select-stage', stageId: 'warm-up', expectedVersion: 0 }, db);
  const reorderedState = applyAction({ ...otherAccess, role: 'student' }, { ...action, expectedVersion: 1 }, db);
  assert.equal(reorderedState.selections[choice.id][choice.items[0].id], action.optionId);
  db.prepare("UPDATE classes SET status = 'completed' WHERE id = ?").run(lesson.id);
  assert.equal(authorizeClass({ headers: { cookie } }, lesson.id, db, 'student'), null);
  assert.throws(() => joinClass({ headers: {} }, lesson.invitePath.split('/').at(-1), db), { statusCode: 404 });
});
