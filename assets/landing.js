(() => {
  'use strict';

  const body = document.body;
  const menuToggle = document.getElementById('menu-toggle');
  const toast = document.getElementById('landing-toast');
  let toastTimer = null;

  const showcasePages = [
    [
      { title: 'Future Careers', age: '15–18 лет', level: 'B1', duration: '45 мин', description: 'Обсуждаем профессии будущего и навыки, которые важны завтра.', image: '/assets/images/lesson-careers.png', skills: ['Vocabulary', 'Speaking'] },
      { title: 'My Superhero', age: '9–11 лет', level: 'A1', duration: '30–45 мин', description: 'Говорим о героях и развиваем словарный запас.', image: '/assets/images/lesson-superhero.png', skills: ['Vocabulary', 'Grammar', 'Speaking'] },
      { title: 'Travel & Transport', age: '12–14 лет', level: 'A2', duration: '30–45 мин', description: 'Транспорт, путешествия и полезные фразы.', image: '/assets/images/lesson-travel.png', skills: ['Vocabulary', 'Speaking'] },
    ],
    [
      { title: 'Animals and Their Superpowers', age: '9–11 лет', level: 'A1', duration: '30–45 мин', description: 'Изучаем животных и их удивительные способности.', image: '/assets/images/lesson-animals.png', skills: ['Vocabulary', 'Listening'] },
      { title: 'My Perfect Weekend', age: '12–14 лет', level: 'A2', duration: '30–45 мин', description: 'Рассказываем о выходных и любимых занятиях.', image: '/assets/images/lesson-weekend.png', skills: ['Speaking', 'Writing'] },
      { title: 'Music and Mood', age: '12–14 лет', level: 'A2', duration: '30–45 мин', description: 'Музыка, эмоции и выражение своего мнения.', image: '/assets/images/lesson-music.png', skills: ['Listening', 'Speaking'] },
    ],
    [
      { title: 'Working in Tech', age: '15–18 лет', level: 'B1', duration: '45 мин', description: 'Работа в IT: навыки, команды и современные проекты.', image: '/assets/images/lesson-work-tech.png', skills: ['Listening', 'Speaking'] },
      { title: 'Global Issues', age: '15–18 лет', level: 'B2', duration: '45 мин', description: 'Обсуждаем важные мировые проблемы на английском.', image: '/assets/images/lesson-global.png', skills: ['Listening', 'Speaking'] },
      { title: 'Everyday Communication', age: '12–14 лет', level: 'B1', duration: '30–45 мин', description: 'Учимся уверенно общаться каждый день.', image: '/assets/images/lesson-communication.png', skills: ['Speaking', 'Grammar'] },
    ],
  ];

  const showcaseTrack = document.getElementById('lesson-showcase-track');
  const showcaseDots = document.querySelector('.lesson-showcase__dots');
  const showcasePrevious = document.querySelector('.lesson-showcase__arrow--previous');
  const showcaseNext = document.querySelector('.lesson-showcase__arrow--next');
  const showcaseCarousel = document.querySelector('.lesson-showcase__carousel');
  let showcasePage = 0;
  let showcaseTouchStart = null;

  function skillIcon(skill) {
    if (skill === 'Speaking') return '◯';
    if (skill === 'Grammar') return '≡';
    if (skill === 'Listening') return '♫';
    if (skill === 'Writing') return '✎';
    return '▣';
  }

  function renderShowcase() {
    if (!showcaseTrack) return;

    showcaseTrack.innerHTML = showcasePages.map((page, pageIndex) => `
      <div class="lesson-showcase__page" role="group" aria-roledescription="страница" aria-label="${pageIndex + 1} из ${showcasePages.length}">
        ${page.map(lesson => `
          <a class="showcase-card" href="/library.html" aria-label="Открыть урок ${lesson.title}">
            <div class="showcase-card__cover">
              <img src="${lesson.image}" alt="" width="720" height="405" loading="lazy" decoding="async" />
              <span class="showcase-card__level">${lesson.level}</span>
              <span class="showcase-card__skills" aria-hidden="true">
                ${lesson.skills.map(skill => `<span><b>${skillIcon(skill)}</b>${skill}</span>`).join('')}
              </span>
            </div>
            <div class="showcase-card__body">
              <h3>${lesson.title}</h3>
              <p class="showcase-card__facts">${lesson.age}<i>•</i>${lesson.level}<i>•</i>${lesson.duration}</p>
              <p class="showcase-card__description">${lesson.description}</p>
            </div>
          </a>
        `).join('')}
      </div>
    `).join('');

    showcaseDots.innerHTML = showcasePages.map((_, index) => `
      <button type="button" aria-label="Перейти на страницу ${index + 1}" aria-current="${index === 0 ? 'true' : 'false'}"></button>
    `).join('');

    showcaseDots.querySelectorAll('button').forEach((dot, index) => {
      dot.addEventListener('click', () => setShowcasePage(index));
    });

    updateShowcase();
  }

  function updateShowcase() {
    if (!showcaseTrack) return;
    showcaseTrack.style.transform = `translateX(-${showcasePage * 100}%)`;
    showcaseTrack.querySelectorAll('.lesson-showcase__page').forEach((page, index) => {
      page.setAttribute('aria-hidden', String(index !== showcasePage));
      page.querySelectorAll('a').forEach(link => { link.tabIndex = index === showcasePage ? 0 : -1; });
    });
    showcaseDots.querySelectorAll('button').forEach((dot, index) => {
      dot.setAttribute('aria-current', String(index === showcasePage));
    });
  }

  function setShowcasePage(page) {
    showcasePage = (page + showcasePages.length) % showcasePages.length;
    updateShowcase();
  }

  function setMenu(open) {
    body.classList.toggle('nav-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }

  function showToast(label) {
    toast.textContent = `${label}: раздел скоро появится.`;
    toast.classList.add('landing-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('landing-toast--visible'), 2400);
  }

  menuToggle.addEventListener('click', () => setMenu(!body.classList.contains('nav-open')));

  document.querySelectorAll('[data-soon]').forEach(button => {
    button.addEventListener('click', () => {
      setMenu(false);
      showToast(button.dataset.soon);
    });
  });

  document.querySelectorAll('.landing-nav a, .landing-actions a').forEach(link => {
    link.addEventListener('click', () => setMenu(false));
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMenu(false);
  });

  window.matchMedia('(min-width: 861px)').addEventListener('change', event => {
    if (event.matches) setMenu(false);
  });

  renderShowcase();

  showcasePrevious?.addEventListener('click', () => setShowcasePage(showcasePage - 1));
  showcaseNext?.addEventListener('click', () => setShowcasePage(showcasePage + 1));

  showcaseCarousel?.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft') setShowcasePage(showcasePage - 1);
    if (event.key === 'ArrowRight') setShowcasePage(showcasePage + 1);
  });

  showcaseCarousel?.addEventListener('touchstart', event => {
    showcaseTouchStart = event.changedTouches[0].clientX;
  }, { passive: true });

  showcaseCarousel?.addEventListener('touchend', event => {
    if (showcaseTouchStart === null) return;
    const distance = event.changedTouches[0].clientX - showcaseTouchStart;
    if (Math.abs(distance) > 50) setShowcasePage(showcasePage + (distance < 0 ? 1 : -1));
    showcaseTouchStart = null;
  }, { passive: true });
})();
