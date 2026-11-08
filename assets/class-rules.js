(function initClassRules(root) {
  'use strict';
  // The rules of a live class: what each role sees and which actions it may take.
  // The server applies them to the shared session, the library preview to its local copy.
  const load = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
  const componentTree = load('ComponentTree', './components/component-tree.js');
  const exercises = load('ExerciseState', './components/exercise-state.js');
  const { shouldRenderMarkdownCard } = load('MarkdownCardComponent', './components/markdown-card.js');
  const { OPTIONS: selfAssessmentOptions } = load('SelfAssessmentComponent', './components/self-assessment.js');
  const { ACTIONS: homeworkActions, applyWritingAction } = load('HomeworkWritingComponent', './components/homework-writing.js');
  const { guidedRoleCardsPresentation } = load('GuidedRoleCardsComponent', './components/guided-role-cards.js');
  // Composite components register their children in ComponentTree when loaded.
  load('CardRowComponent', './components/card-row.js');
  load('MiniSituationComponent', './components/mini-situation.js');
  function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
  function assertCanAnswer(role) {
    if (!['teacher', 'student'].includes(role)) fail('Нет доступа к ответам.', 403);
  }

  const exerciseTypes = new Set(['dragWordsInText', 'matchWords', 'sentenceBuilder', 'sentenceMatching', 'dropdownChoice', 'fillInBlanks', 'describeAndGuess', 'multipleChoice', 'oddOneOut', 'factOrMyth', 'checkboxChoice', 'gapFill', 'miniSituation', 'sentenceCorrection']);
  function hasControlledExerciseVisibility(component) {
    return component.type === 'describeAndGuess'
      || (component.type === 'gapFill' && component.studentVisibility === 'controlled');
  }
  function clearVisibility({ component, state }) { delete state.visibleCards?.[component.id]; }
  const staticContent = { studentContent: component => component };
  const handlers = new Map([
    ['teacherNote', { studentContent: () => null }],
    ['taskPrompt', staticContent],
    ['howToPlay', staticContent],
    ['speakingSupport', staticContent],
    ['guidedRoleCards', {
      studentContent: component => ({ type: component.type, id: component.id,
        presentation: guidedRoleCardsPresentation(component, 'student') }),
    }],
    ['personalizedQuestions', staticContent],
    ['threeTwoOne', staticContent],
    ['selfAssessment', {
      clearState({ component, state }) { delete state.selfAssessments?.[component.id]; },
      studentContent: component => component,
      applyAction({ role, component, action, state }) {
        if (action.type !== 'select-assessment') fail('Неизвестное действие.');
        assertCanAnswer(role);
        if (action.selectedId !== null && !selfAssessmentOptions.some(option => option.id === action.selectedId)) {
          fail('Вариант самооценки не найден.');
        }
        const next = { ...state.selfAssessments };
        if (action.selectedId === null) delete next[component.id];
        else next[component.id] = action.selectedId;
        state.selfAssessments = next;
      },
    }],
    ['homeworkWriting', {
      clearState({ component, state }) { delete state.writings?.[component.id]; },
      studentContent: component => component,
      applyAction({ role, component, action, state }) {
        const teacherAction = [homeworkActions.review, homeworkActions.return].includes(action.type);
        if (role !== (teacherAction ? 'teacher' : 'student')) {
          fail(teacherAction ? 'Оценивает преподаватель.' : 'Текст пишет ученик.', 403);
        }
        const next = applyWritingAction(component, state.writings?.[component.id], action);
        state.writings = { ...state.writings, [component.id]: next };
      },
    }],
    ['textPanel', staticContent],
    ['videoPlayer', {
      studentContent: component => component,
      clearState({ component, state }) {
        delete state.videoQuestions?.[component.id];
        state.videoQuestionEpochs = { ...state.videoQuestionEpochs, [component.id]: (state.videoQuestionEpochs?.[component.id] || 0) + 1 };
      },
      applyAction({ role, component, action, state }) {
        assertCanAnswer(role);
        if (action.type !== 'video-question-answer') fail('Неизвестное действие.');
        const question = component.questions?.find(q => q.id === action.questionId);
        if (!question || !component.videoSrc) fail('Вопрос не найден.');
        const selected = action.selectedOptionIds;
        if (!Array.isArray(selected) || !selected.length || new Set(selected).size !== selected.length
          || selected.some(id => !question.options.some(o => o.id === id))
          || (question.mode === 'single' && selected.length !== 1)) fail('Выберите допустимые варианты ответа.');
        const answers = state.videoQuestions?.[component.id] || {};
        if (answers[question.id]) return; // First accepted answer wins, including retries.
        const correct = selected.length === question.correctOptionIds.length && question.correctOptionIds.every(id => selected.includes(id));
        state.videoQuestions = { ...state.videoQuestions, [component.id]: { ...answers,
          [question.id]: { selectedOptionIds: [...selected], correct, answeredBy: role } } };
      },
    }],
    ['textReading', staticContent],
    ['storyCards', staticContent],
    ['guidedCommunicationCards', staticContent],
    ['illustratedTextPanel', staticContent],
    ['thisOrThat', {
      clearState({ component, state }) { delete state.selections?.[component.id]; },
      studentContent: component => component,
      applyAction({ role, component, action, state }) {
        if (action.type !== 'select-option') fail('Неизвестное действие.');
        assertCanAnswer(role);
        const item = component.items.find(item => item.id === action.itemId);
        if (!item?.options.some(option => option.id === action.optionId)) fail('Вариант не найден.');
        state.selections[component.id] = { ...state.selections[component.id], [item.id]: action.optionId };
      },
    }],
    ['describeAndGuess', { clearState: clearVisibility }],
    ['gapFill', { clearState: clearVisibility }],
    ['markdownCard', {
      clearState: clearVisibility,
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
      clearState: clearVisibility,
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
    if (component.type === 'guidedRoleCards') return { type: component.type, id: component.id,
      presentation: guidedRoleCardsPresentation(component, 'teacher') };
    return exerciseTypes.has(component.type) ? exerciseComponent(component, state, 'teacher') : component;
  }
  function studentComponent(component, state) {
    if (component.type === 'cardRow') {
      const items = component.items.map(item => studentComponent(item, state)).filter(Boolean);
      return items.length ? { type: component.type, id: component.id,
        presentation: { type: component.type, id: component.id, items } } : null;
    }
    if (exerciseTypes.has(component.type)) {
      if (hasControlledExerciseVisibility(component) && !state.visibleCards?.[component.id]) return null;
      return exerciseComponent(component, state, 'student');
    }
    return handlers.get(component.type)?.studentContent(component, state) || null;
  }
  function applyComponentAction(context) {
    const { component, role, action, state } = context;
    if (exerciseTypes.has(component.type)) {
      if (hasControlledExerciseVisibility(component) && action.type === 'set-visibility') {
        if (role !== 'teacher') fail('Видимостью управляет преподаватель.', 403);
        if (typeof action.visible !== 'boolean') fail('Некорректная видимость.');
        state.visibleCards = { ...state.visibleCards, [component.id]: action.visible };
        return;
      }
      assertCanAnswer(role);
      if (component.type === 'sentenceCorrection' && role !== 'student') fail('Ответ вводит ученик.', 403);
      if (role === 'student' && hasControlledExerciseVisibility(component) && !state.visibleCards?.[component.id]) fail('Упражнение скрыто.', 403);
      const next = exercises.apply(component, state.exercises?.[component.id], action, state._layouts?.[component.id]);
      state.exercises = { ...state.exercises, [component.id]: next };
      return;
    }
    const handler = handlers.get(context.component.type);
    if (!handler?.applyAction) fail('Компонент не поддерживает это действие.');
    handler.applyAction(context);
  }
  // Clear only this component; the caller traverses children and persists once.
  function clearComponentState(context) {
    const { component, state } = context;
    if (exerciseTypes.has(component.type)) delete state.exercises?.[component.id];
    handlers.get(component.type)?.clearState?.(context);
  }
  const availableStageIds = content => content.stages.filter(stage => stage.content?.length).map(stage => stage.id);
  const layoutTypes = new Set(['matchWords', 'sentenceBuilder', 'sentenceMatching', 'fillInBlanks']);
  function initialState(content) {
    const activeStageId = availableStageIds(content)[0];
    if (!activeStageId) fail('В классе нет доступных стадий.', 409);
    return { activeStageId, version: 0, selections: {} };
  }
  // Fixes the shuffled order of new exercises, so every participant sees the same layout. Returns whether any was added.
  function addLayouts(content, state, id) {
    let changed = false;
    for (const stage of content.stages) for (const component of stage.content || []) {
      if (!layoutTypes.has(component.type) || state._layouts?.[component.id]) continue;
      state._layouts = { ...state._layouts, [component.id]: exercises.createLayout(component, id) };
      changed = true;
    }
    return changed;
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
  function teacherContent(content, state) {
    return { ...content, stages: content.stages.map(stage => ({ ...stage, content: stage.content?.map(component => teacherComponent(component, state)) ?? null })) };
  }
  // The teacher may point only at what the student sees.
  function pointerComponentIds(content, state) {
    return componentTree.collectComponents(studentContent(content, state).stages).map(component => component.id);
  }
  // Applies one participant's action to the state. Returns false when the action changes nothing.
  function applyAction(content, state, role, action) {
    if (!action || typeof action !== 'object' || Array.isArray(action)) fail('Некорректное действие.');
    if (action.type === 'select-stage' && role !== 'teacher') fail('Стадией управляет преподаватель.', 403);
    if (action.type === 'reset-stage' && role !== 'teacher') fail('Сбрасывать прогресс может только преподаватель.', 403);
    if (action.expectedVersion !== state.version) fail('Состояние обновилось. Повторите действие.', 409);
    // The student browses stages on their own, so answers are accepted on any available stage, not only the active one.
    if (!availableStageIds(content).includes(action.stageId)) fail('Стадия недоступна.');
    if (action.type === 'select-stage') {
      if (action.stageId === state.activeStageId) return false;
      state.activeStageId = action.stageId;
    } else {
      const stage = content.stages.find(stage => stage.id === action.stageId);
      if (action.type === 'reset-stage') {
        for (const component of componentTree.collectComponents([stage])) clearComponentState({ component, state });
      } else {
        const component = componentTree.collectComponents([stage]).find(item => item.id === action.componentId);
        if (!component) fail('Компонент не найден.');
        applyComponentAction({ role, component, action, state });
      }
    }
    state.version++;
    return true;
  }
  const api = { availableStageIds, initialState, addLayouts, studentContent, teacherContent, pointerComponentIds, applyAction,
    studentComponent, teacherComponent, applyComponentAction, clearComponentState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ClassRules = api;
})(typeof window !== 'undefined' ? window : globalThis);
