'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createClass } = require('../lib/class-store.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { applyAction, readState, sessionPayload } = require('../lib/class-session-store.js');

test('matching selection, order and pairs persist across reopen and stage changes; reset keeps initial layout', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'matching-session-'));
  const databasePath = path.join(directory, 'app.sqlite');
  let db = openDatabase(databasePath);
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const teacher = createUser({ email: 'matching@test.local', displayName: 'Teacher', passwordHash: 'unused' }, db);
  const content = createSyntheticLesson('Grammar', { template: 'template-2' });
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(content));
  const lesson = createClass({ name: 'Grammar', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID() }, teacher.id, db);
  const access = { role: 'teacher', classId: lesson.id, ownerId: teacher.id }, student = { ...access, role: 'student' };
  let state = readState(lesson.id, db);
  const select = stageId => { state = applyAction(access, { type: 'select-stage', stageId, expectedVersion: state.version }, db); };
  const task = sessionPayload(student, db).lesson.content.stages[5].content.at(-1).presentation;
  const action = { type: 'match-word', stageId: 'grammar-focus', componentId: task.id,
    itemId: task.items[2].id, targetId: task.answerKey[task.items[2].id], attemptId: crypto.randomUUID() };
  assert.throws(() => applyAction(student, { ...action, expectedVersion: state.version }, db), { statusCode: 409 });
  select('grammar-focus');
  state = applyAction(student, { ...action, expectedVersion: state.version }, db);
  assert.equal(state.exercises[task.id].rightOrder[2], action.targetId);
  assert.throws(() => applyAction(student, { ...action, expectedVersion: state.version - 1 }, db), { statusCode: 409 });
  state = applyAction(access, { type: 'select-word', stageId: 'grammar-focus', componentId: task.id,
    itemId: task.items[0].id, expectedVersion: state.version }, db);
  select('warm-up'); select('grammar-focus');
  db.close(); db = openDatabase(databasePath);
  assert.deepEqual(readState(lesson.id, db), state);
  const learner = sessionPayload(student, db), tutor = sessionPayload(access, db);
  assert.deepEqual(learner.state.exercises, tutor.state.exercises);
  assert.deepEqual(learner.lesson.content.stages[5].content.at(-1).presentation, task);
  assert.deepEqual(tutor.lesson.content.stages[5].content.at(-1).presentation, task);
  state = applyAction(access, { type: 'reset-stage', stageId: 'grammar-focus', expectedVersion: state.version }, db);
  assert.equal(readState(lesson.id, db).exercises[task.id], undefined);
  assert.deepEqual(sessionPayload(student, db).lesson.content.stages[5].content.at(-1).presentation, task);
});
