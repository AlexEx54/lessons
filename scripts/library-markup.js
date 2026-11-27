#!/usr/bin/env node
'use strict';
// One-off markup of the library lessons published before the grammar program existed: sets the
// grammar point, topic and season of each lesson listed below. Prints the plan by default; --apply
// writes it. Lessons that already have any of the three fields are left as they are, so a later
// run never overwrites what an admin set from the card menu.
// node scripts/library-markup.js /var/lib/teach_platform/app.sqlite [--apply]

const fs = require('node:fs');
const path = require('node:path');
const { openDatabase } = require('../lib/db.js');
const { grammarTitle, isGrammarPoint, isSeason, seasonLabel } = require('../lib/lesson-program.js');

// Lesson id → [grammar point, topic, season].
const MARKUP = new Map([
  ['d0b891ae-395c-4c68-8d27-e8f040f76b83', ['to-be', 'Страны и национальности', null]],
  ['8208aa03-c2f9-4922-8c09-46d995a996ea', ['have-got', 'Одежда и внешность', null]],
  ['65acf990-9c16-4aa4-a3f2-110504e13a12', ['there-is-are', 'Любимые места', null]],
  ['09c11e1c-6d6b-4d9c-9e61-619fed8cc65e', ['prepositions-place', 'Комната и мебель', null]],
  ['3cc4fb69-d2bc-4fac-8914-357811a203a4', ['present-simple', 'Распорядок дня', null]],
  ['ea580c11-9574-4101-b74c-e6d346e49207', ['adverbs-frequency', 'Школа и друзья', null]],
  ['782376ba-29af-412b-b134-db5b69efbfa6', ['prepositions-time', 'Даты и праздники', null]],
  ['cc135191-492f-4fb9-bc27-354b2e45430c', ['was-were', 'Странный день', null]],
  ['a72c181f-77f1-44ec-93e5-2fadd3e601be', ['past-simple-regular', 'Летние каникулы', 'back-to-school']],
  ['78494b6c-7635-440a-a734-29a31dd2f20d', ['past-simple-irregular', 'Неожиданные события', null]],
  ['5735e153-6a59-483f-a168-37ddf784a2a5', ['past-simple-irregular', 'Приключения', null]],
  ['049eab5d-0b69-41e2-956f-e4ef9ccc0e2b', ['past-continuous', 'Школьная ярмарка', null]],
  ['752b67a9-3e86-473e-b499-412f00243f02', ['past-simple-continuous', 'Сказки и истории', null]],
  ['9da0c944-161e-49cd-9f55-5ea43d90e82d', ['past-simple-continuous', 'Истории по фотографиям', null]],
  ['5328c114-e6e8-4f93-a5b4-6da54b0e5ab3', ['past-simple-continuous', 'Страшные истории', 'halloween']],
  ['312c0bd8-4e46-426d-9cef-0dc575f8e87c', ['present-simple-third-person', 'Домашние дела', null]],
  ['774b9fba-d955-47ea-93cf-2f4af8ada72c', ['present-simple-third-person', 'Выходные и свободное время', null]],
  ['9b7f3afb-9e34-44ed-bb14-b4e9f8f6290b', ['present-continuous', 'Отпуск и путешествия', null]],
  ['f04301df-37c8-420e-ac53-c022867cbf3f', ['present-simple-continuous', 'Хобби и развлечения', null]],
  ['cba9f742-2ec7-4dcf-9cbe-70b366ef1550', ['will-future', 'Хэллоуин и выживание', 'halloween']],
  ['ca5a9f48-e3fe-4b8a-bdad-5a9e58236e3b', ['articles', 'Профессии и карьера', null]],
  ['4a1ce96c-1514-4c5a-b5c7-c50d748377f6', ['possessive-pronouns', 'Семья и традиции', null]],
  ['479f58c0-a0cd-4322-a6c2-855762c3fb77', ['present-perfect-experience', 'Жизненный опыт', null]],
  ['4092ecbc-6f85-406e-94e6-9a619e311be0', ['used-to', 'Поколения: тогда и сейчас', null]],
  ['81acc876-7008-4b14-8947-dd47b5907520', ['zero-conditional', 'Мифы и факты', null]],
  ['baf814ba-8af4-453d-9739-5ee8426a313e', ['future-forms', 'Парк развлечений', null]],
  ['68ee15e5-ed86-4462-9c96-778586d5b23c', ['state-action-verbs', 'Отношения', null]],
  ['22f33768-b233-4462-bd85-dbf1b17b38ed', ['present-perfect-continuous', 'Игры и киберспорт', null]],
  ['806b5116-c91a-46a4-81af-31d5c9214e0f', ['first-conditional', 'Космос', null]],
  ['a5bb170c-d9a1-4c8c-b9ce-b12ad6e56767', ['used-to-would', 'Привычки', null]],
  ['f767df66-7cdc-4165-900a-33012ecccbd1', ['mixed-conditionals', 'Глобальные проблемы', null]],
  ['953d12d9-4085-4f3d-9d51-eb5ef53bef1e', ['wish-if-only', 'Мода и дизайн', null]],
  ['e02d6e58-9e7c-42e8-951b-8a1b77006f2a', ['modals-deduction-past', 'Детективы и преступления', null]],
  ['6366cb91-a689-4f0a-8b71-64daa9d5b0bd', ['impersonal-passive', 'Ложь и фейковые новости', null]],
]);

for (const [id, [grammarPoint, topic, season]] of MARKUP) {
  if (!isGrammarPoint(grammarPoint) || !topic || topic.length > 60 || (season !== null && !isSeason(season))) {
    throw new Error(`Некорректная разметка урока ${id}.`);
  }
}

// Every published lesson with what will happen to it, and the listed lessons the database lacks.
function planMarkup(database) {
  const lessons = database.prepare(`SELECT id, title, level, age, grammar_point, topic, season FROM library_lessons
    WHERE is_published = 1 ORDER BY level, title`).all();
  const plan = lessons.map(lesson => {
    const markup = MARKUP.get(lesson.id);
    const marked = lesson.grammar_point !== null || lesson.topic !== null || lesson.season !== null;
    const status = !markup ? 'unlisted' : marked ? 'marked' : 'write';
    const [grammarPoint, topic, season] = markup || [];
    return { ...lesson, status, grammarPoint, newTopic: topic, newSeason: season };
  });
  const missing = [...MARKUP.keys()].filter(id => !lessons.some(lesson => lesson.id === id));
  return { plan, missing };
}

function applyMarkup(database, plan) {
  const update = database.prepare(`UPDATE library_lessons SET grammar_point = ?, topic = ?, season = ?, updated_at = ?
    WHERE id = ? AND is_published = 1 AND grammar_point IS NULL AND topic IS NULL AND season IS NULL`);
  const now = new Date().toISOString();
  let written = 0;
  database.exec('BEGIN IMMEDIATE');
  try {
    for (const row of plan.filter(row => row.status === 'write')) {
      written += update.run(row.grammarPoint, row.newTopic, row.newSeason, now, row.id).changes;
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return written;
}

const STATUS = { write: '', marked: '  [уже размечен — пропуск]', unlisted: '  [нет в разметке]' };

function report({ plan, missing }) {
  const lines = plan.map(row => {
    const target = row.status === 'unlisted' ? '' : `${grammarTitle(row.grammarPoint)} · ${row.newTopic}${row.newSeason ? ` · ${seasonLabel(row.newSeason)}` : ''}`;
    return `${row.level} ${row.age.padEnd(6)} ${row.title}\n    → ${target}${STATUS[row.status]}`;
  });
  for (const id of missing) lines.push(`?? ${id}\n    → нет в базе`);
  const count = status => plan.filter(row => row.status === status).length;
  lines.push('', `Записать: ${count('write')}, уже размечены: ${count('marked')}, нет в разметке: ${count('unlisted')}, нет в базе: ${missing.length}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const [databasePath, ...rest] = args.filter(arg => arg !== '--apply');
  if (!databasePath || rest.length) throw new Error('Использование: node scripts/library-markup.js <app.sqlite> [--apply]');
  if (!fs.existsSync(databasePath)) throw new Error(`Нет базы ${databasePath}.`);

  const database = openDatabase(path.resolve(databasePath));
  try {
    const markup = planMarkup(database);
    process.stdout.write(report(markup));
    if (apply) process.stdout.write(`Записано уроков: ${applyMarkup(database, markup.plan)}\n`);
    else process.stdout.write('Пробный запуск, база не изменена. Для записи добавьте --apply.\n');
  } finally {
    database.close();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`Ошибка: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { MARKUP, planMarkup, applyMarkup };
