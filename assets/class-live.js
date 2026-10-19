(() => {
  'use strict';
  const match = window.location.pathname.match(/^\/sessions\/([a-f0-9-]{36})(\/student)?\/?$/i);
  if (!match) return;
  const sessionId = match[1], role = match[2] ? 'student' : 'teacher';
  const byId = id => document.getElementById(id);
  let socket, reconnectTimer, toastTimer, lessonTimer, stopped = false, connected = false, slotTaken = false;
  let elapsedSeconds = 0;
  let confirmed, inFlight = false, pending = [], reconnectDelay = 500;
  const viewState = { lesson: null, activeIndex: 0 };
  // The student may look at a stage other than the teacher's shared `activeStageId`.
  const viewedStageId = () => viewState.lesson?.stages[viewState.activeIndex]?.id;
  const stageIndex = stageId => viewState.lesson.stages.findIndex(stage => stage.id === stageId);
  let availableStageIds = [];
  let peerPresent = false;
  // Playback is synchronised only on the teacher's stage; elsewhere the video plays locally.
  function sendMedia(message) {
    if (connected && socket?.readyState === WebSocket.OPEN && viewedStageId() === confirmed.activeStageId) socket.send(JSON.stringify({ ...message, stageId: confirmed.activeStageId }));
  }
  let feedback = false;
  let pointerComponentIds = [];
  const sendEphemeral = message => {
    if (connected && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  const pointer = window.ClassPointer?.create({ role, notify, send: sendEphemeral });
  const reactions = window.ClassReactions?.create({ send: sendEphemeral });
  const adapters = window.ClassComponentAdapters;
  const status = byId('teacher-screen');
  status.disabled = true;
  const statusLabel = status.querySelector('span');
  const setStatus = (text, state) => {
    statusLabel.textContent = text;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  };
  const notice = byId('lesson-connection');
  const showNotice = (text, state) => {
    notice.hidden = !text;
    notice.textContent = text || '';
    notice.dataset.state = state || '';
  };
  const slotTakenNotice = 'Место ученика занято другим устройством. Возможно, ссылка ученика открыта в другой вкладке. Подключимся автоматически, как только место освободится.';
  const resetButton = byId('reset-stage-progress');
  resetButton.hidden = role !== 'teacher';
  resetButton.disabled = true;
  if (role !== 'teacher') resetButton.remove();
  else resetButton.addEventListener('click', () => {
    if (!connected || !confirmed || pending.length) return;
    enqueue({ type: 'reset-stage', stageId: confirmed.activeStageId });
  });
  const follow = byId('lesson-follow');
  byId('lesson-follow-return').addEventListener('click', () => showTeacherStage());
  const timerButton = byId('lesson-timer');
  timerButton.hidden = role !== 'teacher';
  document.querySelector('.teacher-version').textContent = role === 'teacher' ? 'Teacher version' : 'Student version';
  const exit = document.querySelector('.end-lesson');
  if (role === 'teacher') { exit.href = '/schedule'; exit.querySelector('span').textContent = 'В расписание'; }
  else { exit.hidden = true; document.querySelector('.lesson-brand').href = window.location.pathname; }
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
    const link = byId('lesson-error').querySelector('a');
    link.href = role === 'teacher' ? '/schedule' : window.location.pathname;
    link.textContent = role === 'teacher' ? 'В расписание' : 'Повторить подключение';
  }
  function componentFor(action) {
    const stage = viewState.lesson?.stages.find(stage => stage.id === action.stageId);
    return stage && window.ComponentTree.collectComponents([stage]).find(component => component.id === action.componentId);
  }
  function session(state = confirmed) { return { role, connected, peerPresent, sendMedia, state, send: enqueue, pendingActions: pending, feedback }; }
  function enqueue(action) {
    if (!connected) { paint(); return; }
    pending.push({ ...action, stageId: action.stageId || viewedStageId() });
    paint();
    flush();
  }
  const view = window.LessonView.create({
    state: viewState,
    initialStageId: () => confirmed?.activeStageId,
    canSelect: index => connected && availableStageIds.includes(viewState.lesson?.stages[index]?.id),
    // The student browses locally; the teacher's choice becomes shared only after the server confirms it.
    beforeSelect: index => {
      if (role !== 'teacher') return true;
      const stageId = viewState.lesson.stages[index].id;
      if (stageId !== confirmed.activeStageId) enqueue({ type: 'select-stage', stageId });
      return false;
    },
    componentOptions: component => adapters.options(component, session()),
    onSelect: () => paint(),
  });
  function showTeacherStage() {
    view.selectStage(stageIndex(confirmed.activeStageId), true);
    paint();
  }
  if (role === 'teacher') timerButton.addEventListener('click', () => {
    if (lessonTimer) {
      window.clearInterval(lessonTimer);
      lessonTimer = null;
      byId('timer-icon').textContent = '▶';
      return;
    }
    byId('timer-icon').textContent = 'Ⅱ';
    lessonTimer = window.setInterval(() => {
      elapsedSeconds += 1;
      byId('elapsed-time').textContent = view.formatTime(elapsedSeconds);
    }, 1000);
  });
  function paint() {
    resetButton.disabled = !connected || !confirmed || pending.length > 0;
    if (!confirmed || !viewState.lesson) return;
    const state = structuredClone(confirmed);
    for (const action of pending) {
      const component = componentFor(action);
      if (component && action.stageId === viewedStageId()) adapters.preview(component, state, action);
    }
    const stage = viewState.lesson.stages[viewState.activeIndex];
    for (const component of stage?.content || []) {
      const node = view.mounted.get(component.id);
      if (node) adapters.update(node, component, session(state));
    }
    view.refreshNavigation();
    pointer?.update({ connected, stageId: viewedStageId(), componentIds: pointerComponentIds });
    // Without the teacher (e.g. homework) there is no one to return to.
    follow.hidden = role !== 'student' || !connected || !peerPresent || viewedStageId() === confirmed.activeStageId;
    byId('lesson-follow-text').textContent = `Учитель на этапе «${viewState.lesson.stages[stageIndex(confirmed.activeStageId)].title}»`;
  }
  function receiveState(payload) {
    feedback = payload.type === 'action';
    const previousStage = viewState.lesson?.stages[viewState.activeIndex];
    const previousTeacherStageId = confirmed?.activeStageId;
    confirmed = payload.state;
    pointerComponentIds = payload.pointerComponentIds || [];
    availableStageIds = payload.availableStageIds;
    viewState.lesson = payload.lesson.content;
    // The student stays on the stage they opened until the teacher moves to another one.
    const followTeacher = role === 'teacher' || previousTeacherStageId !== confirmed.activeStageId;
    const index = stageIndex(followTeacher ? confirmed.activeStageId : previousStage.id);
    const stage = viewState.lesson.stages[index];
    if (index < 0) throw new Error('Активная стадия не найдена.');
    if (previousStage.id !== stage.id) {
      view.selectStage(index, true);
      if (role === 'student' && previousStage.id !== previousTeacherStageId) notify(`Учитель перешёл на этап «${stage.title}».`);
    }
    else if (payload.resetStageId === stage.id) view.renderStageContent(stage);
    else if (JSON.stringify(previousStage.content) !== JSON.stringify(stage.content)) view.renderStageContent(stage, true);
    paint();
    feedback = false;
  }
  function flush() {
    if (!connected || inFlight || !pending.length || socket?.readyState !== WebSocket.OPEN) return;
    inFlight = true;
    socket.send(JSON.stringify({ ...pending[0], expectedVersion: confirmed.version }));
  }
  function connect() {
    if (stopped) return;
    if (!slotTaken) setStatus('Подключаемся…', 'connecting');
    const socketPath = `/ws/sessions/${sessionId}?role=${role}`;
    socket = new WebSocket(window.ClassConnectionDiagnostics?.url(socketPath)
      || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${socketPath}`);
    window.ClassConnectionDiagnostics?.attach(socket, 'sessions');
    const current = socket;
    window.ClassSocketLiveness?.watch(current, () => { if (socket === current) disconnected({ code: 4000 }); });
    socket.addEventListener('message', event => {
      if (socket !== current) return;
      const message = JSON.parse(event.data);
      if (['media-command', 'media-align', 'media-status'].includes(message.type)) {
        if (message.stageId === viewedStageId()) view.mounted.get(message.componentId)?.receiveMedia?.(message);
        return;
      }
      if (message.type === 'media-error') { notify(message.error); return; }
      if (message.type === 'pointer') {
        // The teacher points only at their own stage, so a fresh pointer brings the student there first.
        if (role === 'student' && message.target && !message.replay && message.stageId !== viewedStageId()) showTeacherStage();
        pointer?.receive(message);
        return;
      }
      if (message.type === 'pointer-error') { notify(message.error); return; }
      if (message.type === 'reaction') { reactions?.receive(message); return; }
      if (message.type === 'presence') {
        peerPresent = message.peerPresent;
        paint();
        setStatus(
          message.peerPresent ? (role === 'teacher' ? 'Ученик подключён' : 'Учитель подключён') : (role === 'teacher' ? 'Ожидаем ученика' : 'Ожидаем учителя'),
          message.peerPresent ? 'connected' : 'waiting',
        );
        return;
      }
      if (!['snapshot', 'action', 'action-error'].includes(message.type)) return;
      if (message.type === 'snapshot') { connected = true; reconnectDelay = 500; slotTaken = false; showNotice(null); }
      if (inFlight && ((message.type === 'action' && message.actorRole === role) || message.type === 'action-error')) {
        pending.shift();
        inFlight = false;
      }
      if (message.type === 'action-error') { pending = []; notify(message.error); }
      receiveState(message);
      if (message.type === 'action' && message.resetStageId && role === 'teacher') notify('Прогресс на этой странице сброшен.');
      flush();
    });
    // A replaced or abandoned socket may close long after its successor opened.
    socket.addEventListener('close', event => { if (socket === current) disconnected(event); });
  }
  function scheduleReconnect(delay) {
    reconnectTimer = window.setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  }
  function disconnected(event) {
    socket = null;
    connected = false;
    peerPresent = false;
    pointer?.disconnect();
    if (pending.length) notify('Связь прервалась. Неподтверждённый выбор нужно повторить после подключения.');
    pending = [];
    inFlight = false;
    paint();
    if (stopped) return;
    // The student slot is held by another device; it may free up, so keep polling instead of giving up.
    if (event.code === 4003) {
      slotTaken = true;
      setStatus('Место ученика занято', 'lost');
      showNotice(slotTakenNotice, 'waiting');
      scheduleReconnect(5000);
      return;
    }
    if ([4001, 4004, 4008].includes(event.code)) {
      stopped = true;
      setStatus(event.reason || 'Подключение закрыто', 'closed');
      showNotice(event.reason || 'Подключение закрыто. Откройте ссылку заново.', 'closed');
      return;
    }
    slotTaken = false;
    setStatus('Связь потеряна. Подключаемся…', 'lost');
    showNotice('Связь потеряна. Подключаемся…', 'lost');
    scheduleReconnect(reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 10000);
  }
  // The network or the tab is back: skip the remaining backoff instead of waiting up to 10 s.
  window.ClassSocketLiveness?.onWake(() => {
    if (!reconnectTimer || slotTaken || stopped) return;
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
    reconnectDelay = 500;
    connect();
  });
  async function load() {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/live?role=${role}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось открыть класс.');
      confirmed = payload.state;
      pointerComponentIds = payload.pointerComponentIds || [];
      availableStageIds = payload.availableStageIds;
      view.render(payload.lesson.content);
      window.LessonNotes?.mount({ mode: 'class', id: sessionId, role });
      paint();
      connect();
    } catch (error) { showError(error.message); }
  }
  window.addEventListener('pagehide', () => {
    stopped = true;
    window.clearInterval(lessonTimer);
    window.clearTimeout(reconnectTimer);
    window.clearTimeout(toastTimer);
    socket?.close();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  load();
})();
