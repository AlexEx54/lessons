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
  const newLessonModal = document.getElementById('new-lesson-modal');
  const newLessonDialog = newLessonModal?.querySelector('.new-lesson-dialog');
  const newLessonTopic = document.getElementById('new-lesson-topic');
  const newLessonWarmUpTopic = document.getElementById('new-lesson-warm-up-topic');
  const newLessonGrammarTopic = document.getElementById('new-lesson-grammar-topic');
  const newLessonSynthetic = document.getElementById('new-lesson-synthetic');
  const createLessonDraftButton = newLessonModal?.querySelector('[data-create-lesson-draft]');
  const newLessonSelect = newLessonModal?.querySelector('[data-new-lesson-select]');
  const newLessonSelectTrigger = newLessonSelect?.querySelector('.new-lesson-select__trigger');
  const newLessonSelectList = newLessonSelect?.querySelector('.new-lesson-select__list');
  const newLessonSelectValue = newLessonSelect?.querySelector('.new-lesson-select__value');
  const newLessonSelectInput = newLessonSelect?.querySelector('[data-new-lesson-template-value]');
  const newLessonSelectOptions = newLessonSelect
    ? [...newLessonSelect.querySelectorAll('.new-lesson-select__option')]
    : [];
  const newLessonChoiceGroups = newLessonModal
    ? [...newLessonModal.querySelectorAll('[data-new-lesson-choice-group]')]
    : [];
  let toastTimer = null;
  let newLessonReturnFocus = null;

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

  function isNewLessonSelectOpen() {
    return Boolean(newLessonSelect?.classList.contains('new-lesson-select--open'));
  }

  function closeNewLessonSelect({ restoreFocus = false } = {}) {
    if (!newLessonSelect || !isNewLessonSelectOpen()) return;
    newLessonSelect.classList.remove('new-lesson-select--open');
    newLessonSelectTrigger?.setAttribute('aria-expanded', 'false');
    newLessonSelectList?.setAttribute('hidden', '');
    if (restoreFocus) newLessonSelectTrigger?.focus();
  }

  function openNewLessonSelect() {
    if (!newLessonSelect || !newLessonSelectTrigger || !newLessonSelectList) return;
    newLessonSelect.classList.add('new-lesson-select--open');
    newLessonSelectTrigger.setAttribute('aria-expanded', 'true');
    newLessonSelectList.removeAttribute('hidden');
    const selected = newLessonSelectOptions.find(option => option.getAttribute('aria-selected') === 'true')
      || newLessonSelectOptions[0];
    window.requestAnimationFrame(() => selected?.focus());
  }

  function toggleNewLessonSelect() {
    if (isNewLessonSelectOpen()) closeNewLessonSelect({ restoreFocus: true });
    else openNewLessonSelect();
  }

  function selectNewLessonTemplate(option) {
    if (!option || !newLessonSelectValue || !newLessonSelectInput) return;
    const value = option.dataset.value || '';
    const label = option.textContent.trim();
    newLessonSelectOptions.forEach(item => {
      item.setAttribute('aria-selected', String(item === option));
    });
    newLessonSelectValue.textContent = label;
    newLessonSelectInput.value = value;
    closeNewLessonSelect({ restoreFocus: true });
  }

  function moveNewLessonSelectFocus(delta) {
    if (!newLessonSelectOptions.length) return;
    const currentIndex = newLessonSelectOptions.indexOf(document.activeElement);
    const nextIndex = currentIndex < 0
      ? 0
      : (currentIndex + delta + newLessonSelectOptions.length) % newLessonSelectOptions.length;
    newLessonSelectOptions[nextIndex]?.focus();
  }

  function openNewLessonModal(event) {
    if (!newLessonModal || !newLessonDialog) return;
    newLessonReturnFocus = event.currentTarget;
    closeProfileMenu();
    closeNavigation({ restoreFocus: false });
    closeNewLessonSelect();
    newLessonModal.classList.add('new-lesson-modal--visible');
    newLessonModal.setAttribute('aria-hidden', 'false');
    body.classList.add('new-lesson-modal-open');
    window.requestAnimationFrame(() => newLessonTopic?.focus());
  }

  function closeNewLessonModal() {
    if (!newLessonModal?.classList.contains('new-lesson-modal--visible')) return;
    closeNewLessonSelect();
    newLessonModal.classList.remove('new-lesson-modal--visible');
    newLessonModal.setAttribute('aria-hidden', 'true');
    body.classList.remove('new-lesson-modal-open');
    newLessonReturnFocus?.focus();
    newLessonReturnFocus = null;
  }

  async function createLessonDraft() {
    if (!createLessonDraftButton || !newLessonTopic || !newLessonGrammarTopic || !newLessonSelectInput) return;
    const topic = newLessonTopic.value.trim();
    if (!topic) {
      showToast('Укажите тему урока.');
      newLessonTopic.focus();
      return;
    }
    const grammarTopic = newLessonGrammarTopic.value.trim();
    if (!grammarTopic) {
      showToast('Укажите тему Grammar.');
      newLessonGrammarTopic.focus();
      return;
    }

    const originalLabel = createLessonDraftButton.innerHTML;
    createLessonDraftButton.disabled = true;
    createLessonDraftButton.textContent = 'Создаём структуру…';
    try {
      const response = await fetch('/api/lesson-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          warmUpTopic: newLessonWarmUpTopic?.value.trim() || '',
          grammarTopic,
          template: newLessonSelectInput.value,
          synthetic: Boolean(newLessonSynthetic?.checked),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось создать черновик.');
      window.location.assign('/lesson-drafts');
    } catch (error) {
      showToast(error.message || 'Не удалось создать черновик.');
      createLessonDraftButton.disabled = false;
      createLessonDraftButton.innerHTML = originalLabel;
    }
  }

  function keepFocusInsideNewLessonModal(event) {
    if (event.key !== 'Tab' || !newLessonModal?.classList.contains('new-lesson-modal--visible')) return;
    const focusable = [...newLessonDialog.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type="hidden"])')]
      .filter(el => !el.classList.contains('new-lesson-select__option'));
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;

    if (isNewLessonSelectOpen() || newLessonSelectOptions.includes(document.activeElement)) {
      event.preventDefault();
      closeNewLessonSelect();
      const triggerIndex = Math.max(0, focusable.indexOf(newLessonSelectTrigger));
      const next = event.shiftKey
        ? focusable[triggerIndex - 1] || last
        : focusable[triggerIndex + 1] || first;
      next.focus();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
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
      window.location.assign('/');
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
    if (event.key === 'Escape' && isNewLessonSelectOpen()) {
      event.preventDefault();
      closeNewLessonSelect({ restoreFocus: true });
      return;
    }
    if (event.key === 'Escape' && newLessonModal?.classList.contains('new-lesson-modal--visible')) {
      event.preventDefault();
      closeNewLessonModal();
      return;
    }
    if (event.key === 'Escape' && body.classList.contains('nav-open')) {
      event.preventDefault();
      closeNavigation();
      return;
    }
    if (isNewLessonSelectOpen()) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveNewLessonSelectFocus(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveNewLessonSelectFocus(-1);
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        newLessonSelectOptions[0]?.focus();
        return;
      }
      if (event.key === 'End') {
        event.preventDefault();
        newLessonSelectOptions.at(-1)?.focus();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        const option = document.activeElement?.closest?.('.new-lesson-select__option');
        if (option) {
          event.preventDefault();
          selectNewLessonTemplate(option);
          return;
        }
      }
    }
    keepFocusInsideNewLessonModal(event);
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
  document.querySelectorAll('[data-open-new-lesson-modal]').forEach(button => {
    button.addEventListener('click', openNewLessonModal);
  });
  newLessonModal?.querySelectorAll('[data-close-new-lesson-modal]').forEach(button => {
    button.addEventListener('click', closeNewLessonModal);
  });
  newLessonSelectTrigger?.addEventListener('click', event => {
    event.stopPropagation();
    toggleNewLessonSelect();
  });
  newLessonSelectOptions.forEach(option => {
    option.addEventListener('click', event => {
      event.stopPropagation();
      selectNewLessonTemplate(option);
    });
  });
  newLessonChoiceGroups.forEach(group => {
    group.addEventListener('click', event => {
      const choice = event.target.closest('.new-lesson-choice');
      if (!choice || !group.contains(choice)) return;
      group.querySelectorAll('.new-lesson-choice').forEach(button => {
        button.setAttribute('aria-pressed', String(button === choice));
      });
    });
  });
  createLessonDraftButton?.addEventListener('click', createLessonDraft);
  document.addEventListener('click', event => {
    if (!event.target.closest('.profile-menu-wrap') && !event.target.closest('.mobile-profile-wrap')) closeProfileMenu();
    if (!event.target.closest('[data-new-lesson-select]')) closeNewLessonSelect();
  });
  window.AppShell = Object.freeze({ closeNavigation, showToast });
  syncViewportState();
})();
