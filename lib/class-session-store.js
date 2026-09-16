'use strict';
const crypto = require('node:crypto');
const { parseCookies, getAuthenticatedUser } = require('./auth.js');
const { findClass } = require('./class-store.js');
const { studentComponent, teacherComponent, applyComponentAction, clearComponentState } = require('./class-component-handlers.js');
const componentTree = require('../assets/components/component-tree.js');
require('../assets/components/card-row.js');
require('../assets/components/mini-situation.js');
const supportedStages = new Set(['warm-up', 'lead-in', 'target-vocabulary', 'reading', 'listening', 'grammar-presentation', 'grammar-focus', 'guided-speaking', 'wrap-up']);
const availableStageIds = content => content.stages.filter(stage => supportedStages.has(stage.id) && stage.content?.length).map(stage => stage.id);
const { createLayout } = require('../assets/components/exercise-state.js');
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
  const activeStageId = availableStageIds(lesson.content)[0];
  if (!activeStageId) fail('В классе нет доступных стадий.', 409);
  return { activeStageId, version: 0, selections: {} };
}
function readState(id, db) {
  const row = classRow(id, db);
  if (!row) fail('Класс недоступен.', 404);
  const saved = db.prepare('SELECT state_json FROM class_live_state WHERE class_id = ?').get(id);
  const content = JSON.parse(row.content_json);
  const state = saved ? JSON.parse(saved.state_json) : initialState({ content });
  let changed = false;
  for (const stage of content.stages) for (const component of stage.content || []) {
    if (!['matchWords', 'fillInBlanks'].includes(component.type) || state._layouts?.[component.id]) continue;
    state._layouts = { ...state._layouts, [component.id]: createLayout(component, () => crypto.randomUUID()) };
    changed = true;
  }
  if (changed) db.prepare('INSERT INTO class_live_state VALUES (?, ?) ON CONFLICT(class_id) DO UPDATE SET state_json = excluded.state_json').run(id, JSON.stringify(state));
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
  const lesson = findClass(access.classId, access.ownerId, db);
  const state = readState(access.classId, db);
  const { _layouts, ...publicState } = state;
  return { role: access.role, state: publicState, availableStageIds: availableStageIds(lesson.content), lesson: {
    id: lesson.id,
    content: access.role === 'student' ? studentContent(lesson.content, state) : { ...lesson.content, stages: lesson.content.stages.map(stage => ({ ...stage, content: stage.content?.map(component => teacherComponent(component, state)) ?? null })) },
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
  const lesson = findClass(access.classId, access.ownerId, db);
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
  db.prepare('INSERT INTO class_live_state VALUES (?, ?) ON CONFLICT(class_id) DO UPDATE SET state_json = excluded.state_json')
    .run(access.classId, JSON.stringify(state));
  return state;
}
module.exports = { joinClass, authorizeClass, readState, sessionPayload, applyAction, guestCanReadAsset };
