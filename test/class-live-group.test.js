'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const crypto = require('node:crypto');
const http = require('node:http');
const { WebSocket } = require('ws');
const Y = require('yjs');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClassSession } = require('../lib/class-store.js');
const { joinClass, pickStudent } = require('../lib/class-live-store.js');
const { syntheticLesson } = require('./helpers/synthetic-lessons.js');
const { ACTIONS } = require('../assets/components/homework-writing.js');
const { createClassLiveSignaling } = require('../lib/class-live-signaling.js');
const { createNotesSignaling } = require('../lib/lesson-notes-signaling.js');
const { addLibraryLesson } = require('./helpers/library.js');

// A group session with a teacher cookie and a way to bring in students by name, served by one signaling module.
async function fixture(t, createSignaling, content = syntheticLesson()) {
  const db = openDatabase(':memory:');
  const teacher = createUser({ email: 'group@test.example', displayName: 'Teacher', role: 'teacher', passwordHash: 'unused' }, db);
  addLibraryLesson(db, content);
  const lesson = createClassSession({ level: 'A2', age: '12-14', className: 'Группа B1', isGroup: true, lessonId: 'superhero', expectedRevision: 1,
    requestKey: crypto.randomUUID(), scheduledAt: '2099-01-01T10:00:00Z' }, teacher.id, db);
  const token = lesson.classInvitePath.split('/').at(-1);
  const teacherCookie = `teach_session=${createSession(teacher.id, db).token}`;
  const student = name => {
    const cookie = joinClass({ headers: {} }, token, db).cookie.split(';')[0];
    pickStudent({ headers: { cookie } }, token, { name }, db);
    return cookie;
  };
  const signaling = createSignaling({ database: db });
  const server = http.createServer();
  server.on('upgrade', signaling.handleUpgrade);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`, sockets = [];
  t.after(async () => {
    sockets.forEach(socket => socket.terminate());
    await new Promise(resolve => signaling.webSocketServer.close(resolve));
    await new Promise(resolve => server.close(resolve));
    db.close();
  });
  const connect = (channel, cookie, role = 'student') => {
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws/${channel}/${lesson.id}?role=${role}`, { headers: { Cookie: cookie, Origin: origin } });
    sockets.push(socket);
    socket.messages = [];
    socket.on('message', raw => socket.messages.push(JSON.parse(raw)));
    socket.next = async (type, accept = () => true) => {
      for (const deadline = Date.now() + 2000; Date.now() < deadline;) {
        const index = socket.messages.findIndex(message => message.type === type && accept(message));
        if (index >= 0) return socket.messages.splice(index, 1)[0];
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      throw new Error(`Timed out waiting for ${type}`);
    };
    return socket;
  };
  return { teacherCookie, student, connect };
}

test('a group session takes the teacher and eight students, each by name', { timeout: 15000 }, async t => {
  const { teacherCookie, student, connect } = await fixture(t, createClassLiveSignaling);
  const teacher = connect('sessions', teacherCookie, 'teacher');
  assert.equal((await teacher.next('snapshot')).isGroup, true);
  const names = ['Оля', 'Маша', 'Петя', 'Аня', 'Вова', 'Женя', 'Дима', 'Костя'];
  const cookies = Object.fromEntries(names.map(name => [name, student(name)]));
  const students = {};
  for (const name of names) {
    students[name] = connect('sessions', cookies[name]);
    await students[name].next('snapshot');
  }
  const everyone = [...names].sort((a, b) => a.localeCompare(b, 'ru'));
  assert.deepEqual(await teacher.next('presence', message => message.students.length === 8), { type: 'presence', teacher: true, students: everyone });
  await students['Оля'].next('presence', message => message.teacher && message.students.length === 8);

  // The ninth student waits for a free place; Маша's new tab replaces her old one.
  const ninth = connect('sessions', student('Лена'));
  const [code, reason] = await once(ninth, 'close');
  assert.deepEqual([code, String(reason)], [4003, 'В занятии уже 8 учеников.']);
  const replaced = once(students['Маша'], 'close');
  const mashaPhone = connect('sessions', cookies['Маша']);
  await mashaPhone.next('snapshot');
  assert.equal((await replaced)[0], 4001);

  // A reaction reaches everyone but the sender.
  students['Петя'].send(JSON.stringify({ type: 'reaction', kind: 'heart' }));
  await teacher.next('reaction');
  await students['Оля'].next('reaction');
  await mashaPhone.next('reaction');
  assert.equal(students['Петя'].messages.some(message => message.type === 'reaction'), false);

  // Two students answer the same question: the first answer counts, the second quietly gets the fresh state.
  const answer = { type: 'choose-option', stageId: 'reading', componentId: 'reading-gist-quiz', itemId: 'main-idea',
    value: 'The writer discovered that an exchange week was challenging but rewarding.' };
  students['Оля'].send(JSON.stringify(answer));
  const own = await students['Оля'].next('action');
  assert.equal(own.own, true);
  const seen = await students['Петя'].next('action');
  assert.equal(seen.own, undefined);
  assert.deepEqual(seen.state, own.state);
  assert.equal((await teacher.next('action')).own, undefined);
  students['Петя'].send(JSON.stringify(answer));
  const conflict = await students['Петя'].next('action-error');
  assert.equal(conflict.conflict, true);
  assert.deepEqual(conflict.state, own.state);
  // The teacher switches the stage without a version, whatever the students did meanwhile.
  teacher.send(JSON.stringify({ type: 'select-stage', stageId: 'reading' }));
  assert.equal((await mashaPhone.next('action', message => message.state.activeStageId === 'reading')).own, undefined);
});

test('group notes are written by the teacher and read by the students', { timeout: 15000 }, async t => {
  const { teacherCookie, student, connect } = await fixture(t, createNotesSignaling);
  const teacher = connect('notes', teacherCookie, 'teacher');
  const teacherHello = await teacher.next('hello');
  assert.deepEqual([teacherHello.group, teacherHello.editable], [true, true]);
  const masha = connect('notes', student('Маша')), petya = connect('notes', student('Петя'));
  const mashaHello = await masha.next('hello');
  assert.deepEqual([mashaHello.group, mashaHello.editable], [true, false]);
  await petya.next('hello');
  const write = (socket, hello, text) => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, Buffer.from(hello.state, 'base64'));
    const paragraph = new Y.XmlElement('paragraph');
    paragraph.insert(0, [new Y.XmlText(text)]);
    doc.getXmlFragment('notes').push([paragraph]);
    socket.send(JSON.stringify({ type: 'sync', id: 1, update: Buffer.from(Y.encodeStateAsUpdate(doc, Buffer.from(hello.vector, 'base64'))).toString('base64') }));
    doc.destroy();
  };
  write(teacher, teacherHello, 'Домашка: упр. 3');
  assert.equal((await teacher.next('ack')).id, 1);
  await masha.next('update');
  await petya.next('update');
  const closed = once(masha, 'close');
  write(masha, mashaHello, 'шалость');
  assert.match((await masha.next('error')).error, /Не удалось сохранить/);
  assert.equal((await closed)[0], 4009);
  // The header of the lesson shows who is in, so group notes keep quiet about it.
  assert.equal([teacher, petya].some(socket => socket.messages.some(message => message.type === 'presence')), false);
});

test('in a group each student keeps their own homework and self-assessment, and the teacher sees everyone\'s', { timeout: 15000 }, async t => {
  const content = syntheticLesson();
  const homework = { type: 'homeworkWriting', id: 'homework-comment', title: 'Comment', instruction: 'Write.', task: 'Write a comment.', minWords: 10, maxWords: 40 };
  content.stages.push({ id: 'homework', number: content.stages.length + 1, title: 'Homework', icon: 'pencil', content: [homework] });
  const { teacherCookie, student, connect } = await fixture(t, createClassLiveSignaling, content);
  const masha = connect('sessions', student('Маша')), petya = connect('sessions', student('Петя'));
  await masha.next('snapshot');
  await petya.next('snapshot');
  const teacher = connect('sessions', teacherCookie, 'teacher');
  const snapshot = await teacher.next('snapshot');
  assert.deepEqual(snapshot.students.map(item => item.name), ['Маша', 'Петя']);
  const ids = Object.fromEntries(snapshot.students.map(item => [item.name, item.id]));
  const act = async (socket, action) => {
    socket.send(JSON.stringify(action));
    return socket.next('action', message => message.own);
  };
  const ENOUGH = 'I think we should keep our phones on silent in class today.';
  const assess = { type: 'select-assessment', stageId: 'wrap-up', componentId: 'wrap-up-self-assessment' };
  const write = { stageId: 'homework', componentId: homework.id };

  // Маша's choice and text are hers: Петя does not see them, the teacher sees them by her id.
  assert.deepEqual((await act(masha, { ...assess, selectedId: 'withHelp' })).state.selfAssessments, { 'wrap-up-self-assessment': 'withHelp' });
  assert.equal((await petya.next('action')).state.selfAssessments, undefined);
  assert.equal((await teacher.next('action')).state.personal[ids['Маша']].selfAssessments['wrap-up-self-assessment'], 'withHelp');
  await act(masha, { ...write, type: ACTIONS.submit, text: ENOUGH });
  const petyaDraft = await act(petya, { ...write, type: ACTIONS.write, text: 'My own words' });
  assert.deepEqual(petyaDraft.state.writings[homework.id], { text: 'My own words', status: 'draft' });

  // The teacher grades the student the action names; without one, personal work is out of reach.
  teacher.messages.length = 0;
  teacher.send(JSON.stringify({ ...assess, selectedId: 'independent' }));
  assert.equal((await teacher.next('action-error')).error, 'Выберите ученика.');
  const graded = await act(teacher, { ...write, type: ACTIONS.review, score: 5, comment: 'Great!', studentId: ids['Маша'] });
  assert.equal(graded.state.personal[ids['Маша']].writings[homework.id].status, 'checked');
  assert.equal(graded.state.personal[ids['Петя']].writings[homework.id].status, 'draft');
  assert.deepEqual((await masha.next('action', message => message.state.writings?.[homework.id]?.status === 'checked')).state.writings[homework.id].review,
    { score: 5, comment: 'Great!' });

  // Resetting a stage clears everyone's work on it.
  const reset = await act(teacher, { type: 'reset-stage', stageId: 'homework' });
  for (const name of ['Маша', 'Петя']) assert.equal(reset.state.personal[ids[name]].writings[homework.id], undefined);
  assert.equal(reset.state.personal[ids['Маша']].selfAssessments['wrap-up-self-assessment'], 'withHelp');
});
