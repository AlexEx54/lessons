'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { addLibraryLesson } = require('./helpers/library.js');
const { planMarkup, applyMarkup } = require('../scripts/library-markup.js');

const FLAGS = 'd0b891ae-395c-4c68-8d27-e8f040f76b83';
const ZOMBIE = 'cba9f742-2ec7-4dcf-9cbe-70b366ef1550';
const ROOM = '09c11e1c-6d6b-4d9c-9e61-619fed8cc65e';

test('library markup fills only unmarked listed lessons', t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  for (const id of [FLAGS, ZOMBIE, ROOM, 'unlisted']) addLibraryLesson(db, { stages: [] }, id);
  db.prepare("UPDATE library_lessons SET topic = 'Своя тема' WHERE id = ?").run(ZOMBIE);
  db.prepare('UPDATE library_lessons SET is_published = 0 WHERE id = ?').run(ROOM);

  const markup = planMarkup(db);
  const status = Object.fromEntries(markup.plan.map(row => [row.id, row.status]));
  assert.deepEqual(status, { [FLAGS]: 'write', [ZOMBIE]: 'marked', unlisted: 'unlisted' });
  assert.ok(markup.missing.includes(ROOM));

  assert.equal(applyMarkup(db, markup.plan), 1);
  const fields = id => db.prepare('SELECT grammar_point, topic, season FROM library_lessons WHERE id = ?').get(id);
  assert.deepEqual({ ...fields(FLAGS) }, { grammar_point: 'to-be', topic: 'Страны и национальности', season: null });
  assert.deepEqual({ ...fields(ZOMBIE) }, { grammar_point: null, topic: 'Своя тема', season: null });
  assert.deepEqual({ ...fields('unlisted') }, { grammar_point: null, topic: null, season: null });
  assert.equal(planMarkup(db).plan.find(row => row.id === FLAGS).status, 'marked');
});
