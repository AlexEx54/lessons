(() => {
  'use strict';
  const match = window.location.pathname.match(/^\/classes\/([a-f0-9-]{36})(\/student)?\/?$/i);
  if (!match) return;
  const classId = match[1], role = match[2] ? 'student' : 'teacher';
  const byId = id => document.getElementById(id);
  let socket, reconnectTimer, toastTimer, lessonTimer, stopped = false, connected = false;
  let elapsedSeconds = 0;
  let confirmed, inFlight = false, pending = [], reconnectDelay = 500;
  const viewState = { lesson: null, activeIndex: 0 };
  let availableStageIds = [];
  let feedback = false;
  const adapters = window.ClassComponentAdapters;
  const status = byId('teacher-screen');
  status.disabled = true;
  const statusLabel = status.querySelector('span');
  const setStatus = (text, state) => {
    statusLabel.textContent = text;
    if (state) status.dataset.state = state;
    else delete status.dataset.state;
  };
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
  function session(state = confirmed) { return { role, connected, state, send: enqueue, pendingActions: pending, feedback }; }
  function enqueue(action) {
    if (!connected) { paint(); return; }
    pending.push({ ...action, stageId: action.stageId || confirmed.activeStageId });
    paint();
    flush();
  }
  const view = window.LessonView.create({
    state: viewState,
    initialStageId: () => confirmed?.activeStageId,
    canSelect: index => role === 'teacher' && connected && availableStageIds.includes(viewState.lesson?.stages[index]?.id),
    beforeSelect: index => {
      const stageId = viewState.lesson.stages[index].id;
      if (stageId !== confirmed.activeStageId) enqueue({ type: 'select-stage', stageId });
      return false;
    },
    componentOptions: component => adapters.options(component, session()),
  });
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
    if (!confirmed || !viewState.lesson) return;
    const state = structuredClone(confirmed);
    for (const action of pending) {
      const component = componentFor(action);
      if (component && action.stageId === confirmed.activeStageId) adapters.preview(component, state, action);
    }
    const stage = viewState.lesson.stages[viewState.activeIndex];
    for (const component of stage?.content || []) {
      const node = view.mounted.get(component.id);
      if (node) adapters.update(node, component, session(state));
    }
    view.refreshNavigation();
  }
  function receiveState(payload) {
    feedback = payload.type === 'action';
    const previousStage = viewState.lesson?.stages[viewState.activeIndex];
    confirmed = payload.state;
    availableStageIds = payload.availableStageIds;
    viewState.lesson = payload.lesson.content;
    const index = viewState.lesson.stages.findIndex(stage => stage.id === confirmed.activeStageId);
    const stage = viewState.lesson.stages[index];
    if (index < 0) throw new Error('Активная стадия не найдена.');
    if (previousStage?.id !== stage.id) view.selectStage(index, true);
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
    setStatus('Подключаемся…', 'connecting');
    socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/classes/${classId}?role=${role}`);
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.type === 'presence') {
        setStatus(
          message.peerPresent ? (role === 'teacher' ? 'Ученик подключён' : 'Учитель подключён') : (role === 'teacher' ? 'Ожидаем ученика' : 'Ожидаем учителя'),
          message.peerPresent ? 'connected' : 'waiting',
        );
        return;
      }
      if (!['snapshot', 'action', 'action-error'].includes(message.type)) return;
      if (message.type === 'snapshot') { connected = true; reconnectDelay = 500; }
      if (inFlight && ((message.type === 'action' && message.actorRole === role) || message.type === 'action-error')) {
        pending.shift();
        inFlight = false;
      }
      if (message.type === 'action-error') { pending = []; notify(message.error); }
      receiveState(message);
      flush();
    });
    socket.addEventListener('close', event => {
      connected = false;
      if (pending.length) notify('Связь прервалась. Неподтверждённый выбор нужно повторить после подключения.');
      pending = [];
      inFlight = false;
      paint();
      if (stopped) return;
      if ([4001, 4003, 4004, 4008].includes(event.code)) {
        stopped = true;
        setStatus(event.reason || 'Подключение закрыто', 'closed');
        notify(event.reason || 'Откройте ссылку заново.');
        return;
      }
      setStatus('Связь потеряна. Подключаемся…', 'lost');
      reconnectTimer = window.setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 10000);
    });
  }
  async function load() {
    try {
      const response = await fetch(`/api/classes/${classId}/live?role=${role}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось открыть класс.');
      confirmed = payload.state;
      availableStageIds = payload.availableStageIds;
      view.render(payload.lesson.content);
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
