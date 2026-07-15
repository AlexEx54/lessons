(() => {
  'use strict';

  const mockLessons = [
    {
      id: 'travel-and-transport',
      level: 'A2',
      title: 'Путешествия и транспорт',
      description: 'Лексика и разговорные ситуации для поездок и перемещений.',
      lessonCount: 12,
      duration: '30–45 мин.',
      coverSrc: '/assets/images/lesson-travel.png',
      isNew: true,
    },
    {
      id: 'work-and-technology',
      level: 'B1',
      title: 'Работа и технологии',
      description: 'Профессиональная лексика и коммуникация в офисе.',
      lessonCount: 10,
      duration: '30–45 мин.',
      coverSrc: '/assets/images/lesson-work-tech.png',
      isNew: true,
    },
    {
      id: 'everyday-communication',
      level: 'B2',
      title: 'Повседневное общение',
      description: 'Фразы и диалоги на каждый день для уверенного общения.',
      lessonCount: 15,
      duration: '30–45 мин.',
      coverSrc: '/assets/images/lesson-communication.png',
      isNew: true,
    },
    {
      id: 'discussion-and-argumentation',
      level: 'C1',
      title: 'Дискуссии и аргументация',
      description: 'Развитие навыков обсуждения и выражения мнения.',
      lessonCount: 8,
      duration: '30–45 мин.',
      coverSrc: '/assets/images/lesson-discussion.png',
      isNew: true,
    },
  ];

  const lessonTrack = document.getElementById('lesson-track');
  const toast = document.getElementById('toast');
  const menuButton = document.getElementById('menu-button');
  const navOverlay = document.getElementById('nav-overlay');
  const carouselNext = document.getElementById('carousel-next');
  let toastTimer = null;

  function showComingSoon(label) {
    const prefix = label ? `${label}: ` : '';
    toast.textContent = `${prefix}этот раздел скоро появится.`;
    toast.classList.add('toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('toast--visible'), 2800);
  }

  function createBadge(text, className) {
    const badge = document.createElement('span');
    badge.className = `lesson-badge ${className}`;
    badge.textContent = text;
    return badge;
  }

  function createLessonCard(lesson) {
    const card = document.createElement('button');
    card.className = 'lesson-card';
    card.type = 'button';
    card.dataset.lessonId = lesson.id;
    card.setAttribute('aria-label', `${lesson.title}, уровень ${lesson.level}. Открытие скоро появится.`);

    const cover = document.createElement('span');
    cover.className = 'lesson-cover';

    const image = document.createElement('img');
    image.src = lesson.coverSrc;
    image.alt = '';
    image.width = 320;
    image.height = 160;
    image.loading = 'lazy';
    image.decoding = 'async';
    cover.append(createBadge(lesson.level, 'lesson-badge--level'), image);
    if (lesson.isNew) cover.append(createBadge('NEW', 'lesson-badge--new'));

    const body = document.createElement('span');
    body.className = 'lesson-card__body';

    const title = document.createElement('h3');
    title.textContent = lesson.title;

    const description = document.createElement('span');
    description.className = 'lesson-description';
    description.textContent = lesson.description;

    const meta = document.createElement('span');
    meta.className = 'lesson-meta';
    meta.append(
      document.createTextNode(`Уроков: ${lesson.lessonCount}`),
      document.createTextNode(' • '),
      document.createTextNode(lesson.duration),
    );
    const arrow = document.createElement('span');
    arrow.className = 'lesson-meta__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    meta.append(arrow);

    body.append(title, description, meta);
    card.append(cover, body);
    card.addEventListener('click', () => showComingSoon(lesson.title));
    return card;
  }

  function renderLessons(lessons) {
    const fragment = document.createDocumentFragment();
    lessons.forEach(lesson => fragment.append(createLessonCard(lesson)));
    lessonTrack.replaceChildren(fragment);
  }

  function closeNavigation() {
    document.body.classList.remove('nav-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Открыть меню');
  }

  function toggleNavigation() {
    const isOpen = document.body.classList.toggle('nav-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.setAttribute('aria-label', isOpen ? 'Закрыть меню' : 'Открыть меню');
  }

  document.querySelectorAll('[data-coming-soon]').forEach(button => {
    button.addEventListener('click', () => {
      closeNavigation();
      showComingSoon(button.dataset.comingSoon);
    });
  });

  menuButton.addEventListener('click', toggleNavigation);
  navOverlay.addEventListener('click', closeNavigation);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeNavigation();
  });

  carouselNext.addEventListener('click', () => {
    const firstCard = lessonTrack.querySelector('.lesson-card');
    const amount = firstCard ? firstCard.getBoundingClientRect().width + 18 : 260;
    const atEnd = Math.ceil(lessonTrack.scrollLeft + lessonTrack.clientWidth) >= lessonTrack.scrollWidth;
    lessonTrack.scrollBy({ left: atEnd ? -lessonTrack.scrollWidth : amount, behavior: 'smooth' });
  });

  renderLessons(mockLessons);
})();
