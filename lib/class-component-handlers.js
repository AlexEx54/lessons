'use strict';
const { shouldRenderMarkdownCard } = require('../assets/components/markdown-card.js');
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }

const exercises = require('../assets/components/exercise-state.js');
const exerciseTypes = new Set(['dragWordsInText', 'matchWords', 'dropdownChoice', 'fillInBlanks', 'describeAndGuess', 'multipleChoice', 'checkboxChoice', 'gapFill', 'miniSituation']);
const staticContent = { studentContent: component => component };
const handlers = new Map([
  ['teacherNote', { studentContent: () => null }],
  ['taskPrompt', staticContent],
  ['personalizedQuestions', staticContent],
  ['textPanel', staticContent],
  ['textReading', staticContent],
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
  ['audioPlayer', {
    studentContent(component, state) {
      const presentation = {
        type: component.type,
        id: component.id,
        title: component.title,
        ...(component.audioSrc ? { audioSrc: component.audioSrc } : {}),
        ...(state.visibleCards?.[component.id] ? { script: component.script } : {}),
      };
      return { type: component.type, id: component.id, presentation };
    },
    applyAction({ role, component, action, state }) {
      if (action.type !== 'set-visibility') fail('Неизвестное действие.');
      if (role !== 'teacher') fail('Видимостью управляет преподаватель.', 403);
      if (typeof action.visible !== 'boolean') fail('Некорректная видимость.');
      state.visibleCards = { ...state.visibleCards, [component.id]: action.visible };
    },
  }],
]);
function exerciseComponent(component, state, role) {
  if (component.type === 'describeAndGuess') return component;
  const presentation = exercises.presentation(component, state._layouts?.[component.id]);
  return { ...(role === 'teacher' ? component : { type: component.type, id: component.id }), presentation };
}
function teacherComponent(component, state) {
  return exerciseTypes.has(component.type) ? exerciseComponent(component, state, 'teacher') : component;
}
function studentComponent(component, state) {
  if (component.type === 'cardRow') {
    const items = component.items.map(item => studentComponent(item, state)).filter(Boolean);
    return items.length ? { type: component.type, id: component.id,
      presentation: { type: component.type, id: component.id, items } } : null;
  }
  if (exerciseTypes.has(component.type)) {
    if (component.type === 'describeAndGuess' && !state.visibleCards?.[component.id]) return null;
    return exerciseComponent(component, state, 'student');
  }
  return handlers.get(component.type)?.studentContent(component, state) || null;
}
function applyComponentAction(context) {
  const { component, role, action, state } = context;
  if (exerciseTypes.has(component.type)) {
    if (component.type === 'describeAndGuess' && action.type === 'set-visibility') {
      if (role !== 'teacher') fail('Видимостью управляет преподаватель.', 403);
      if (typeof action.visible !== 'boolean') fail('Некорректная видимость.');
      state.visibleCards = { ...state.visibleCards, [component.id]: action.visible };
      return;
    }
    if (role !== 'student' && component.type !== 'describeAndGuess') fail('Ответ выбирает ученик.', 403);
    if (role === 'student' && component.type === 'describeAndGuess' && !state.visibleCards?.[component.id]) fail('Упражнение скрыто.', 403);
    const next = exercises.apply(component, state.exercises?.[component.id], action, state._layouts?.[component.id]);
    state.exercises = { ...state.exercises, [component.id]: next };
    return;
  }
  const handler = handlers.get(context.component.type);
  if (!handler?.applyAction) fail('Компонент не поддерживает это действие.');
  handler.applyAction(context);
}
module.exports = { studentComponent, teacherComponent, applyComponentAction };
