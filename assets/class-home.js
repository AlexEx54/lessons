(() => {
  'use strict';
  // `/join/:token` shows the current session, `/join/:token/sessions` lists them all.
  const match = window.location.pathname.match(/^\/join\/([^/]+)(\/sessions)?\/?$/);
  if (!match) return;
  const token = match[1], classPath = `/join/${token}`, listPath = `${classPath}/sessions`;
  const byId = id => document.getElementById(id);
  const day = new Intl.DateTimeFormat('ru', { weekday: 'short', day: 'numeric', month: 'long' });
  const dayWithYear = new Intl.DateTimeFormat('ru', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const time = new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit' });
  // Times are shown in the student's own time zone.
  function formatWhen(scheduledAt) {
    const date = new Date(scheduledAt);
    const format = date.getFullYear() === new Date().getFullYear() ? day : dayWithYear;
    return `${format.format(date)}, ${time.format(date)}`;
  }
  const started = session => Date.parse(session.scheduledAt) <= Date.now();
  const describe = session => [session.level, session.duration].filter(Boolean).join(' · ');
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function whenLabel(session, current) {
    if (!current) return `Прошлое занятие · ${formatWhen(session.scheduledAt)}`;
    return started(session)
      ? `Идёт сейчас · началось в ${time.format(new Date(session.scheduledAt))}`
      : `Ближайшее занятие · ${formatWhen(session.scheduledAt)}`;
  }
  function showHome({ className, current, upcoming, past }) {
    byId('class-home-class').textContent = `Ваш класс · ${className}`;
    // Without a current session the student most likely returns for homework, so offer the latest past one.
    const shown = current ?? past[0];
    byId('class-home-current').hidden = !shown;
    byId('class-home-empty').hidden = Boolean(shown);
    const enter = byId('class-home-enter'), all = byId('class-home-all');
    enter.hidden = !shown;
    all.hidden = !upcoming.length && !past.length;
    all.href = listPath;
    if (shown) {
      const cover = byId('class-home-cover');
      cover.hidden = !shown.cover;
      if (shown.cover) cover.src = shown.cover;
      byId('class-home-when').textContent = whenLabel(shown, current);
      byId('class-home-title').textContent = shown.title;
      byId('class-home-meta').textContent = describe(shown);
      enter.href = shown.path;
    }
    byId('class-home').hidden = false;
  }
  function sessionItem(session, current) {
    const link = element('a', 'class-sessions__item');
    link.href = session.path;
    const thumb = element('span', 'class-sessions__thumb');
    if (session.cover) {
      const image = element('img');
      image.src = session.cover;
      image.alt = '';
      image.loading = 'lazy';
      thumb.append(image);
    }
    const text = element('span', 'class-sessions__text');
    const when = element('span', 'class-sessions__when', formatWhen(session.scheduledAt));
    if (session.id === current?.id && started(session)) when.append(element('span', 'class-sessions__live', 'Идёт сейчас'));
    text.append(when, element('strong', '', session.title), element('span', 'class-sessions__meta', describe(session)));
    link.append(thumb, text, element('span', 'class-sessions__arrow', '›'));
    const item = element('li');
    item.append(link);
    return item;
  }
  function showSessions({ className, current, upcoming, past }) {
    byId('class-sessions-class').textContent = `Ваш класс · ${className}`;
    byId('class-sessions-back').href = classPath;
    const lists = { upcoming, past };
    const empty = { upcoming: 'Предстоящих занятий пока нет.', past: 'Прошедших занятий пока нет.' };
    const tabs = Object.keys(lists).map(name => byId(`class-sessions-tab-${name}`));
    function select(name) {
      for (const tab of tabs) {
        const selected = tab.dataset.tab === name;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      }
      byId('class-sessions-list').replaceChildren(...lists[name].map(session => sessionItem(session, current)));
      byId('class-sessions-empty').hidden = lists[name].length > 0;
      byId('class-sessions-empty').textContent = empty[name];
    }
    for (const tab of tabs) {
      tab.querySelector('span').textContent = lists[tab.dataset.tab].length || '';
      tab.addEventListener('click', () => {
        // The tab lives in the hash, so returning from a session reopens the same list.
        window.history.replaceState(null, '', `#${tab.dataset.tab}`);
        select(tab.dataset.tab);
      });
    }
    const requested = window.location.hash.slice(1);
    select(lists[requested] ? requested : upcoming.length || !past.length ? 'upcoming' : 'past');
    byId('class-sessions').hidden = false;
  }
  function showError(message) {
    byId('class-home-error-message').textContent = message;
    byId('class-home-error').hidden = false;
  }
  async function load() {
    let response, overview;
    try {
      response = await fetch(`/api${classPath}`, { cache: 'no-store' });
      overview = await response.json();
    } catch {
      overview = null;
    }
    byId('class-home-loading').hidden = true;
    if (!response?.ok || !overview) {
      showError(overview?.error || 'Проверьте подключение к интернету и обновите страницу.');
      return;
    }
    document.title = `${overview.className} — EasyClass`;
    (match[2] ? showSessions : showHome)(overview);
  }
  load();
})();
