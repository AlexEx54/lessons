'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createDocument } = require('./helpers/lesson-dom.js');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { completeLessonDraft, createLessonDraft, updateHomeworkWriting } = require('../lib/lesson-draft-store.js');
const { checkStaticComponent, STATIC_BLOCKS } = require('../assets/lesson-template-statics.js');
const {
  ACTIONS,
  ART_SRC,
  MAX_COMMENT_LENGTH,
  MAX_TEXT_LENGTH,
  applyWritingAction,
  countWords,
  normalizeHomeworkWriting,
  normalizeWriting,
  renderHomeworkWriting,
} = require('../assets/components/homework-writing.js');

function component(overrides = {}) {
  return {
    type: 'homeworkWriting',
    id: 'homework-comment',
    title: ' Post Your  Comment ',
    instruction: ' Write your text, then hand it in. ',
    task: ' Write a comment for your class group chat.\n\nUse **should** three times. ',
    minWords: 10,
    maxWords: 20,
    ...overrides,
  };
}

const ENOUGH = 'I think we should keep our phones on silent in class.';

function find(node, className) {
  if (node.classList?.contains(className)) return node;
  for (const child of node.children || []) {
    const found = find(child, className);
    if (found) return found;
  }
  return null;
}

function findAll(node, className, found = []) {
  if (node.classList?.contains(className)) found.push(node);
  for (const child of node.children || []) findAll(child, className, found);
  return found;
}

function text(node) {
  return [node.textContent, ...(node.children || []).map(text)].join('');
}

function render(options) {
  return renderHomeworkWriting(component(), options, createDocument());
}

function type(node, value) {
  const textarea = find(node, 'homework-writing__text');
  textarea.value = value;
  textarea.listeners.input.forEach(listener => listener({}));
  return textarea;
}

test('normalizes copy and the word range, and rejects schema drift', () => {
  assert.deepEqual(normalizeHomeworkWriting(component()), {
    type: 'homeworkWriting',
    id: 'homework-comment',
    title: 'Post Your Comment',
    instruction: 'Write your text, then hand it in.',
    task: 'Write a comment for your class group chat.\n\nUse **should** three times.',
    minWords: 10,
    maxWords: 20,
  });
  assert.throws(() => normalizeHomeworkWriting(component({ extra: true })), /unsupported fields/);
  assert.throws(() => normalizeHomeworkWriting(component({ task: ' ' })), /requires a title, an instruction and a task/);
  assert.throws(() => normalizeHomeworkWriting(component({ minWords: 3 })), /minWords between 10 and 400/);
  assert.throws(() => normalizeHomeworkWriting(component({ minWords: 20, maxWords: 15 })), /not above maxWords/);
});

test('counts words with apostrophes, hyphens and numbers as one word each', () => {
  assert.equal(countWords('I don’t think our school-bus is 2 good, isn\'t it?'), 10);
  assert.equal(countWords('  '), 0);
});

test('session work keeps only the fields of its status', () => {
  assert.deepEqual(normalizeWriting(undefined), { text: '', status: 'draft' });
  assert.deepEqual(normalizeWriting({ text: 'Hi', status: 'checked', submittedAt: 7, review: { score: 4, comment: ' Good! ' } }),
    { text: 'Hi', status: 'checked', submittedAt: 7, review: { score: 4, comment: 'Good!' } });
  assert.deepEqual(normalizeWriting({ text: 'Hi', status: 'returned', review: { score: 4, comment: 'More, please.' } }),
    { text: 'Hi', status: 'returned', review: { comment: 'More, please.' } });
  assert.deepEqual(normalizeWriting({ status: 'checked', review: { score: 9 } }), { text: '', status: 'checked' });
  assert.deepEqual(normalizeWriting({ status: 'unknown' }), { text: '', status: 'draft' });
});

test('the student types, sees the word count and hands in once the minimum is reached', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = [];
  const submits = [];
  const node = render({
    viewerRole: 'student',
    interactive: true,
    onWrite: value => writes.push(value),
    onSubmit: value => submits.push(value),
  });
  assert.equal(find(node, 'homework-writing__status').textContent, 'Draft');
  assert.equal(find(node, 'homework-writing__art').children[0].src, ART_SRC);
  const handIn = find(node, 'homework-writing__button--primary');
  assert.equal(handIn.disabled, true);

  type(node, 'I think');
  assert.equal(find(node, 'homework-writing__meter').dataset.state, 'short');
  assert.match(text(find(node, 'homework-writing__meter-label')), /^2 \/ 10–20 words$/);
  assert.equal(handIn.disabled, true);
  assert.match(text(find(node, 'homework-writing__saved')), /Saving…/);

  type(node, ENOUGH);
  assert.equal(find(node, 'homework-writing__meter').dataset.state, 'ok');
  assert.equal(handIn.disabled, false);
  t.mock.timers.tick(700);
  assert.deepEqual(writes, [ENOUGH]);

  node.updateState({ text: ENOUGH, status: 'draft' });
  assert.match(text(find(node, 'homework-writing__saved')), /Saved/);
  handIn.click();
  assert.deepEqual(submits, [ENOUGH]);
});

test('unsent typing survives an older saved text from the session', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const node = render({ viewerRole: 'student', interactive: true, onWrite() {}, onSubmit() {} });
  type(node, 'I think we should');
  node.updateState({ text: 'I think', status: 'draft' });
  assert.equal(find(node, 'homework-writing__text').value, 'I think we should');
});

test('a handed-in text is read-only for the student and can be taken back', () => {
  let reopened = 0;
  const node = render({
    viewerRole: 'student',
    interactive: true,
    writing: { text: ENOUGH, status: 'submitted', submittedAt: Date.UTC(2026, 10, 7, 12) },
    onReopen: () => { reopened += 1; },
  });
  assert.equal(find(node, 'homework-writing__status').textContent, 'Handed in');
  assert.equal(find(node, 'homework-writing__text'), null);
  assert.equal(find(node, 'homework-writing__sheet').textContent, ENOUGH);
  assert.match(text(find(node, 'homework-writing__note--submitted')), /Handed in on 7 Nov\. Waiting for your teacher’s feedback\./);
  find(node, 'homework-writing__button--quiet').click();
  assert.equal(reopened, 1);
});

test('the teacher grades a handed-in text with stars and a comment, or returns it', () => {
  const reviews = [];
  const returns = [];
  const node = render({
    viewerRole: 'teacher',
    interactive: true,
    writing: { text: ENOUGH, status: 'submitted', submittedAt: Date.UTC(2026, 10, 7, 12) },
    onReview: review => reviews.push(review),
    onReturn: review => returns.push(review),
  });
  assert.equal(find(node, 'homework-writing__status').textContent, 'Сдано');
  assert.match(find(node, 'homework-writing__meta').textContent, /^Сдано 7 ноября/);
  const grade = () => find(node, 'homework-writing__button--primary');
  assert.equal(grade().disabled, true);
  findAll(node, 'homework-writing__star')[3].click();
  assert.equal(grade().disabled, false);
  assert.match(text(find(node, 'homework-writing__score-label')), /^4 из 5$/);
  const comment = find(node, 'homework-writing__comment');
  comment.value = ' Great arguments! ';
  comment.listeners.input.forEach(listener => listener({}));
  grade().click();
  find(node, 'homework-writing__button--ghost').click();
  assert.deepEqual(reviews, [{ score: 4, comment: 'Great arguments!' }]);
  assert.deepEqual(returns, [{ comment: 'Great arguments!' }]);
});

test('the student sees the grade; a returned text is editable again with the teacher’s note', () => {
  const checked = render({
    viewerRole: 'student',
    interactive: true,
    writing: { text: ENOUGH, status: 'checked', review: { score: 4, comment: 'Well done!' } },
  });
  assert.equal(find(checked, 'homework-writing__status').textContent, 'Checked');
  assert.match(text(find(checked, 'homework-writing__badge')), /^4\/ 5$/);
  assert.equal(find(checked, 'homework-writing__feedback-text').textContent, 'Well done!');
  assert.equal(findAll(checked, 'homework-writing__star--on').length, 4);

  const returned = render({
    viewerRole: 'student',
    interactive: true,
    writing: { text: ENOUGH, status: 'returned', review: { comment: 'Add one more reason.' } },
    onWrite() {},
    onSubmit() {},
  });
  assert.equal(find(returned, 'homework-writing__status').textContent, 'Needs changes');
  assert.match(text(find(returned, 'homework-writing__note--returned')), /Add one more reason\./);
  assert.equal(find(returned, 'homework-writing__text').readOnly, false);
});

test('outside a session the teacher sees the task and an empty sheet without grading', () => {
  const node = render({ viewerRole: 'teacher' });
  assert.equal(find(node, 'homework-writing__status').hidden, true);
  assert.equal(find(node, 'homework-writing__sheet').textContent, 'Ученик ещё ничего не написал.');
  assert.equal(find(node, 'homework-writing__review'), null);
  assert.equal(find(node, 'homework-writing__edit'), null);
  assert.equal(render({ viewerRole: 'teacher', onSave() {} }).querySelector('.homework-writing__edit') !== null, true);
});

test('a template may hold it as a static block with the task written by the AI', () => {
  const block = STATIC_BLOCKS.homeworkWriting;
  assert.equal(block.aiFields.task.name, 'homeworkTask');
  checkStaticComponent({ id: 'homework', ...block.sample });
  checkStaticComponent({ id: 'homework', ...block.sample, task: 'Write it.\n\n{{homeworkTask}}' });
});

test('a review draft saves new copy and word range of the homework', () => {
  const database = openDatabase(':memory:');
  const owner = createUser({ email: 'homework-owner@example.com', displayName: 'Owner', passwordHash: 'unused', role: 'admin' }, database);
  const pending = createLessonDraft({ ownerAdminId: owner.id, topic: 'Phones', template: 'template-3' }, database);
  const ready = completeLessonDraft(pending.id, owner.id, {
    stages: [{ content: [normalizeHomeworkWriting(component())] }],
  }, database);
  const updated = updateHomeworkWriting({
    id: ready.id,
    ownerAdminId: owner.id,
    componentId: 'homework-comment',
    title: ' Your Reply ',
    instruction: 'Hand it in.',
    task: 'Write **60** words.',
    minWords: 40,
    maxWords: 60,
  }, database);
  assert.deepEqual(updated.content.stages[0].content[0], {
    type: 'homeworkWriting',
    id: 'homework-comment',
    title: 'Your Reply',
    instruction: 'Hand it in.',
    task: 'Write **60** words.',
    minWords: 40,
    maxWords: 60,
  });
  assert.throws(() => updateHomeworkWriting({
    ...component(), id: ready.id, ownerAdminId: owner.id, componentId: 'homework-comment', minWords: 80, maxWords: 60,
  }, database), /not above maxWords/);
  assert.throws(() => updateHomeworkWriting({
    ...component(), id: ready.id, ownerAdminId: owner.id, componentId: 'missing',
  }, database), /не найдено/);
  database.close();
});

test('component is registered in the lesson pages, the editor and the session', () => {
  const root = path.join(__dirname, '..');
  const read = file => fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(read('assets/lesson-view.js'), /homeworkWriting: \['HomeworkWritingComponent', 'renderHomeworkWriting'\]/);
  assert.match(read('assets/lesson-editor.js'), /saveHomeworkWriting/);
  assert.match(read('server.js'), /homework-writing/);
  for (const page of ['lesson-editor.html', 'lesson-template-editor.html']) {
    assert.match(read(page), /<script src="\/assets\/components\/homework-writing\.js" defer><\/script>/);
    assert.match(read(page), /<link rel="stylesheet" href="\/assets\/components\/homework-writing\.css" \/>/);
  }
  assert.ok(fs.statSync(path.join(root, 'assets/images/homework-writing.webp')).size < 20000);
});

test('the work moves from draft to handed in, back for changes and to a grade', () => {
  const homework = normalizeHomeworkWriting(component());
  const apply = (writing, action) => applyWritingAction(homework, writing, action, 1000);
  const draft = apply(undefined, { type: ACTIONS.write, text: 'I think' });
  assert.deepEqual(draft, { text: 'I think', status: 'draft' });
  assert.throws(() => apply(draft, { type: ACTIONS.submit, text: 'I think' }), { statusCode: 400 });
  assert.throws(() => apply(draft, { type: ACTIONS.write, text: 'x'.repeat(MAX_TEXT_LENGTH + 1) }), { statusCode: 400 });
  assert.throws(() => apply(draft, { type: ACTIONS.review, score: 5 }), { statusCode: 400 });

  const submitted = apply(draft, { type: ACTIONS.submit, text: ENOUGH });
  assert.deepEqual(submitted, { text: ENOUGH, status: 'submitted', submittedAt: 1000 });
  assert.throws(() => apply(submitted, { type: ACTIONS.write, text: 'Later' }), { statusCode: 400 });
  assert.deepEqual(apply(submitted, { type: ACTIONS.reopen }), { text: ENOUGH, status: 'draft' });

  assert.throws(() => apply(submitted, { type: ACTIONS.review, score: 6 }), { statusCode: 400 });
  assert.throws(() => apply(submitted, { type: ACTIONS.review, score: 4, comment: 'x'.repeat(MAX_COMMENT_LENGTH + 1) }), { statusCode: 400 });
  const checked = apply(submitted, { type: ACTIONS.review, score: 4, comment: ' Good! ' });
  assert.deepEqual(checked, { text: ENOUGH, status: 'checked', submittedAt: 1000, review: { score: 4, comment: 'Good!' } });
  assert.throws(() => apply(checked, { type: ACTIONS.reopen }), { statusCode: 400 });
  assert.equal(apply(checked, { type: ACTIONS.review, score: 5 }).review.score, 5);

  const returned = apply(checked, { type: ACTIONS.return, comment: 'One more reason.' });
  assert.deepEqual(returned, { text: ENOUGH, status: 'returned', review: { comment: 'One more reason.' } });
  assert.deepEqual(apply(submitted, { type: ACTIONS.return }), { text: ENOUGH, status: 'returned' });
  assert.deepEqual(apply(returned, { type: ACTIONS.write, text: `${ENOUGH} Also` }).review, { comment: 'One more reason.' });
  assert.equal(apply(returned, { type: ACTIONS.submit, text: ENOUGH }).status, 'submitted');
  assert.throws(() => apply(draft, { type: 'invented' }), { statusCode: 400 });
});

test('in a session the student writes and the teacher grades; the preview follows the same rules', () => {
  const { applyComponentAction, clearComponentState, studentComponent } = require('../assets/class-rules.js');
  const window = { HomeworkWritingComponent: require('../assets/components/homework-writing.js') };
  require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/class-component-adapters.js'), 'utf8'), { window });
  const homework = normalizeHomeworkWriting(component());
  const state = {};
  const preview = {};
  const act = (role, action) => {
    const full = { ...action, componentId: homework.id };
    window.ClassComponentAdapters.preview(homework, preview, full);
    applyComponentAction({ role, component: homework, state, action: full });
    if (state.writings[homework.id].submittedAt) preview.writings[homework.id].submittedAt = state.writings[homework.id].submittedAt;
    assert.equal(JSON.stringify(preview), JSON.stringify(state));
  };
  assert.equal(studentComponent(homework, {}), homework);
  act('student', { type: ACTIONS.write, text: ENOUGH });
  assert.throws(() => applyComponentAction({ role: 'teacher', component: homework, state, action: { type: ACTIONS.write, text: 'Mine' } }), { statusCode: 403 });
  act('student', { type: ACTIONS.submit, text: ENOUGH });
  assert.throws(() => applyComponentAction({ role: 'student', component: homework, state, action: { type: ACTIONS.review, score: 5 } }), { statusCode: 403 });
  act('teacher', { type: ACTIONS.review, score: 5, comment: 'Great!' });
  assert.equal(state.writings[homework.id].status, 'checked');

  const stale = structuredClone(state);
  window.ClassComponentAdapters.preview(homework, stale, { type: ACTIONS.reopen, componentId: homework.id });
  assert.equal(JSON.stringify(stale), JSON.stringify(state), 'a preview the state no longer allows changes nothing');
  clearComponentState({ component: homework, state });
  assert.deepEqual(state.writings, {});
});

test('session updates keep the textarea in place and resend a save the session rejected', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = [];
  const node = render({ viewerRole: 'student', interactive: true, writing: { text: '', status: 'draft' }, onWrite: value => writes.push(value), onSubmit() {} });
  const textarea = type(node, 'I think');
  const body = find(node, 'homework-writing__body');
  const paper = body.children[0];
  t.mock.timers.tick(700);
  assert.deepEqual(writes, ['I think']);
  node.updateState({ text: 'I think', status: 'draft' });
  node.setInteractive(true);
  assert.equal(body.children[0], paper, 'the paper is not rebuilt while the student writes');
  assert.equal(find(node, 'homework-writing__text'), textarea);

  node.updateState({ text: '', status: 'draft' });
  assert.equal(textarea.value, 'I think');
  t.mock.timers.tick(700);
  assert.deepEqual(writes, ['I think', 'I think']);

  node.updateState({ text: 'I think', status: 'submitted', submittedAt: 1 });
  assert.notEqual(body.children[0], paper, 'a new status repaints the card');
});

test('a card taken off the page does not save pending typing', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const writes = [];
  const node = render({ viewerRole: 'student', interactive: true, onWrite: value => writes.push(value), onSubmit() {} });
  type(node, 'I think');
  node.isConnected = false;
  t.mock.timers.tick(700);
  assert.deepEqual(writes, []);
});

test('any stage with content opens in a session, and the homework there is saved, graded and reset', t => {
  const crypto = require('node:crypto');
  const { createClassSession } = require('../lib/class-store.js');
  const { syntheticLesson } = require('./helpers/synthetic-lessons.js');
  const { applyAction, sessionPayload } = require('../lib/class-live-store.js');
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const teacher = createUser({ email: 'homework-session@test.local', displayName: 'Homework', passwordHash: 'unused' }, db);
  const content = syntheticLesson();
  const homework = normalizeHomeworkWriting(component());
  content.stages.push({ id: 'homework', number: content.stages.length + 1, title: 'Homework', icon: 'pencil', content: [homework] });
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(content));
  const session = createClassSession({ className: 'Homework', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00.000Z' }, teacher.id, db);
  const teacherAccess = { role: 'teacher', sessionId: session.id, ownerId: teacher.id };
  const studentAccess = { ...teacherAccess, role: 'student' };
  let version = 0;
  const act = (access, action) => applyAction(access, { stageId: 'homework', componentId: homework.id, expectedVersion: version++, ...action }, db);

  assert.ok(sessionPayload(studentAccess, db).availableStageIds.includes('homework'));
  act(teacherAccess, { type: 'select-stage' });
  act(studentAccess, { type: ACTIONS.write, text: ENOUGH });
  act(studentAccess, { type: ACTIONS.submit, text: ENOUGH });
  const graded = act(teacherAccess, { type: ACTIONS.review, score: 4, comment: 'Nice.' });
  assert.deepEqual(graded.writings[homework.id].review, { score: 4, comment: 'Nice.' });
  const student = sessionPayload(studentAccess, db);
  assert.deepEqual(student.state.writings[homework.id].review, { score: 4, comment: 'Nice.' });
  assert.deepEqual(student.lesson.content.stages.at(-1).content, [homework]);
  const reset = act(teacherAccess, { type: 'reset-stage' });
  assert.equal(reset.writings[homework.id], undefined);
});
