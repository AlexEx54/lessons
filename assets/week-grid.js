(() => {
  'use strict';
  const Calendar = window.ScheduleCalendar;
  // week-grid.css sizes the rows for half-hour slots.
  const SLOT_MINUTES = 30;
  const HINT_MS = 2000;
  const formats = {
    weekday: new Intl.DateTimeFormat('ru', { weekday: 'short' }),
    dayMonth: new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short' }),
    time: new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' }),
  };

  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

  function dayHead(date, today) {
    const head = element('div', 'week-grid__head');
    head.classList.toggle('week-grid__head--today', date.getTime() === today);
    head.append(element('span', '', capitalize(formats.weekday.format(date))), element('small', '', formats.dayMonth.format(date).replace('.', '')));
    return head;
  }
  // Past slots are inert and only explain themselves on click. The slot holding `picked` shows the current field value.
  function slot(start, { now, picked, slotLabel, dayLabel }) {
    const isPast = start <= now;
    const node = element(isPast ? 'div' : 'button', 'week-grid__slot');
    node.classList.toggle('week-grid__slot--past', isPast);
    node.classList.toggle('week-grid__slot--picked', Boolean(picked) && picked >= start && picked - start < SLOT_MINUTES * 60_000);
    if (isPast) return node;
    const time = formats.time.format(start);
    node.type = 'button';
    node.tabIndex = -1;
    node.dataset.time = Calendar.toLocalInputValue(start);
    node.dataset.label = time;
    node.setAttribute('aria-label', `${slotLabel}: ${dayLabel}, ${time}`);
    return node;
  }
  // Selectable cards are pressable buttons; otherwise a card only marks busy time.
  function eventCard({ lesson, start, end, lane, lanes }, { startHour, now, selectable, selectedId }) {
    const at = new Date(lesson.scheduled_at);
    const time = formats.time.format(at);
    const card = element(selectable ? 'button' : 'div', 'week-grid__event');
    card.title = lesson.title;
    card.classList.toggle('week-grid__event--past', at < now);
    card.style.cssText = `--start:${start - startHour * 60};--length:${end - start};--lane:${lane};--lanes:${lanes}`;
    if (selectable) {
      card.type = 'button';
      card.dataset.id = lesson.id;
      card.setAttribute('aria-pressed', String(lesson.id === selectedId));
      card.setAttribute('aria-label', `${time}, ${lesson.class_name}, ${lesson.title}`);
    }
    card.append(element('span', 'week-grid__event-time', time), element('strong', 'week-grid__event-name', lesson.class_name));
    return card;
  }

  // Each rendered grid keeps its clock timer; a grid without one is rendered for the first time.
  const clocks = new WeakMap();

  // The hint sits next to the grid, so inside a modal dialog it stays in the dialog's subtree and is not inert.
  function createHint(grid) {
    const hint = element('div', 'week-grid__hint');
    hint.popover = 'auto';
    hint.append(element('strong', '', 'Это время уже прошло'), element('span', '', 'Занятие можно запланировать только на будущее — выберите время позже текущего.'));
    grid.after(hint);
    const hide = () => hint.hidePopover();
    let hideTimer = null;
    grid.addEventListener('click', event => {
      const slot = event.target.closest('.week-grid__slot--past');
      if (!slot) return;
      hint.showPopover();
      const box = slot.getBoundingClientRect();
      const gap = 8;
      const above = box.top - hint.offsetHeight - gap;
      hint.style.left = `${Math.max(gap, Math.min(box.left + (box.width - hint.offsetWidth) / 2, innerWidth - hint.offsetWidth - gap))}px`;
      hint.style.top = `${above >= gap ? above : box.bottom + gap}px`;
      document.addEventListener('scroll', hide, { capture: true, once: true });
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, HINT_MS);
    });
  }
  // The current time line moves without redrawing the grid, so hover and selection survive the ticks.
  function startClock(grid, layout) {
    const label = grid.querySelector('.week-grid__now-label');
    const tick = () => {
      const now = new Date();
      const offset = Calendar.nowOffset(layout, now);
      grid.classList.toggle('week-grid--now', offset !== null);
      if (offset === null) return;
      grid.style.setProperty('--now', offset);
      label.textContent = formats.time.format(now);
    };
    clearInterval(clocks.get(grid));
    clocks.set(grid, setInterval(tick, 10_000));
    tick();
  }

  // Draws a `ScheduleCalendar.layoutWeek` result. `slotLabel` starts the accessible name of every free slot.
  function render(grid, layout, { slotLabel, selectable = false, selectedId = null, picked = null }) {
    const { weekStart, days, startHour, endHour } = layout;
    if (!clocks.has(grid)) createHint(grid);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dates = days.map((_, index) => Calendar.addDays(weekStart, index));
    const times = element('div', 'week-grid__times');
    for (let hour = startHour; hour < endHour; hour += 1) times.append(element('span', '', `${String(hour).padStart(2, '0')}:00`));
    const nowLabel = element('div', 'week-grid__now-label');
    nowLabel.ariaHidden = 'true';
    times.append(nowLabel);
    const columns = dates.map((date, index) => {
      const column = element('div', 'week-grid__day');
      const context = { now, picked, slotLabel, dayLabel: Calendar.longDate(date, now) };
      for (let minutes = startHour * 60; minutes < endHour * 60; minutes += SLOT_MINUTES) {
        column.append(slot(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, minutes), context));
      }
      column.append(...days[index].map(event => eventCard(event, { startHour, now, selectable, selectedId })), element('div', 'week-grid__now'));
      return column;
    });
    grid.replaceChildren(element('div', 'week-grid__corner'), ...dates.map(date => dayHead(date, today)), times, ...columns);
    startClock(grid, layout);
  }

  window.WeekGrid = Object.freeze({ render });
})();
