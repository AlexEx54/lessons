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
  updateAudioPlayer,
  updateAudioPlayerAudio,
  updateDescribeAndGuess,
  updateIllustratedTextPanel,
  updateIllustratedTextPanelImage,
  updateFillInBlanks,
  updateMarkdownCard,
  updateMatchWordsImage,
  updateCheckboxChoice,
  updateMultipleChoice,
  updatePersonalizedQuestions,
  updateTaskPrompt,
  updateTeacherNote,
  updateTextReading,
  updateTextReadingImage,
  updateTextPanel,
  updateThisOrThatImage,
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

test('composite teacher note update edits custom text and can only remove existing blocks', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'composite-note');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Composite', template: 'template-1' }, database);
  const blocks = [{
    type: 'teacherNoteBlock', id: 'first-block', title: 'First', titleColor: '#6545F5', icon: 'audio', text: 'One',
  }, {
    type: 'teacherNoteBlock', id: 'second-block', title: 'Second', titleColor: '#20A85B', icon: 'chat', text: 'Two',
  }];
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{ type: 'teacherNote', id: 'composite-note', blocks }] }],
  }, database);

  const updated = updateTeacherNote({
    id: ready.id,
    ownerAdminId: owner.id,
    noteId: 'composite-note',
    text: ' My own note ',
    retainedBlockIds: ['second-block'],
  }, database).content.stages[0].content[0];
  assert.equal(updated.text, 'My own note');
  assert.deepEqual(updated.blocks, [blocks[1]]);

  assert.throws(() => updateTeacherNote({
    id: ready.id,
    ownerAdminId: owner.id,
    noteId: 'composite-note',
    text: 'Text',
    retainedBlockIds: ['unknown-block'],
  }, database), /неизвестный подблок/);
  assert.throws(() => updateTeacherNote({
    id: ready.id,
    ownerAdminId: owner.id,
    noteId: 'composite-note',
    text: '',
    retainedBlockIds: [],
  }, database), /текст или хотя бы один подблок/);
  assert.throws(() => updateTeacherNote({
    id: ready.id,
    ownerAdminId: owner.id,
    noteId: 'composite-note',
    text: 'Text',
    retainedBlockIds: ['second-block', 'second-block'],
  }, database), /повторяющиеся/);
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

test('markdown card title and text can be updated without changing presentation fields', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'answers-owner');
  const outsider = admin(database, 'answers-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Answers', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'markdownCard', id: 'lead-in-answers', title: 'Suggested answers', text: '1. Original',
      icon: 'check', accentColor: '#1EAD58', studentVisibility: 'controlled',
    }] }],
  }, database);

  const updated = updateMarkdownCard({
    id: ready.id,
    ownerAdminId: owner.id,
    componentId: 'lead-in-answers',
    title: ' Updated answers ',
    text: '  1. **Updated**\n2. Personal answer.  ',
  }, database);
  assert.deepEqual(updated.content.stages[0].content[0], {
    type: 'markdownCard',
    id: 'lead-in-answers',
    title: 'Updated answers',
    text: '1. **Updated**\n2. Personal answer.',
    icon: 'check',
    accentColor: '#1EAD58',
    studentVisibility: 'controlled',
  });
  assert.throws(() => updateMarkdownCard({
    id: ready.id, ownerAdminId: owner.id, componentId: 'lead-in-answers', title: '', text: 'Text',
  }, database), /не могут быть пустыми/);
  assert.throws(() => updateMarkdownCard({
    id: ready.id, ownerAdminId: owner.id, componentId: 'missing', title: 'Title', text: 'Text',
  }, database), /не найден/);
  assert.throws(() => updateMarkdownCard({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'lead-in-answers', title: 'Title', text: 'Text',
  }, database), /Черновик урока не найден/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateMarkdownCard({
    id: ready.id, ownerAdminId: owner.id, componentId: 'lead-in-answers', title: 'Title', text: 'Too late',
  }, database), /только черновик на проверке/);

  const duplicatePending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Duplicates', template: 'template-1' }, database);
  const duplicate = completeLessonDraft(duplicatePending.id, owner.id, {
    stages: [
      { content: [{ type: 'markdownCard', id: 'same-answers', title: 'One', text: 'One' }] },
      { content: [{ type: 'markdownCard', id: 'same-answers', title: 'Two', text: 'Two' }] },
    ],
  }, database);
  assert.throws(() => updateMarkdownCard({
    id: duplicate.id, ownerAdminId: owner.id, componentId: 'same-answers', title: 'Title', text: 'Text',
  }, database), /несколько/);
  database.close();
});

test('fill in the blanks items can be edited, added, removed, and reordered in review', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'fill-owner');
  const outsider = admin(database, 'fill-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Fill', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'fillInBlanks',
      id: 'target-fill',
      title: 'Task 3',
      instruction: 'Complete the sentences.',
      items: [{ id: 'first-item', before: 'First', answer: 'one', after: '.' }],
    }] }],
  }, database);
  const items = [
    { id: 'second-item', before: 'Second', answer: 'two', after: '.' },
    { id: 'first-item', before: 'Updated first', answer: 'one', after: '!' },
  ];
  const updated = updateFillInBlanks({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-fill', items,
  }, database);
  assert.deepEqual(updated.content.stages[0].content[0], {
    type: 'fillInBlanks',
    id: 'target-fill',
    title: 'Task 3',
    instruction: 'Complete the sentences.',
    items,
  });
  assert.throws(() => updateFillInBlanks({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-fill', items: [],
  }, database), /between 1 and 12/);
  assert.throws(() => updateFillInBlanks({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'target-fill', items,
  }, database), /не найден/);
  assert.throws(() => updateFillInBlanks({
    id: ready.id, ownerAdminId: owner.id, componentId: 'missing', items,
  }, database), /не найден/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateFillInBlanks({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-fill', items,
  }, database), /только черновик на проверке/);
  database.close();
});

test('personalized questions content and order can be updated only in an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'questions-owner');
  const outsider = admin(database, 'questions-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Questions', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'personalizedQuestions',
      id: 'target-questions',
      title: 'Task 4',
      instruction: 'Speak.',
      items: [{ id: 'first-question', question: 'First?', followUp: 'Why?' }],
    }] }],
  }, database);
  const items = [
    { id: 'second-question', question: 'Do you **play games**?', followUp: 'Which ones?' },
    { id: 'first-question', question: 'Updated first?', followUp: 'With whom?' },
  ];
  const updated = updatePersonalizedQuestions({
    id: ready.id,
    ownerAdminId: owner.id,
    componentId: 'target-questions',
    title: ' Updated questions ',
    instruction: ' Answer out loud. ',
    items,
  }, database);
  assert.deepEqual(updated.content.stages[0].content[0], {
    type: 'personalizedQuestions',
    id: 'target-questions',
    title: 'Updated questions',
    instruction: 'Answer out loud.',
    items,
  });
  assert.throws(() => updatePersonalizedQuestions({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'target-questions',
    title: 'Questions', instruction: 'Speak.', items,
  }, database), /не найден/);
  assert.throws(() => updatePersonalizedQuestions({
    id: ready.id, ownerAdminId: owner.id, componentId: 'missing-questions',
    title: 'Questions', instruction: 'Speak.', items,
  }, database), /не найден/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updatePersonalizedQuestions({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-questions',
    title: 'Questions', instruction: 'Speak.', items,
  }, database), /только черновик на проверке/);

  const duplicatePending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Duplicate questions', template: 'template-1' }, database);
  const duplicate = completeLessonDraft(duplicatePending.id, owner.id, {
    stages: [
      { content: [{ type: 'personalizedQuestions', id: 'same-questions', title: 'One', instruction: 'Speak.', items }] },
      { content: [{ type: 'personalizedQuestions', id: 'same-questions', title: 'Two', instruction: 'Speak.', items }] },
    ],
  }, database);
  assert.throws(() => updatePersonalizedQuestions({
    id: duplicate.id, ownerAdminId: owner.id, componentId: 'same-questions',
    title: 'Questions', instruction: 'Speak.', items,
  }, database), /несколько/);
  database.close();
});

test('multiple choice content and order can be updated only in an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'choice-owner');
  const outsider = admin(database, 'choice-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Choice', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'multipleChoice',
      id: 'target-choice',
      title: 'Task 1',
      instruction: 'Choose.',
      items: [{ id: 'first-question', question: 'First?', options: ['One', 'Two'], answer: 'One' }],
    }] }],
  }, database);
  const items = [
    { id: 'second-question', question: 'Second?', options: ['Yes', 'No', 'Maybe'], answer: 'No', explanation: 'Because the text says no.' },
    { id: 'first-question', question: 'Updated first?', options: ['One', 'Two'], answer: 'Two', explanation: '   ' },
  ];
  const updated = updateMultipleChoice({
    id: ready.id,
    ownerAdminId: owner.id,
    componentId: 'target-choice',
    title: ' Updated quiz ',
    instruction: ' Choose the best answer. ',
    items,
  }, database);
  assert.deepEqual(updated.content.stages[0].content[0], {
    type: 'multipleChoice',
    id: 'target-choice',
    title: 'Updated quiz',
    instruction: 'Choose the best answer.',
    items: [{
      id: 'second-question',
      question: 'Second?',
      options: ['Yes', 'No', 'Maybe'],
      answer: 'No',
      explanation: 'Because the text says no.',
    }, {
      id: 'first-question',
      question: 'Updated first?',
      options: ['One', 'Two'],
      answer: 'Two',
    }],
  });
  assert.throws(() => updateMultipleChoice({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'target-choice',
    title: 'Quiz', instruction: 'Choose.', items,
  }, database), /не найден/);
  assert.throws(() => updateMultipleChoice({
    id: ready.id, ownerAdminId: owner.id, componentId: 'missing-choice',
    title: 'Quiz', instruction: 'Choose.', items,
  }, database), /не найден/);
  assert.throws(() => updateMultipleChoice({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-choice',
    title: 'Quiz', instruction: 'Choose.', items: [],
  }, database), /between 1 and 12/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateMultipleChoice({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-choice',
    title: 'Quiz', instruction: 'Choose.', items,
  }, database), /только черновик на проверке/);

  const duplicatePending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Duplicate choice', template: 'template-1' }, database);
  const duplicate = completeLessonDraft(duplicatePending.id, owner.id, {
    stages: [
      { content: [{ type: 'multipleChoice', id: 'same-choice', title: 'One', instruction: 'Choose.', items: [items[1]] }] },
      { content: [{ type: 'multipleChoice', id: 'same-choice', title: 'Two', instruction: 'Choose.', items: [items[1]] }] },
    ],
  }, database);
  assert.throws(() => updateMultipleChoice({
    id: duplicate.id, ownerAdminId: owner.id, componentId: 'same-choice',
    title: 'Quiz', instruction: 'Choose.', items: [items[1]],
  }, database), /несколько/);
  database.close();
});

test('checkbox choice content and order can be updated only in an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'checkbox-owner');
  const outsider = admin(database, 'checkbox-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Checkbox', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'checkboxChoice',
      id: 'target-checkbox',
      title: 'Task 1',
      instruction: 'Choose.',
      items: [{ id: 'first-question', question: 'First?', options: ['One', 'Two'], answers: ['One'] }],
    }] }],
  }, database);
  const items = [
    { id: 'second-question', question: 'Second?', options: ['Yes', 'No', 'Maybe'], answers: ['Maybe', 'Yes'] },
    { id: 'first-question', question: 'Updated first?', options: ['One', 'Two'], answers: ['Two'] },
  ];
  const updated = updateCheckboxChoice({
    id: ready.id,
    ownerAdminId: owner.id,
    componentId: 'target-checkbox',
    title: ' Updated quiz ',
    instruction: ' Choose the correct options. ',
    items,
  }, database);
  assert.deepEqual(updated.content.stages[0].content[0], {
    type: 'checkboxChoice',
    id: 'target-checkbox',
    title: 'Updated quiz',
    instruction: 'Choose the correct options.',
    items: [{
      id: 'second-question',
      question: 'Second?',
      options: ['Yes', 'No', 'Maybe'],
      answers: ['Yes', 'Maybe'],
    }, {
      id: 'first-question',
      question: 'Updated first?',
      options: ['One', 'Two'],
      answers: ['Two'],
    }],
  });
  assert.throws(() => updateCheckboxChoice({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'target-checkbox',
    title: 'Quiz', instruction: 'Choose.', items,
  }, database), /не найден/);
  assert.throws(() => updateCheckboxChoice({
    id: ready.id, ownerAdminId: owner.id, componentId: 'missing-checkbox',
    title: 'Quiz', instruction: 'Choose.', items,
  }, database), /не найден/);
  assert.throws(() => updateCheckboxChoice({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-checkbox',
    title: 'Quiz', instruction: 'Choose.', items: [],
  }, database), /between 1 and 12/);
  assert.throws(() => updateCheckboxChoice({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-checkbox',
    title: 'Quiz', instruction: 'Choose.',
    items: [{ id: 'second-question', question: 'Second?', options: ['Yes', 'No'], answers: [] }],
  }, database), /at least one answer/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateCheckboxChoice({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-checkbox',
    title: 'Quiz', instruction: 'Choose.', items,
  }, database), /только черновик на проверке/);

  const duplicatePending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Duplicate checkbox', template: 'template-1' }, database);
  const duplicate = completeLessonDraft(duplicatePending.id, owner.id, {
    stages: [
      { content: [{ type: 'checkboxChoice', id: 'same-checkbox', title: 'One', instruction: 'Choose.', items: [items[1]] }] },
      { content: [{ type: 'checkboxChoice', id: 'same-checkbox', title: 'Two', instruction: 'Choose.', items: [items[1]] }] },
    ],
  }, database);
  assert.throws(() => updateCheckboxChoice({
    id: duplicate.id, ownerAdminId: owner.id, componentId: 'same-checkbox',
    title: 'Quiz', instruction: 'Choose.', items: [items[1]],
  }, database), /несколько/);
  database.close();
});

test('Describe and Guess copy, words, and rules can be updated only in an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'describe-owner');
  const outsider = admin(database, 'describe-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Describe', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'describeAndGuess', id: 'target-describe', title: 'Extra Task', instruction: 'Describe it.',
      items: [{ id: 'word-one', text: 'level up' }],
      howToPlay: { title: 'How to Play', steps: ['Pick a word.'], tip: 'Use examples.' },
    }] }],
  }, database);
  const updated = updateDescribeAndGuess({
    id: ready.id,
    ownerAdminId: owner.id,
    componentId: 'target-describe',
    title: ' Updated game ',
    instruction: ' Take turns. ',
    items: [{ id: 'word-two', text: ' get stuck ' }, { id: 'word-one', text: ' level up ' }],
    howToPlay: { title: ' Rules ', steps: [' Explain it. ', ' Guess it. '], tip: ' Use actions. ' },
  }, database);
  assert.deepEqual(updated.content.stages[0].content[0], {
    type: 'describeAndGuess', id: 'target-describe', title: 'Updated game', instruction: 'Take turns.',
    items: [{ id: 'word-two', text: 'get stuck' }, { id: 'word-one', text: 'level up' }],
    howToPlay: { title: 'Rules', steps: ['Explain it.', 'Guess it.'], tip: 'Use actions.' },
  });
  assert.throws(() => updateDescribeAndGuess({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'target-describe', title: 'Game', instruction: 'Play.',
    items: [{ id: 'word-one', text: 'word' }],
    howToPlay: { title: 'Rules', steps: ['Play.'], tip: 'Try.' },
  }, database), /не найден/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateDescribeAndGuess({
    id: ready.id, ownerAdminId: owner.id, componentId: 'target-describe', title: 'Game', instruction: 'Play.',
    items: [{ id: 'word-one', text: 'word' }],
    howToPlay: { title: 'Rules', steps: ['Play.'], tip: 'Try.' },
  }, database), /только черновик на проверке/);
  database.close();
});

test('task prompt update rejects missing, duplicate, and immutable draft targets', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'prompt-invalid');
  const outsider = admin(database, 'prompt-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Prompts', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [
      { content: [{ type: 'taskPrompt', id: 'same-prompt', variant: 'followUp', title: 'One', text: 'One' }] },
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

test('text panel content and background can be updated in an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'panel-owner');
  const outsider = admin(database, 'panel-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Panel', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'textPanel', id: 'panel-one', text: 'Original', backgroundColor: '#252A38',
    }] }],
  }, database);

  const updated = updateTextPanel({
    id: ready.id,
    ownerAdminId: owner.id,
    panelId: 'panel-one',
    text: ' **Updated** ',
    backgroundColor: ' #abcdef ',
  }, database);
  assert.equal(updated.content.stages[0].content[0].text, '**Updated**');
  assert.equal(updated.content.stages[0].content[0].backgroundColor, '#ABCDEF');
  assert.equal(updated.content.stages[0].content[0].accentColor, undefined);
  assert.equal(updated.content.stages[0].content[0].showBorder, undefined);
  const styled = updateTextPanel({
    id: ready.id,
    ownerAdminId: owner.id,
    panelId: 'panel-one',
    text: '**Styled**',
    backgroundColor: '#ffffff',
    accentColor: ' #20a85b ',
    showBorder: false,
  }, database);
  assert.equal(styled.content.stages[0].content[0].accentColor, '#20A85B');
  assert.equal(styled.content.stages[0].content[0].showBorder, false);
  assert.throws(() => updateTextPanel({
    id: ready.id, ownerAdminId: owner.id, panelId: 'panel-one', text: '', backgroundColor: '#FFFFFF',
  }, database), /не может быть пустым/);
  assert.throws(() => updateTextPanel({
    id: ready.id, ownerAdminId: owner.id, panelId: 'panel-one', text: 'Text', backgroundColor: '#fff',
  }, database), /#RRGGBB/);
  assert.throws(() => updateTextPanel({
    id: ready.id, ownerAdminId: owner.id, panelId: 'panel-one', text: 'Text', backgroundColor: '#FFFFFF', accentColor: '#123',
  }, database), /#RRGGBB/);
  assert.throws(() => updateTextPanel({
    id: ready.id, ownerAdminId: owner.id, panelId: 'panel-one', text: 'Text', backgroundColor: '#FFFFFF', showBorder: 'no',
  }, database), /boolean/);
  assert.throws(() => updateTextPanel({
    id: ready.id, ownerAdminId: outsider.id, panelId: 'panel-one', text: 'Text', backgroundColor: '#FFFFFF',
  }, database), /не найден/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateTextPanel({
    id: ready.id, ownerAdminId: owner.id, panelId: 'panel-one', text: 'Late', backgroundColor: '#FFFFFF',
  }, database), /только черновик на проверке/);
  database.close();
});

test('illustrated text panel content and background update independently from plain panels', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'illustrated-panel-owner');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Panels', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [
      { type: 'textPanel', id: 'plain-panel', text: 'Plain', backgroundColor: '#FFFFFF' },
      { type: 'illustratedTextPanel', id: 'illustrated-panel', text: 'Illustrated', backgroundColor: '#252A38' },
    ] }],
  }, database);

  const updated = updateIllustratedTextPanel({
    id: ready.id,
    ownerAdminId: owner.id,
    panelId: 'illustrated-panel',
    text: 'Updated illustration',
    backgroundColor: '#abcdef',
  }, database);
  assert.equal(updated.content.stages[0].content[0].text, 'Plain');
  assert.equal(updated.content.stages[0].content[1].text, 'Updated illustration');
  assert.equal(updated.content.stages[0].content[1].backgroundColor, '#ABCDEF');
  assert.throws(() => updateTextPanel({
    id: ready.id, ownerAdminId: owner.id, panelId: 'illustrated-panel', text: 'Wrong type', backgroundColor: '#FFFFFF',
  }, database), /не найдена/);
  database.close();
});

test('text panel image URL changes only an existing requested side', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'panel-image');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Panel image', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'illustratedTextPanel',
      id: 'panel-one',
      text: 'Text',
      backgroundColor: '#252A38',
      leadingPicture: { imagePrompt: 'Avatar' },
    }] }],
  }, database);

  const added = updateIllustratedTextPanelImage({
    id: ready.id, ownerAdminId: owner.id, panelId: 'panel-one', side: 'leading', imageSrc: '/asset.png',
  }, database);
  assert.equal(added.previousImageSrc, null);
  assert.equal(added.draft.content.stages[0].content[0].leadingPicture.imageSrc, '/asset.png');
  const removed = updateIllustratedTextPanelImage({
    id: ready.id, ownerAdminId: owner.id, panelId: 'panel-one', side: 'leading', imageSrc: null,
  }, database);
  assert.equal(removed.previousImageSrc, '/asset.png');
  assert.equal(removed.draft.content.stages[0].content[0].leadingPicture.imageSrc, undefined);
  assert.throws(() => updateIllustratedTextPanelImage({
    id: ready.id, ownerAdminId: owner.id, panelId: 'panel-one', side: 'middle', imageSrc: '/bad.png',
  }, database), /Неизвестная сторона/);
  assert.throws(() => updateIllustratedTextPanelImage({
    id: ready.id, ownerAdminId: owner.id, panelId: 'panel-one', side: 'trailing', imageSrc: '/missing.png',
  }, database), /Слот изображения/);
  database.close();
});

test('text reading fields and image slots can be updated only in an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'reading-owner');
  const outsider = admin(database, 'reading-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Reading', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'textReading',
      id: 'reading-text',
      title: 'Original title',
      subtitle: 'Original subtitle',
      headerImage: { imagePrompt: 'Header prompt' },
      text: 'Original text',
      textImage: { imagePrompt: 'Text prompt' },
    }] }],
  }, database);

  const updated = updateTextReading({
    id: ready.id,
    ownerAdminId: owner.id,
    componentId: 'reading-text',
    title: ' Updated title ',
    subtitle: ' Updated subtitle ',
    text: ' **Updated** text ',
  }, database);
  assert.deepEqual(updated.content.stages[0].content[0], {
    type: 'textReading',
    id: 'reading-text',
    title: 'Updated title',
    subtitle: 'Updated subtitle',
    headerImage: { imagePrompt: 'Header prompt' },
    text: '**Updated** text',
    textImage: { imagePrompt: 'Text prompt' },
  });

  const withoutSubtitle = updateTextReading({
    id: ready.id,
    ownerAdminId: owner.id,
    componentId: 'reading-text',
    title: 'Title',
    subtitle: '   ',
    text: 'Text',
  }, database);
  assert.equal(withoutSubtitle.content.stages[0].content[0].subtitle, undefined);
  assert.throws(() => updateTextReading({
    id: ready.id, ownerAdminId: owner.id, componentId: 'reading-text', title: '', text: 'Text',
  }, database), /requires title/);
  assert.throws(() => updateTextReading({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'reading-text', title: 'Title', text: 'Text',
  }, database), /Черновик урока не найден/);
  assert.throws(() => updateTextReading({
    id: ready.id, ownerAdminId: owner.id, componentId: 'missing-reading', title: 'Title', text: 'Text',
  }, database), /не найден/);

  const headerAdded = updateTextReadingImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'reading-text', side: 'header', imageSrc: '/header.png',
  }, database);
  assert.equal(headerAdded.previousImageSrc, null);
  assert.equal(headerAdded.draft.content.stages[0].content[0].headerImage.imageSrc, '/header.png');
  const textAdded = updateTextReadingImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'reading-text', side: 'text', imageSrc: '/text.png',
  }, database);
  assert.equal(textAdded.draft.content.stages[0].content[0].textImage.imageSrc, '/text.png');
  const headerRemoved = updateTextReadingImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'reading-text', side: 'header', imageSrc: null,
  }, database);
  assert.equal(headerRemoved.previousImageSrc, '/header.png');
  assert.equal(headerRemoved.draft.content.stages[0].content[0].headerImage.imageSrc, undefined);
  assert.throws(() => updateTextReadingImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'reading-text', side: 'middle', imageSrc: '/bad.png',
  }, database), /Неизвестная область/);
  const duplicatePending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Duplicate reading', template: 'template-1' }, database);
  const duplicate = completeLessonDraft(duplicatePending.id, owner.id, {
    stages: [
      { content: [{ type: 'textReading', id: 'same-reading', title: 'One', text: 'One' }] },
      { content: [{ type: 'textReading', id: 'same-reading', title: 'Two', text: 'Two' }] },
    ],
  }, database);
  assert.throws(() => updateTextReading({
    id: duplicate.id, ownerAdminId: owner.id, componentId: 'same-reading', title: 'Title', text: 'Text',
  }, database), /несколько/);

  const missingSlotPending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Missing reading image', template: 'template-1' }, database);
  const missingSlot = completeLessonDraft(missingSlotPending.id, owner.id, {
    stages: [{ content: [{ type: 'textReading', id: 'reading-without-header', title: 'Title', text: 'Text' }] }],
  }, database);
  assert.throws(() => updateTextReadingImage({
    id: missingSlot.id, ownerAdminId: owner.id, componentId: 'reading-without-header', side: 'header', imageSrc: '/bad.png',
  }, database), /Слот изображения/);

  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateTextReading({
    id: ready.id, ownerAdminId: owner.id, componentId: 'reading-text', title: 'Late', text: 'Text',
  }, database), /только черновик на проверке/);
  assert.throws(() => updateTextReadingImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'reading-text', side: 'text', imageSrc: '/late.png',
  }, database), /только черновик на проверке/);
  database.close();
});

test('audio player title and audio slot can be updated only in an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'audio-owner');
  const outsider = admin(database, 'audio-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Listening', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'audioPlayer',
      id: 'listening-audio',
      title: 'Listen to the audio',
      script: 'Alex: Hello.\nMia: Hi.',
    }] }],
  }, database);

  const updated = updateAudioPlayer({
    id: ready.id,
    ownerAdminId: owner.id,
    componentId: 'listening-audio',
    title: '  Play the dialogue  ',
  }, database);
  assert.deepEqual(updated.content.stages[0].content[0], {
    type: 'audioPlayer',
    id: 'listening-audio',
    title: 'Play the dialogue',
    script: 'Alex: Hello.\nMia: Hi.',
  });

  const added = updateAudioPlayerAudio({
    id: ready.id, ownerAdminId: owner.id, componentId: 'listening-audio', audioSrc: '/audio.mp3',
  }, database);
  assert.equal(added.previousAudioSrc, null);
  assert.equal(added.draft.content.stages[0].content[0].audioSrc, '/audio.mp3');
  assert.equal(added.draft.content.stages[0].content[0].script, 'Alex: Hello.\nMia: Hi.');
  const removed = updateAudioPlayerAudio({
    id: ready.id, ownerAdminId: owner.id, componentId: 'listening-audio', audioSrc: null,
  }, database);
  assert.equal(removed.previousAudioSrc, '/audio.mp3');
  assert.equal(removed.draft.content.stages[0].content[0].audioSrc, undefined);

  assert.throws(() => updateAudioPlayer({
    id: ready.id, ownerAdminId: owner.id, componentId: 'listening-audio', title: '',
  }, database), /requires title/);
  assert.throws(() => updateAudioPlayer({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'listening-audio', title: 'Title',
  }, database), /Черновик урока не найден/);
  assert.throws(() => updateAudioPlayer({
    id: ready.id, ownerAdminId: owner.id, componentId: 'missing-audio', title: 'Title',
  }, database), /не найден/);

  const duplicatePending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Duplicate audio', template: 'template-1' }, database);
  const duplicate = completeLessonDraft(duplicatePending.id, owner.id, {
    stages: [
      { content: [{ type: 'audioPlayer', id: 'same-audio', title: 'One', script: 'One' }] },
      { content: [{ type: 'audioPlayer', id: 'same-audio', title: 'Two', script: 'Two' }] },
    ],
  }, database);
  assert.throws(() => updateAudioPlayer({
    id: duplicate.id, ownerAdminId: owner.id, componentId: 'same-audio', title: 'Title',
  }, database), /несколько/);

  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateAudioPlayer({
    id: ready.id, ownerAdminId: owner.id, componentId: 'listening-audio', title: 'Late',
  }, database), /только черновик на проверке/);
  assert.throws(() => updateAudioPlayerAudio({
    id: ready.id, ownerAdminId: owner.id, componentId: 'listening-audio', audioSrc: '/late.mp3',
  }, database), /только черновик на проверке/);
  database.close();
});

test('this or that image URL can be added and removed only from an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'image-owner');
  const outsider = admin(database, 'image-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Images', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'thisOrThat', id: 'choices', items: [{ id: 'pair-one', options: [
        { id: 'left', caption: 'Left', imagePrompt: 'Left prompt' },
        { id: 'right', caption: 'Right', imagePrompt: 'Right prompt' },
      ] }],
    }] }],
  }, database);
  const added = updateThisOrThatImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'choices', itemId: 'pair-one', optionId: 'left', imageSrc: '/asset.png',
  }, database);
  assert.equal(added.previousImageSrc, null);
  assert.equal(added.draft.content.stages[0].content[0].items[0].options[0].imageSrc, '/asset.png');
  const removed = updateThisOrThatImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'choices', itemId: 'pair-one', optionId: 'left', imageSrc: null,
  }, database);
  assert.equal(removed.previousImageSrc, '/asset.png');
  assert.equal(removed.draft.content.stages[0].content[0].items[0].options[0].imageSrc, undefined);
  assert.throws(() => updateThisOrThatImage({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'choices', itemId: 'pair-one', optionId: 'left', imageSrc: '/other.png',
  }, database), /не найден/);
  assert.throws(() => updateThisOrThatImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'choices', itemId: 'pair-one', optionId: 'missing', imageSrc: '/missing.png',
  }, database), /не найден/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateThisOrThatImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'choices', itemId: 'pair-one', optionId: 'left', imageSrc: '/late.png',
  }, database), /только черновик на проверке/);
  database.close();
});

test('match words image URL can be added and removed only from an owned review draft', () => {
  const database = openDatabase(':memory:');
  const owner = admin(database, 'match-image-owner');
  const outsider = admin(database, 'match-image-outsider');
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Match images', template: 'template-1' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [{
      type: 'matchWords',
      id: 'match-words',
      items: [{ id: 'first-word', term: 'First', imagePrompt: 'First prompt' }],
    }] }],
  }, database);
  const added = updateMatchWordsImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'match-words', itemId: 'first-word', imageSrc: '/asset.png',
  }, database);
  assert.equal(added.previousImageSrc, null);
  assert.equal(added.draft.content.stages[0].content[0].items[0].imageSrc, '/asset.png');
  const removed = updateMatchWordsImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'match-words', itemId: 'first-word', imageSrc: null,
  }, database);
  assert.equal(removed.previousImageSrc, '/asset.png');
  assert.equal(removed.draft.content.stages[0].content[0].items[0].imageSrc, undefined);
  assert.throws(() => updateMatchWordsImage({
    id: ready.id, ownerAdminId: outsider.id, componentId: 'match-words', itemId: 'first-word', imageSrc: '/other.png',
  }, database), /не найден/);
  assert.throws(() => updateMatchWordsImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'match-words', itemId: 'missing', imageSrc: '/missing.png',
  }, database), /не найден/);
  publishLessonDraft(ready.id, owner.id, database);
  assert.throws(() => updateMatchWordsImage({
    id: ready.id, ownerAdminId: owner.id, componentId: 'match-words', itemId: 'first-word', imageSrc: '/late.png',
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
