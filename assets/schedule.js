(() => {
  'use strict';
  const Calendar = window.ScheduleCalendar;
  const byId = id => document.getElementById(id);
  const status = byId('schedule-status');
  const retry = byId('schedule-retry');
  const calendar = byId('schedule-calendar');
  const grid = byId('schedule-grid');
  const list = byId('schedule-list');
  const clear = byId('schedule-clear');
  const weekNav = byId('schedule-week-nav');
  const dateInput = byId('schedule-date');
  const tabs = [...document.querySelectorAll('.schedule-tab')];
  const details = {
    empty: byId('schedule-details-empty'), body: byId('schedule-details-body'), cover: byId('schedule-details-cover'),
    lesson: byId('schedule-details-lesson'), level: byId('schedule-details-level'), student: byId('schedule-details-student'),
    date: byId('schedule-details-date'), time: byId('schedule-details-time'), open: byId('schedule-open'),
  };
  const timeInput = byId('schedule-reschedule-dialog').querySelector('input[name="time"]');
  const formats = {
    time: new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }),
    dateTime: new Intl.DateTimeFormat('ru', { dateStyle: 'long', timeStyle: 'short' }),
  };
  const params = new URLSearchParams(location.search);
  let sessions = [];
  let view = params.get('view') === 'list' ? 'list' : 'calendar';
  let weekStart = Calendar.startOfWeek(new Date());
  let selectedId = null;
  byId('schedule-time-zone').textContent = `Часовой пояс: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  const selected = () => sessions.find(lesson => lesson.id === selectedId);
  const lessonSummary = lesson => `${lesson.class_name} · ${lesson.title}`;

  function renderDetails() {
    const lesson = selected();
    details.empty.hidden = Boolean(lesson);
    details.body.hidden = !lesson;
    if (!lesson) return;
    const at = new Date(lesson.scheduled_at);
    details.cover.src = lesson.cover;
    details.lesson.textContent = lesson.title;
    details.level.textContent = lesson.level;
    details.student.textContent = lesson.class_name;
    details.date.textContent = Calendar.longDate(at);
    details.time.textContent = `${formats.time.format(at)} · ${lesson.duration}`;
    details.open.href = lesson.path;
  }
  // Keeps the chosen lesson while it is on screen, otherwise picks the next lesson of the week.
  function renderCalendar() {
    byId('schedule-range-label').textContent = Calendar.weekRange(weekStart);
    const layout = Calendar.layoutWeek(sessions, weekStart);
    const visible = layout.days.flat().map(event => event.lesson);
    if (!visible.some(lesson => lesson.id === selectedId)) {
      selectedId = (visible.find(lesson => Date.parse(lesson.scheduled_at) >= Date.now()) ?? visible[0])?.id ?? null;
    }
    window.WeekGrid.render(grid, layout, { slotLabel: 'Запланировать занятие', selectable: true, selectedId });
    renderDetails();
  }
  function listCard(lesson) {
    const row = element('article', 'schedule-card');
    const image = element('img', 'schedule-cover');
    image.src = lesson.cover;
    image.alt = '';
    image.loading = 'lazy';
    const body = element('div', 'schedule-body');
    const time = element('p', 'schedule-time', formats.dateTime.format(new Date(lesson.scheduled_at)));
    body.append(time, element('h3', '', lesson.class_name), element('p', 'schedule-lesson', lesson.title), element('p', 'schedule-meta', `${lesson.level} · ${lesson.duration}`));
    const actions = element('div', 'schedule-actions');
    const open = element('a', 'schedule-action schedule-action--primary', 'Открыть занятие');
    open.href = lesson.path;
    const copy = element('button', 'schedule-copy', 'Ссылка класса');
    copy.type = 'button';
    copy.addEventListener('click', () => copyClassLink(lesson));
    actions.append(open, copy);
    row.append(image, body, actions);
    return row;
  }
  function render() {
    renderCalendar();
    list.replaceChildren(...(sessions.length ? sessions.map(listCard) : [element('p', 'schedule-empty', 'Пока нет занятий. Запланируйте первое — оно появится здесь и в календаре.')]));
    clear.hidden = view !== 'list' || !sessions.length;
  }
  function setView(next) {
    view = next;
    for (const tab of tabs) {
      const active = tab.dataset.view === view;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    calendar.hidden = view !== 'calendar';
    weekNav.hidden = view !== 'calendar';
    list.hidden = view !== 'list';
    clear.hidden = view !== 'list' || !sessions.length;
    history.replaceState(null, '', view === 'list' ? '?view=list' : location.pathname);
  }
  function select(id) {
    selectedId = id;
    calendar.querySelectorAll('[data-id]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.id === id)));
    renderDetails();
  }
  function showWeek(date) {
    weekStart = Calendar.startOfWeek(date);
    renderCalendar();
  }
  async function copyClassLink(lesson) {
    try {
      await navigator.clipboard.writeText(new URL(lesson.classInvitePath, location.origin).href);
      window.AppShell.showToast('Ссылка класса скопирована. Она всегда открывает ближайшее занятие.');
    } catch { window.AppShell.showToast('Не удалось скопировать ссылку.'); }
  }
  async function updateLesson(id, changes) {
    const response = await fetch(`/api/sessions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Не удалось изменить занятие.');
  }
  // The server owns the list order, so every change is followed by a fresh load.
  async function load() {
    retry.hidden = true;
    if (!sessions.length) status.textContent = 'Загружаем занятия…';
    try {
      const response = await fetch('/api/sessions', { cache: 'no-store' });
      if (response.status === 401) { location.href = '/login?next=/schedule'; return false; }
      if (!response.ok) throw new Error();
      sessions = (await response.json()).sessions;
    } catch {
      status.textContent = 'Не удалось загрузить расписание.';
      retry.hidden = false;
      return false;
    }
    status.textContent = '';
    render();
    return true;
  }
  function planLesson(time, classId) {
    window.ClassModal.open({
      time,
      classId,
      onCreated: lesson => {
        weekStart = Calendar.startOfWeek(new Date(lesson.scheduled_at));
        selectedId = lesson.id;
        load();
      },
    });
  }
  function setupDialog(dialog, submit) {
    const form = dialog.querySelector('form');
    const error = dialog.querySelector('.schedule-dialog__error');
    const controls = form.querySelectorAll('button, input');
    let busy = false;
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      error.textContent = '';
      busy = true;
      controls.forEach(control => { control.disabled = true; });
      try {
        await submit();
        dialog.close();
      } catch (failure) { error.textContent = failure.message; }
      finally {
        busy = false;
        controls.forEach(control => { control.disabled = false; });
      }
    });
    return () => { error.textContent = ''; dialog.showModal(); };
  }
  const openReschedule = setupDialog(byId('schedule-reschedule-dialog'), async () => {
    const at = new Date(timeInput.value);
    if (!(at > new Date())) throw new Error('Выберите время в будущем.');
    await updateLesson(selectedId, { scheduledAt: at.toISOString() });
    weekStart = Calendar.startOfWeek(at);
    await load();
    window.AppShell.showToast('Время занятия сохранено.');
  });
  const openCancel = setupDialog(byId('schedule-cancel-dialog'), async () => {
    await updateLesson(selectedId, { status: 'cancelled' });
    selectedId = null;
    await load();
    window.AppShell.showToast('Занятие отменено.');
  });
  const openClear = setupDialog(byId('schedule-clear-dialog'), async () => {
    const response = await fetch('/api/sessions', { method: 'DELETE' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Не удалось очистить список.');
    selectedId = null;
    await load();
    window.AppShell.showToast('Список занятий очищен.');
  });

  tabs.forEach(tab => tab.addEventListener('click', () => setView(tab.dataset.view)));
  document.querySelector('.schedule-tabs').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const next = tabs.find(tab => tab.dataset.view !== view);
    setView(next.dataset.view);
    next.focus();
  });
  byId('schedule-prev').addEventListener('click', () => showWeek(Calendar.addDays(weekStart, -7)));
  byId('schedule-next').addEventListener('click', () => showWeek(Calendar.addDays(weekStart, 7)));
  byId('schedule-range').addEventListener('click', () => {
    dateInput.value = Calendar.toLocalInputValue(weekStart).slice(0, 10);
    try { dateInput.showPicker(); } catch {}
  });
  dateInput.addEventListener('change', () => { if (dateInput.value) showWeek(new Date(`${dateInput.value}T00:00`)); });
  byId('schedule-create').addEventListener('click', () => planLesson());
  calendar.addEventListener('click', event => {
    const lesson = event.target.closest('.week-grid__event');
    if (lesson) select(lesson.dataset.id);
    const slot = event.target.closest('button.week-grid__slot');
    if (slot) planLesson(slot.dataset.time);
  });
  byId('schedule-copy').addEventListener('click', () => copyClassLink(selected()));
  byId('schedule-plan-more').addEventListener('click', () => planLesson('', selected().class_id));
  byId('schedule-reschedule').addEventListener('click', () => {
    const lesson = selected();
    byId('schedule-reschedule-lesson').textContent = lessonSummary(lesson);
    timeInput.min = Calendar.toLocalInputValue(new Date());
    timeInput.value = Calendar.toLocalInputValue(new Date(lesson.scheduled_at));
    openReschedule();
  });
  byId('schedule-cancel').addEventListener('click', () => {
    const lesson = selected();
    byId('schedule-cancel-lesson').textContent = `${lessonSummary(lesson)}, ${formats.dateTime.format(new Date(lesson.scheduled_at))}`;
    openCancel();
  });
  clear.addEventListener('click', openClear);
  const start = async () => { if (await load()) setView(view); };
  retry.addEventListener('click', start);
  start();
})();
