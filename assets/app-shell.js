(() => {
  'use strict';

  const MOBILE_QUERY = '(max-width: 860px)';
  const body = document.body;
  const sidebar = document.getElementById('sidebar');
  const menuButton = document.getElementById('menu-button');
  const navOverlay = document.getElementById('nav-overlay');
  const toast = document.getElementById('toast');
  const mobileMedia = window.matchMedia(MOBILE_QUERY);
  const profileButton = document.getElementById('profile-button');
  const mobileProfileButton = document.getElementById('mobile-profile-button');
  const profileMenu = document.getElementById('profile-menu');
  const mobileProfileMenu = document.getElementById('mobile-profile-menu');
  const logoutButton = document.getElementById('logout-button');
  const mobileLogoutButton = document.getElementById('mobile-logout-button');
  let toastTimer = null;

  function showToast(message) {
    if (!message) return;
    toast.textContent = message;
    toast.classList.add('toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('toast--visible'), 2800);
  }

  function setMobileAccessibility(open) {
    if (!mobileMedia.matches) {
      sidebar.inert = false;
      sidebar.removeAttribute('aria-hidden');
      navOverlay.setAttribute('aria-hidden', 'true');
      return;
    }

    sidebar.inert = !open;
    sidebar.setAttribute('aria-hidden', String(!open));
    navOverlay.setAttribute('aria-hidden', String(!open));
  }

  function closeNavigation({ restoreFocus = true } = {}) {
    const wasOpen = body.classList.contains('nav-open');
    body.classList.remove('nav-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Открыть меню');
    setMobileAccessibility(false);
    if (restoreFocus && wasOpen && mobileMedia.matches) menuButton.focus();
  }

  function openNavigation() {
    if (!mobileMedia.matches) return;
    body.classList.add('nav-open');
    menuButton.setAttribute('aria-expanded', 'true');
    menuButton.setAttribute('aria-label', 'Закрыть меню');
    setMobileAccessibility(true);
    const focusTarget = sidebar.querySelector('[aria-current="page"]') || sidebar.querySelector('a[href], button');
    window.requestAnimationFrame(() => focusTarget?.focus());
  }

  function toggleNavigation() {
    if (body.classList.contains('nav-open')) closeNavigation();
    else openNavigation();
  }

  function keepFocusInsideSidebar(event) {
    if (event.key !== 'Tab' || !mobileMedia.matches || !body.classList.contains('nav-open')) return;
    const focusable = [...sidebar.querySelectorAll('a[href], button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function syncViewportState() {
    closeNavigation({ restoreFocus: false });
    setMobileAccessibility(false);
  }

  function closeProfileMenu() {
    if (profileMenu && profileButton) {
      profileMenu.hidden = true;
      profileButton.setAttribute('aria-expanded', 'false');
    }
    if (mobileProfileMenu && mobileProfileButton) {
      mobileProfileMenu.hidden = true;
      mobileProfileButton.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleProfileMenu() {
    if (!profileMenu || !profileButton) return;
    const willOpen = profileMenu.hidden;
    profileMenu.hidden = !willOpen;
    profileButton.setAttribute('aria-expanded', String(willOpen));
  }

  async function logout() {
    if (logoutButton) logoutButton.disabled = true;
    if (mobileLogoutButton) mobileLogoutButton.disabled = true;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.assign('/login');
    }
  }

  menuButton.addEventListener('click', toggleNavigation);
  navOverlay.addEventListener('click', () => closeNavigation());
  sidebar.querySelectorAll('a[href]').forEach(link => {
    link.addEventListener('click', () => closeNavigation({ restoreFocus: false }));
  });

  document.querySelectorAll('[data-coming-soon]').forEach(button => {
    button.addEventListener('click', () => {
      closeNavigation();
      const label = button.dataset.comingSoon;
      showToast(label ? `${label}: этот раздел скоро появится.` : 'Этот раздел скоро появится.');
    });
  });

  document.querySelectorAll('[data-toast]').forEach(button => {
    button.addEventListener('click', () => showToast(button.dataset.toast));
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && body.classList.contains('nav-open')) {
      event.preventDefault();
      closeNavigation();
      return;
    }
    keepFocusInsideSidebar(event);
  });

  mobileMedia.addEventListener('change', syncViewportState);
  profileButton?.addEventListener('click', event => {
    event.stopPropagation();
    toggleProfileMenu();
  });
  mobileProfileButton?.addEventListener('click', event => {
    event.stopPropagation();
    if (!mobileProfileMenu) return;
    const willOpen = mobileProfileMenu.hidden;
    closeProfileMenu();
    mobileProfileMenu.hidden = !willOpen;
    mobileProfileButton.setAttribute('aria-expanded', String(willOpen));
  });
  logoutButton?.addEventListener('click', logout);
  mobileLogoutButton?.addEventListener('click', logout);
  document.addEventListener('click', event => {
    if (!event.target.closest('.profile-menu-wrap') && !event.target.closest('.mobile-profile-wrap')) closeProfileMenu();
  });
  window.AppShell = Object.freeze({ closeNavigation, showToast });
  syncViewportState();
})();
