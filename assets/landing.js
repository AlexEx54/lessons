(() => {
  'use strict';

  const body = document.body;
  const menuToggle = document.getElementById('menu-toggle');
  const toast = document.getElementById('landing-toast');
  const authModal = document.getElementById('auth-modal');
  const authDialog = authModal?.querySelector('.auth-modal__dialog');
  const authTabs = [...(authModal?.querySelectorAll('[data-auth-tab]') || [])];
  const authPanels = {
    login: document.getElementById('auth-login-panel'),
    register: document.getElementById('auth-register-panel'),
  };
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  let authReturnFocus = null;
  let toastTimer = null;

  const showcasePages = [
    [
      { title: 'Future Careers', age: '15–18 лет', level: 'B1', duration: '50–60 мин', description: 'Обсуждаем профессии будущего и навыки, которые важны завтра.', image: '/assets/images/lesson-careers.png', skills: ['Vocabulary', 'Speaking'] },
      { title: 'My Superhero', age: '9–11 лет', level: 'A1', duration: '50–60 мин', description: 'Говорим о героях и развиваем словарный запас.', image: '/assets/images/lesson-superhero.png', skills: ['Vocabulary', 'Grammar', 'Speaking'] },
      { title: 'Travel & Transport', age: '12–14 лет', level: 'A2', duration: '50–60 мин', description: 'Транспорт, путешествия и полезные фразы.', image: '/assets/images/lesson-travel.png', skills: ['Vocabulary', 'Speaking'] },
    ],
    [
      { title: 'Animals and Their Superpowers', age: '9–11 лет', level: 'A1', duration: '50–60 мин', description: 'Изучаем животных и их удивительные способности.', image: '/assets/images/lesson-animals.png', skills: ['Vocabulary', 'Listening'] },
      { title: 'My Perfect Weekend', age: '12–14 лет', level: 'A2', duration: '50–60 мин', description: 'Рассказываем о выходных и любимых занятиях.', image: '/assets/images/lesson-weekend.png', skills: ['Speaking', 'Writing'] },
      { title: 'Music and Mood', age: '12–14 лет', level: 'A2', duration: '50–60 мин', description: 'Музыка, эмоции и выражение своего мнения.', image: '/assets/images/lesson-music.png', skills: ['Listening', 'Speaking'] },
    ],
    [
      { title: 'Working in Tech', age: '15–18 лет', level: 'B1', duration: '50–60 мин', description: 'Работа в IT: навыки, команды и современные проекты.', image: '/assets/images/lesson-work-tech.png', skills: ['Listening', 'Speaking'] },
      { title: 'Global Issues', age: '15–18 лет', level: 'B2', duration: '50–60 мин', description: 'Обсуждаем важные мировые проблемы на английском.', image: '/assets/images/lesson-global.png', skills: ['Listening', 'Speaking'] },
      { title: 'Everyday Communication', age: '12–14 лет', level: 'B1', duration: '50–60 мин', description: 'Учимся уверенно общаться каждый день.', image: '/assets/images/lesson-communication.png', skills: ['Speaking', 'Grammar'] },
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

  function setAuthTab(name, moveFocus = false) {
    const activeName = name === 'register' ? 'register' : 'login';
    authTabs.forEach(tab => {
      const active = tab.dataset.authTab === activeName;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && moveFocus) tab.focus();
    });
    Object.entries(authPanels).forEach(([panelName, panel]) => {
      if (panel) panel.hidden = panelName !== activeName;
    });
  }

  function openAuth(name) {
    if (!authModal) return;
    authReturnFocus = document.activeElement;
    setAuthTab(name);
    authModal.hidden = false;
    body.classList.add('auth-modal-open');
    window.requestAnimationFrame(() => {
      authModal.classList.add('auth-modal--visible');
      authPanels[name]?.querySelector('[data-auth-initial]')?.focus();
    });
  }

  function closeAuth() {
    if (!authModal || authModal.hidden) return;
    authModal.classList.remove('auth-modal--visible');
    body.classList.remove('auth-modal-open');
    window.setTimeout(() => { authModal.hidden = true; }, 180);
    authReturnFocus?.focus();
  }

  function clearAuthError(form) {
    const errorBox = form.querySelector('.auth-form__error');
    if (errorBox) errorBox.textContent = '';
    form.querySelectorAll('[aria-invalid="true"]').forEach(input => input.removeAttribute('aria-invalid'));
  }

  function showAuthError(form, message, input) {
    const errorBox = form.querySelector('.auth-form__error');
    if (errorBox) errorBox.textContent = message;
    if (input) {
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  }

  function loginRequest(form) {
    const emailInput = form.elements['login-email'];
    const passwordInput = form.elements['login-password'];
    const email = emailInput.value.trim();

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return { error: 'Укажите корректный email.', input: emailInput };
    }
    if (!passwordInput.value) {
      return { error: 'Введите пароль.', input: passwordInput };
    }
    return {
      endpoint: '/api/auth/login',
      body: { email, password: passwordInput.value },
      pendingLabel: 'Входим…',
    };
  }

  function registrationRequest(form) {
    const nameInput = form.elements['register-name'];
    const emailInput = form.elements['register-email'];
    const passwordInput = form.elements['register-password'];
    const termsInput = form.elements.terms;
    const displayName = nameInput.value.trim();
    const email = emailInput.value.trim();

    if (!displayName || displayName.length > 80) {
      return { error: 'Имя должно содержать от 1 до 80 символов.', input: nameInput };
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
      return { error: 'Укажите корректный email.', input: emailInput };
    }
    if (passwordInput.value.length < 10 || passwordInput.value.length > 256) {
      return { error: 'Пароль должен содержать от 10 до 256 символов.', input: passwordInput };
    }
    if (!termsInput.checked) {
      return { error: 'Необходимо принять условия регистрации.', input: termsInput };
    }
    return {
      endpoint: '/api/auth/register',
      body: { displayName, email, password: passwordInput.value, termsAccepted: true },
      pendingLabel: 'Создаём аккаунт…',
      emailInput,
    };
  }

  async function submitAuthForm(form) {
    if (form.dataset.submitting === 'true') return;
    clearAuthError(form);

    const request = form.dataset.authForm === 'register'
      ? registrationRequest(form)
      : loginRequest(form);
    if (request.error) {
      showAuthError(form, request.error, request.input);
      return;
    }

    const submitButton = form.querySelector('.auth-form__submit');
    const idleLabel = submitButton.textContent;
    form.dataset.submitting = 'true';
    submitButton.disabled = true;
    submitButton.textContent = request.pendingLabel;
    let completed = false;

    try {
      const response = await fetch(request.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(request.body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || 'Не удалось выполнить запрос.');
        error.input = response.status === 409 ? request.emailInput : null;
        throw error;
      }
      completed = true;
      window.location.assign('/app');
    } catch (error) {
      showAuthError(form, error.message || 'Не удалось выполнить запрос.', error.input);
    } finally {
      if (!completed) {
        delete form.dataset.submitting;
        submitButton.disabled = false;
        submitButton.textContent = idleLabel;
      }
    }
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

  document.querySelectorAll('[data-auth-open]').forEach(button => {
    button.addEventListener('click', () => {
      setMenu(false);
      openAuth(button.dataset.authOpen);
    });
  });

  authTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setAuthTab(tab.dataset.authTab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const direction = event.key === 'ArrowRight' ? 1 : -1;
      const nextTab = authTabs[(index + direction + authTabs.length) % authTabs.length];
      setAuthTab(nextTab.dataset.authTab, true);
    });
  });

  authModal?.querySelectorAll('[data-auth-close]').forEach(button => {
    button.addEventListener('click', closeAuth);
  });

  authModal?.querySelectorAll('[data-auth-form]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      submitAuthForm(form);
    });
    form.addEventListener('input', event => {
      event.target.removeAttribute('aria-invalid');
      const errorBox = form.querySelector('.auth-form__error');
      if (errorBox) errorBox.textContent = '';
    });
  });

  authModal?.querySelectorAll('.auth-form__password-toggle').forEach(button => {
    button.addEventListener('click', () => {
      const input = button.closest('.auth-form__control').querySelector('input');
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.setAttribute('aria-pressed', String(reveal));
      button.setAttribute('aria-label', reveal ? 'Скрыть пароль' : 'Показать пароль');
    });
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!authModal?.hidden) closeAuth();
      else setMenu(false);
    }

    if (event.key === 'Tab' && !authModal?.hidden) {
      const focusable = [...authDialog.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden])')]
        .filter(element => element.offsetParent !== null);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
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
