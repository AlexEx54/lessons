'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const { createLessonDraft, findLessonDraft, findLessonDraftTemplate } = require('../lib/lesson-draft-store.js');
const {
  copyLessonTemplate,
  deleteLessonTemplate,
  findLessonTemplate,
  listLessonTemplates,
  updateLessonTemplate,
} = require('../lib/lesson-template-store.js');
const { findSystemTemplate } = require('../lib/lesson-templates/system-templates.js');
const { createUser } = require('../lib/user-store.js');

const TEMPLATE_TWO_DEFINITION = findSystemTemplate('template-2').definition;

function setup(t) {
  const database = openDatabase(':memory:');
  t.after(() => database.close());
  const admin = createUser({ email: 'admin@example.com', displayName: 'Admin', passwordHash: 'unused', role: 'admin' }, database);
  return { database, admin };
}

const statusOf = statusCode => error => error.statusCode === statusCode;

test('templates list the system ones first, then copies from the newest', t => {
  const { database, admin } = setup(t);
  assert.deepEqual(listLessonTemplates(database).map(({ id, system }) => ({ id, system })), [
    { id: 'template-1', system: true },
    { id: 'template-2', system: true },
  ]);

  const first = copyLessonTemplate({ id: 'template-2', createdBy: admin.id }, database);
  const second = copyLessonTemplate({ id: first.id, title: '  Для младших  ', createdBy: admin.id }, database);
  database.prepare('UPDATE lesson_templates SET created_at = ? WHERE id = ?').run('2026-01-01T00:00:00.000Z', first.id);
  assert.deepEqual(listLessonTemplates(database).map(template => template.title), ['Шаблон 1', 'Шаблон 2', 'Для младших', 'Шаблон 2 (копия)']);
  assert.deepEqual(second, {
    id: second.id,
    title: 'Для младших',
    description: TEMPLATE_TWO_DEFINITION.description,
    system: false,
    sourceTemplateId: first.id,
    systemTemplateId: 'template-2',
    createdBy: { id: admin.id, name: 'Admin' },
    revision: 0,
    createdAt: second.createdAt,
    updatedAt: second.createdAt,
  });
});

test('a copy carries the source definition under its own id and title', t => {
  const { database, admin } = setup(t);
  const copy = copyLessonTemplate({ id: 'template-2', createdBy: admin.id }, database);
  const { definition } = findLessonTemplate(copy.id, database);
  assert.deepEqual(definition, { ...TEMPLATE_TWO_DEFINITION, id: copy.id, title: 'Шаблон 2 (копия)' });
  assert.equal(findLessonTemplate('template-1', database).definition, findSystemTemplate('template-1').definition);
  assert.equal(findLessonTemplate('missing', database), null);

  assert.throws(() => copyLessonTemplate({ id: 'missing', createdBy: admin.id }, database), statusOf(404));
  assert.throws(() => copyLessonTemplate({ id: 'template-2', title: ' ', createdBy: admin.id }, database), statusOf(400));
  assert.throws(() => copyLessonTemplate({ id: 'template-2', title: 'x'.repeat(81), createdBy: admin.id }, database), statusOf(400));
});

test('renaming a copy checks the revision and updates the definition too', t => {
  const { database, admin } = setup(t);
  const copy = copyLessonTemplate({ id: 'template-2', createdBy: admin.id }, database);

  const renamed = updateLessonTemplate({ id: copy.id, revision: 0, title: 'Путешествия', description: ' Для 9–11 ' }, database);
  assert.equal(renamed.revision, 1);
  assert.equal(renamed.description, 'Для 9–11');
  const { definition } = findLessonTemplate(copy.id, database);
  assert.equal(definition.title, 'Путешествия');
  assert.equal(definition.description, 'Для 9–11');

  assert.throws(() => updateLessonTemplate({ id: copy.id, revision: 0, title: 'Позже' }, database), statusOf(409));
  assert.throws(() => updateLessonTemplate({ id: copy.id, title: 'Без версии' }, database), statusOf(400));
  assert.throws(() => updateLessonTemplate({ id: copy.id, revision: 1, description: 7 }, database), statusOf(400));
  assert.throws(() => updateLessonTemplate({ id: 'template-2', revision: 0, title: 'Мой' }, database), statusOf(403));
  assert.throws(() => updateLessonTemplate({ id: 'missing', revision: 0, title: 'Мой' }, database), statusOf(404));
  assert.equal(findLessonTemplate(copy.id, database).title, 'Путешествия');
});

test('saving a definition validates it and keeps the id and title of the copy', t => {
  const { database, admin } = setup(t);
  const copy = copyLessonTemplate({ id: 'template-2', title: 'Путешествия', createdBy: admin.id }, database);
  const { definition } = findLessonTemplate(copy.id, database);
  const stories = definition.stages.flatMap(stage => stage.blocks).find(block => block.control === 'storyCards');

  stories.params = { ...stories.params, stories: 3 };
  const saved = updateLessonTemplate({ id: copy.id, revision: 0, definition: { ...definition, id: 'other', title: 'Чужой' } }, database);
  assert.equal(saved.revision, 1);
  assert.equal(saved.title, 'Путешествия');
  const stored = findLessonTemplate(copy.id, database).definition;
  assert.equal(stored.id, copy.id);
  assert.equal(stored.title, 'Путешествия');
  assert.equal(stored.stages.flatMap(stage => stage.blocks).find(block => block.id === stories.id).params.stories, 3);

  stories.params = { ...stories.params, minWords: 90, maxWords: 50 };
  assert.throws(() => updateLessonTemplate({ id: copy.id, revision: 1, definition }, database), error => {
    assert.equal(error.statusCode, 400);
    assert.deepEqual(error.errors, [{
      stage: 'target-vocabulary',
      block: stories.id,
      param: 'minWords',
      detail: 'больше, чем «Слов в истории: до»',
      message: `Блок ${stories.id}: «Слов в истории: от» больше, чем «Слов в истории: до».`,
    }]);
    return true;
  });
  assert.equal(findLessonTemplate(copy.id, database).revision, 1);
});

test('a deleted copy leaves its drafts working from their snapshots', t => {
  const { database, admin } = setup(t);
  const copy = copyLessonTemplate({ id: 'template-2', title: 'Путешествия', createdBy: admin.id }, database);
  const { definition } = findLessonTemplate(copy.id, database);
  const draft = createLessonDraft({
    ownerAdminId: admin.id, topic: 'Travel', template: copy.id, templateSnapshot: definition,
  }, database);
  assert.equal(draft.templateTitle, 'Путешествия');
  assert.equal(Object.hasOwn(draft, 'templateSnapshot'), false);

  assert.throws(() => deleteLessonTemplate('template-2', database), statusOf(403));
  deleteLessonTemplate(copy.id, database);
  assert.throws(() => deleteLessonTemplate(copy.id, database), statusOf(404));
  assert.equal(findLessonTemplate(copy.id, database), null);
  assert.deepEqual(findLessonDraftTemplate(draft.id, admin.id, database), definition);
  assert.equal(findLessonDraft(draft.id, admin.id, database).templateTitle, 'Путешествия');
});

test('drafts without a snapshot fall back to the system template', t => {
  const { database, admin } = setup(t);
  const templateTwo = createLessonDraft({ ownerAdminId: admin.id, topic: 'Travel', template: 'template-2' }, database);
  const templateOne = createLessonDraft({ ownerAdminId: admin.id, topic: 'Travel', template: 'template-1' }, database);
  assert.equal(findLessonDraftTemplate(templateTwo.id, admin.id, database), TEMPLATE_TWO_DEFINITION);
  assert.equal(findLessonDraftTemplate(templateOne.id, admin.id, database), findSystemTemplate('template-1').definition);
  assert.equal(templateTwo.templateTitle, 'Шаблон 2');
  assert.equal(templateOne.templateTitle, 'Шаблон 1');
});
