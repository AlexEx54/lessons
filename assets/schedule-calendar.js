(function (root) {
  'use strict';
  const DAY_MINUTES = 24 * 60;
  const DEFAULT_HOURS = Object.freeze({ start: 9, end: 22 });
  function startOfWeek(date) {
    return addDays(date, -((date.getDay() + 6) % 7));
  }
  function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  }
  // Library durations look like "50 мин" or "30–45 мин"; the upper bound is what the slot must fit.
  function durationMinutes(text) {
    const numbers = String(text).match(/\d+/g);
    return numbers ? Number(numbers.at(-1)) : 60;
  }
  function toLocalInputValue(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  // Dates outside the current year carry it, so that "5 января" is never ambiguous.
  function withYear(options, now, ...dates) {
    return dates.every(date => date.getFullYear() === now.getFullYear()) ? options : { ...options, year: 'numeric' };
  }
  function longDate(date, now = new Date()) {
    const text = new Intl.DateTimeFormat('ru', withYear({ weekday: 'long', day: 'numeric', month: 'long' }, now, date)).format(date);
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function weekRange(weekStart, now = new Date()) {
    const weekEnd = addDays(weekStart, 6);
    return new Intl.DateTimeFormat('ru', withYear({ day: 'numeric', month: 'long' }, now, weekStart, weekEnd)).formatRange(weekStart, weekEnd);
  }
  // Overlapping lessons share the day column: each gets a lane and the lane count of its overlap group.
  function assignLanes(events) {
    events.sort((a, b) => a.start - b.start);
    let group = [], laneEnds = [];
    const closeGroup = () => group.forEach(event => { event.lanes = laneEnds.length; });
    for (const event of events) {
      if (laneEnds.every(end => end <= event.start)) { closeGroup(); group = []; laneEnds = []; }
      event.lane = laneEnds.findIndex(end => end <= event.start);
      if (event.lane === -1) event.lane = laneEnds.length;
      laneEnds[event.lane] = event.end;
      group.push(event);
    }
    closeGroup();
  }
  // Minutes are counted from local midnight; visible hours grow to fit early or late lessons.
  function layoutWeek(lessons, weekStart) {
    const weekEnd = addDays(weekStart, 7);
    const days = Array.from({ length: 7 }, () => []);
    let { start: startHour, end: endHour } = DEFAULT_HOURS;
    for (const lesson of lessons) {
      const at = new Date(lesson.scheduled_at);
      if (at < weekStart || at >= weekEnd) continue;
      const start = at.getHours() * 60 + at.getMinutes();
      const end = Math.min(start + durationMinutes(lesson.duration), DAY_MINUTES);
      days[(at.getDay() + 6) % 7].push({ lesson, start, end });
      startHour = Math.min(startHour, Math.floor(start / 60));
      endHour = Math.max(endHour, Math.ceil(end / 60));
    }
    days.forEach(assignLanes);
    return { weekStart, days, startHour, endHour };
  }
  // Minutes from the first visible hour to `now`, or null when `now` is outside the visible week or hours.
  function nowOffset({ weekStart, startHour, endHour }, now = new Date()) {
    if (now < weekStart || now >= addDays(weekStart, 7)) return null;
    const minutes = now.getHours() * 60 + now.getMinutes() - startHour * 60;
    return minutes >= 0 && minutes < (endHour - startHour) * 60 ? minutes : null;
  }
  const api = { startOfWeek, addDays, durationMinutes, toLocalInputValue, longDate, weekRange, layoutWeek, nowOffset };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScheduleCalendar = api;
})(typeof window === 'object' ? window : undefined);
