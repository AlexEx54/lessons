'use strict';
const { shouldRenderMarkdownCard } = require('../assets/components/markdown-card.js');
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }

const staticContent = { studentContent: component => component };
const handlers = new Map([
  ['teacherNote', { studentContent: () => null }],
  ['taskPrompt', staticContent],
  ['textPanel', staticContent],
  ['illustratedTextPanel', staticContent],
  ['thisOrThat', {
    studentContent: component => component,
    applyAction({ role, component, action, state }) {
      if (action.type !== 'select-option') fail('Неизвестное действие.');
      if (role !== 'student') fail('Ответ выбирает ученик.', 403);
      const item = component.items.find(item => item.id === action.itemId);
      if (!item?.options.some(option => option.id === action.optionId)) fail('Вариант не найден.');
      state.selections[component.id] = { ...state.selections[component.id], [item.id]: action.optionId };
    },
  }],
  ['markdownCard', {
    studentContent(component, state) {
      return shouldRenderMarkdownCard(component.studentVisibility, 'student', state.visibleCards?.[component.id])
        ? component : null;
    },
    applyAction({ role, component, action, state }) {
      if (action.type !== 'set-visibility') fail('Неизвестное действие.');
      if (role !== 'teacher') fail('Видимостью управляет преподаватель.', 403);
      if (component.studentVisibility !== 'controlled' || typeof action.visible !== 'boolean') {
        fail('Нельзя изменить видимость этой карточки.');
      }
      state.visibleCards = { ...state.visibleCards, [component.id]: action.visible };
    },
  }],
]);
function studentComponent(component, state) {
  return handlers.get(component.type)?.studentContent(component, state) || null;
}
function applyComponentAction(context) {
  const handler = handlers.get(context.component.type);
  if (!handler?.applyAction) fail('Компонент не поддерживает это действие.');
  handler.applyAction(context);
}
module.exports = { studentComponent, applyComponentAction };
