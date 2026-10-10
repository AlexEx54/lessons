(() => {
  'use strict';

  const lessonTrack = document.getElementById('lesson-track');
  const carouselNext = document.getElementById('carousel-next');
  const libraryState = document.getElementById('library-state');
  const libraryStatus = document.getElementById('library-status');
  const libraryRetry = document.getElementById('library-retry');
  const createClassButton = document.getElementById('create-class-button');

  function createBadge(text, className) {
    const badge = document.createElement('span');
    badge.className = `lesson-badge ${className}`;
    badge.textContent = text;
    return badge;
  }

  function createLessonCard(lesson) {
    const card = document.createElement('a');
    card.className = 'lesson-card';
    card.href = `/library/${encodeURIComponent(lesson.id)}`;
    card.dataset.lessonId = lesson.id;
    card.setAttribute('aria-label', `${lesson.title}, уровень ${lesson.level}. Открыть урок.`);

    const cover = document.createElement('span');
    cover.className = 'lesson-cover';

    const image = document.createElement('img');
    image.src = lesson.cover;
    image.alt = '';
    image.width = 320;
    image.height = 160;
    image.loading = 'lazy';
    image.decoding = 'async';
    cover.append(createBadge(lesson.level, 'lesson-badge--level'), image);
    if (lesson.badge === 'new') cover.append(createBadge('NEW', 'lesson-badge--new'));

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
      document.createTextNode(lesson.category),
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
    return card;
  }

  function renderLessons(lessons) {
    if (!lessons.length) return showLibraryState('Новых уроков пока нет');
    const fragment = document.createDocumentFragment();
    lessons.forEach(lesson => fragment.append(createLessonCard(lesson)));
    lessonTrack.replaceChildren(fragment);
    libraryState.hidden = true;
    lessonTrack.hidden = false;
    updateCarousel();
  }

  function updateCarousel() {
    carouselNext.hidden = lessonTrack.hidden || lessonTrack.scrollWidth <= lessonTrack.clientWidth + 1;
  }

  function showLibraryState(message, retry = false) {
    lessonTrack.hidden = true;
    carouselNext.hidden = true;
    libraryState.hidden = false;
    libraryStatus.textContent = message;
    libraryRetry.hidden = !retry;
  }

  function loadHomeContent() {
    showLibraryState('Загружаем новые уроки…');
    fetch('/api/home-content', { headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error('Cannot load home content');
        return response.json();
      })
      .then(content => {
        if (content.hasClasses) updateHomeState();
        renderLessons(content.libraryLessons);
      })
      .catch(() => showLibraryState('Не удалось загрузить новые уроки.', true));
  }

  function updateHomeState() {
    createClassButton.lastChild.textContent = ' Запланировать занятие';
    const subtitle = document.querySelector('.welcome-row p');
    if (subtitle) subtitle.textContent = 'Готовьте новые уроки и открывайте назначенные занятия в расписании.';
  }

  createClassButton.addEventListener('click', () => window.ClassModal.open({ onCreated: updateHomeState }));
  libraryRetry.addEventListener('click', loadHomeContent);
  new ResizeObserver(updateCarousel).observe(lessonTrack);

  carouselNext.addEventListener('click', () => {
    const firstCard = lessonTrack.querySelector('.lesson-card');
    const gap = parseFloat(getComputedStyle(lessonTrack).columnGap) || 0;
    const amount = firstCard ? firstCard.getBoundingClientRect().width + gap : 260;
    const atEnd = Math.ceil(lessonTrack.scrollLeft + lessonTrack.clientWidth) >= lessonTrack.scrollWidth;
    lessonTrack.scrollBy({ left: atEnd ? -lessonTrack.scrollWidth : amount, behavior: 'smooth' });
  });

  loadHomeContent();
})();
