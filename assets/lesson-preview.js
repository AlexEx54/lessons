(() => {
  'use strict';
  // The library preview rehearses a live class on one screen. Both views share one in-memory state
  // under the same rules as the server, but nothing is sent anywhere, so answers vanish on reload.
  const match = window.location.pathname.match(/^\/library\/([^/]+)\/?$/);
  if (!match) return;
  const byId = id => document.getElementById(id);
  const rules = window.ClassRules, adapters = window.ClassComponentAdapters;
  const viewState = { lesson: null, activeIndex: 0 };
  const CALL_PICTURES = { teacher: '/assets/images/call-mockup-teacher.jpg', student: '/assets/images/call-mockup-student.jpg' };
  let role = 'teacher', lesson, state, availableStageIds = [], feedback = false, pointerRevision = 0, toastTimer;
  const viewedStageId = () => viewState.lesson?.stages[viewState.activeIndex]?.id;
  const stageIndex = stageId => viewState.lesson.stages.findIndex(stage => stage.id === stageId);
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
  function act(action, actor = role) {
    const stageId = action.stageId || viewedStageId();
    try {
      if (!rules.applyAction(lesson, state, actor, { ...action, stageId, expectedVersion: state.version })) return;
    } catch (error) { notify(error.message); return; }
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
    initialStageId: () => state.activeStageId,
    canSelect: index => availableStageIds.includes(viewState.lesson?.stages[index]?.id),
    // Both views show one stage, and whoever runs the preview moves it, so the move goes through as the teacher's.
    beforeSelect: index => {
      act({ type: 'select-stage', stageId: viewState.lesson.stages[index].id }, 'teacher');
      return false;
    },
    componentOptions: component => adapters.options(component, session()),
  });
  // Re-projects the state for the current role and updates the page in place, like a live class on a new snapshot.
  function show(resetStageId) {
    const previous = viewState.lesson.stages[viewState.activeIndex];
    viewState.lesson = project();
    const index = stageIndex(state.activeStageId);
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
  }
  // Shows the controls and the call picture the current role has in a live class.
  function applyRole() {
    const teacher = role === 'teacher', peer = teacher ? 'student' : 'teacher';
    byId('reset-stage-progress').hidden = !teacher;
    byId('lesson-timer-card').hidden = !teacher;
    document.querySelector('.teacher-version').textContent = teacher ? 'Teacher version' : 'Student version';
    for (const button of byId('preview-role').children) button.setAttribute('aria-pressed', String(button.dataset.role === role));
    byId('call-local-video').poster = CALL_PICTURES[role];
    byId('call-remote-video').poster = CALL_PICTURES[peer];
    byId('call-remote-name').textContent = peer === 'teacher' ? 'Учитель' : 'Ученик';
  }
  // Both views share the class state and the stage, so switching only re-draws the same stage for the other side.
  function switchRole(next) {
    if (next === role) return;
    role = next;
    pointer.setRole(role);
    applyRole();
    viewState.lesson = project();
    view.selectStage(viewState.activeIndex, true);
    paint();
  }
  // The call is only drawn: pictures stand in for the cameras, so the teacher sees where it lives in a class.
  function mountCallMockup() {
    const panel = byId('call-panel'), toggle = byId('call-toggle');
    const setOpen = open => {
      panel.hidden = !open;
      document.body.classList.toggle('lesson-call-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    };
    toggle.hidden = false;
    toggle.addEventListener('click', () => setOpen(panel.hidden));
    byId('call-panel-collapse').addEventListener('click', () => setOpen(false));
    byId('call-lobby').hidden = true;
    byId('call-room').hidden = false;
    byId('call-local-placeholder').hidden = true;
    for (const control of document.querySelectorAll('.call-controls button')) control.disabled = true;
    const chatTab = byId('chat-tab');
    chatTab.disabled = true;
    chatTab.title = 'Чат работает на занятии';
    const note = byId('call-note');
    note.textContent = 'Это макет звонка. На занятии здесь будут камеры учителя и ученика.';
    note.hidden = false;
    setOpen(true);
  }
  const resetButton = byId('reset-stage-progress');
  resetButton.disabled = false;
  resetButton.addEventListener('click', () => act({ type: 'reset-stage', stageId: state.activeStageId }));
  byId('teacher-screen').hidden = true;
  byId('preview-role').hidden = false;
  byId('preview-role').addEventListener('click', event => {
    const button = event.target.closest('[data-role]');
    if (button && lesson) switchRole(button.dataset.role);
  });
  byId('preview-hint').hidden = false;
  mountCallMockup();
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
