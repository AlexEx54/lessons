(() => {
  'use strict';
  const canAnswer = session => session.connected && ['teacher', 'student'].includes(session.role);
  const adapters = new Map([
    ['guidedRoleCards', {
      options: component => ({ presentation: component.presentation }),
    }],
    ['thisOrThat', {
      options(component, session) {
        return {
          selections: session.state.selections[component.id],
          interactive: canAnswer(session),
          onAction: session.send,
        };
      },
      preview(state, action) {
        state.selections[action.componentId] = { ...state.selections[action.componentId], [action.itemId]: action.optionId };
      },
      update(node, component, session) {
        node.updateState(session.state.selections[component.id]);
        node.setInteractive(canAnswer(session));
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
    ['audioPlayer', {
      options(component, session) {
        return {
          presentation: component.presentation,
          studentVisible: Boolean(session.state.visibleCards?.[component.id]),
          visibilityInteractive: session.role === 'teacher' && session.connected,
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
    ['selfAssessment', {
      options(component, session) {
        return {
          selectedId: session.state.selfAssessments?.[component.id],
          interactive: canAnswer(session),
          onAction: session.send,
        };
      },
      preview(state, action) {
        const next = { ...state.selfAssessments };
        if (action.selectedId == null) delete next[action.componentId];
        else next[action.componentId] = action.selectedId;
        state.selfAssessments = next;
      },
      update(node, component, session) {
        node.updateState(session.state.selfAssessments?.[component.id]);
        node.setInteractive(canAnswer(session));
      },
    }],
  ]);
  for (const type of ['dragWordsInText', 'matchWords', 'dropdownChoice', 'fillInBlanks', 'describeAndGuess', 'multipleChoice', 'oddOneOut', 'factOrMyth', 'checkboxChoice', 'gapFill', 'miniSituation']) {
    adapters.set(type, {
      options(component, session) {
        return {
          presentation: component.presentation,
          exerciseState: session.state.exercises?.[component.id] || {},
          interactive: canAnswer(session),
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
        // Reapply queued actions with the same rules as the component and server.
        if (type === 'gapFill' || type === 'miniSituation' || type === 'dragWordsInText' || type === 'dropdownChoice' || type === 'matchWords' || type === 'multipleChoice' || type === 'oddOneOut' || type === 'factOrMyth' || type === 'checkboxChoice') {
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
        node.setInteractive(canAnswer(session));
        if (type === 'describeAndGuess') {
          node.updateStudentVisibility(Boolean(session.state.visibleCards?.[component.id]));
          node.setVisibilityInteractive(session.role === 'teacher' && session.connected);
        }
      },
    });
  }
  adapters.set('cardRow', {
    options(component, session) {
      return { presentation: component.presentation,
        componentOptions: child => window.ClassComponentAdapters.options(child, session) };
    },
    update(node, component, session) {
      for (const child of window.ComponentTree.childComponentsOf(component)) {
        const childNode = node.componentNodes.get(child.id);
        if (childNode) window.ClassComponentAdapters.update(childNode, child, session);
      }
    },
  });
  window.ClassComponentAdapters = {
    options(component, session) {
      return { viewerRole: session.role, showImagePrompts: false, ...adapters.get(component.type)?.options(component, session) };
    },
    preview(component, state, action) { adapters.get(component.type)?.preview?.(state, action, component); },
    update(node, component, session) { adapters.get(component.type)?.update?.(node, component, session); },
  };
})();
