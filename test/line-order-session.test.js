'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createClassSession } = require('../lib/class-store.js');
const { syntheticLesson } = require('./helpers/synthetic-lessons.js');
const { applyAction, readState, sessionPayload } = require('../lib/class-live-store.js');

const exercise = {
  type: 'lineOrder', id: 'warm-up-order', title: 'Tom’s trip', instruction: 'Put the events in order.', look: 'story',
  lines: [
    { id: 'alarm', text: 'Tom’s alarm didn’t go off.' }, { id: 'packed', text: 'He packed in a hurry.' },
    { id: 'taxi', text: 'He took a taxi.' }, { id: 'missed', text: 'He missed the plane.' },
  ],
};

test('line order and locked lines persist across reopen; reset clears the progress but keeps the dealt order', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'line-order-session-'));
  const databasePath = path.join(directory, 'app.sqlite');
  let db = openDatabase(databasePath);
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const teacher = createUser({ email: 'order@test.local', displayName: 'Teacher', passwordHash: 'unused' }, db);
  const content = syntheticLesson('template-2');
  content.stages[0].content.push(exercise);
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(content));
  const lesson = createClassSession({ className: 'Stories', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00.000Z' }, teacher.id, db);
  const access = { role: 'teacher', sessionId: lesson.id, ownerId: teacher.id }, student = { ...access, role: 'student' };
  const presentation = access => sessionPayload(access, db).lesson.content.stages[0].content.find(item => item.type === 'lineOrder').presentation;
  const task = presentation(student);
  assert.deepEqual(presentation(access), task);
  assert.deepEqual(task.answerKey, ['alarm', 'packed', 'taxi', 'missed']);
  assert.notDeepEqual(task.lines.map(line => line.id), task.answerKey);
  assert.equal(sessionPayload(student, db).state._layouts, undefined);
  let state = readState(lesson.id, db);
  const act = (who, fields) => { state = applyAction(who, { stageId: 'warm-up', expectedVersion: state.version, ...fields }, db); };
  const move = (who, itemId, toIndex) => act(who, { type: 'move-line', componentId: exercise.id, itemId, toIndex });
  // Both participants arrange alarm · missed · taxi · packed, so the check locks alarm and taxi.
  ['alarm', 'missed', 'taxi', 'packed'].forEach((id, index) => move(index % 2 ? access : student, id, index));
  act(access, { type: 'check-order', componentId: exercise.id, checkId: crypto.randomUUID() });
  const progress = state.exercises[exercise.id];
  assert.deepEqual(progress.order, ['alarm', 'missed', 'taxi', 'packed']);
  assert.deepEqual(progress.locked, ['alarm', 'taxi']);
  assert.deepEqual([progress.check.sequence, progress.check.correct], [1, 2]);
  assert.throws(() => move(student, 'alarm', 1), { statusCode: 400 });
  db.close(); db = openDatabase(databasePath);
  assert.deepEqual(readState(lesson.id, db), state);
  assert.deepEqual(sessionPayload(student, db).state.exercises, sessionPayload(access, db).state.exercises);
  assert.deepEqual(presentation(student), task);
  task.answerKey.filter(id => !progress.locked.includes(id)).forEach((id, index) => move(student, id, index));
  act(student, { type: 'check-order', componentId: exercise.id });
  assert.deepEqual(state.exercises[exercise.id].locked, task.answerKey);
  act(access, { type: 'reset-stage' });
  assert.equal(readState(lesson.id, db).exercises[exercise.id], undefined);
  assert.deepEqual(presentation(student), task);
});
