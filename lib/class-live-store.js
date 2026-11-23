'use strict';
const crypto = require('node:crypto');
const { parseCookies, getAuthenticatedUser } = require('./auth.js');
const { findClassSession } = require('./class-store.js');
const rules = require('../assets/class-rules.js');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const cookieName = classId => `class_guest_${classId}`;
// A started session stays current for this long, so a late student still lands in the running lesson.
const CURRENT_SESSION_WINDOW_MS = 90 * 60 * 1000;
// Until the teacher can edit the roster, a cap keeps typos and pranks from filling it.
const MAX_GROUP_STUDENTS = 30;
const MAX_STUDENT_NAME = 40;
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function sessionRow(id, db) {
  return db.prepare(`SELECT s.*, c.owner_id, c.is_group FROM class_sessions s JOIN classes c ON c.id = s.class_id
    WHERE s.id = ? AND s.status = 'upcoming'`).get(id);
}
// The device's guest session, with the student picked on it in a group class.
function guestSession(req, classId, db) {
  const token = parseCookies(req.headers.cookie)[cookieName(classId)];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare(`SELECT g.token_hash, st.id AS student_id, st.name AS student_name FROM class_guest_sessions g
    LEFT JOIN class_students st ON st.id = g.student_id WHERE g.token_hash = ? AND g.class_id = ? AND g.expires_at > ?`)
    .get(hash(token), classId, Date.now()) ?? null;
}
const classByToken = (token, db) => db.prepare('SELECT id, name, is_group FROM classes WHERE invite_token = ?').get(token) ?? fail('Класс не найден.', 404);
const presentStudent = guest => guest?.student_id ? { id: guest.student_id, name: guest.student_name } : null;
// The class home offers the latest session started within the window, otherwise the nearest upcoming one.
function currentSessionId(classId, db, now = Date.now()) {
  const at = time => new Date(time).toISOString();
  const find = (condition, order, ...params) => db.prepare(`SELECT id FROM class_sessions
    WHERE class_id = ? AND status = 'upcoming' AND ${condition} ORDER BY scheduled_at ${order} LIMIT 1`).get(classId, ...params);
  return (find('scheduled_at > ? AND scheduled_at <= ?', 'DESC', at(now - CURRENT_SESSION_WINDOW_MS), at(now))
    ?? find('scheduled_at > ?', 'ASC', at(now)))?.id ?? null;
}
// The class home lists every non-cancelled session. The rows carry no lesson content, so the whole history stays small.
// A group also gets its roster and the student picked on this device, so the home can ask «Кто вы?».
function classOverview(req, token, db) {
  const row = classByToken(token, db);
  const now = Date.now(), currentId = currentSessionId(row.id, db, now);
  const sessions = db.prepare(`SELECT id, title, level, duration, cover, scheduled_at FROM class_sessions
    WHERE class_id = ? AND status = 'upcoming' ORDER BY scheduled_at, id`).all(row.id)
    .map(({ scheduled_at, ...session }) => ({ ...session, scheduledAt: scheduled_at, path: `/sessions/${session.id}/student` }));
  const started = session => Date.parse(session.scheduledAt) <= now;
  const group = row.is_group ? {
    students: db.prepare('SELECT id, name FROM class_students WHERE class_id = ? ORDER BY name').all(row.id),
    me: presentStudent(guestSession(req, row.id, db)),
  } : {};
  return {
    className: row.name,
    isGroup: Boolean(row.is_group),
    ...group,
    current: sessions.find(session => session.id === currentId) ?? null,
    upcoming: sessions.filter(session => !started(session)),
    past: sessions.filter(started).reverse(),
  };
}
// Without `sessionId` the student lands on the class home, which offers the current session and the list.
// A group student who has not picked a name yet lands there too and enters the session after picking.
function joinClass(req, token, db, sessionId) {
  const row = classByToken(token, db);
  if (sessionId && !db.prepare("SELECT 1 FROM class_sessions WHERE id = ? AND class_id = ? AND status = 'upcoming'").get(sessionId, row.id)) fail('Занятие не найдено.', 404);
  const guest = guestSession(req, row.id, db);
  const joined = { sessionId: sessionId && (!row.is_group || guest?.student_id) ? sessionId : null };
  if (guest) return joined;
  const secret = crypto.randomBytes(32).toString('hex');
  const seconds = 7 * 24 * 3600;
  db.prepare('DELETE FROM class_guest_sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO class_guest_sessions (token_hash, class_id, expires_at) VALUES (?, ?, ?)').run(hash(secret), row.id, Date.now() + seconds * 1000);
  return { ...joined, cookie: `${cookieName(row.id)}=${secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` };
}
// The device picks an existing name or adds a new one; names differ within the class regardless of case.
function pickStudent(req, token, input, db) {
  const row = classByToken(token, db);
  if (!row.is_group) fail('Это индивидуальный класс.');
  const guest = guestSession(req, row.id, db);
  if (!guest) fail('Обновите страницу класса.', 403);
  db.exec('BEGIN IMMEDIATE');
  try {
    const students = db.prepare('SELECT id, name FROM class_students WHERE class_id = ?').all(row.id);
    let student;
    if (typeof input?.studentId === 'string') {
      student = students.find(item => item.id === input.studentId) ?? fail('Такого ученика нет в классе. Обновите страницу.', 404);
    } else {
      const name = typeof input?.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
      if (!name || name.length > MAX_STUDENT_NAME) fail(`Введите имя (до ${MAX_STUDENT_NAME} символов).`);
      const key = name.toLocaleLowerCase('ru');
      if (students.some(item => item.name.toLocaleLowerCase('ru') === key)) fail('Такое имя уже есть — выберите его в списке или добавьте фамилию.', 409);
      if (students.length >= MAX_GROUP_STUDENTS) fail('В классе уже слишком много имён — выберите своё в списке.', 409);
      student = { id: crypto.randomUUID(), name };
      db.prepare('INSERT INTO class_students (id, class_id, name, created_at) VALUES (?, ?, ?, ?)').run(student.id, row.id, name, new Date().toISOString());
    }
    db.prepare('UPDATE class_guest_sessions SET student_id = ? WHERE token_hash = ?').run(student.id, guest.token_hash);
    db.exec('COMMIT');
    return { me: student };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
function authorizeSession(req, id, db, role) {
  const row = sessionRow(id, db);
  if (!row) return null;
  if (role !== 'student') {
    const user = getAuthenticatedUser(req, db);
    if (user?.id === row.owner_id) return { role: 'teacher', identity: user.id, sessionId: id, ownerId: row.owner_id };
  }
  if (role === 'teacher') return null;
  const guest = guestSession(req, row.class_id, db);
  if (!guest) return null;
  const access = { role: 'student', identity: guest.token_hash, sessionId: id, ownerId: row.owner_id };
  if (!row.is_group) return access;
  // A group student is the picked name rather than the device, so a second device of the same student is the same participant.
  return guest.student_id ? { ...access, identity: guest.student_id, studentId: guest.student_id, name: guest.student_name } : null;
}
function saveState(id, state, db) {
  db.prepare('INSERT INTO class_live_state VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET state_json = excluded.state_json').run(id, JSON.stringify(state));
}
function readState(id, db) {
  const row = sessionRow(id, db);
  if (!row) fail('Класс недоступен.', 404);
  const saved = db.prepare('SELECT state_json FROM class_live_state WHERE session_id = ?').get(id);
  const content = JSON.parse(row.content_json);
  const state = saved ? JSON.parse(saved.state_json) : rules.initialState(content);
  if (rules.addLayouts(content, state, () => crypto.randomUUID())) saveState(id, state, db);
  return state;
}
function sessionPayload(access, db) {
  const lesson = findClassSession(access.sessionId, access.ownerId, db);
  const state = readState(access.sessionId, db);
  const { _layouts, ...publicState } = state;
  return { pointerComponentIds: rules.pointerComponentIds(lesson.content, state), role: access.role, state: publicState, availableStageIds: rules.availableStageIds(lesson.content),
    // The student returns from a session to the class home, which lists the other sessions.
    ...(access.role === 'student' ? { classPath: lesson.classInvitePath } : {}), lesson: {
    id: lesson.id,
    content: access.role === 'student' ? rules.studentContent(lesson.content, state) : rules.teacherContent(lesson.content, state),
  } };
}
// The cover is shown on the class home, so the student may read it alongside the lesson media.
function guestCanReadAsset(access, name, db) {
  const assetPath = `/api/sessions/${access.sessionId}/assets/${name}`;
  if (findClassSession(access.sessionId, access.ownerId, db).cover === assetPath) return true;
  const { lesson } = sessionPayload(access, db);
  function contains(value) {
    if (typeof value === 'string') return value === assetPath;
    if (Array.isArray(value)) return value.some(contains);
    return value && typeof value === 'object' ? Object.values(value).some(contains) : false;
  }
  return contains(lesson.content);
}
function applyAction(access, action, db) {
  const state = readState(access.sessionId, db);
  const lesson = findClassSession(access.sessionId, access.ownerId, db);
  if (rules.applyAction(lesson.content, state, access.role, action)) saveState(access.sessionId, state, db);
  return state;
}
module.exports = { joinClass, classOverview, pickStudent, authorizeSession, readState, sessionPayload, applyAction, guestCanReadAsset };
