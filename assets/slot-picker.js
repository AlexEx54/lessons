(() => {
  'use strict';
  const Calendar = window.ScheduleCalendar;
  const byId = id => document.getElementById(id);
  const dialog = byId('slot-picker');
  const grid = byId('slot-picker-grid');
  const status = byId('slot-picker-status');
  const prev = byId('slot-picker-prev');
  const next = byId('slot-picker-next');
  let target = null;
  let picked = null;
  let weekStart = null;
  let sessions = [];
  let request = 0;

  // Past weeks have no free time left, so the picker never goes back beyond the current week.
  function render() {
    const atCurrentWeek = weekStart <= Calendar.startOfWeek(new Date());
    if (atCurrentWeek && document.activeElement === prev) next.focus();
    prev.disabled = atCurrentWeek;
    byId('slot-picker-range').textContent = Calendar.weekRange(weekStart);
    window.WeekGrid.render(grid, Calendar.layoutWeek(sessions, weekStart), { slotLabel: 'Выбрать время', picked });
  }
  // A whole week is taller than the dialog, so the current field value is scrolled to the middle.
  function revealPicked() {
    const slot = grid.querySelector('.week-grid__slot--picked');
    if (!slot) return;
    const scroller = grid.parentElement;
    const view = scroller.getBoundingClientRect();
    const box = slot.getBoundingClientRect();
    scroller.scrollBy(box.left - view.left - (view.width - box.width) / 2, box.top - view.top - (view.height - box.height) / 2);
  }
  // Busy time covers all of the teacher's upcoming lessons; a failed load still leaves every slot pickable.
  async function loadSessions() {
    const current = ++request;
    status.textContent = 'Загружаем занятия…';
    try {
      const response = await fetch('/api/sessions', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const loaded = (await response.json()).sessions;
      if (current !== request) return;
      sessions = loaded;
      status.textContent = '';
    } catch {
      if (current !== request) return;
      status.textContent = 'Не удалось загрузить занятия.';
    }
    if (dialog.open) render();
  }
  function open(input) {
    const value = new Date(input.value);
    target = input;
    picked = Number.isNaN(value.getTime()) ? null : value;
    weekStart = Calendar.startOfWeek(picked ?? new Date());
    render();
    dialog.showModal();
    grid.parentElement.scrollTo(0, 0);
    revealPicked();
    loadSessions();
  }
  function choose(time) {
    target.value = time;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    dialog.close();
  }
  function showWeek(days) {
    weekStart = Calendar.addDays(weekStart, days);
    render();
  }

  // Any `.slot-field` gets the picker through its `[data-slot-picker]` button.
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-slot-picker]');
    if (button) open(button.closest('.slot-field').querySelector('input'));
  });
  prev.addEventListener('click', () => showWeek(-7));
  next.addEventListener('click', () => showWeek(7));
  grid.addEventListener('click', event => {
    const slot = event.target.closest('button.week-grid__slot');
    if (slot) choose(slot.dataset.time);
  });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
})();
