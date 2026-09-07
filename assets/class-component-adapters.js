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
  window.ClassComponentAdapters = {
    options(component, session) {
      return { viewerRole: session.role, showImagePrompts: false, ...adapters.get(component.type)?.options(component, session) };
    },
    preview(component, state, action) { adapters.get(component.type)?.preview(state, action); },
    update(node, component, session) { adapters.get(component.type)?.update(node, component, session); },
  };
})();
