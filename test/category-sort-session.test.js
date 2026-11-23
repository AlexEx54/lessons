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
  type: 'categorySort', id: 'warm-up-sort', title: 'How does -ed sound?', instruction: 'Sort the verbs by the sound of -ed.',
  categories: [{ id: 't', title: '/t/' }, { id: 'd', title: '/d/' }, { id: 'id', title: '/ɪd/' }],
  items: [
    { id: 'worked', text: 'worked', categoryId: 't' }, { id: 'played', text: 'played', categoryId: 'd' },
    { id: 'wanted', text: 'wanted', categoryId: 'id' }, { id: 'watched', text: 'watched', categoryId: 't' },
  ],
};

test('card order and sorted cards persist across reopen; reset clears the cards but keeps the order', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'category-sort-session-'));
  const databasePath = path.join(directory, 'app.sqlite');
  let db = openDatabase(databasePath);
  t.after(() => { db.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const teacher = createUser({ email: 'sort@test.local', displayName: 'Teacher', passwordHash: 'unused' }, db);
  const content = syntheticLesson('template-2');
  content.stages[0].content.push(exercise);
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(content));
  const lesson = createClassSession({ className: 'Sounds', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00.000Z' }, teacher.id, db);
  const access = { role: 'teacher', sessionId: lesson.id, ownerId: teacher.id }, student = { ...access, role: 'student' };
  const presentation = access => sessionPayload(access, db).lesson.content.stages[0].content.find(item => item.type === 'categorySort').presentation;
  const task = presentation(student);
  assert.deepEqual(presentation(access), task);
  assert.equal(sessionPayload(student, db).state._layouts, undefined);
  let state = readState(lesson.id, db);
  const act = (who, fields) => { state = applyAction(who, { stageId: 'warm-up', ...fields }, db); };
  const sort = (who, itemId, targetId) => act(who, { type: 'match-word', componentId: exercise.id, itemId, targetId, attemptId: crypto.randomUUID() });
  act(student, { type: 'select-word', componentId: exercise.id, itemId: 'wanted' });
  sort(student, 'wanted', 't');
  sort(access, 'worked', 't');
  sort(student, 'wanted', 'id');
  assert.deepEqual(state.exercises[exercise.id].placed, ['worked', 'wanted']);
  assert.throws(() => sort(student, 'worked', 't'), { statusCode: 409 });
  db.close(); db = openDatabase(databasePath);
  assert.deepEqual(readState(lesson.id, db), state);
  assert.deepEqual(sessionPayload(student, db).state.exercises, sessionPayload(access, db).state.exercises);
  assert.deepEqual(presentation(student), task);
  act(access, { type: 'reset-stage' });
  assert.equal(readState(lesson.id, db).exercises[exercise.id], undefined);
  assert.deepEqual(presentation(student), task);
});
