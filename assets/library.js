(() => {
  'use strict';

  // Временный контракт данных. Позже массив можно заменить результатом GET /api/library.
  const libraryLessonsMock = [
    { id: 'superhero', title: 'My Superhero', age: '9-11', level: 'A1', category: 'General English', description: 'Говорим о героях и развиваем словарный запас.', skills: ['Vocabulary', 'Speaking'], duration: '30–45 мин', cover: '/assets/images/lesson-superhero.png', badge: 'NEW' },
    { id: 'animals', title: 'Animals and Their Superpowers', age: '9-11', level: 'A1', category: 'General English', description: 'Изучаем животных и их суперсилы.', skills: ['Vocabulary', 'Listening'], duration: '30–45 мин', cover: '/assets/images/lesson-animals.png' },
    { id: 'weekend', title: 'My Perfect Weekend', age: '12-14', level: 'A2', category: 'Speaking', description: 'Рассказываем о выходных и любимых занятиях.', skills: ['Speaking', 'Writing'], duration: '30–45 мин', cover: '/assets/images/lesson-weekend.png' },
    { id: 'music', title: 'Music and Mood', age: '12-14', level: 'A2', category: 'Speaking', description: 'Музыка, эмоции и выражение своего мнения.', skills: ['Listening', 'Speaking'], duration: '30–45 мин', cover: '/assets/images/lesson-music.png', badge: 'Популярное' },
    { id: 'travel', title: 'Travel & Transport', age: '12-14', level: 'A2', category: 'General English', description: 'Транспорт, путешествия и полезные фразы.', skills: ['Vocabulary', 'Speaking'], duration: '30–45 мин', cover: '/assets/images/lesson-travel.png' },
    { id: 'careers', title: 'Future Careers', age: '15-18', level: 'B1', category: 'Speaking', description: 'Профессии будущего и планы на жизнь.', skills: ['Vocabulary', 'Speaking'], duration: '45 мин', cover: '/assets/images/lesson-careers.png', badge: 'NEW' },
    { id: 'tech', title: 'Working in Tech', age: '15-18', level: 'B1', category: 'Grammar', description: 'Работа в IT: навыки, команды и проекты.', skills: ['Listening', 'Speaking'], duration: '45 мин', cover: '/assets/images/lesson-work-tech.png' },
    { id: 'global', title: 'Global Issues', age: '15-18', level: 'B2', category: 'ОГЭ / ЕГЭ', description: 'Обсуждаем важные мировые проблемы.', skills: ['Listening', 'Speaking'], duration: '45 мин', cover: '/assets/images/lesson-global.png', badge: 'NEW' },
    { id: 'communication', title: 'Everyday Communication', age: '12-14', level: 'B1', category: 'General English', description: 'Учимся уверенно общаться каждый день.', skills: ['Speaking', 'Grammar'], duration: '30–45 мин', cover: '/assets/images/lesson-communication.png' },
    { id: 'discussion', title: 'Discussion Club', age: '15-18', level: 'B2', category: 'ОГЭ / ЕГЭ', description: 'Аргументируем мнение и ведём дискуссию.', skills: ['Speaking', 'Listening'], duration: '45 мин', cover: '/assets/images/lesson-discussion.png' },
  ];

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

  function skillLabel(skill) {
    const icon = skillIcons[skill] || skillIcons.Vocabulary;
    return `<span class="skill-tag">${icon}${skill}</span>`;
  }

  function lessonCard(lesson) {
    const article = document.createElement('article');
    article.className = 'lesson-card';
    const badge = lesson.badge ? `<span class="cover-badge ${lesson.badge === 'Популярное' ? 'cover-badge--popular' : ''}">${lesson.badge}</span>` : '';
    article.innerHTML = `
      <div class="lesson-cover"><img src="${lesson.cover}" alt="" loading="lazy" decoding="async" />${badge}</div>
      <div class="lesson-body">
        <h3>${lesson.title}</h3>
        <p class="lesson-facts">${lesson.age.replace('-', '–')} лет <span>•</span> ${lesson.level}</p>
        <p class="lesson-description">${lesson.description}</p>
        <div class="lesson-skills">${lesson.skills.map(skillLabel).join('')}</div>
        <p class="lesson-duration"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.25" stroke="currentColor" stroke-width="1.7"/><path d="M12 8v4.5l2.5 1.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>${lesson.duration}</p>
        <div class="lesson-actions"><button type="button" data-action="preview">Предпросмотр</button><button type="button" data-action="select">Выбрать урок</button></div>
      </div>`;
    article.querySelector('[data-action="preview"]').addEventListener('click', () => showToast(`Предпросмотр: ${lesson.title}`));
    article.querySelector('[data-action="select"]').addEventListener('click', event => {
      document.querySelectorAll('.lesson-card--selected').forEach(card => card.classList.remove('lesson-card--selected'));
      article.classList.add('lesson-card--selected');
      event.currentTarget.textContent = 'Выбрано ✓';
      showToast(`Урок «${lesson.title}» выбран`);
    });
    return article;
  }

  function render() {
    const filtered = libraryLessonsMock.filter(lesson => {
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
    card.querySelector('button').addEventListener('click', () => showToast(`Выбрано: ${item.title}`));
    quickList.append(card);
  });

  render();
})();
