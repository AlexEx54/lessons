(() => {
  'use strict';
  const list = document.getElementById('schedule-list');
  const status = document.getElementById('schedule-status');
  const retry = document.getElementById('schedule-retry');
  const formatter = new Intl.DateTimeFormat('ru', { dateStyle: 'long', timeStyle: 'short' });
  document.getElementById('schedule-time-zone').textContent = `Часовой пояс: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function card(lesson) {
    const row = element('article', 'schedule-card');
    const image = element('img', 'schedule-cover');
    image.src = lesson.cover;
    image.alt = '';
    image.loading = 'lazy';
    const body = element('div', 'schedule-body');
    const time = element('p', 'schedule-time', lesson.scheduled_at ? formatter.format(new Date(lesson.scheduled_at)) : 'Время не назначено');
    body.append(time, element('h3', '', lesson.name), element('p', 'schedule-lesson', lesson.title), element('p', 'schedule-meta', `${lesson.level} · ${lesson.duration}`));
    const actions = element('div', 'schedule-actions');
    const open = element('a', 'schedule-primary', 'Открыть урок');
    open.href = lesson.lessonPath;
    const copy = element('button', 'schedule-copy', 'Скопировать ссылку');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(new URL(lesson.invitePath, location.origin).href); window.AppShell.showToast('Ссылка на класс скопирована.'); }
      catch { window.AppShell.showToast('Не удалось скопировать ссылку.'); }
    });
    actions.append(open, copy);
    row.append(image, body, actions);
    return row;
  }
  async function load() {
    retry.hidden = true;
    status.textContent = 'Загружаем уроки…';
    try {
      const response = await fetch('/api/classes', { cache: 'no-store' });
      if (response.status === 401) { location.href = '/login?next=/schedule'; return; }
      if (!response.ok) throw new Error();
      const data = await response.json();
      list.replaceChildren(...data.classes.map(card));
      status.textContent = data.classes.length ? '' : 'Пока нет предстоящих уроков. Создайте класс и выберите материал из библиотеки.';
    } catch { status.textContent = 'Не удалось загрузить расписание.'; retry.hidden = false; }
  }
  retry.addEventListener('click', load);
  load();
})();
