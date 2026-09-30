(() => {
  'use strict';
  const Calendar = window.ScheduleCalendar;
  const byId = id => document.getElementById(id);
  const status = byId('schedule-status');
  const retry = byId('schedule-retry');
  const calendar = byId('schedule-calendar');
  const grid = byId('schedule-grid');
  const undated = byId('schedule-undated');
  const list = byId('schedule-list');
  const clear = byId('schedule-clear');
  const weekNav = byId('schedule-week-nav');
  const dateInput = byId('schedule-date');
  const tabs = [...document.querySelectorAll('.schedule-tab')];
  const details = {
    empty: byId('schedule-details-empty'), body: byId('schedule-details-body'), cover: byId('schedule-details-cover'),
    lesson: byId('schedule-details-lesson'), level: byId('schedule-details-level'), student: byId('schedule-details-student'),
    date: byId('schedule-details-date'), time: byId('schedule-details-time'), open: byId('schedule-open'),
    rescheduleLabel: byId('schedule-reschedule-label'),
  };
  const timeInput = byId('schedule-reschedule-dialog').querySelector('input[name="time"]');
  const formats = {
    weekday: new Intl.DateTimeFormat('ru', { weekday: 'short' }),
    dayMonth: new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }),
    time: new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }),
    dateTime: new Intl.DateTimeFormat('ru', { dateStyle: 'long', timeStyle: 'short' }),
  };
  const params = new URLSearchParams(location.search);
  let classes = [];
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
  const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
  const selected = () => classes.find(lesson => lesson.id === selectedId);
  const withYear = (options, ...dates) => dates.some(date => date.getFullYear() !== new Date().getFullYear()) ? { ...options, year: 'numeric' } : options;
  const lessonSummary = lesson => `${lesson.name} · ${lesson.title}`;
  const longDate = date => capitalize(new Intl.DateTimeFormat('ru', withYear({ weekday: 'long', day: 'numeric', month: 'long' }, date)).format(date));

  function slot(start, now) {
    if (start <= now) return element('div', 'schedule-slot');
    const button = element('button', 'schedule-slot');
    button.type = 'button';
    button.dataset.time = Calendar.toLocalInputValue(start);
    button.tabIndex = -1;
    button.setAttribute('aria-label', `Запланировать урок: ${longDate(start)}, ${formats.time.format(start)}`);
    return button;
  }
  function eventCard({ lesson, start, end, lane, lanes }, startHour, now) {
    const at = new Date(lesson.scheduled_at);
    const card = element('button', 'schedule-event');
    card.type = 'button';
    card.dataset.id = lesson.id;
    card.title = lesson.title;
    card.classList.toggle('schedule-event--past', at < now);
    card.style.cssText = `--start:${start - startHour * 60};--length:${end - start};--lane:${lane};--lanes:${lanes}`;
    card.setAttribute('aria-pressed', String(lesson.id === selectedId));
    card.setAttribute('aria-label', `${formats.time.format(at)}, ${lesson.name}, ${lesson.title}`);
    card.append(element('span', 'schedule-event__time', formats.time.format(at)), element('strong', 'schedule-event__name', lesson.name));
    return card;
  }
  function renderGrid({ days, startHour, endHour }) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const hours = Array.from({ length: endHour - startHour }, (_, index) => startHour + index);
    const dates = days.map((_, index) => Calendar.addDays(weekStart, index));
    const heads = dates.map(date => {
      const head = element('div', 'schedule-day-head');
      head.classList.toggle('schedule-day-head--today', date.getTime() === today);
      head.append(element('span', '', capitalize(formats.weekday.format(date))), element('small', '', formats.dayMonth.format(date).replace('.', '')));
      return head;
    });
    const times = element('div', 'schedule-times');
    times.append(...hours.map(hour => element('span', '', `${String(hour).padStart(2, '0')}:00`)));
    const columns = dates.map((date, index) => {
      const column = element('div', 'schedule-day');
      column.append(...hours.map(hour => slot(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour), now)));
      column.append(...days[index].map(event => eventCard(event, startHour, now)));
      return column;
    });
    grid.style.setProperty('--hours', hours.length);
    grid.replaceChildren(element('div', 'schedule-grid__corner'), ...heads, times, ...columns);
  }
  function renderUndated() {
    const lessons = classes.filter(lesson => !lesson.scheduled_at);
    undated.hidden = !lessons.length;
    undated.replaceChildren(element('span', '', 'Без даты:'), ...lessons.map(lesson => {
      const chip = element('button', 'schedule-chip', lesson.name);
      chip.type = 'button';
      chip.dataset.id = lesson.id;
      chip.title = lesson.title;
      chip.setAttribute('aria-pressed', String(lesson.id === selectedId));
      return chip;
    }));
  }
  function renderDetails() {
    const lesson = selected();
    details.empty.hidden = Boolean(lesson);
    details.body.hidden = !lesson;
    if (!lesson) return;
    const at = lesson.scheduled_at && new Date(lesson.scheduled_at);
    details.cover.src = lesson.cover;
    details.lesson.textContent = lesson.title;
    details.level.textContent = lesson.level;
    details.student.textContent = lesson.name;
    details.date.textContent = at ? longDate(at) : 'Дата не назначена';
    details.time.textContent = at ? `${formats.time.format(at)} · ${lesson.duration}` : lesson.duration;
    details.open.href = lesson.lessonPath;
    details.rescheduleLabel.textContent = at ? 'Изменить дату и время' : 'Назначить дату и время';
  }
  // Keeps the chosen lesson while it is on screen, otherwise picks the next lesson of the week.
  function renderCalendar() {
    const weekEnd = Calendar.addDays(weekStart, 6);
    byId('schedule-range-label').textContent = new Intl.DateTimeFormat('ru', withYear({ day: 'numeric', month: 'long' }, weekStart, weekEnd)).formatRange(weekStart, weekEnd);
    const layout = Calendar.layoutWeek(classes, weekStart);
    const visible = layout.days.flat().map(event => event.lesson);
    if (![...visible, ...classes.filter(lesson => !lesson.scheduled_at)].some(lesson => lesson.id === selectedId)) {
      selectedId = (visible.find(lesson => Date.parse(lesson.scheduled_at) >= Date.now()) ?? visible[0])?.id ?? null;
    }
    renderGrid(layout);
    renderUndated();
    renderDetails();
  }
  function listCard(lesson) {
    const row = element('article', 'schedule-card');
    const image = element('img', 'schedule-cover');
    image.src = lesson.cover;
    image.alt = '';
    image.loading = 'lazy';
    const body = element('div', 'schedule-body');
    const time = element('p', 'schedule-time', lesson.scheduled_at ? formats.dateTime.format(new Date(lesson.scheduled_at)) : 'Время не назначено');
    body.append(time, element('h3', '', lesson.name), element('p', 'schedule-lesson', lesson.title), element('p', 'schedule-meta', `${lesson.level} · ${lesson.duration}`));
    const actions = element('div', 'schedule-actions');
    const open = element('a', 'schedule-action schedule-action--primary', 'Открыть урок');
    open.href = lesson.lessonPath;
    const copy = element('button', 'schedule-copy', 'Скопировать ссылку');
    copy.type = 'button';
    copy.addEventListener('click', () => copyInvite(lesson));
    actions.append(open, copy);
    row.append(image, body, actions);
    return row;
  }
  function render() {
    renderCalendar();
    list.replaceChildren(...(classes.length ? classes.map(listCard) : [element('p', 'schedule-empty', 'Пока нет занятий. Запланируйте первый урок — он появится здесь и в календаре.')]));
    clear.hidden = view !== 'list' || !classes.length;
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
    clear.hidden = view !== 'list' || !classes.length;
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
  async function copyInvite(lesson) {
    try { await navigator.clipboard.writeText(new URL(lesson.invitePath, location.origin).href); window.AppShell.showToast('Ссылка на класс скопирована.'); }
    catch { window.AppShell.showToast('Не удалось скопировать ссылку.'); }
  }
  async function updateLesson(id, changes) {
    const response = await fetch(`/api/classes/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Не удалось изменить занятие.');
  }
  // The server owns the list order, so every change is followed by a fresh load.
  async function load() {
    retry.hidden = true;
    if (!classes.length) status.textContent = 'Загружаем уроки…';
    try {
      const response = await fetch('/api/classes', { cache: 'no-store' });
      if (response.status === 401) { location.href = '/login?next=/schedule'; return false; }
      if (!response.ok) throw new Error();
      classes = (await response.json()).classes;
    } catch {
      status.textContent = 'Не удалось загрузить расписание.';
      retry.hidden = false;
      return false;
    }
    status.textContent = '';
    render();
    return true;
  }
  function planLesson(time) {
    window.ClassModal.open({
      time,
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
    const response = await fetch('/api/classes', { method: 'DELETE' });
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
    const lesson = event.target.closest('.schedule-event, .schedule-chip');
    if (lesson) select(lesson.dataset.id);
    const slot = event.target.closest('button.schedule-slot');
    if (slot) planLesson(slot.dataset.time);
  });
  byId('schedule-copy').addEventListener('click', () => copyInvite(selected()));
  byId('schedule-reschedule').addEventListener('click', () => {
    const lesson = selected();
    byId('schedule-reschedule-lesson').textContent = lessonSummary(lesson);
    timeInput.min = Calendar.toLocalInputValue(new Date());
    timeInput.value = lesson.scheduled_at ? Calendar.toLocalInputValue(new Date(lesson.scheduled_at)) : '';
    openReschedule();
  });
  byId('schedule-cancel').addEventListener('click', () => {
    const lesson = selected();
    byId('schedule-cancel-lesson').textContent = lesson.scheduled_at
      ? `${lessonSummary(lesson)}, ${formats.dateTime.format(new Date(lesson.scheduled_at))}`
      : lessonSummary(lesson);
    openCancel();
  });
  clear.addEventListener('click', openClear);
  const start = async () => { if (await load()) setView(view); };
  retry.addEventListener('click', start);
  start();
})();
