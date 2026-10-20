(() => {
  'use strict';

  // Notifications are not urgent: a rare background poll, plus a refresh whenever the teacher looks.
  const POLL_MS = 5 * 60_000;
  const MAX_BADGE = 99;
  const bells = [...document.querySelectorAll('[data-notifications]')].map(root => ({
    button: root.querySelector('.notification-button'),
    badge: root.querySelector('[data-notifications-badge]'),
    list: root.querySelector('[data-notifications-list]'),
    empty: root.querySelector('[data-notifications-empty]'),
  }));
  // Features register how their notification types look: type -> payload -> { title, text, open }.
  const describers = new Map();
  let state = { notifications: [], unreadCount: 0 };

  function formatTime(iso) {
    const date = new Date(iso);
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === new Date().toDateString()) return time;
    return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
  }

  function renderItem(notification) {
    const { title, text, open } = describers.get(notification.type)(notification.payload);
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `notifications-item${notification.read ? '' : ' notifications-item--unread'}`;
    const heading = document.createElement('strong');
    heading.textContent = title;
    const body = document.createElement('span');
    body.textContent = text;
    const time = document.createElement('time');
    time.dateTime = notification.updatedAt;
    time.textContent = formatTime(notification.updatedAt);
    button.append(heading, body, time);
    button.addEventListener('click', () => {
      window.AppShell.closeHeaderMenus();
      markRead(notification.subjectKey);
      open();
    });
    item.append(button);
    return item;
  }

  function render() {
    const known = state.notifications.filter(notification => describers.has(notification.type));
    const count = state.unreadCount;
    for (const bell of bells) {
      bell.badge.hidden = !count;
      bell.badge.textContent = count > MAX_BADGE ? `${MAX_BADGE}+` : String(count);
      bell.button.setAttribute('aria-label', count ? `Уведомления, непрочитанных: ${count}` : 'Уведомления');
      bell.list.replaceChildren(...known.map(renderItem));
      bell.empty.hidden = known.length > 0;
    }
  }

  async function request(url, options) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) return;
      state = await response.json();
      render();
    } catch (_error) {
      // The next refresh repairs a missed one.
    }
  }

  function refresh() {
    if (!document.hidden) return request('/api/notifications');
  }

  function markRead(subjectKey) {
    return request('/api/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectKey }),
    });
  }

  function register(type, describe) {
    describers.set(type, describe);
    render();
  }

  bells.forEach(bell => bell.button.addEventListener('click', () => {
    if (bell.button.getAttribute('aria-expanded') === 'true') refresh();
  }));
  document.addEventListener('visibilitychange', refresh);
  window.setInterval(refresh, POLL_MS);
  refresh();
  window.Notifications = Object.freeze({ markRead, refresh, register });
})();
