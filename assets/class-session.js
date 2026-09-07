(() => {
  'use strict';
  const match = window.location.pathname.match(/^\/classes\/([a-f0-9-]{36})(\/student)?\/?$/i);
  if (!match) return;
  const classId = match[1], role = match[2] ? 'student' : 'teacher';
  const byId = id => document.getElementById(id);
  let socket, reconnectTimer, toastTimer, stopped = false, connected = false;
  let confirmed, inFlight = false, pending = [], reconnectDelay = 500;
  const status = byId('teacher-screen');
  status.disabled = true;
  const statusLabel = status.querySelector('span');
  const setStatus = text => { statusLabel.textContent = text; };
  byId('lesson-timer').hidden = true;
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
  const view = window.LessonView.create({
    // Other stages remain listed; no extra navigation workflow for this increment.
    canSelect: index => role === 'teacher' && index === 0,
    componentOptions: component => ({
      viewerRole: role,
      showImagePrompts: false,
      selections: confirmed?.selections[component.id],
      interactive: role === 'student' && connected,
      onAction: action => {
        if (!connected) { paint(); return; }
        pending.push(action);
        flush();
      },
    }),
  });
  function paint() {
    if (!confirmed) return;
    const selections = structuredClone(confirmed.selections);
    // Keep later local clicks visible while an earlier click is being acknowledged.
    for (const action of pending) {
      selections[action.componentId] = { ...selections[action.componentId], [action.itemId]: action.optionId };
    }
    for (const [id, node] of view.mounted) {
      node.updateState?.(selections[id]);
      node.setInteractive?.(role === 'student' && connected);
    }
  }
  function flush() {
    if (!connected || inFlight || !pending.length || socket?.readyState !== WebSocket.OPEN) return;
    inFlight = true;
    socket.send(JSON.stringify({ ...pending[0], stageId: confirmed.activeStageId, expectedVersion: confirmed.version }));
  }
  function connect() {
    if (stopped) return;
    setStatus('Подключаемся…');
    socket = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/classes/${classId}?role=${role}`);
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.type === 'presence') {
        setStatus(message.peerPresent ? (role === 'teacher' ? 'Ученик подключён' : 'Учитель подключён') : (role === 'teacher' ? 'Ожидаем ученика' : 'Ожидаем учителя'));
        return;
      }
      if (!['snapshot', 'action', 'action-error'].includes(message.type)) return;
      if (message.type === 'snapshot') { connected = true; reconnectDelay = 500; }
      if (inFlight && (message.type === 'action' || message.type === 'action-error')) {
        pending.shift();
        inFlight = false;
      }
      confirmed = message.state;
      if (message.type === 'action-error') { pending = []; notify(message.error); }
      paint();
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
        setStatus(event.reason || 'Подключение закрыто');
        notify(event.reason || 'Откройте ссылку заново.');
        return;
      }
      setStatus('Связь потеряна. Подключаемся…');
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
      view.render(payload.lesson.content);
      connect();
    } catch (error) { showError(error.message); }
  }
  window.addEventListener('pagehide', () => {
    stopped = true;
    window.clearTimeout(reconnectTimer);
    window.clearTimeout(toastTimer);
    socket?.close();
  });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  load();
})();
