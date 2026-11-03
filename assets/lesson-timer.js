(() => {
  'use strict';
  // The teacher's own stopwatch: it counts only in this browser and is never shared with the class.
  window.LessonTimer = { create({ formatTime }) {
    const byId = id => document.getElementById(id);
    const toggle = byId('lesson-timer'), reset = byId('lesson-timer-reset');
    let seconds = 0, interval = null;
    function paint() {
      byId('timer-icon').textContent = interval ? 'Ⅱ' : '▶';
      byId('elapsed-time').textContent = formatTime(seconds);
      toggle.setAttribute('aria-label', interval ? 'Остановить таймер урока' : 'Запустить таймер урока');
      reset.disabled = !interval && seconds === 0;
    }
    function stop() {
      window.clearInterval(interval);
      interval = null;
    }
    toggle.addEventListener('click', () => {
      if (interval) stop();
      else interval = window.setInterval(() => { seconds += 1; paint(); }, 1000);
      paint();
    });
    reset.addEventListener('click', () => {
      stop();
      seconds = 0;
      paint();
    });
    paint();
    return { stop };
  } };
})();
