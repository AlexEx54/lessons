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

  // Format icons of the program view, keyed by the card's format: one stroke and size, bigger than the skill icons.
  const formatIcon = paths => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const formatIcons = {
    reading: formatIcon('<path d="M12 6.8C10.2 5.5 7.8 5 4 5v12.6c3.8 0 6.2.5 8 1.9 1.8-1.4 4.2-1.9 8-1.9V5c-3.8 0-6.2.5-8 1.8Z"/><path d="M12 6.8v12.7"/>'),
    video: formatIcon('<circle cx="12" cy="12" r="9"/><path d="M10.2 8.9v6.2a.5.5 0 0 0 .77.42l4.8-3.1a.5.5 0 0 0 0-.84l-4.8-3.1a.5.5 0 0 0-.77.42Z" fill="currentColor" stroke-width="1"/>'),
    debate: formatIcon('<path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h7.5A2.5 2.5 0 0 1 16 6.5v3.5a2.5 2.5 0 0 1-2.5 2.5H9l-3.5 3v-3A2.5 2.5 0 0 1 3.5 10V6.5Z"/><path d="M19.5 9.6A2.4 2.4 0 0 1 20.5 11.5V15a2.5 2.5 0 0 1-2 2.45V20l-3-2.5H12a2.5 2.5 0 0 1-2.2-1.3"/>'),
    situation: formatIcon('<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>'),
    lesson: formatIcon('<path d="M14 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5l-5-5Z"/><path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h4.5"/>'),
  };
  const AGES = ['9-11', '12-14', '15-18', 'adults'];
  const VISIBLE_PILLS = 5;
  const VIEW_STORAGE_KEY = 'easyclass.libraryView';

  // view: «По программе» or «Все уроки»; tab: the level open in the program view, never 'all'.
  const state = { view: 'program', tab: null, age: 'all', level: 'all', category: 'all', query: '' };
  let program = null;
  let grammarPoints = new Map();
  const programList = document.getElementById('program');
  const levelChips = [...document.querySelectorAll('[data-filter="level"] .chip')];
  const grid = document.getElementById('lesson-grid');
  const empty = document.getElementById('empty-state');
  const showMore = document.getElementById('show-more');
  const classPicker = document.getElementById('library-class');
  const classSelect = document.getElementById('library-class-select');
  const classHint = document.getElementById('library-class-hint');
  let classes = [];
  // The class chosen in «Для класса» with its sessions, and what ClassPlan makes of them for the current render.
  let chosenClass = null;
  let ranking = null;
  let classRequest = 0;

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

  async function editProgram(lesson, article) {
    const saved = await window.LessonPublication.editProgram(lesson);
    // The menu item that opened the window is hidden by now, so focus goes back to the card's menu button.
    if (!saved) { article.querySelector('.lesson-menu-button').focus(); return; }
    for (const key of ['grammar_point', 'grammar_title', 'topic', 'season', 'season_label']) lesson[key] = saved[key];
    const updated = lessonCard(lesson);
    article.replaceWith(updated);
    updated.querySelector('.lesson-menu-button').focus();
    showToast('Урок обновлён.');
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

  function menuSeparator() {
    const separator = document.createElement('hr');
    separator.setAttribute('role', 'separator');
    return separator;
  }

  function lessonMenuItems(lesson, article) {
    const items = BADGE_OPTIONS.map(([badge, label]) => {
      const item = menuItem(label, 'menuitemradio', () => { if (lesson.badge !== badge) changeBadge(lesson, article, badge); });
      item.setAttribute('aria-checked', String(lesson.badge === badge));
      return item;
    });
    items.push(menuSeparator(), menuItem('Грамматика и тема…', 'menuitem', () => editProgram(lesson, article)));
    if (lesson.can_unpublish) {
      const unpublish = menuItem('Снять с публикации', 'menuitem', () => unpublishLesson(lesson, article));
      unpublish.classList.add('lesson-menu__danger');
      items.push(menuSeparator(), unpublish);
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

  // «Present Simple · Распорядок дня»: what the lesson teaches, for lessons marked up by the program.
  function programLine(lesson) {
    const parts = [lesson.grammar_title, lesson.topic].filter(Boolean);
    return parts.length ? `<p class="lesson-program">${parts.join(' <span>·</span> ')}</p>` : '';
  }

  // «Дальше по программе», «Проводили 9 ноября»: where the lesson stands for the chosen class.
  function classMark(lesson, variant = '') {
    const mark = ranking?.marks.get(lesson.id);
    return mark ? `<span class="plan-mark plan-mark--${mark.state} ${variant}">${escapeHtml(window.ClassPlan.markText(mark))}</span>` : '';
  }

  function lessonCard(source) {
    const lesson = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]));
    const article = document.createElement('article');
    article.className = 'lesson-card';
    article.innerHTML = `
      <div class="lesson-cover"><img src="${lesson.cover}" alt="" loading="lazy" decoding="async" />${classMark(source, 'plan-mark--cover')}</div>
      <div class="lesson-body">
        <h3>${lesson.title}</h3>
        <p class="lesson-facts">${lesson.age_label} <span>•</span> ${lesson.level}${lesson.season_label ? ` <span>•</span> ${lesson.season_label}` : ''}</p>
        ${programLine(lesson)}
        <p class="lesson-description">${lesson.description}</p>
        <div class="lesson-skills">${source.skills.map(skillLabel).join('')}</div>
        <p class="lesson-duration"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v4.5l2.5 1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>${lesson.duration}</p>
        <div class="lesson-actions"><button type="button" data-action="preview">Предпросмотр</button><button type="button" data-action="schedule">Запланировать</button></div>
      </div>`;
    renderBadge(article, source.badge);
    article.querySelector('[data-action="preview"]').addEventListener('click', () => { window.location.href = `/library/${encodeURIComponent(source.id)}`; });
    article.querySelector('[data-action="schedule"]').addEventListener('click', () => window.ClassModal.open({
      lessonId: source.id, classId: chosenClass?.item.id ?? null, onCreated: refreshClasses,
    }));
    if (isAdmin) addLessonMenuButton(source, article);
    return article;
  }

  // Age, category and search; the level is a filter of the list and a tab of the program view.
  function matchesFilters(lesson) {
    const query = state.query.toLocaleLowerCase('ru-RU');
    return (state.age === 'all' || lesson.age === state.age)
      && (state.category === 'all' || lesson.category === state.category)
      && (!query || `${lesson.title} ${lesson.description} ${lesson.grammar_title ?? ''} ${lesson.topic ?? ''} ${lesson.season_label ?? ''} ${lesson.skills.join(' ')}`.toLocaleLowerCase('ru-RU').includes(query));
  }

  function updateListState() {
    empty.hidden = filtered.length > 0;
    grid.hidden = filtered.length === 0;
    showMore.hidden = shown >= filtered.length;
  }

  // The grid is auto-fit, so the column count depends on the viewport width.
  function columnCount() {
    return getComputedStyle(grid).gridTemplateColumns.split(' ').length;
  }

  // Appends the next page without touching cards that are already shown.
  // The page is at least PAGE_SIZE cards and is rounded up to end on a full row.
  function appendPage() {
    const columns = columnCount();
    const page = filtered.slice(shown, Math.ceil((shown + PAGE_SIZE) / columns) * columns);
    const fragment = document.createDocumentFragment();
    page.forEach(lesson => fragment.append(lessonCard(lesson)));
    grid.append(fragment);
    shown += page.length;
    updateListState();
  }

  // Full rebuild — only when the lesson set or filters change. A chosen class puts its lessons in the program order.
  function resetList() {
    filtered = (ranking?.lessons ?? libraryLessons).filter(lesson => (state.level === 'all' || lesson.level === state.level) && matchesFilters(lesson));
    shown = 0;
    grid.replaceChildren();
    grid.hidden = false; // A hidden grid has no tracks to measure.
    appendPage();
  }

  // A lesson sits under its grammar point's level; a lesson without grammar sits under its own level.
  function programLevel(lesson) {
    return grammarPoints.get(lesson.grammar_point)?.level ?? lesson.level;
  }

  function byLevelAgeTitle(a, b) {
    return a.level.localeCompare(b.level) || AGES.indexOf(a.age) - AGES.indexOf(b.age) || a.title.localeCompare(b.title, 'en');
  }

  // Grammar rows of one level in program order, then the lessons of that level without grammar.
  function programRows(level) {
    const rows = program.grammar.filter(point => point.level === level).map((point, index) => ({
      key: point.key, number: index + 1, title: point.title, hint: point.hint,
      lessons: libraryLessons.filter(lesson => lesson.grammar_point === point.key),
    }));
    rows.push({ number: null, title: 'Без грамматики', hint: 'уроки на тему, без отдельной грамматики',
      lessons: libraryLessons.filter(lesson => !grammarPoints.has(lesson.grammar_point) && lesson.level === level) });
    return rows;
  }

  // «Family · 12–14 лет · B1 · Хэллоуин»: the level is shown only when it differs from the grammar point's.
  function lessonPill(lesson, level) {
    const pill = document.createElement('a');
    pill.className = 'lesson-pill';
    pill.href = `/library/${encodeURIComponent(lesson.id)}`;
    const format = lesson.format_label ? `role="img" aria-label="${escapeHtml(lesson.format_label)}" title="${escapeHtml(lesson.format_label)}"` : 'aria-hidden="true"';
    const age = lesson.level === level ? escapeHtml(lesson.age_label) : `<b>${escapeHtml(lesson.level)}</b> ${escapeHtml(lesson.age_label)}`;
    const facts = [isNextLesson(lesson) ? '' : classMark(lesson), age, escapeHtml(lesson.season_label ?? '')].filter(Boolean).join(' · ');
    pill.classList.toggle('lesson-pill--next', isNextLesson(lesson));
    pill.innerHTML = `<span class="lesson-pill__icon" ${format}>${formatIcons[lesson.format] ?? formatIcons.lesson}</span>
      <span class="lesson-pill__text"><span class="lesson-pill__title">${escapeHtml(lesson.title)}</span>
      <span class="lesson-pill__facts">${facts}</span></span>`;
    return pill;
  }

  // Pills beyond the first ones wait behind «Ещё N»; it opens only its own row, until the next render.
  function morePills(hiddenPills) {
    hiddenPills.forEach(pill => { pill.hidden = true; });
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lesson-pill lesson-pill--more';
    button.textContent = `Ещё ${hiddenPills.length}`;
    button.addEventListener('click', () => {
      hiddenPills.forEach(pill => { pill.hidden = false; });
      hiddenPills[0].focus();
      button.remove();
    });
    return button;
  }

  const isNextLesson = lesson => ranking?.marks.get(lesson.id)?.state === 'next';

  // A class with a level and age dims the lessons for other ages, except the ones it took or takes next.
  function fitsClass(lesson) {
    const age = ranking?.profileKnown && chosenClass.item.age;
    return !age || lesson.age === age || ranking.marks.has(lesson.id);
  }

  // Filters dim the lessons that miss them instead of hiding them, so rows stay put; the matching ones go first.
  function programRow(row, level) {
    const item = document.createElement('li');
    const isNext = Boolean(row.key) && row.key === ranking?.nextPoint?.key;
    const isHeld = Boolean(row.key) && Boolean(ranking?.heldPoints.has(row.key));
    item.className = ['program-row', !row.number && 'program-row--free', isNext && 'program-row--next', isHeld && 'program-row--held']
      .filter(Boolean).join(' ');
    item.innerHTML = `<div class="program-row__point"><span class="program-row__number" aria-hidden="true">${row.number ?? ''}</span>
      <div>${isNext ? '<span class="program-row__next">Дальше</span>' : ''}<h3>${escapeHtml(row.title)}</h3>
      <p>${escapeHtml(row.hint)}${isHeld ? '<span class="visually-hidden"> — пройдено</span>' : ''}</p></div></div>
      <div class="program-row__lessons"></div>`;
    const lessons = item.querySelector('.program-row__lessons');
    if (!row.lessons.length) {
      lessons.innerHTML = '<span class="program-row__none">нет уроков</span>';
      return item;
    }
    const matching = new Set(row.lessons.filter(lesson => matchesFilters(lesson) && fitsClass(lesson)));
    const pills = row.lessons.sort((a, b) => matching.has(b) - matching.has(a) || isNextLesson(b) - isNextLesson(a) || byLevelAgeTitle(a, b)).map(lesson => {
      const pill = lessonPill(lesson, level);
      pill.classList.toggle('lesson-pill--dimmed', !matching.has(lesson));
      return pill;
    });
    lessons.append(...pills);
    if (pills.length > VISIBLE_PILLS) lessons.append(morePills(pills.slice(VISIBLE_PILLS)));
    return item;
  }

  // Admins see every grammar point of the level, so the gaps of the library show; teachers see points with lessons.
  function renderProgram() {
    const rows = programRows(state.tab).filter(row => row.lessons.length || (isAdmin && row.number));
    programList.replaceChildren(...rows.map(row => programRow(row, state.tab)));
    programList.hidden = rows.length === 0;
    setEmptyText(`На уровне ${state.tab} пока нет уроков`);
    empty.hidden = rows.length > 0;
  }

  // An empty level is not a search miss, so it gets its own text instead of the hint about filters.
  const emptyTexts = [empty.querySelector('h3').textContent, empty.querySelector('p').textContent];
  function setEmptyText(title) {
    empty.querySelector('h3').textContent = title ?? emptyTexts[0];
    empty.querySelector('p').textContent = title ? 'Откройте другой уровень или «Все уроки».' : emptyTexts[1];
  }

  // The view and the program tab survive a reload; the filters do not.
  function restoreView() {
    try {
      const saved = JSON.parse(window.localStorage.getItem(VIEW_STORAGE_KEY));
      if (saved?.view === 'program' || saved?.view === 'all') state.view = saved.view;
      if (levelChips.some(chip => chip.dataset.value === saved?.tab)) state.tab = saved.tab;
    } catch (_error) {
      // Storage is off or holds a broken value: the page opens with the defaults.
    }
  }

  function saveView() {
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ view: state.view, tab: state.tab }));
    } catch (_error) {
      // The choice still works until the page is reloaded.
    }
  }

  function markControls() {
    document.querySelectorAll('#library-views [data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === state.view)));
    const level = state.view === 'program' ? state.tab : state.level;
    levelChips.forEach(chip => chip.classList.toggle('chip--active', chip.dataset.value === level));
  }

  function rankForClass() {
    const { item, history } = chosenClass;
    const { nextPoint, items } = window.ClassPlan.rank({ lessons: libraryLessons, grammar: program.grammar, profile: item, history });
    return {
      profileKnown: Boolean(item.level && item.age),
      nextPoint,
      lessons: items.map(entry => entry.lesson),
      // Grammar points the class has had a held session on, whichever lesson taught them.
      heldPoints: new Set(history.filter(session => session.held && session.grammar_point).map(session => session.grammar_point)),
      marks: new Map(items.filter(entry => entry.state).map(entry => [entry.lesson.id, entry])),
    };
  }

  function renderClassHint() {
    classHint.hidden = !chosenClass;
    if (!chosenClass) return;
    const { item } = chosenClass;
    if (!ranking.profileKnown) {
      classHint.innerHTML = 'У класса не указаны уровень и возраст. <a href="/classes">Укажите их</a>, и уроки подберутся по программе.';
      return;
    }
    const next = ranking.nextPoint
      ? `Дальше по программе: <b>${escapeHtml(ranking.nextPoint.title)}</b>.`
      : `На уровне ${escapeHtml(item.level)} не осталось уроков на новые темы.`;
    classHint.innerHTML = `Программа для ${escapeHtml(item.level)} · ${escapeHtml(item.age_label)}. ${next}`;
  }

  function render() {
    const isProgram = state.view === 'program';
    ranking = chosenClass ? rankForClass() : null;
    renderClassHint();
    markControls();
    programList.hidden = !isProgram;
    if (!isProgram) { setEmptyText(null); resetList(); return; }
    grid.hidden = true;
    showMore.hidden = true;
    renderProgram();
  }

  document.getElementById('library-views').addEventListener('click', event => {
    const button = event.target.closest('[data-view]');
    if (!button || button.dataset.view === state.view) return;
    state.view = button.dataset.view;
    saveView();
    render();
  });

  document.getElementById('filters').addEventListener('click', event => {
    const button = event.target.closest('.chip');
    if (!button) return;
    const group = button.closest('[data-filter]');
    const filter = group.dataset.filter;
    if (filter === 'level' && state.view === 'program') {
      state.tab = button.dataset.value;
      saveView();
      render();
      return;
    }
    const isActive = button.classList.contains('chip--active');
    group.querySelectorAll('.chip').forEach(chip => chip.classList.remove('chip--active'));
    if (isActive) {
      state[filter] = 'all';
    } else {
      button.classList.add('chip--active');
      state[filter] = button.dataset.value;
    }
    render();
  });
  document.getElementById('lesson-search').addEventListener('input', event => {
    state.query = event.target.value.trim();
    render();
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

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Запрос не выполнен.');
    return payload;
  }

  // Only teachers have classes; without any the picker stays hidden.
  async function loadClasses() {
    try {
      classes = (await fetchJson('/api/classes')).classes;
    } catch (_error) {
      classes = [];
    }
    const label = item => (item.level && item.age ? `${item.name} · ${item.level} · ${item.age_label}` : item.name);
    classSelect.replaceChildren(new Option('Не выбран', ''), ...classes.map(item => new Option(label(item), item.id)));
    classSelect.value = chosenClass?.item.id ?? '';
    classPicker.hidden = classes.length === 0;
  }

  // The class lives in ?class=, so the «Классы» page can link to its program and a reload keeps it.
  function writeClassToUrl(id) {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('class', id);
    else url.searchParams.delete('class');
    window.history.replaceState(null, '', url);
  }

  // reveal: the teacher picked the class, so the program opens on its level and shows the next point.
  async function chooseClass(id, { reveal = false } = {}) {
    const request = ++classRequest;
    const item = classes.find(entry => entry.id === id) ?? null;
    classSelect.value = item?.id ?? '';
    writeClassToUrl(item?.id);
    let history = null;
    if (item) {
      try {
        history = (await fetchJson(`/api/classes/${encodeURIComponent(item.id)}/sessions`)).sessions;
      } catch (_error) {
        if (request === classRequest) { showToast('Не удалось загрузить занятия класса.'); chooseClass(null); }
        return;
      }
    }
    if (request !== classRequest) return;
    chosenClass = item && { item, history };
    if (reveal && item?.level && item.age) state.tab = item.level;
    render();
    if (reveal) programList.querySelector('.program-row--next')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // A new session may add a class or plan a lesson for the chosen one.
  async function refreshClasses() {
    await loadClasses();
    await chooseClass(chosenClass?.item.id ?? null);
  }

  classSelect.addEventListener('change', () => chooseClass(classSelect.value || null, { reveal: true }));

  async function loadLibrary() {
    document.getElementById('library-loading').hidden = false;
    document.getElementById('library-error').hidden = true;
    empty.hidden = true;
    grid.hidden = true;
    programList.hidden = true;
    showMore.hidden = true;
    try {
      const [payload, programData] = await Promise.all([fetchJson('/api/library'), window.LessonPublication.loadProgram(), loadClasses()]);
      if (!Array.isArray(payload.lessons)) throw new Error('Не удалось загрузить библиотеку.');
      libraryLessons = payload.lessons;
      program = programData;
      grammarPoints = new Map(program.grammar.map(point => [point.key, point]));
      // The program view opens on the first level that has lessons.
      state.tab ??= levelChips.map(chip => chip.dataset.value).find(level => libraryLessons.some(lesson => programLevel(lesson) === level)) ?? levelChips[0].dataset.value;
      const classId = new URLSearchParams(window.location.search).get('class');
      if (classId) await chooseClass(classId, { reveal: true });
      else render();
    } catch (_error) {
      document.getElementById('library-error').hidden = false;
    } finally {
      document.getElementById('library-loading').hidden = true;
    }
  }
  document.getElementById('library-retry').addEventListener('click', loadLibrary);
  restoreView();
  markControls();
  loadLibrary();
})();
