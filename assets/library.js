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

  const state = { age: 'all', level: 'all', category: 'all', query: '', expanded: false };
  const grid = document.getElementById('lesson-grid');
  const empty = document.getElementById('empty-state');
  const showMore = document.getElementById('show-more');
  const resultCount = document.getElementById('result-count');
  const toast = document.getElementById('toast');
  let toastTimer;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('toast--visible'), 2400);
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
        <div class="lesson-skills">${lesson.skills.map(skill => `<span>◉ ${skill}</span>`).join('')}</div>
        <p class="lesson-duration">◷ ${lesson.duration}</p>
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
    resultCount.textContent = `Найдено уроков: ${filtered.length}`;
    showMore.hidden = filtered.length <= 8;
    showMore.innerHTML = state.expanded ? 'Свернуть <span aria-hidden="true">↑</span>' : 'Показать ещё <span aria-hidden="true">↓</span>';
  }

  document.getElementById('filters').addEventListener('click', event => {
    const button = event.target.closest('.chip');
    if (!button) return;
    const group = button.closest('[data-filter]');
    group.querySelectorAll('.chip').forEach(chip => chip.classList.remove('chip--active'));
    button.classList.add('chip--active');
    state[group.dataset.filter] = button.dataset.value;
    state.expanded = false;
    render();
  });
  document.getElementById('lesson-search').addEventListener('input', event => { state.query = event.target.value.trim(); state.expanded = false; render(); });
  showMore.addEventListener('click', () => { state.expanded = !state.expanded; render(); if (!state.expanded) document.getElementById('library-title').scrollIntoView({ behavior: 'smooth' }); });

  const quickList = document.getElementById('quick-list');
  quickLessonsMock.forEach(item => {
    const card = document.createElement('article');
    card.className = 'quick-card';
    card.innerHTML = `${item.popular ? '<span class="quick-popular">Популярное</span>' : ''}<img src="${item.image}" alt="" /><div><h3>${item.title}</h3><p>${item.text}</p><button type="button">Выбрать <span aria-hidden="true">›</span></button></div>`;
    card.querySelector('button').addEventListener('click', () => showToast(`Выбрано: ${item.title}`));
    quickList.append(card);
  });

  document.querySelectorAll('[data-toast]').forEach(button => button.addEventListener('click', () => showToast(button.dataset.toast)));
  const menuButton = document.getElementById('menu-button');
  function toggleMenu(force) {
    const open = typeof force === 'boolean' ? force : !document.body.classList.contains('nav-open');
    document.body.classList.toggle('nav-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
  }
  menuButton.addEventListener('click', () => toggleMenu());
  document.getElementById('nav-overlay').addEventListener('click', () => toggleMenu(false));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') toggleMenu(false); });
  render();
})();
