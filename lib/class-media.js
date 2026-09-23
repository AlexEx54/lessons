'use strict';
const { collectComponents } = require('../assets/components/component-tree.js');
function validateMediaAction(role, action, payload) {
  const fail = () => { throw new Error('Некорректное действие с видео.'); };
  if (!['teacher', 'student'].includes(role) || action.stageId !== payload.state.activeStageId) fail();
  const component = collectComponents(payload.lesson.content.stages.filter(s => s.id === action.stageId))
    .find(c => c.id === action.componentId && c.type === 'videoPlayer' && c.videoSrc);
  if (!component) fail();
  const base = { type: action.type, stageId: action.stageId, componentId: component.id };
  if (action.type === 'media-command') {
    if (!['play', 'pause'].includes(action.action)) fail();
    return { ...base, action: action.action };
  }
  if (typeof action.position !== 'number' || !Number.isFinite(action.position) || action.position < 0 || action.position > 86400) fail();
  if (action.type === 'media-align') {
    if (role !== 'teacher') fail();
    return { ...base, position: action.position };
  }
  if (action.type !== 'media-status' || role !== 'student' || ['paused', 'buffering', 'blocked'].some(key => typeof action[key] !== 'boolean')) fail();
  return { ...base, position: action.position, paused: action.paused, buffering: action.buffering, blocked: action.blocked };
}
module.exports = { validateMediaAction };
