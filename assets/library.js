(() => {
  'use strict';

  let libraryLessons = [];

  const quickLessonsMock = [
    { title: 'Тест на определение уровня', text: 'Идеальный старт для нового ученика', image: '/assets/images/recommendation-placement.png' },
    { title: 'General English — первый урок', text: 'Starter · A1 · A2 · B1', image: '/assets/images/recommendation-general-english.png' },
    { title: 'Travel & Transport', text: 'Готовый урок на любимую тему', image: '/assets/images/recommendation-travel.png', popular: true },
  ];

  const skillIcons = {
    Vocabulary: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" stroke="currentColor" stroke-width="1.7"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5V5.5Z" stroke="currentColor" stroke-width="1.7"/></svg>',
    Speaking: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7.5h8a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H9l-3.5 3v-3H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M18 9.5c.9.6 1.5 1.6 1.5 2.7s-.6 2.1-1.5 2.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    Listening: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4 13v3.5A2.5 2.5 0 0 0 6.5 19H8v-6H4zM20 13v3.5A2.5 2.5 0 0 1 17.5 19H16v-6h4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    Writing: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m13 7 4 4" stroke="currentColor" stroke-width="1.7"/></svg>',
    Grammar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4h10M7 9h10M7 14h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M5 20h14a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1Z" stroke="currentColor" stroke-width="1.7"/></svg>',
  };

  const state = { age: 'all', level: 'all', category: 'all', query: '', expanded: false };
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

  function lessonCard(source) {
    const lesson = Object.fromEntries(Object.entries(source).map(([key, value]) => [key, typeof value === 'string' ? escapeHtml(value) : value]));
    const article = document.createElement('article');
    article.className = 'lesson-card';
    const badge = lesson.badge ? `<span class="cover-badge ${lesson.badge === 'Популярное' ? 'cover-badge--popular' : ''}">${lesson.badge}</span>` : '';
    article.innerHTML = `
      <div class="lesson-cover"><img src="${lesson.cover}" alt="" loading="lazy" decoding="async" />${badge}</div>
      <div class="lesson-body">
        <h3>${lesson.title}</h3>
        <p class="lesson-facts">${lesson.age.replace('-', '–')} лет <span>•</span> ${lesson.level}</p>
        <p class="lesson-description">${lesson.description}</p>
        <div class="lesson-skills">${source.skills.map(skillLabel).join('')}</div>
        <p class="lesson-duration"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v4.5l2.5 1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>${lesson.duration}</p>
        <div class="lesson-actions"><button type="button" data-action="preview">Предпросмотр</button><button type="button" data-action="select">Выбрать урок</button></div>
      </div>`;
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
    if (source.can_unpublish) {
      const unpublish = document.createElement('button');
      unpublish.type = 'button';
      unpublish.className = 'library-unpublish';
      unpublish.textContent = 'Снять с публикации';
      unpublish.addEventListener('click', async () => {
        unpublish.disabled = true;
        try {
          const response = await fetch(`/api/library/${encodeURIComponent(source.id)}/publication`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expectedRevision: source.revision }),
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || 'Не удалось скрыть урок.');
          libraryLessons = libraryLessons.filter(lesson => lesson.id !== source.id);
          render();
          showToast('Урок снят с публикации.');
        } catch (error) { unpublish.disabled = false; showToast(error.message); }
      });
      article.querySelector('.lesson-body').append(unpublish);
    }
    return article;
  }

  function render() {
    const filtered = libraryLessons.filter(lesson => {
      const query = state.query.toLocaleLowerCase('ru-RU');
      return (state.age === 'all' || lesson.age === state.age)
        && (state.level === 'all' || lesson.level === state.level)
        && (state.category === 'all' || lesson.category === state.category)
        && (!query || `${lesson.title} ${lesson.description} ${lesson.skills.join(' ')}`.toLocaleLowerCase('ru-RU').includes(query));
    });
    const visible = state.expanded ? filtered : filtered.slice(0, 8);
    grid.replaceChildren(...visible.map(lessonCard));
    empty.hidden = filtered.length > 0;
    grid.hidden = filtered.length === 0;
    showMore.hidden = filtered.length <= 8;
    showMore.innerHTML = state.expanded ? 'Свернуть <span aria-hidden="true">↑</span>' : 'Показать ещё <span aria-hidden="true">↓</span>';
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
    state.expanded = false;
    render();
  });
  document.getElementById('lesson-search').addEventListener('input', event => {
    state.query = event.target.value.trim();
    state.expanded = false;
    render();
  });
  showMore.addEventListener('click', () => {
    state.expanded = !state.expanded;
    render();
    if (!state.expanded) document.getElementById('library-title').scrollIntoView({ behavior: 'smooth' });
  });

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
      render();
    } catch (_error) {
      document.getElementById('library-error').hidden = false;
    } finally {
      document.getElementById('library-loading').hidden = true;
    }
  }
  document.getElementById('library-retry').addEventListener('click', loadLibrary);
  loadLibrary();
})();
