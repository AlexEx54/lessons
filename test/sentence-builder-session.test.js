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
const { createSentenceBuilderExample } = require('../lib/sentence-builder-example.js');
const { applyAction, readState, sessionPayload } = require('../lib/class-session-store.js');

test('sentence builder shares progress, persists completion after reopen and resets without reshuffling', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sentence-builder-session-'));
  const databasePath = path.join(directory, 'app.sqlite');
  let db = openDatabase(databasePath);
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const teacher = createUser({ email: 'builder@test.local', displayName: 'Teacher', passwordHash: 'unused' }, db);
  const content = createSyntheticLesson('Grammar', { template: 'template-2' });
  content.stages[7].content.splice(1, 0, createSentenceBuilderExample());
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(content));
  const lesson = createClass({ name: 'Grammar', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID() }, teacher.id, db);
  const access = { role: 'teacher', classId: lesson.id, ownerId: teacher.id }, student = { ...access, role: 'student' };
  let state = readState(lesson.id, db);
  const select = stageId => { state = applyAction(access, { type: 'select-stage', stageId, expectedVersion: state.version }, db); };
  const projected = role => sessionPayload(role, db).lesson.content.stages[7].content.find(item => item.type === 'sentenceBuilder').presentation;
  const task = projected(student);
  assert.equal(JSON.stringify(task).includes('acceptedOrders'), false);
  const action = (type, itemId = task.items[0].id) => ({ type, itemId, stageId: 'wrap-up', componentId: task.id, actionId: crypto.randomUUID(), expectedVersion: state.version });
  assert.throws(() => applyAction(student, action('request-hint'), db), { statusCode: 409 });
  select('wrap-up');
  state = applyAction(student, action('request-hint'), db);
  assert.equal(state.exercises[task.id].items[task.items[0].id].hintsUsed, 1);
  assert.throws(() => applyAction(student, { ...action('request-hint'), expectedVersion: state.version - 1 }, db), { statusCode: 409 });
  select('warm-up'); select('wrap-up');
  db.close(); db = openDatabase(databasePath);
  assert.deepEqual(readState(lesson.id, db), state);
  assert.deepEqual(projected(student), task);
  assert.deepEqual(projected(access), task);
  for (const item of task.items) {
    while ((state.exercises[task.id].items?.[item.id]?.placedIds.length || 0) < item.tokens.length) {
      state = applyAction(student, action('request-hint', item.id), db);
    }
    state = applyAction(access, action('check-sentence', item.id), db);
    state = applyAction(student, action('next-sentence', item.id), db);
  }
  assert.equal(state.exercises[task.id].completed, true);
  assert.deepEqual(sessionPayload(student, db).state.exercises, sessionPayload(access, db).state.exercises);
  db.close(); db = openDatabase(databasePath);
  assert.deepEqual(readState(lesson.id, db), state);
  state = applyAction(access, { type: 'reset-stage', stageId: 'wrap-up', expectedVersion: state.version }, db);
  assert.equal(state.exercises[task.id], undefined);
  assert.deepEqual(projected(student), task);
});
