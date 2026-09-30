'use strict';
const crypto = require('node:crypto');
const { parseCookies, getAuthenticatedUser } = require('./auth.js');
const { findClassSession } = require('./class-store.js');
const { studentComponent, teacherComponent, applyComponentAction, clearComponentState } = require('./class-component-handlers.js');
const componentTree = require('../assets/components/component-tree.js');
require('../assets/components/card-row.js');
require('../assets/components/mini-situation.js');
const supportedStages = new Set(['watch-and-interact', 'warm-up', 'lead-in', 'target-vocabulary', 'reading', 'listening', 'grammar-presentation', 'grammar-focus', 'guided-speaking', 'wrap-up']);
const availableStageIds = content => content.stages.filter(stage => supportedStages.has(stage.id) && stage.content?.length).map(stage => stage.id);
const { createLayout } = require('../assets/components/exercise-state.js');
const hash = token => crypto.createHash('sha256').update(token).digest('hex');
const cookieName = classId => `class_guest_${classId}`;
// A started session stays current for this long, so a late student still lands in the running lesson.
const CURRENT_SESSION_WINDOW_MS = 90 * 60 * 1000;
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function sessionRow(id, db) {
  return db.prepare(`SELECT s.*, c.owner_id FROM class_sessions s JOIN classes c ON c.id = s.class_id
    WHERE s.id = ? AND s.status = 'upcoming'`).get(id);
}
function guestIdentity(req, classId, db) {
  const token = parseCookies(req.headers.cookie)[cookieName(classId)];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const identity = hash(token);
  return db.prepare('SELECT 1 FROM class_guest_sessions WHERE token_hash = ? AND class_id = ? AND expires_at > ?')
    .get(identity, classId, Date.now()) ? identity : null;
}
// The permanent class link opens the latest session started within the window, otherwise the nearest upcoming one.
function currentSessionId(classId, db) {
  const now = Date.now(), at = time => new Date(time).toISOString();
  const find = (condition, order, ...params) => db.prepare(`SELECT id FROM class_sessions
    WHERE class_id = ? AND status = 'upcoming' AND ${condition} ORDER BY scheduled_at ${order} LIMIT 1`).get(classId, ...params);
  return (find('scheduled_at > ? AND scheduled_at <= ?', 'DESC', at(now - CURRENT_SESSION_WINDOW_MS), at(now))
    ?? find('scheduled_at > ?', 'ASC', at(now)))?.id ?? null;
}
// Without `sessionId` the class link resolves to the current session, which may be none yet.
function joinClass(req, token, db, sessionId) {
  const row = db.prepare('SELECT id FROM classes WHERE invite_token = ?').get(token);
  if (!row) fail('Класс не найден.', 404);
  if (sessionId && !db.prepare("SELECT 1 FROM class_sessions WHERE id = ? AND class_id = ? AND status = 'upcoming'").get(sessionId, row.id)) fail('Занятие не найдено.', 404);
  const joined = { sessionId: sessionId || currentSessionId(row.id, db) };
  if (guestIdentity(req, row.id, db)) return joined;
  const secret = crypto.randomBytes(32).toString('hex');
  const seconds = 7 * 24 * 3600;
  db.prepare('DELETE FROM class_guest_sessions WHERE expires_at <= ?').run(Date.now());
  db.prepare('INSERT INTO class_guest_sessions VALUES (?, ?, ?)').run(hash(secret), row.id, Date.now() + seconds * 1000);
  return { ...joined, cookie: `${cookieName(row.id)}=${secret}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${seconds}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}` };
}
function authorizeSession(req, id, db, role) {
  const row = sessionRow(id, db);
  if (!row) return null;
  if (role !== 'student') {
    const user = getAuthenticatedUser(req, db);
    if (user?.id === row.owner_id) return { role: 'teacher', identity: user.id, sessionId: id, ownerId: row.owner_id };
  }
  if (role === 'teacher') return null;
  const identity = guestIdentity(req, row.class_id, db);
  return identity ? { role: 'student', identity, sessionId: id, ownerId: row.owner_id } : null;
}
function initialState(lesson) {
  const activeStageId = availableStageIds(lesson.content)[0];
  if (!activeStageId) fail('В классе нет доступных стадий.', 409);
  return { activeStageId, version: 0, selections: {} };
}
function readState(id, db) {
  const row = sessionRow(id, db);
  if (!row) fail('Класс недоступен.', 404);
  const saved = db.prepare('SELECT state_json FROM class_live_state WHERE session_id = ?').get(id);
  const content = JSON.parse(row.content_json);
  const state = saved ? JSON.parse(saved.state_json) : initialState({ content });
  let changed = false;
  for (const stage of content.stages) for (const component of stage.content || []) {
    if (!['matchWords', 'sentenceBuilder', 'sentenceMatching', 'fillInBlanks'].includes(component.type) || state._layouts?.[component.id]) continue;
    state._layouts = { ...state._layouts, [component.id]: createLayout(component, () => crypto.randomUUID()) };
    changed = true;
  }
  if (changed) db.prepare('INSERT INTO class_live_state VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET state_json = excluded.state_json').run(id, JSON.stringify(state));
  return state;
}
// Apply the same projection for HTTP, WebSocket and guest asset access.
function studentContent(content, state) {
  const available = availableStageIds(content);
  return {
    meta: content.meta,
    stages: content.stages.map(stage => ({
      id: stage.id, number: stage.number, title: stage.title,
      subtitle: stage.subtitle, durationMinutes: stage.durationMinutes, icon: stage.icon,
      content: available.includes(stage.id) ? stage.content.map(component => studentComponent(component, state)).filter(Boolean) : null,
    })),
  };
}
function sessionPayload(access, db) {
  const lesson = findClassSession(access.sessionId, access.ownerId, db);
  const state = readState(access.sessionId, db);
  const { _layouts, ...publicState } = state;
  return { pointerComponentIds: componentTree.collectComponents(studentContent(lesson.content, state).stages).map(component => component.id), role: access.role, state: publicState, availableStageIds: availableStageIds(lesson.content), lesson: {
    id: lesson.id,
    content: access.role === 'student' ? studentContent(lesson.content, state) : { ...lesson.content, stages: lesson.content.stages.map(stage => ({ ...stage, content: stage.content?.map(component => teacherComponent(component, state)) ?? null })) },
  } };
}
function guestCanReadAsset(access, name, db) {
  const { lesson } = sessionPayload(access, db);
  const assetPath = `/api/sessions/${access.sessionId}/assets/${name}`;
  function contains(value) {
    if (typeof value === 'string') return value === assetPath;
    if (Array.isArray(value)) return value.some(contains);
    return value && typeof value === 'object' ? Object.values(value).some(contains) : false;
  }
  return contains(lesson.content);
}
function applyAction(access, action, db) {
  if (!action || typeof action !== 'object' || Array.isArray(action)) fail('Некорректное действие.');
  const state = readState(access.sessionId, db);
  const lesson = findClassSession(access.sessionId, access.ownerId, db);
  if (action.type === 'select-stage' && access.role !== 'teacher') fail('Стадией управляет преподаватель.', 403);
  if (action.type === 'reset-stage' && access.role !== 'teacher') fail('Сбрасывать прогресс может только преподаватель.', 403);
  if (action.expectedVersion !== state.version) fail('Состояние обновилось. Повторите действие.', 409);
  if (action.type === 'select-stage') {
    if (!availableStageIds(lesson.content).includes(action.stageId)) fail('Стадия пока недоступна.');
    if (action.stageId === state.activeStageId) return state;
    state.activeStageId = action.stageId;
  } else {
    if (action.stageId !== state.activeStageId) fail('Стадия уже изменилась.', 409);
    const stage = lesson.content.stages.find(stage => stage.id === action.stageId);
    if (action.type === 'reset-stage') {
      if (!stage) fail('Стадия не найдена.', 404);
      for (const component of componentTree.collectComponents([stage])) clearComponentState({ component, state });
    } else {
      const component = stage && componentTree.collectComponents([stage]).find(item => item.id === action.componentId);
      if (!component) fail('Компонент не найден.');
      applyComponentAction({ role: access.role, component, action, state });
    }
  }
  state.version++;
  db.prepare('INSERT INTO class_live_state VALUES (?, ?) ON CONFLICT(session_id) DO UPDATE SET state_json = excluded.state_json')
    .run(access.sessionId, JSON.stringify(state));
  return state;
}
module.exports = { joinClass, authorizeSession, readState, sessionPayload, applyAction, guestCanReadAsset };
