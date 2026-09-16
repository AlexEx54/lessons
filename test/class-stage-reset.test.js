'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const crypto = require('node:crypto');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createClass } = require('../lib/class-store.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { applyAction, readState } = require('../lib/class-session-store.js');
const { collectComponents } = require('../assets/components/component-tree.js');

test('reset each stage persists cleared component state, preserves other stages/layouts and enforces access', t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const teacher = createUser({ email: 'reset@test.local', displayName: 'Reset test', passwordHash: 'unused' }, db);
  const content = createSyntheticLesson('Reset test');
  const row = content.stages.find(stage => stage.id === 'grammar-focus').content.find(item => item.type === 'cardRow');
  row.items[0].studentVisibility = 'controlled';
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(content));
  const lesson = createClass({ name: 'Reset test', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID() }, teacher.id, db);
  const access = { role: 'teacher', classId: lesson.id, ownerId: teacher.id };
  const exerciseTypes = new Set(['dragWordsInText', 'matchWords', 'dropdownChoice', 'fillInBlanks', 'describeAndGuess', 'multipleChoice', 'checkboxChoice', 'gapFill', 'miniSituation']);
  const keys = component => [
    ...(exerciseTypes.has(component.type) ? ['exercises'] : []),
    ...(component.type === 'thisOrThat' ? ['selections'] : []),
    ...(component.type === 'selfAssessment' ? ['selfAssessments'] : []),
    ...(['markdownCard', 'audioPlayer', 'describeAndGuess'].includes(component.type) ? ['visibleCards'] : []),
  ];
  const save = state => db.prepare('INSERT OR REPLACE INTO class_live_state VALUES (?, ?)').run(lesson.id, JSON.stringify(state));
  const persisted = () => JSON.parse(db.prepare('SELECT state_json FROM class_live_state WHERE class_id = ?').get(lesson.id).state_json);
  for (const stage of content.stages) {
    const seeded = { ...readState(lesson.id, db), activeStageId: stage.id, selections: {}, exercises: {}, visibleCards: {}, selfAssessments: {} };
    for (const component of collectComponents(content.stages)) {
      for (const key of keys(component)) seeded[key][component.id] = key === 'visibleCards' ? true : { marker: component.id };
    }
    save(seeded);
    const action = { type: 'reset-stage', stageId: stage.id, expectedVersion: seeded.version };
    assert.throws(() => applyAction({ ...access, role: 'student' }, action, db), { statusCode: 403 });
    assert.throws(() => applyAction(access, { ...action, stageId: 'missing' }, db), { statusCode: 409 });
    assert.throws(() => applyAction(access, { ...action, expectedVersion: seeded.version - 1 }, db), { statusCode: 409 });
    assert.deepEqual(persisted(), seeded);
    const expected = structuredClone(seeded);
    for (const component of collectComponents([stage])) for (const key of keys(component)) delete expected[key][component.id];
    expected.version++;
    assert.deepEqual(applyAction(access, action, db), expected, stage.id);
    assert.deepEqual(persisted(), expected, `${stage.id}: database`);
    assert.deepEqual(readState(lesson.id, db), expected, `${stage.id}: reload`);
    expected.version++;
    assert.deepEqual(applyAction(access, { ...action, expectedVersion: expected.version - 1 }, db), expected, `${stage.id}: repeat`);
  }
});
