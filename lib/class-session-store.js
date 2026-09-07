'use strict';
const crypto = require('node:crypto');
const { parseCookies, getAuthenticatedUser } = require('./auth.js');
const { findClass } = require('./class-store.js');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const cookieName = id => `class_guest_${id}`;
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function classRow(id, db) {
  return db.prepare("SELECT * FROM classes WHERE id = ? AND status = 'upcoming'").get(id);
}
function guestIdentity(req, id, db) {
  const token = parseCookies(req.headers.cookie)[cookieName(id)];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const identity = hash(token);
  return db.prepare('SELECT 1 FROM class_guest_sessions WHERE token_hash = ? AND class_id = ? AND expires_at > ?')
    .get(identity, id, Date.now()) ? identity : null;
}
function joinClass(req, token, db) {
  const row = db.prepare("SELECT id FROM classes WHERE invite_token = ? AND status = 'upcoming'").get(token);
  if (!row) fail('Класс не найден.', 404);
  if (guestIdentity(req, row.id, db)) return { id: row.id };
  const secret = crypto.randomBytes(32).toString('hex');
  const seconds = 7 * 24 * 3600;
  db.prepare('DELETE FROM class_guest_sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO class_guest_sessions VALUES (?, ?, ?)').run(hash(secret), row.id, Date.now() + seconds * 1000);
  return { id: row.id, cookie: `${cookieName(row.id)}=${secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` };
}
function authorizeClass(req, id, db, role) {
  const row = classRow(id, db);
  if (!row) return null;
  if (role !== 'student') {
    const user = getAuthenticatedUser(req, db);
    if (user?.id === row.owner_id) return { role: 'teacher', identity: user.id, classId: id, ownerId: row.owner_id };
  }
  if (role === 'teacher') return null;
  const identity = guestIdentity(req, id, db);
  return identity ? { role: 'student', identity, classId: id, ownerId: row.owner_id } : null;
}
function initialState(lesson) {
  if (lesson.content.stages[0]?.id !== 'warm-up') fail('В классе пока поддерживается только Warm Up.', 409);
  return { activeStageId: 'warm-up', version: 0, selections: {} };
}
function readState(id, db) {
  const row = classRow(id, db);
  if (!row) fail('Класс недоступен.', 404);
  const saved = db.prepare('SELECT state_json FROM class_live_state WHERE class_id = ?').get(id);
  return saved ? JSON.parse(saved.state_json) : initialState({ content: JSON.parse(row.content_json) });
}
// Only the implemented stage is exposed to the student. Teacher-only content
// never travels to the guest browser, including in inactive stages.
function studentContent(content) {
  return {
    meta: content.meta,
    stages: content.stages.map(stage => ({
      id: stage.id, number: stage.number, title: stage.title,
      subtitle: stage.subtitle, durationMinutes: stage.durationMinutes, icon: stage.icon,
      content: stage.id === 'warm-up' ? (stage.content || []).filter(component =>
        component.type === 'thisOrThat' || component.type === 'taskPrompt'
        || (component.type === 'markdownCard' && component.studentVisibility === 'always')) : null,
    })),
  };
}
function sessionPayload(access, db) {
  const lesson = findClass(access.classId, access.ownerId, db);
  const state = readState(access.classId, db);
  return { role: access.role, state, lesson: {
    id: lesson.id,
    content: access.role === 'student' ? studentContent(lesson.content) : lesson.content,
  } };
}
function guestCanReadAsset(access, name, db) {
  const { lesson } = sessionPayload(access, db);
  const assetPath = `/api/classes/${access.classId}/assets/${name}`;
  function contains(value) {
    if (typeof value === 'string') return value === assetPath;
    if (Array.isArray(value)) return value.some(contains);
    return value && typeof value === 'object' ? Object.values(value).some(contains) : false;
  }
  return contains(lesson.content);
}
function applyAction(access, action, db) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) fail('Некорректное действие.');
  const state = readState(access.classId, db);
  if (action.type === 'select-stage') {
    if (access.role !== 'teacher') fail('Стадией управляет преподаватель.', 403);
    if (action.stageId !== 'warm-up') fail('Пока доступен только Warm Up.');
    return state;
  }
  if (action.type !== 'select-option') fail('Неизвестное действие.');
  if (access.role !== 'student') fail('Ответ выбирает ученик.', 403);
  if (action.stageId !== state.activeStageId) fail('Стадия уже изменилась.', 409);
  // A stale or repeated command cannot overwrite newer state, even after reconnect.
  if (action.expectedVersion !== state.version) fail('Состояние обновилось. Повторите выбор.', 409);
  const lesson = findClass(access.classId, access.ownerId, db);
  const component = lesson.content.stages[0].content?.find(item => item.id === action.componentId && item.type === 'thisOrThat');
  const item = component?.items.find(item => item.id === action.itemId);
  if (!item?.options.some(option => option.id === action.optionId)) fail('Вариант не найден.');
  state.selections[component.id] = { ...state.selections[component.id], [item.id]: action.optionId };
  state.version++;
  db.prepare('INSERT INTO class_live_state VALUES (?, ?) ON CONFLICT(class_id) DO UPDATE SET state_json = excluded.state_json')
    .run(access.classId, JSON.stringify(state));
  return state;
}
module.exports = { joinClass, authorizeClass, readState, sessionPayload, applyAction, guestCanReadAsset };
