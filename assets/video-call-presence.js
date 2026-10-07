(() => {
  'use strict';

  // Rooms are permanent, so a student may come in while the teacher is busy elsewhere in the cabinet.
  const POLL_MS = 15000;
  const menuLinks = [...document.querySelectorAll('a[href="/video-calls"][role="menuitem"]')];
  const avatars = ['profile-button', 'mobile-profile-button'].map(id => document.getElementById(id)).filter(Boolean);
  let waitingIds = null;

  function renderBadge(count) {
    for (const link of menuLinks) {
      let badge = link.querySelector('.menu-badge');
      if (!count) {
        badge?.remove();
        link.removeAttribute('aria-label');
        continue;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'menu-badge';
        badge.setAttribute('aria-hidden', 'true');
        link.append(badge);
      }
      badge.textContent = String(count);
      link.setAttribute('aria-label', `Видеозвонки, учеников ждёт: ${count}`);
    }
    avatars.forEach(avatar => avatar.classList.toggle('has-call-waiting', count > 0));
  }

  async function poll() {
    if (document.hidden) return;
    const requestedAt = Date.now();
    try {
      const response = await fetch('/api/video-calls');
      if (!response.ok) return;
      const { calls } = await response.json();
      const waiting = calls.filter(call => call.presence.guest && !call.presence.teacher);
      // The first poll only sets the badge; later polls also announce each newly arrived student.
      if (waitingIds) {
        waiting.filter(call => !waitingIds.has(call.id))
          .forEach(call => window.AppShell.showToast(`${call.name} ждёт в видеозвонке.`));
      }
      waitingIds = new Set(waiting.map(call => call.id));
      renderBadge(waiting.length);
      document.dispatchEvent(new CustomEvent('video-calls:update', { detail: { calls, requestedAt } }));
    } catch (_error) {
      // The next poll repairs a missed one.
    }
  }

  poll();
  window.setInterval(poll, POLL_MS);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
