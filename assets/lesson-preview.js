(() => {
  'use strict';
  // The library preview rehearses a live class on one screen. Both views share one in-memory state
  // under the same rules as the server, but nothing is sent anywhere, so answers vanish on reload.
  const match = window.location.pathname.match(/^\/library\/([^/]+)\/?$/);
  if (!match) return;
  const byId = id => document.getElementById(id);
  const rules = window.ClassRules, adapters = window.ClassComponentAdapters;
  const viewState = { lesson: null, activeIndex: 0 };
  let role = 'teacher', lesson, state, availableStageIds = [], studentStageId, feedback = false, pointerRevision = 0, toastTimer;
  const viewedStageId = () => viewState.lesson?.stages[viewState.activeIndex]?.id;
  const stageIndex = stageId => viewState.lesson.stages.findIndex(stage => stage.id === stageId);
  // The teacher always looks at the class stage; the student may browse to another one.
  const ownStageId = () => role === 'teacher' ? state.activeStageId : studentStageId;
  const project = () => role === 'teacher' ? rules.teacherContent(lesson, state) : rules.studentContent(lesson, state);
  // The other participant is always "present", and without sendMedia the video plays locally.
  const session = () => ({ role, connected: true, peerPresent: true, state: structuredClone(state), send: act, pendingActions: [], feedback });
  function notify(message) {
    const toast = byId('lesson-toast');
    toast.textContent = message;
    toast.classList.add('lesson-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('lesson-toast--visible'), 5000);
  }
  function showError(message) {
    byId('lesson-loading').hidden = true;
    byId('lesson-content').hidden = true;
    byId('lesson-error').hidden = false;
    byId('lesson-error-message').textContent = message;
  }
  // There is no server to wait for, so an action applies at once, as if it were already confirmed.
  function act(action) {
    const stageId = action.stageId || viewedStageId();
    try {
      if (!rules.applyAction(lesson, state, role, { ...action, stageId, expectedVersion: state.version })) return;
    } catch (error) { notify(error.message); return; }
    // As in a live class, a new teacher stage brings the student along.
    if (action.type === 'select-stage') studentStageId = state.activeStageId;
    feedback = true;
    show(action.type === 'reset-stage' ? stageId : null);
    feedback = false;
    if (action.type === 'reset-stage') notify('Прогресс на этой странице сброшен.');
  }
  // The teacher sees their own pointer, so it loops straight back as the server would broadcast it.
  const pointer = window.ClassPointer.create({ role, notify, send: message => pointer.receive({ type: 'pointer', revision: ++pointerRevision,
    stageId: state.activeStageId, target: message.type === 'pointer-set' ? message.target : null }) });
  const view = window.LessonView.create({
    state: viewState,
    initialStageId: ownStageId,
    canSelect: index => availableStageIds.includes(viewState.lesson?.stages[index]?.id),
    // The teacher's choice moves the whole class; the student only browses.
    beforeSelect: index => {
      if (role !== 'teacher') return true;
      act({ type: 'select-stage', stageId: viewState.lesson.stages[index].id });
      return false;
    },
    componentOptions: component => adapters.options(component, session()),
    onSelect: () => {
      studentStageId = viewedStageId();
      paint();
    },
  });
  // Re-projects the state for the current role and updates the page in place, like a live class on a new snapshot.
  function show(resetStageId) {
    const previous = viewState.lesson.stages[viewState.activeIndex];
    viewState.lesson = project();
    const index = stageIndex(ownStageId());
    const stage = viewState.lesson.stages[index];
    if (previous.id !== stage.id) view.selectStage(index, true);
    else if (resetStageId === stage.id) view.renderStageContent(stage);
    else if (JSON.stringify(previous.content) !== JSON.stringify(stage.content)) view.renderStageContent(stage, true);
    paint();
  }
  function paint() {
    const current = session();
    for (const component of viewState.lesson.stages[viewState.activeIndex].content || []) {
      const node = view.mounted.get(component.id);
      if (node) adapters.update(node, component, current);
    }
    view.refreshNavigation();
    pointer.update({ connected: true, stageId: viewedStageId(), componentIds: rules.pointerComponentIds(lesson, state) });
    byId('lesson-follow').hidden = role !== 'student' || viewedStageId() === state.activeStageId;
    byId('lesson-follow-text').textContent = `Учитель на этапе «${viewState.lesson.stages[stageIndex(state.activeStageId)].title}»`;
  }
  // Shows the controls the current role has in a live class.
  function applyRole() {
    const teacher = role === 'teacher';
    byId('reset-stage-progress').hidden = !teacher;
    byId('lesson-timer-card').hidden = !teacher;
    document.querySelector('.teacher-version').textContent = teacher ? 'Teacher version' : 'Student version';
  }
  const resetButton = byId('reset-stage-progress');
  resetButton.disabled = false;
  resetButton.addEventListener('click', () => act({ type: 'reset-stage', stageId: state.activeStageId }));
  byId('lesson-follow-return').addEventListener('click', () => {
    studentStageId = state.activeStageId;
    show();
  });
  byId('teacher-screen').hidden = true;
  const exit = document.querySelector('.end-lesson');
  exit.href = '/library.html';
  exit.querySelector('span').textContent = 'В библиотеку';
  window.ClassReactions?.create();
  const lessonTimer = window.LessonTimer.create({ formatTime: view.formatTime });
  window.addEventListener('pagehide', () => {
    lessonTimer.stop();
    window.clearTimeout(toastTimer);
  });
  async function load() {
    try {
      const response = await fetch(`/api/library/${encodeURIComponent(decodeURIComponent(match[1]))}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Урок не найден.');
      lesson = payload.lesson.content;
      state = rules.initialState(lesson);
      rules.addLayouts(lesson, state, () => crypto.randomUUID());
      availableStageIds = rules.availableStageIds(lesson);
      studentStageId = state.activeStageId;
      const schedule = byId('schedule-lesson');
      schedule.hidden = false;
      schedule.addEventListener('click', () => window.ClassModal.open({ lessonId: payload.lesson.id }));
      applyRole();
      view.render(project());
      window.LessonNotes.mount({ mode: 'library', content: lesson.notes });
      paint();
    } catch (error) { showError(error.message || 'Не удалось загрузить урок.'); }
  }
  load();
})();
