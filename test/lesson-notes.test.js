'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const { once } = require('node:events');
const Y = require('yjs');
const { WebSocket } = require('ws');
const { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } = require('@tiptap/y-tiptap');
const { openDatabase } = require('../lib/db.js');
const { createUser } = require('../lib/user-store.js');
const { createSession } = require('../lib/session-store.js');
const { createClass } = require('../lib/class-store.js');
const { joinClass } = require('../lib/class-session-store.js');
const { createLessonDraft, completeLessonDraft } = require('../lib/lesson-draft-store.js');
const { createSyntheticLesson } = require('../lib/synthetic-lesson.js');
const { publishLesson } = require('../lib/library-store.js');
const { notesSchema } = require('../lib/lesson-notes-editor.js');
const { EMPTY_NOTES, validateNotes, readDraftNotes, saveDraftNotes } = require('../lib/lesson-notes-schema.js');
const { readClassNotes, persistUpdate } = require('../lib/lesson-notes-store.js');
const { createNotesSignaling } = require('../lib/lesson-notes-signaling.js');
const content = text => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const textOf = doc => yDocToProsemirrorJSON(doc, 'notes').content[0].content.map(node => node.text || '').join('');
function setup(t) {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const teacher = createUser({ email: `${crypto.randomUUID()}@notes.test`, displayName: 'Teacher', role: 'admin', passwordHash: 'unused' }, db);
  const lesson = createSyntheticLesson('Notes');
  lesson.notes = content('Start');
  db.prepare("UPDATE library_lessons SET content_json = ?, is_available = 1, revision = 1 WHERE id = 'superhero'").run(JSON.stringify(lesson));
  const makeClass = () => createClass({ name: 'Notes', lessonId: 'superhero', expectedRevision: 1, requestKey: crypto.randomUUID() }, teacher.id, db);
  return { db, teacher, makeClass };
}

test('draft notes: ownership, version conflicts, formatting validation and publication snapshot', t => {
  const { db, teacher } = setup(t);
  const draft = createLessonDraft({ ownerAdminId: teacher.id, topic: 'Notes', template: 'general' }, db);
  completeLessonDraft(draft.id, teacher.id, createSyntheticLesson('Notes'), db);
  assert.deepEqual(readDraftNotes(draft.id, teacher.id, db).content, EMPTY_NOTES);
  const formatted = content('Prepared vocabulary');
  formatted.content[0].content[0].marks = [{ type: 'bold' }, { type: 'highlight', attrs: {} }];
  saveDraftNotes(draft.id, teacher.id, { version: 0, content: formatted }, db);
  assert.throws(() => readDraftNotes(draft.id, 'other', db), { statusCode: 404 });
  assert.throws(() => saveDraftNotes(draft.id, teacher.id, { version: 0, content: content('Stale') }, db), { statusCode: 409 });
  assert.deepEqual(readDraftNotes(draft.id, teacher.id, db).content, formatted);
  assert.throws(() => validateNotes({ type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:evil' } }] }));
  assert.throws(() => validateNotes(content('x'.repeat(300000))));
  assert.throws(() => validateNotes({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'javascript:evil' } }] }] }] }));
  const updatedAt = db.prepare('SELECT updated_at FROM lesson_drafts WHERE id = ?').get(draft.id).updated_at;
  const published = publishLesson(draft.id, teacher.id, {
    expectedUpdatedAt: updatedAt, expectedRevision: 0, title: 'Notes', description: 'Notes', category: 'General English', skills: ['Writing'], duration: '45 мин', allowIncompleteImages: true,
    coverUpload: { type: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII=' },
  }, db, '/unused');
  const publishedContent = JSON.parse(db.prepare('SELECT content_json FROM library_lessons WHERE id = ?').get(published.id).content_json);
  assert.deepEqual(publishedContent.notes, formatted);
  const session = createClass({ name: 'Snapshot', lessonId: published.id, expectedRevision: published.revision, requestKey: crypto.randomUUID() }, teacher.id, db);
  saveDraftNotes(draft.id, teacher.id, { version: 1, content: content('Changed later') }, db);
  const doc = readClassNotes(session.id, db);
  assert.equal(textOf(doc), 'Prepared vocabulary');
  doc.destroy();
});

test('class notes merge concurrent edits, persist deletions, reject invalid updates and isolate classes', t => {
  const { db, makeClass } = setup(t);
  const lesson = makeClass(), other = makeClass();
  const server = readClassNotes(lesson.id, db);
  const a = new Y.Doc(), b = new Y.Doc();
  const baseline = Y.encodeStateAsUpdate(server), vector = Y.encodeStateVector(server);
  Y.applyUpdate(a, baseline); Y.applyUpdate(b, baseline);
  a.getXmlFragment('notes').get(0).get(0).insert(0, 'Teacher ');
  b.getXmlFragment('notes').get(0).get(0).insert(5, ' Student');
  const ua = Y.encodeStateAsUpdate(a, vector), ub = Y.encodeStateAsUpdate(b, vector);
  persistUpdate(lesson.id, server, ua, db);
  persistUpdate(lesson.id, server, ub, db);
  persistUpdate(lesson.id, server, ua, db);
  Y.applyUpdate(a, ub); Y.applyUpdate(b, ua);
  assert.equal(textOf(a), textOf(b));
  assert.equal(textOf(server), 'Teacher Start Student');
  server.destroy();
  const restored = readClassNotes(lesson.id, db);
  assert.equal(textOf(restored), textOf(a));
  const beforeDelete = Y.encodeStateVector(a);
  a.getXmlFragment('notes').get(0).get(0).delete(0, 8);
  persistUpdate(lesson.id, restored, Y.encodeStateAsUpdate(a, beforeDelete), db);
  assert.equal(textOf(restored), 'Start Student');
  const bad = new Y.Doc(); Y.applyUpdate(bad, Y.encodeStateAsUpdate(restored));
  bad.getMap('private').set('x', true);
  assert.throws(() => persistUpdate(lesson.id, restored, Y.encodeStateAsUpdate(bad), db));
  assert.equal(textOf(restored), 'Start Student');
  const independent = readClassNotes(other.id, db);
  assert.equal(textOf(independent), 'Start');
  [a, b, bad, restored, independent].forEach(doc => doc.destroy());
});

test('notes websocket authorizes both roles, persists before ack and recovers missing updates', { timeout: 15000 }, async t => {
  const { db, teacher, makeClass } = setup(t);
  const lesson = makeClass(), other = makeClass();
  const cookie = `teach_session=${createSession(teacher.id, db).token}`;
  const invite = db.prepare('SELECT invite_token FROM classes WHERE id = ?').get(lesson.id).invite_token;
  const guest = joinClass({ headers: {} }, invite, db).cookie.split(';')[0];
  const signaling = createNotesSignaling({ database: db });
  const server = http.createServer();
  server.on('upgrade', signaling.handleUpgrade);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  t.after(async () => {
    sockets.forEach(socket => socket.terminate());
    await new Promise(resolve => signaling.webSocketServer.close(resolve));
    await new Promise(resolve => server.close(resolve));
  });
  function connect(id, role, auth, requestOrigin = origin) {
    const socket = new WebSocket(`${origin.replace('http:', 'ws:')}/ws/notes/${id}?role=${role}`, { headers: { Cookie: auth, Origin: requestOrigin } });
    sockets.push(socket);
    const queue = [], waiters = [];
    socket.on('message', raw => { const message = JSON.parse(raw); const index = waiters.findIndex(waiter => waiter.type === message.type); if (index < 0) queue.push(message); else waiters.splice(index, 1)[0].resolve(message); });
    socket.next = type => { const index = queue.findIndex(message => message.type === type); return index < 0 ? new Promise(resolve => waiters.push({ type, resolve })) : Promise.resolve(queue.splice(index, 1)[0]); };
    return socket;
  }
  for (const [id, role, auth, requestOrigin] of [[lesson.id, 'teacher', guest, origin], [other.id, 'student', guest, origin], [lesson.id, 'teacher', cookie, 'http://evil.invalid']]) {
    const socket = connect(id, role, auth, requestOrigin);
    await new Promise(resolve => socket.on('unexpected-response', (_req, response) => { assert.equal(response.statusCode, 403); response.resume(); socket.terminate(); resolve(); }).on('error', () => {}));
  }
  const a = connect(lesson.id, 'teacher', cookie), b = connect(lesson.id, 'student', guest);
  const [helloA, helloB] = await Promise.all([a.next('hello'), b.next('hello')]);
  const docA = new Y.Doc(), docB = new Y.Doc();
  Y.applyUpdate(docA, Buffer.from(helloA.state, 'base64')); Y.applyUpdate(docB, Buffer.from(helloB.state, 'base64'));
  docA.getXmlFragment('notes').get(0).get(0).insert(0, 'A ');
  docB.getXmlFragment('notes').get(0).get(0).insert(5, ' B');
  function push(socket, doc, vector, id) { socket.send(JSON.stringify({ type: 'sync', id, update: Buffer.from(Y.encodeStateAsUpdate(doc, Buffer.from(vector, 'base64'))).toString('base64') })); }
  push(a, docA, helloA.vector, 1); push(b, docB, helloB.vector, 1);
  await Promise.all([a.next('ack'), b.next('ack')]);
  const saved = readClassNotes(lesson.id, db); assert.equal(textOf(saved), 'A Start B'); saved.destroy();
  Y.applyUpdate(docA, Buffer.from((await a.next('update')).update, 'base64'));
  Y.applyUpdate(docB, Buffer.from((await b.next('update')).update, 'base64'));
  assert.equal(textOf(docA), textOf(docB));
  b.close(); await once(b, 'close');
  docB.getXmlFragment('notes').get(0).get(0).insert(9, ' offline');
  const reconnected = connect(lesson.id, 'student', guest);
  const hello = await reconnected.next('hello');
  Y.applyUpdate(docB, Buffer.from(hello.state, 'base64'));
  push(reconnected, docB, hello.vector, 2);
  await reconnected.next('ack');
  const finalDoc = readClassNotes(lesson.id, db);
  assert.equal(textOf(finalDoc), 'A Start B offline');
  [docA, docB, finalDoc].forEach(doc => doc.destroy());
});

test('notes links survive draft and collaborative persistence; unsafe URLs are rejected', t => {
  const { db, teacher, makeClass } = setup(t);
  const linked = content('Study material');
  linked.content[0].content[0].marks = [{ type: 'link', attrs: { href: 'https://example.com/lesson?q=1', target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: null } }];
  validateNotes(linked);
  const draft = createLessonDraft({ ownerAdminId: teacher.id, topic: 'Links', template: 'general' }, db);
  completeLessonDraft(draft.id, teacher.id, createSyntheticLesson('Links'), db);
  saveDraftNotes(draft.id, teacher.id, { version: 0, content: linked }, db);
  assert.deepEqual(readDraftNotes(draft.id, teacher.id, db).content, linked);
  const lesson = makeClass();
  const server = readClassNotes(lesson.id, db);
  const client = new Y.Doc(); Y.applyUpdate(client, Y.encodeStateAsUpdate(server));
  const vector = Y.encodeStateVector(server);
  client.getXmlFragment('notes').get(0).get(0).format(0, 5, { link: linked.content[0].content[0].marks[0].attrs });
  persistUpdate(lesson.id, server, Y.encodeStateAsUpdate(client, vector), db);
  const restored = readClassNotes(lesson.id, db);
  assert.equal(yDocToProsemirrorJSON(restored, 'notes').content[0].content[0].marks[0].attrs.href, 'https://example.com/lesson?q=1');
  for (const href of ['javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd', 'java\nscript:alert(1)']) {
    const unsafe = structuredClone(linked); unsafe.content[0].content[0].marks[0].attrs.href = href;
    assert.throws(() => validateNotes(unsafe));
  }
  [server, client, restored].forEach(doc => doc.destroy());
});

test('bare domains become links without a trailing space, including loaded and formatted text', () => {
  const { EditorState } = require('@tiptap/pm/state');
  const { linkNotesTransaction } = require('../lib/lesson-notes-links.js');
  const schema = notesSchema();
  for (const text of ['www.example.com', 'https://example.com/path', 'example.com']) {
    let state = EditorState.create({ schema, doc: schema.nodeFromJSON(content(text)) });
    const tr = linkNotesTransaction(state);
    assert.ok(tr, text);
    state = state.apply(tr);
    assert.equal(state.doc.firstChild.firstChild.marks[0].attrs.href, text.startsWith('https:') ? text : `https://${text}`);
    assert.equal(linkNotesTransaction(state), null, 'normalization must not loop');
    state = state.apply(state.tr.insertText('/lesson', state.doc.content.size - 1));
    state = state.apply(linkNotesTransaction(state));
    assert.ok(state.doc.firstChild.firstChild.marks[0].attrs.href.endsWith('/lesson'));
  }
  const formatted = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'www.', marks: [{ type: 'bold' }] }, { type: 'text', text: 'example.com' }] }] };
  let state = EditorState.create({ schema, doc: schema.nodeFromJSON(formatted) });
  state = state.apply(linkNotesTransaction(state));
  assert.ok(state.doc.firstChild.firstChild.marks.some(mark => mark.type.name === 'bold'));
  assert.ok(state.doc.firstChild.firstChild.marks.some(mark => mark.attrs.href === 'https://www.example.com'));
});
