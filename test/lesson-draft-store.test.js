'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { openDatabase } = require('../lib/db.js');
const {
  completeLessonDraft,
  createLessonDraft,
  failLessonDraft,
  findLessonDraft,
  listLessonDrafts,
  publishLessonDraft,
  retryLessonDraft,
  updateTaskPrompt,
  updateTeacherNote,
} = require('../lib/lesson-draft-store.js');
const { createUser } = require('../lib/user-store.js');

function admin(database, suffix) {
  return createUser({
    email: `admin-${suffix}@example.com`,
    displayName: `Admin ${suffix}`,
    passwordHash: 'unused',
    role: 'admin',
  }, database);
}

test('lesson drafts are isolated by owner and sorted by latest update', () => {
  const database = openDatabase(':memory:');
  const firstAdmin = admin(database, 'one');
  const secondAdmin = admin(database, 'two');
  const older = createLessonDraft({ ownerAdminId: firstAdmin.id, topic: 'Older', template: 'template-1' }, database);
  const newer = createLessonDraft({ ownerAdminId: firstAdmin.id, topic: 'Newer', template: 'template-1' }, database);
  createLessonDraft({ ownerAdminId: secondAdmin.id, topic: 'Private', template: 'template-1' }, database);
  database.prepare('UPDATE lesson_drafts SET updated_at = ? WHERE id = ?')
    .run('2026-01-01T00:00:00.000Z', older.id);
  database.prepare('UPDATE lesson_drafts SET updated_at = ? WHERE id = ?')
    .run('2026-02-01T00:00:00.000Z', newer.id);

  assert.deepEqual(listLessonDrafts(firstAdmin.id, database).map(item => item.topic), ['Newer', 'Older']);
  assert.equal(findLessonDraft(older.id, secondAdmin.id, database), null);
  assert.equal(listLessonDrafts(secondAdmin.id, database).length, 1);
  database.close();
});

test('lesson draft lifecycle only allows the supported transitions', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'lifecycle');
  const readyDraft = createLessonDraft({ ownerAdminId: owner.id, topic: 'Ready', template: 'template-1' }, database);
  const ready = completeLessonDraft(readyDraft.id, owner.id, { meta: { title: 'Ready lesson' } }, database);
  assert.equal(ready.status, 'review');
  assert.deepEqual(ready.content, { meta: { title: 'Ready lesson' } });
  assert.throws(() => failLessonDraft(ready.id, owner.id, 'Late failure', database), /нельзя перевести/);
  const published = publishLessonDraft(ready.id, owner.id, database);
  assert.equal(published.status, 'published');
  assert.ok(published.publishedAt);

  const failedDraft = createLessonDraft({ ownerAdminId: owner.id, topic: 'Retry', template: 'template-1' }, database);
  assert.equal(failLessonDraft(failedDraft.id, owner.id, 'Provider error', database).status, 'failed');
  assert.equal(retryLessonDraft(failedDraft.id, owner.id, database).status, 'generating');
  assert.throws(() => retryLessonDraft(failedDraft.id, owner.id, database), /только для черновика с ошибкой/);
  database.close();
});

test('teacher note content can be updated only in an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'note-owner');
  const outsider = admin(database, 'note-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Notes', template: 'template-1' }, database);
  const lesson = {
    stages: [{
      id: 'warm-up',
      content: [{ type: 'teacherNote', id: 'note-1', text: 'Original' }],
    }],
  };
  const ready = completeLessonDraft(pending.id, owner.id, lesson, database);
  database.prepare('UPDATE lesson_drafts SET updated_at = ? WHERE id = ?')
    .run('2020-01-01T00:00:00.000Z', ready.id);

  const updated = updateTeacherNote({
    id: ready.id,
    ownerAdminId: owner.id,
    noteId: 'note-1',
    text: '  **Updated**\n\n- One\n- Two  ',
  }, database);
  assert.equal(updated.content.stages[0].content[0].text, '**Updated**\n\n- One\n- Two');
  assert.notEqual(updated.updatedAt, '2020-01-01T00:00:00.000Z');
  assert.throws(() => updateTeacherNote({
    id: ready.id, ownerAdminId: outsider.id, noteId: 'note-1', text: 'Foreign',
  }, database), /не найден/);
  assert.throws(() => updateTeacherNote({
    id: ready.id, ownerAdminId: owner.id, noteId: 'missing', text: 'Missing',
  }, database), /не найдена/);
  assert.throws(() => updateTeacherNote({
    id: ready.id, ownerAdminId: owner.id, noteId: 'note-1', text: '   ',
  }, database), /не может быть пустым/);

  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateTeacherNote({
    id: ready.id, ownerAdminId: owner.id, noteId: 'note-1', text: 'Too late',
  }, database), /только черновик на проверке/);
  database.close();
});

test('teacher note update rejects malformed content and duplicate component ids', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'invalid-notes');
  const malformedDraft = createLessonDraft({ ownerAdminId: owner.id, topic: 'Malformed', template: 'template-1' }, database);
  completeLessonDraft(malformedDraft.id, owner.id, { stages: [{ content: {} }] }, database);
  assert.throws(() => updateTeacherNote({
    id: malformedDraft.id, ownerAdminId: owner.id, noteId: 'note-1', text: 'Text',
  }, database), /повреждена/);

  const duplicateDraft = createLessonDraft({ ownerAdminId: owner.id, topic: 'Duplicate', template: 'template-1' }, database);
  completeLessonDraft(duplicateDraft.id, owner.id, {
    stages: [
      { content: [{ type: 'teacherNote', id: 'same-note', text: 'One' }] },
      { content: [{ type: 'teacherNote', id: 'same-note', text: 'Two' }] },
    ],
  }, database);
  assert.throws(() => updateTeacherNote({
    id: duplicateDraft.id, ownerAdminId: owner.id, noteId: 'same-note', text: 'Text',
  }, database), /несколько/);
  database.close();
});

test('task prompt fields and optional support can be updated in a review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'prompt-owner');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Prompts', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'taskPrompt', id: 'prompt-1', variant: 'followUp', title: 'Old', text: 'Original',
    }] }],
  }, database);

  const withSupport = updateTaskPrompt({
    id: ready.id,
    ownerAdminId: owner.id,
    promptId: 'prompt-1',
    title: ' Follow-up questions: ',
    text: ' **Why?** ',
    support: { title: ' Possible language: ', text: ' I think… ' },
  }, database);
  const updated = withSupport.content.stages[0].content[0];
  assert.deepEqual(updated, {
    type: 'taskPrompt',
    id: 'prompt-1',
    variant: 'followUp',
    title: 'Follow-up questions:',
    text: '**Why?**',
    support: { title: 'Possible language:', text: 'I think…' },
  });

  const withoutSupport = updateTaskPrompt({
    id: ready.id, ownerAdminId: owner.id, promptId: 'prompt-1', title: 'Next', text: 'Question', support: null,
  }, database);
  assert.equal(withoutSupport.content.stages[0].content[0].support, undefined);
  assert.throws(() => updateTaskPrompt({
    id: ready.id, ownerAdminId: owner.id, promptId: 'prompt-1', title: '', text: 'Question', support: null,
  }, database), /не могут быть пустыми/);
  assert.throws(() => updateTaskPrompt({
    id: ready.id,
    ownerAdminId: owner.id,
    promptId: 'prompt-1',
    title: 'Title',
    text: 'Question',
    support: { title: 'Support', text: '' },
  }, database), /дополнительной секции/);
  database.close();
});

test('task prompt update rejects missing, duplicate, and immutable draft targets', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'prompt-invalid');
  const outsider = admin(database, 'prompt-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Prompts', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [
      { content: [{ type: 'taskPrompt', id: 'same-prompt', variant: 'yourTurn', title: 'One', text: 'One' }] },
      { content: [{ type: 'taskPrompt', id: 'same-prompt', variant: 'followUp', title: 'Two', text: 'Two' }] },
    ],
  }, database);
  const changes = { title: 'Title', text: 'Text', support: null };
  assert.throws(() => updateTaskPrompt({
    id: ready.id, ownerAdminId: owner.id, promptId: 'missing', ...changes,
  }, database), /не найден/);
  assert.throws(() => updateTaskPrompt({
    id: ready.id, ownerAdminId: owner.id, promptId: 'same-prompt', ...changes,
  }, database), /несколько/);
  assert.throws(() => updateTaskPrompt({
    id: ready.id, ownerAdminId: outsider.id, promptId: 'same-prompt', ...changes,
  }, database), /не найден/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateTaskPrompt({
    id: ready.id, ownerAdminId: owner.id, promptId: 'same-prompt', ...changes,
  }, database), /только черновик на проверке/);
  database.close();
});

test('lesson draft schema enforces status, owner, and topic constraints', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'constraints');
  const teacher = createUser({
    email: 'teacher-constraints@example.com',
    displayName: 'Teacher',
    passwordHash: 'unused',
  }, database);
  const now = new Date().toISOString();
  assert.throws(() => database.prepare(`
    INSERT INTO lesson_drafts (
      id, owner_admin_id, topic, template_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('bad-status', owner.id, 'Topic', 'template-1', 'unknown', now, now), /CHECK constraint/);
  assert.throws(() => database.prepare(`
    INSERT INTO lesson_drafts (
      id, owner_admin_id, topic, template_id, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    'missing-owner', 'missing-user', 'Topic', 'template-1', 'generating', now, now,
  ), /FOREIGN KEY constraint/);
  assert.throws(() => createLessonDraft({
    ownerAdminId: teacher.id, topic: 'Topic', template: 'template-1',
  }, database), /должен принадлежать администратору/);
  assert.throws(() => createLessonDraft({
    ownerAdminId: 'missing-user', topic: 'Topic', template: 'template-1',
  }, database), /должен принадлежать администратору/);
  assert.throws(() => createLessonDraft({
    ownerAdminId: owner.id, topic: '', template: 'template-1',
  }, database), /CHECK constraint/);
  database.close();
});
