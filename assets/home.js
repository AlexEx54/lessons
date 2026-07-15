(() => {
  'use strict';

  const fallbackLibraryLessons = [
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

  const fallbackRecommendations = [
    {
      id: 'placement-test',
      level: 'A1–B2',
      title: 'Тест на определение уровня',
      subtitle: 'Placement Test',
      description: 'Идеальный старт для нового ученика',
      coverSrc: '/assets/images/recommendation-placement.png',
    },
    {
      id: 'general-english-b1',
      level: 'B1',
      title: 'General English B1',
      subtitle: 'Первый урок',
      coverSrc: '/assets/images/recommendation-general-english.png',
    },
    {
      id: 'travel-and-transport-b1',
      level: 'B1–B2',
      title: 'Travel & Transport',
      popular: true,
      coverSrc: '/assets/images/recommendation-travel.png',
    },
    {
      id: 'english-for-it',
      level: 'B2',
      title: 'English for IT',
      subtitle: 'Английский для IT-специалистов',
      coverSrc: '/assets/images/recommendation-it.png',
    },
  ];

  const lessonTrack = document.getElementById('lesson-track');
  const toast = document.getElementById('toast');
  const menuButton = document.getElementById('menu-button');
  const navOverlay = document.getElementById('nav-overlay');
  const carouselNext = document.getElementById('carousel-next');
  const createClassButton = document.getElementById('create-class-button');
  const classModal = document.getElementById('class-modal');
  const classDialog = classModal.querySelector('.class-dialog');
  const classNameInput = document.getElementById('class-name-input');
  const classLinkValue = document.getElementById('class-link-value');
  const classNextButton = document.getElementById('class-next-button');
  const classBackButton = document.getElementById('class-back-button');
  const attachLessonButton = document.getElementById('attach-lesson-button');
  const classProgress = document.getElementById('class-progress');
  const recommendationTrack = document.getElementById('recommendation-track');
  const recommendationStatus = document.getElementById('recommendation-status');
  let toastTimer = null;
  let modalReturnFocus = null;
  let recommendationLessons = [];
  let selectedRecommendationId = null;
  let homeContentPromise = null;

  // Заглушка генератора: позже здесь появится запрос к API и проверка уникальности.
  function generateClassInviteLinkMock(className) {
    const transliterationMap = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
      й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
      у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
      ь: '', э: 'e', ю: 'yu', я: 'ya',
    };
    const slug = className
      .trim()
      .toLocaleLowerCase('ru-RU')
      .split('')
      .map(character => transliterationMap[character] ?? character)
      .join('')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);

    return `easyclass.ru/join/${slug || 'new-class'}`;
  }

  function updateClassLink() {
    classLinkValue.textContent = generateClassInviteLinkMock(classNameInput.value);
  }

  function openClassModal() {
    modalReturnFocus = document.activeElement;
    closeNavigation();
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.setProperty('--scrollbar-compensation', `${scrollbarWidth}px`);
    classModal.classList.add('class-modal--visible');
    classModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    updateClassLink();
    setClassStep(1);
    window.requestAnimationFrame(() => {
      classNameInput.focus();
      classNameInput.select();
    });
  }

  function setClassStep(stepNumber) {
    classDialog.querySelectorAll('[data-class-step]').forEach(step => {
      const isActive = Number(step.dataset.classStep) === stepNumber;
      step.hidden = !isActive;
      step.classList.toggle('class-step--active', isActive);
    });
    classProgress.querySelectorAll('.class-progress__step').forEach((step, index) => {
      const isActive = index + 1 === stepNumber;
      step.classList.toggle('class-progress__step--active', isActive);
      if (isActive) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
    });
    classProgress.setAttribute('aria-label', `Шаг ${stepNumber} из 3`);
    classDialog.setAttribute('aria-labelledby', stepNumber === 1 ? 'class-dialog-title' : 'lesson-picker-title');
    if (stepNumber === 1) classDialog.setAttribute('aria-describedby', 'class-dialog-description');
    else classDialog.removeAttribute('aria-describedby');
  }

  function closeClassModal() {
    if (!classModal.classList.contains('class-modal--visible')) return;
    classModal.classList.remove('class-modal--visible');
    classModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('--scrollbar-compensation');
    if (modalReturnFocus instanceof HTMLElement) modalReturnFocus.focus();
  }

  function keepFocusInsideModal(event) {
    if (event.key !== 'Tab' || !classModal.classList.contains('class-modal--visible')) return;
    const focusable = [...classDialog.querySelectorAll('button:not([disabled]), input:not([disabled])')];
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

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('toast--visible'), 2800);
  }

  function showComingSoon(label) {
    const prefix = label ? `${label}: ` : '';
    showToast(`${prefix}этот раздел скоро появится.`);
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

  function createRecommendationCard(lesson) {
    const card = document.createElement('button');
    card.className = 'recommendation-card';
    card.type = 'button';
    card.dataset.lessonId = lesson.id;
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(lesson.id === selectedRecommendationId));
    card.setAttribute('aria-label', `${lesson.title}, уровень ${lesson.level}`);

    const cover = document.createElement('span');
    cover.className = 'recommendation-card__cover';
    const image = document.createElement('img');
    image.src = lesson.coverSrc;
    image.alt = '';
    image.width = 480;
    image.height = 270;
    image.loading = 'lazy';
    image.decoding = 'async';
    const level = document.createElement('span');
    level.className = 'recommendation-card__level';
    level.textContent = lesson.level;
    const check = document.createElement('span');
    check.className = 'recommendation-card__check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '✓';
    cover.append(image, level, check);

    const body = document.createElement('span');
    body.className = 'recommendation-card__body';
    const title = document.createElement('h3');
    title.textContent = lesson.title;
    body.append(title);
    if (lesson.subtitle) {
      const subtitle = document.createElement('span');
      subtitle.className = 'recommendation-card__subtitle';
      subtitle.textContent = lesson.subtitle;
      body.append(subtitle);
    }
    if (lesson.description) {
      const description = document.createElement('span');
      description.className = 'recommendation-card__description';
      description.textContent = lesson.description;
      body.append(description);
    }
    if (lesson.popular) {
      const popular = document.createElement('span');
      popular.className = 'recommendation-card__popular';
      popular.textContent = '☆ Популярное';
      body.append(popular);
    }
    card.append(cover, body);
    card.addEventListener('click', () => selectRecommendation(lesson.id));
    return card;
  }

  function selectRecommendation(lessonId, shouldFocus = false) {
    selectedRecommendationId = lessonId;
    recommendationTrack.querySelectorAll('.recommendation-card').forEach(card => {
      const isSelected = card.dataset.lessonId === lessonId;
      card.setAttribute('aria-checked', String(isSelected));
      if (isSelected && shouldFocus) card.focus();
    });
    attachLessonButton.disabled = !selectedRecommendationId;
  }

  function renderRecommendations(lessons) {
    recommendationLessons = lessons;
    selectedRecommendationId = lessons[0]?.id || null;
    const fragment = document.createDocumentFragment();
    lessons.forEach(lesson => fragment.append(createRecommendationCard(lesson)));
    recommendationTrack.replaceChildren(fragment);
    recommendationStatus.textContent = lessons.length ? '' : 'Пока нет готовых рекомендаций.';
    attachLessonButton.disabled = !selectedRecommendationId;
  }

  function loadHomeContent() {
    if (homeContentPromise) return homeContentPromise;
    homeContentPromise = fetch('/api/home-content', { headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error('Cannot load home content');
        return response.json();
      })
      .catch(() => ({
        libraryLessons: fallbackLibraryLessons,
        onboardingRecommendations: fallbackRecommendations,
      }))
      .then(content => {
        renderLessons(Array.isArray(content.libraryLessons) ? content.libraryLessons : fallbackLibraryLessons);
        renderRecommendations(Array.isArray(content.onboardingRecommendations)
          ? content.onboardingRecommendations
          : fallbackRecommendations);
        return content;
      });
    return homeContentPromise;
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
    if (event.key === 'Escape' && classModal.classList.contains('class-modal--visible')) {
      closeClassModal();
      return;
    }
    if (event.key === 'Escape') closeNavigation();
    keepFocusInsideModal(event);
  });

  createClassButton.addEventListener('click', openClassModal);
  classModal.querySelectorAll('[data-close-class-modal]').forEach(button => {
    button.addEventListener('click', closeClassModal);
  });
  classNameInput.addEventListener('input', updateClassLink);
  classNextButton.addEventListener('click', () => {
    if (!classNameInput.value.trim()) {
      classNameInput.focus();
      showComingSoon('Введите название класса');
      return;
    }
    setClassStep(2);
    loadHomeContent().then(() => {
      recommendationTrack.querySelector('[aria-checked="true"]')?.focus();
    });
  });
  classBackButton.addEventListener('click', () => {
    setClassStep(1);
    classNameInput.focus();
  });
  attachLessonButton.addEventListener('click', () => {
    const lesson = recommendationLessons.find(item => item.id === selectedRecommendationId);
    if (lesson) showToast(`Урок «${lesson.title}» прикреплён. Переход к шагу 3 скоро появится.`);
  });
  recommendationTrack.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const cards = [...recommendationTrack.querySelectorAll('.recommendation-card')];
    const currentIndex = cards.findIndex(card => card.dataset.lessonId === selectedRecommendationId);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + cards.length) % cards.length;
    event.preventDefault();
    selectRecommendation(cards[nextIndex].dataset.lessonId, true);
  });

  carouselNext.addEventListener('click', () => {
    const firstCard = lessonTrack.querySelector('.lesson-card');
    const amount = firstCard ? firstCard.getBoundingClientRect().width + 18 : 260;
    const atEnd = Math.ceil(lessonTrack.scrollLeft + lessonTrack.clientWidth) >= lessonTrack.scrollWidth;
    lessonTrack.scrollBy({ left: atEnd ? -lessonTrack.scrollWidth : amount, behavior: 'smooth' });
  });

  renderLessons(fallbackLibraryLessons);
  loadHomeContent();
})();
