'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { startOfWeek, addDays, durationMinutes, toLocalInputValue, nextFullHour, longDate, weekRange, layoutWeek, nowOffset } = require('../assets/schedule-calendar.js');
const at = (day, hour, minute = 0) => new Date(2026, 7, day, hour, minute).toISOString();
const lesson = (id, scheduled_at, duration = '60 мин') => ({ id, scheduled_at, duration });
const week = new Date(2026, 7, 10);

test('weeks start on Monday at local midnight', () => {
  assert.deepEqual(startOfWeek(new Date(2026, 7, 12, 17, 30)), week);
  assert.deepEqual(startOfWeek(new Date(2026, 7, 16, 23, 59)), week);
  assert.deepEqual(startOfWeek(week), week);
  assert.deepEqual(addDays(new Date(2026, 11, 28), 7), new Date(2027, 0, 4));
});

test('durations use the upper bound of library ranges and inputs use local time', () => {
  assert.equal(durationMinutes('50 мин'), 50);
  assert.equal(durationMinutes('30–45 мин'), 45);
  assert.equal(durationMinutes(''), 60);
  assert.equal(toLocalInputValue(new Date(2026, 0, 5, 7, 5)), '2026-01-05T07:05');
});

test('the next full hour is always in the future and rolls over midnight', () => {
  assert.deepEqual(nextFullHour(new Date(2026, 9, 8, 19, 28)), new Date(2026, 9, 8, 20));
  assert.deepEqual(nextFullHour(new Date(2026, 9, 8, 19, 0)), new Date(2026, 9, 8, 20));
  assert.deepEqual(nextFullHour(new Date(2026, 9, 8, 23, 45)), new Date(2026, 9, 9, 0));
});

test('dates and week ranges mention the year only outside the current one', () => {
  const now = new Date(2026, 7, 12);
  assert.equal(longDate(week, now), 'Понедельник, 10 августа');
  assert.equal(longDate(new Date(2027, 0, 4), now), 'Понедельник, 4 января 2027 г.');
  assert.equal(weekRange(week, now), '10–16 августа');
  assert.equal(weekRange(new Date(2026, 7, 31), now), '31 августа – 6 сентября');
  assert.equal(weekRange(new Date(2026, 11, 28), now), '28 декабря 2026 г. – 3 января 2027 г.');
});

test('week layout places lessons by day, splits overlaps into lanes and fits the visible hours', () => {
  const layout = layoutWeek([
    lesson('first', at(12, 17), '50 мин'),
    lesson('overlap', at(12, 17, 30)),
    lesson('reuses-lane', at(12, 17, 50), '30 мин'),
    lesson('alone', at(12, 18, 40)),
    lesson('early', at(10, 7, 30)),
    lesson('late', at(16, 23, 30)),
    lesson('next-week', at(17, 12)),
    lesson('previous-week', at(9, 23)),
  ], week);
  const view = event => [event.lesson.id, event.start, event.end, event.lane, event.lanes];
  assert.deepEqual(layout.days[2].map(view), [
    ['first', 1020, 1070, 0, 2], ['overlap', 1050, 1110, 1, 2], ['reuses-lane', 1070, 1100, 0, 2], ['alone', 1120, 1180, 0, 1],
  ]);
  assert.deepEqual(layout.days[0].map(view), [['early', 450, 510, 0, 1]]);
  assert.deepEqual(layout.days[6].map(view), [['late', 1410, 1440, 0, 1]]);
  assert.equal(layout.days.flat().length, 6);
  assert.deepEqual([layout.weekStart, layout.startHour, layout.endHour], [week, 7, 24]);
  const empty = layoutWeek([], week);
  assert.deepEqual([empty.startHour, empty.endHour], [9, 22]);
});

test('the current time is placed only inside the visible week and hours', () => {
  const layout = layoutWeek([], week);
  assert.equal(nowOffset(layout, new Date(2026, 7, 12, 14, 37)), 337);
  assert.equal(nowOffset(layout, new Date(2026, 7, 16, 9)), 0);
  assert.equal(nowOffset(layout, new Date(2026, 7, 12, 8, 59)), null);
  assert.equal(nowOffset(layout, new Date(2026, 7, 12, 22)), null);
  assert.equal(nowOffset(layout, new Date(2026, 7, 17, 12)), null);
  assert.equal(nowOffset(layout, new Date(2026, 7, 9, 12)), null);
});
