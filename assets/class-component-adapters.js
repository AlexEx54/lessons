(() => {
  'use strict';
  const adapters = new Map([
    ['thisOrThat', {
      options(component, session) {
        return {
          selections: session.state.selections[component.id],
          interactive: session.role === 'student' && session.connected,
          onAction: session.send,
        };
      },
      preview(state, action) {
        state.selections[action.componentId] = { ...state.selections[action.componentId], [action.itemId]: action.optionId };
      },
      update(node, component, session) {
        node.updateState(session.state.selections[component.id]);
        node.setInteractive(session.role === 'student' && session.connected);
      },
    }],
    ['markdownCard', {
      options(component, session) {
        return {
          studentVisible: Boolean(session.state.visibleCards?.[component.id]),
          onStudentVisibilityChange: visible => session.send({ type: 'set-visibility', componentId: component.id, visible }),
        };
      },
      preview(state, action) {
        state.visibleCards = { ...state.visibleCards, [action.componentId]: action.visible };
      },
      update(node, component, session) {
        node.updateStudentVisibility(Boolean(session.state.visibleCards?.[component.id]));
        node.setVisibilityInteractive(session.role === 'teacher' && session.connected);
      },
    }],
  ]);
  for (const type of ['matchWords', 'dropdownChoice', 'fillInBlanks', 'describeAndGuess', 'multipleChoice']) {
    const canInteract = session => session.connected && (session.role === 'student' || type === 'describeAndGuess');
    adapters.set(type, {
      options(component, session) {
        return {
          presentation: component.presentation,
          exerciseState: session.state.exercises?.[component.id] || {},
          interactive: canInteract(session),
          inspectOnly: type === 'dropdownChoice' && session.role === 'teacher',
          onAction: session.send,
          ...(type === 'describeAndGuess' ? {
            studentVisible: Boolean(session.state.visibleCards?.[component.id]),
            visibilityInteractive: session.role === 'teacher' && session.connected,
            onStudentVisibilityChange: visible => session.send({ type: 'set-visibility', componentId: component.id, visible }),
          } : {}),
        };
      },
      preview(state, action, component) {
        if (action.type === 'set-visibility') {
          state.visibleCards = { ...state.visibleCards, [action.componentId]: action.visible };
          return;
        }
        const previous = state.exercises?.[action.componentId] || {};
        let next = previous;
        // These exercises include keys for immediate local feedback.
        if (type === 'matchWords' || type === 'multipleChoice') {
          next = window.ExerciseState.apply(component.presentation, previous, action);
          state.exercises = { ...state.exercises, [action.componentId]: next };
          return;
        }
        if (action.type === 'select-word') next = { ...previous, selectedId: action.itemId };
        if (action.type === 'type-answer' || action.type === 'choose-word') {
          const answer = previous.answers?.[action.itemId];
          next = { ...previous, answers: { ...previous.answers, [action.itemId]: {
            value: action.value, status: answer?.value === action.value ? answer.status : 'pending',
          } } };
        }
        if (action.type === 'set-crossed') next = { ...previous, crossed: { ...previous.crossed, [action.itemId]: action.crossed } };
        state.exercises = { ...state.exercises, [action.componentId]: next };
      },
      update(node, component, session) {
        node.updateState(session.state.exercises?.[component.id] || {}, {
          feedback: session.feedback,
          pending: session.pendingActions?.some(action => action.componentId === component.id && action.type === 'match-word'),
        });
        node.setInteractive(canInteract(session));
        if (type === 'describeAndGuess') {
          node.updateStudentVisibility(Boolean(session.state.visibleCards?.[component.id]));
          node.setVisibilityInteractive(session.role === 'teacher' && session.connected);
        }
      },
    });
  }
  window.ClassComponentAdapters = {
    options(component, session) {
      return { viewerRole: session.role, showImagePrompts: false, ...adapters.get(component.type)?.options(component, session) };
    },
    preview(component, state, action) { adapters.get(component.type)?.preview(state, action, component); },
    update(node, component, session) { adapters.get(component.type)?.update(node, component, session); },
  };
})();
