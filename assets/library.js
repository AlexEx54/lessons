(() => {
  'use strict';

  const PAGE_SIZE = 8;
  let libraryLessons = [];
  let filtered = [];
  let shown = 0;

  const quickLessonsMock = [
    { title: 'Тест на определение уровня', text: 'Идеальный старт для нового ученика', image: '/assets/images/recommendation-placement.png' },
    { title: 'General English — первый урок', text: 'Starter · A1 · A2 · B1', image: '/assets/images/recommendation-general-english.png' },
    { title: 'Travel & Transport', text: 'Готовый урок на любимую тему', image: '/assets/images/recommendation-travel.png', popular: true },
  ];

  const skillIcons = {
    Vocabulary: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" stroke="currentColor" stroke-width="1.7"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5V5.5Z" stroke="currentColor" stroke-width="1.7"/></svg>',
    Speaking: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7.5h8a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H9l-3.5 3v-3H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M18 9.5c.9.6 1.5 1.6 1.5 2.7s-.6 2.1-1.5 2.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    Listening: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4 13v3.5A2.5 2.5 0 0 0 6.5 19H8v-6H4zM20 13v3.5A2.5 2.5 0 0 1 17.5 19H16v-6h4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    Watching: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="1.7"/><path d="m10 9.2 4.8 2.8-4.8 2.8V9.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    Writing: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m13 7 4 4" stroke="currentColor" stroke-width="1.7"/></svg>',
    Grammar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10M7 9h10M7 14h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M5 20h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z" stroke="currentColor" stroke-width="1.7"/></svg>',
  };

  const state = { age: 'all', level: 'all', category: 'all', query: '' };
  const grid = document.getElementById('lesson-grid');
  const empty = document.getElementById('empty-state');
  const showMore = document.getElementById('show-more');

  function showToast(message) {
    window.AppShell.showToast(message);
  }

  function escapeHtml(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function skillLabel(skill) {
    const icon = skillIcons[skill] || skillIcons.Vocabulary;
    return `<span class="skill-tag">${icon}${escapeHtml(skill)}</span>`;
  }

  const BADGE_LABELS = { new: 'NEW', popular: 'Популярное' };
  const BADGE_OPTIONS = [['new', 'Новый'], ['popular', 'Популярный'], [null, 'Без отметки']];
  const isAdmin = document.body.dataset.userRole === 'admin';
  const lessonMenu = isAdmin ? createLessonMenu() : null;
  let lessonMenuOwner = null;

  function renderBadge(article, badge) {
    article.querySelector('.cover-badge')?.remove();
    if (!badge) return;
    const label = document.createElement('span');
    label.className = `cover-badge cover-badge--${badge}`;
    label.textContent = BADGE_LABELS[badge];
    article.querySelector('.lesson-cover').append(label);
  }

  async function sendLessonRequest(url, method, body, fallbackError) {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || fallbackError);
  }

  async function changeBadge(lesson, article, badge) {
    const previous = lesson.badge;
    lesson.badge = badge;
    renderBadge(article, badge);
    try {
      await sendLessonRequest(`/api/library/${encodeURIComponent(lesson.id)}/badge`, 'PUT', { badge }, 'Не удалось изменить отметку урока.');
    } catch (error) {
      lesson.badge = previous;
      renderBadge(article, previous);
      showToast(error.message);
    }
  }

  async function unpublishLesson(lesson, article) {
    try {
      await sendLessonRequest(`/api/library/${encodeURIComponent(lesson.id)}/publication`, 'DELETE', { expectedRevision: lesson.revision }, 'Не удалось скрыть урок.');
      libraryLessons = libraryLessons.filter(item => item.id !== lesson.id);
      filtered = filtered.filter(item => item.id !== lesson.id);
      shown -= 1;
      article.remove();
      updateListState();
      showToast('Урок снят с публикации.');
    } catch (error) { showToast(error.message); }
  }

  // One admin menu for all cards: it lives in the top layer, so the card's overflow does not clip it.
  function createLessonMenu() {
    const menu = document.createElement('div');
    menu.className = 'lesson-menu';
    menu.popover = 'auto';
    menu.setAttribute('role', 'menu');
    const hide = () => menu.hidePopover();
    menu.addEventListener('toggle', event => {
      if (event.newState === 'open') document.addEventListener('scroll', hide, { capture: true });
      else document.removeEventListener('scroll', hide, { capture: true });
    });
    document.body.append(menu);
    return menu;
  }

  function placeLessonMenu() {
    const box = lessonMenuOwner.getBoundingClientRect();
    const gap = 8;
    const below = box.bottom + 6;
    lessonMenu.style.left = `${Math.max(gap, Math.min(box.left, innerWidth - lessonMenu.offsetWidth - gap))}px`;
    lessonMenu.style.top = `${below + lessonMenu.offsetHeight <= innerHeight - gap ? below : Math.max(gap, box.top - lessonMenu.offsetHeight - 6)}px`;
  }

  function menuItem(label, role, onSelect) {
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', role);
    item.textContent = label;
    item.addEventListener('click', () => { lessonMenu.hidePopover(); onSelect(); });
    return item;
  }

  function lessonMenuItems(lesson, article) {
    const items = BADGE_OPTIONS.map(([badge, label]) => {
      const item = menuItem(label, 'menuitemradio', () => { if (lesson.badge !== badge) changeBadge(lesson, article, badge); });
      item.setAttribute('aria-checked', String(lesson.badge === badge));
      return item;
    });
    if (lesson.can_unpublish) {
      const separator = document.createElement('hr');
      separator.setAttribute('role', 'separator');
      const unpublish = menuItem('Снять с публикации', 'menuitem', () => unpublishLesson(lesson, article));
      unpublish.classList.add('lesson-menu__danger');
      items.push(separator, unpublish);
    }
    return items;
  }

  function addLessonMenuButton(lesson, article) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lesson-menu-button';
    button.setAttribute('aria-label', 'Действия с уроком');
    button.setAttribute('aria-haspopup', 'menu');
    button.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
    button.popoverTargetElement = lessonMenu;
    // As the menu's invoker the button does not light-dismiss it; a second click closes it natively.
    button.addEventListener('click', event => {
      const isOpen = lessonMenu.matches(':popover-open');
      if (isOpen && lessonMenuOwner === button) return;
      // Opening here instead of natively places the menu before the first paint and moves an open menu between cards.
      event.preventDefault();
      lessonMenuOwner = button;
      lessonMenu.replaceChildren(...lessonMenuItems(lesson, article));
      if (!isOpen) lessonMenu.showPopover();
      placeLessonMenu();
      lessonMenu.querySelector('[aria-checked="true"]').focus({ preventScroll: true });
    });
    article.querySelector('.lesson-cover').append(button);
  }

  function lessonCard(source) {
    const lesson = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]));
    const article = document.createElement('article');
    article.className = 'lesson-card';
    article.innerHTML = `
      <div class="lesson-cover"><img src="${lesson.cover}" alt="" loading="lazy" decoding="async" /></div>
      <div class="lesson-body">
        <h3>${lesson.title}</h3>
        <p class="lesson-facts">${lesson.age.replace('-', '–')} лет <span>•</span> ${lesson.level}</p>
        <p class="lesson-description">${lesson.description}</p>
        <div class="lesson-skills">${source.skills.map(skillLabel).join('')}</div>
        <p class="lesson-duration"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v4.5l2.5 1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>${lesson.duration}</p>
        <div class="lesson-actions"><button type="button" data-action="preview">Предпросмотр</button><button type="button" data-action="select">Выбрать урок</button></div>
      </div>`;
    renderBadge(article, source.badge);
    const buttons = article.querySelectorAll('.lesson-actions button');
    if (!source.is_available) {
      buttons.forEach(button => { button.disabled = true; button.title = 'Урок пока недоступен'; });
      buttons[1].textContent = 'Скоро';
    } else {
      buttons.forEach(button => button.addEventListener('click', () => {
        window.location.href = `/library/${encodeURIComponent(source.id)}`;
      }));
      buttons[1].textContent = 'Открыть урок';
    }
    if (isAdmin) addLessonMenuButton(source, article);
    return article;
  }

  function matchesFilters(lesson) {
    const query = state.query.toLocaleLowerCase('ru-RU');
    return (state.age === 'all' || lesson.age === state.age)
      && (state.level === 'all' || lesson.level === state.level)
      && (state.category === 'all' || lesson.category === state.category)
      && (!query || `${lesson.title} ${lesson.description} ${lesson.skills.join(' ')}`.toLocaleLowerCase('ru-RU').includes(query));
  }

  function updateListState() {
    empty.hidden = filtered.length > 0;
    grid.hidden = filtered.length === 0;
    showMore.hidden = shown >= filtered.length;
  }

  // Appends the next page without touching cards that are already shown.
  function appendPage() {
    const page = filtered.slice(shown, shown + PAGE_SIZE);
    const fragment = document.createDocumentFragment();
    page.forEach(lesson => fragment.append(lessonCard(lesson)));
    grid.append(fragment);
    shown += page.length;
    updateListState();
  }

  // Full rebuild — only when the lesson set or filters change.
  function resetList() {
    filtered = libraryLessons.filter(matchesFilters);
    shown = 0;
    grid.replaceChildren();
    appendPage();
  }

  document.getElementById('filters').addEventListener('click', event => {
    const button = event.target.closest('.chip');
    if (!button) return;
    const group = button.closest('[data-filter]');
    const filter = group.dataset.filter;
    const isActive = button.classList.contains('chip--active');
    group.querySelectorAll('.chip').forEach(chip => chip.classList.remove('chip--active'));
    if (isActive) {
      state[filter] = 'all';
    } else {
      button.classList.add('chip--active');
      state[filter] = button.dataset.value;
    }
    resetList();
  });
  document.getElementById('lesson-search').addEventListener('input', event => {
    state.query = event.target.value.trim();
    resetList();
  });
  showMore.addEventListener('click', appendPage);

  const quickList = document.getElementById('quick-list');
  quickLessonsMock.forEach(item => {
    const card = document.createElement('article');
    card.className = item.popular ? 'quick-card quick-card--popular' : 'quick-card';
    card.innerHTML = `
      ${item.popular ? '<span class="quick-popular">Популярное</span>' : ''}
      <div class="quick-card__media"><img src="${item.image}" alt="" loading="lazy" decoding="async" /></div>
      <div class="quick-card__body">
        <h3>${item.title}</h3>
        <p>${item.text}</p>
        <button type="button">Выбрать <span aria-hidden="true">›</span></button>
      </div>`;
    card.querySelector('button').disabled = true;
    card.querySelector('button').textContent = 'Скоро';
    quickList.append(card);
  });

  async function loadLibrary() {
    document.getElementById('library-loading').hidden = false;
    document.getElementById('library-error').hidden = true;
    empty.hidden = true;
    grid.hidden = true;
    showMore.hidden = true;
    try {
      const response = await fetch('/api/library', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.lessons)) throw new Error('Не удалось загрузить библиотеку.');
      libraryLessons = payload.lessons;
      resetList();
    } catch (_error) {
      document.getElementById('library-error').hidden = false;
    } finally {
      document.getElementById('library-loading').hidden = true;
    }
  }
  document.getElementById('library-retry').addEventListener('click', loadLibrary);
  loadLibrary();
})();
