'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { rank } = require('../assets/class-plan.js');

const grammar = [
  { key: 'to-be', level: 'A1' },
  { key: 'present-simple', level: 'A1' },
  { key: 'past-simple', level: 'A2' },
  { key: 'going-to', level: 'A2' },
  { key: 'will', level: 'A2' },
  { key: 'first-conditional', level: 'B1' },
];
const lesson = (id, grammarPoint, age = '12-14', level = grammar.find(point => point.key === grammarPoint)?.level) =>
  ({ id, level, age, grammar_point: grammarPoint });
const held = (lessonItem, at) => ({ library_lesson_id: lessonItem.id, grammar_point: lessonItem.grammar_point, held: true, scheduled_at: at });
const planned = (lessonItem, at) => ({ ...held(lessonItem, at), held: false });
const a2Teens = { level: 'A2', age: '12-14' };
const ids = result => result.items.map(item => item.lesson.id);
const states = result => Object.fromEntries(result.items.map(item => [item.lesson.id, [item.state, item.at]]));

test('a new class starts at the first point of its level, ranked by level and age', () => {
  const lessons = [
    lesson('b1-conditional', 'first-conditional'),
    lesson('a2-will', 'will'),
    lesson('a2-chat', null, '12-14', 'A2'),
    lesson('a1-to-be', 'to-be'),
    lesson('a2-past-kids', 'past-simple', '9-11'),
    lesson('a2-going-to', 'going-to'),
    lesson('a2-past', 'past-simple'),
  ];
  const result = rank({ lessons, grammar, profile: a2Teens, history: [] });
  assert.equal(result.nextPoint.key, 'past-simple');
  // Own age before other ages; then the level without grammar; then neighbouring levels, the lower one first.
  assert.deepEqual(ids(result), ['a2-past', 'a2-going-to', 'a2-will', 'a2-past-kids', 'a2-chat', 'a1-to-be', 'b1-conditional']);
  assert.deepEqual(result.items.filter(item => item.state === 'next').map(item => item.lesson.id), ['a2-past']);
});

test('the next point fills a gap rather than following the last session', () => {
  const past = lesson('a2-past', 'past-simple'), goingTo = lesson('a2-going-to', 'going-to'), will = lesson('a2-will', 'will');
  const history = [held(will, '2026-11-20T10:00:00.000Z'), held(past, '2026-11-01T10:00:00.000Z')];
  const result = rank({ lessons: [past, goingTo, will], grammar, profile: a2Teens, history });
  assert.equal(result.nextPoint.key, 'going-to');
  assert.deepEqual(ids(result), ['a2-going-to', 'a2-past', 'a2-will']);
});

test('a planned session covers its point, and another lesson on a covered point comes after the level', () => {
  const past = lesson('a2-past', 'past-simple'), pastAgain = lesson('a2-past-2', 'past-simple');
  const goingTo = lesson('a2-going-to', 'going-to'), chat = lesson('a2-chat', null, '12-14', 'A2');
  const history = [planned(past, '2026-12-01T10:00:00.000Z')];
  const result = rank({ lessons: [past, pastAgain, goingTo, chat], grammar, profile: a2Teens, history });
  assert.equal(result.nextPoint.key, 'going-to');
  assert.deepEqual(ids(result), ['a2-going-to', 'a2-chat', 'a2-past-2', 'a2-past']);
  assert.deepEqual(states(result)['a2-past'], ['planned', '2026-12-01T10:00:00.000Z']);
});

test('the next point needs a lesson for the class age, falling back to other ages when none is left', () => {
  const pastKids = lesson('a2-past-kids', 'past-simple', '9-11'), goingTo = lesson('a2-going-to', 'going-to');
  const result = rank({ lessons: [pastKids, goingTo], grammar, profile: a2Teens, history: [] });
  assert.equal(result.nextPoint.key, 'going-to');
  assert.deepEqual(ids(result), ['a2-going-to', 'a2-past-kids']);

  const kidsOnly = rank({ lessons: [goingTo, pastKids, lesson('a2-will-adults', 'will', 'adults')], grammar, profile: a2Teens,
    history: [held(goingTo, '2026-11-01T10:00:00.000Z')] });
  assert.equal(kidsOnly.nextPoint.key, 'past-simple');
  assert.deepEqual(ids(kidsOnly), ['a2-past-kids', 'a2-will-adults', 'a2-going-to']);
  assert.deepEqual(kidsOnly.items.map(item => item.state), ['next', null, 'held']);
});

test('a repeated lesson shows its latest held date, and a planned repeat wins over held ones', () => {
  const past = lesson('a2-past', 'past-simple'), will = lesson('a2-will', 'will');
  const history = [
    planned(will, '2026-12-08T10:00:00.000Z'), planned(will, '2026-12-01T10:00:00.000Z'), held(will, '2026-11-20T10:00:00.000Z'),
    held(past, '2026-11-10T10:00:00.000Z'), held(past, '2026-10-01T10:00:00.000Z'),
  ];
  const result = rank({ lessons: [past, will], grammar, profile: a2Teens, history });
  assert.deepEqual(states(result), {
    'a2-past': ['held', '2026-11-10T10:00:00.000Z'],
    'a2-will': ['planned', '2026-12-01T10:00:00.000Z'],
  });
});

test('a class whose level is gone through has no next point', () => {
  const lessons = ['past-simple', 'going-to', 'will'].map(key => lesson(`a2-${key}`, key));
  const history = lessons.map(item => held(item, '2026-11-01T10:00:00.000Z'));
  const result = rank({ lessons: [...lessons, lesson('b1-conditional', 'first-conditional')], grammar, profile: a2Teens, history });
  assert.equal(result.nextPoint, null);
  assert.deepEqual(ids(result), ['b1-conditional', 'a2-past-simple', 'a2-going-to', 'a2-will']);
});

test('a class without a level and age keeps the library order and gets only the marks', () => {
  const lessons = [lesson('b1-conditional', 'first-conditional'), lesson('a2-past', 'past-simple'), lesson('a1-to-be', 'to-be')];
  const history = [held(lessons[0], '2026-11-01T10:00:00.000Z'), { library_lesson_id: null, grammar_point: null, held: true, scheduled_at: '2026-10-01T10:00:00.000Z' }];
  for (const profile of [{ level: null, age: null }, { level: 'A2', age: null }]) {
    const result = rank({ lessons, grammar, profile, history });
    assert.equal(result.nextPoint, null);
    assert.deepEqual(ids(result), ['a2-past', 'a1-to-be', 'b1-conditional']);
    assert.deepEqual(result.items.map(item => item.state), [null, null, 'held']);
  }
});

test('a lesson on a point of another level belongs to the point level', () => {
  // An A1 point taught with an A2 lesson is not an A2 lesson for the program.
  const result = rank({ lessons: [lesson('to-be-a2', 'to-be', '12-14', 'A2'), lesson('a2-past', 'past-simple')], grammar, profile: a2Teens, history: [] });
  assert.deepEqual(ids(result), ['a2-past', 'to-be-a2']);
});
