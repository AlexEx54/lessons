(() => {
  'use strict';

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
  const completionLink = document.getElementById('class-completion-link');
  const completionLesson = document.getElementById('class-completion-lesson');
  const copyClassLinkButton = document.getElementById('copy-class-link-button');
  const completionDoneButton = document.getElementById('class-completion-done-button');
  const classTimeInput = document.getElementById('class-time-input');
  const classTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const lessonSearch = document.getElementById('class-lesson-search');
  const classError = document.getElementById('class-error');
  const launchButton = document.getElementById('class-launch-button');
  let modalReturnFocus = null;
  let onCreated = null;
  let recommendationLessons = [];
  let selectedRecommendationId = null;
  let allRecommendations = [];
  let showAllLessons = false;
  let recommendationRequest = 0;
  let loadingRecommendations = false;
  let savingClass = false;
  let createdClass = null;
  let requestKey = null;
  let requestPayload = null;
  document.getElementById('class-time-zone').textContent = `Часовой пояс: ${classTimeZone}`;

  function updateClassLink() {
    classLinkValue.textContent = `${window.location.origin}/join/${window.ClassInvite.slug(classNameInput.value)}-…`;
  }

  // `time` prefills the datetime-local field; `onCreated` receives the class right after it is saved.
  function openClassModal({ time = '', onCreated: createdCallback = null } = {}) {
    if (savingClass) return;
    modalReturnFocus = document.activeElement;
    onCreated = createdCallback;
    window.AppShell.closeNavigation({ restoreFocus: false });
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.setProperty('--scrollbar-compensation', `${scrollbarWidth}px`);
    classModal.classList.add('class-modal--visible');
    classModal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    createdClass = null;
    selectedRecommendationId = null;
    requestKey = null;
    requestPayload = null;
    classError.textContent = '';
    classNameInput.value = classNameInput.defaultValue;
    classTimeInput.value = time;
    lessonSearch.value = '';
    showAllLessons = false;
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
    const stepTitles = {
      1: 'class-dialog-title',
      2: 'lesson-picker-title',
      3: 'class-completion-title',
    };
    classDialog.setAttribute('aria-labelledby', stepTitles[stepNumber]);
    if (stepNumber === 1) classDialog.setAttribute('aria-describedby', 'class-dialog-description');
    else classDialog.removeAttribute('aria-describedby');
  }

  function closeClassModal() {
    if (savingClass || !classModal.classList.contains('class-modal--visible')) return;
    classModal.classList.remove('class-modal--visible');
    classModal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('--scrollbar-compensation');
    if (modalReturnFocus instanceof HTMLElement) modalReturnFocus.focus();
  }

  function keepFocusInsideModal(event) {
    if (event.key !== 'Tab' || !classModal.classList.contains('class-modal--visible')) return;
    if (savingClass) { event.preventDefault(); return; }
    const focusable = [...classDialog.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href]')].filter(element => element.getClientRects().length);
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

  async function copyClassInviteLink() {
    const link = completionLink.textContent.trim();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const temporaryInput = document.createElement('textarea');
      temporaryInput.value = link;
      temporaryInput.style.position = 'fixed';
      temporaryInput.style.opacity = '0';
      document.body.append(temporaryInput);
      temporaryInput.select();
      document.execCommand('copy');
      temporaryInput.remove();
    }
    copyClassLinkButton.querySelector('span').textContent = 'Ссылка скопирована';
    window.AppShell.showToast('Ссылка на класс скопирована.');
    window.setTimeout(() => {
      copyClassLinkButton.querySelector('span').textContent = 'Скопировать ссылку';
    }, 2200);
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
    attachLessonButton.disabled = savingClass || loadingRecommendations || !selectedRecommendationId;
  }

  function renderRecommendations(lessons) {
    recommendationLessons = lessons;
    selectedRecommendationId = lessons.some(lesson => lesson.id === selectedRecommendationId) ? selectedRecommendationId : null;
    const fragment = document.createDocumentFragment();
    lessons.forEach(lesson => fragment.append(createRecommendationCard(lesson)));
    recommendationTrack.replaceChildren(fragment);
    recommendationStatus.textContent = lessons.length ? '' : allRecommendations.length ? 'По вашему запросу уроков не найдено.' : 'Пока нет опубликованных уроков, доступных для назначения.';
    attachLessonButton.disabled = savingClass || loadingRecommendations || !selectedRecommendationId;
  }

  function filterRecommendations() {
    if (loadingRecommendations) return;
    const query = lessonSearch.value.trim().toLocaleLowerCase('ru');
    const filtered = allRecommendations.filter(lesson => `${lesson.title} ${lesson.description} ${lesson.level}`.toLocaleLowerCase('ru').includes(query));
    renderRecommendations(showAllLessons || query ? filtered : filtered.slice(0, 4));
    document.getElementById('class-all-lessons').hidden = showAllLessons || Boolean(query) || allRecommendations.length <= 4;
  }

  async function loadRecommendations() {
    const request = ++recommendationRequest;
    loadingRecommendations = true;
    recommendationLessons = [];
    recommendationTrack.replaceChildren();
    document.getElementById('class-all-lessons').hidden = true;
    document.getElementById('class-retry-lessons').hidden = true;
    recommendationStatus.textContent = 'Загружаем рекомендации…';
    attachLessonButton.disabled = true;
    try {
      const response = await fetch('/api/library', { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error();
      const content = await response.json();
      if (request !== recommendationRequest) return;
      loadingRecommendations = false;
      allRecommendations = content.lessons.filter(lesson => lesson.is_published && lesson.is_available).map(lesson => ({ ...lesson, coverSrc: lesson.cover }));
      filterRecommendations();
    } catch {
      if (request !== recommendationRequest) return;
      loadingRecommendations = false;
      allRecommendations = [];
      renderRecommendations([]);
      recommendationStatus.textContent = 'Не удалось загрузить уроки. Попробуйте ещё раз.';
      document.getElementById('class-retry-lessons').hidden = false;
      return;
    }
    document.getElementById('class-retry-lessons').hidden = true;
  }

  function setSaving(value) {
    savingClass = value;
    classDialog.setAttribute('aria-busy', String(value));
    classDialog.querySelectorAll('button, input').forEach(element => { element.disabled = value; });
    attachLessonButton.disabled = value || !selectedRecommendationId;
    attachLessonButton.querySelector('span').textContent = value ? '…' : '→';
  }

  async function saveClass() {
    if (savingClass) return;
    const lesson = recommendationLessons.find(item => item.id === selectedRecommendationId);
    if (!lesson) return;
    classError.textContent = '';
    if (!classTimeInput.checkValidity()) { classTimeInput.reportValidity(); return; }
    const time = new Date(classTimeInput.value);
    if (!(time.getTime() > Date.now())) {
      classError.textContent = 'Выберите время в будущем.';
      classTimeInput.focus();
      return;
    }
    const scheduledAt = time.toISOString();
    const input = { name: classNameInput.value.trim(), lessonId: lesson.id, expectedRevision: lesson.revision, scheduledAt, timeZone: classTimeZone };
    const payload = JSON.stringify(input);
    if (payload !== requestPayload) { requestKey = crypto.randomUUID(); requestPayload = payload; }
    setSaving(true);
    try {
      const response = await fetch('/api/classes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, requestKey }) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) {
          selectedRecommendationId = null;
          await loadRecommendations();
        }
        throw new Error(result.error || 'Не удалось создать класс.');
      }
      createdClass = result.lesson;
      completionLink.textContent = new URL(createdClass.invitePath, window.location.origin).href;
      completionLesson.textContent = createdClass.title;
      document.getElementById('class-completion-time').textContent = new Intl.DateTimeFormat('ru', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(createdClass.scheduled_at));
      setClassStep(3);
      onCreated?.(createdClass);
      window.requestAnimationFrame(() => copyClassLinkButton.focus());
    } catch (error) {
      classError.textContent = error.message || 'Не удалось создать класс. Попробуйте ещё раз.';
    } finally { setSaving(false); }
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && classModal.classList.contains('class-modal--visible')) {
      closeClassModal();
      return;
    }
    keepFocusInsideModal(event);
  });

  classModal.querySelectorAll('[data-close-class-modal]').forEach(button => {
    button.addEventListener('click', closeClassModal);
  });
  classNameInput.addEventListener('input', updateClassLink);
  classNextButton.addEventListener('click', () => {
    if (!classNameInput.value.trim()) {
      classNameInput.focus();
      window.AppShell.showToast('Введите название класса');
      return;
    }
    setClassStep(2);
    loadRecommendations().then(() => {
      if (!classDialog.querySelector('[data-class-step="2"]').hidden) lessonSearch.focus();
    });
  });
  classBackButton.addEventListener('click', () => {
    setClassStep(1);
    classNameInput.focus();
  });
  attachLessonButton.addEventListener('click', saveClass);
  lessonSearch.addEventListener('input', filterRecommendations);
  document.getElementById('class-all-lessons').addEventListener('click', () => { showAllLessons = true; filterRecommendations(); lessonSearch.focus(); });
  document.getElementById('class-retry-lessons').addEventListener('click', loadRecommendations);
  launchButton.addEventListener('click', () => { if (createdClass) window.location.href = createdClass.lessonPath; });
  copyClassLinkButton.addEventListener('click', copyClassInviteLink);
  completionDoneButton.addEventListener('click', closeClassModal);
  recommendationTrack.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const cards = [...recommendationTrack.querySelectorAll('.recommendation-card')];
    if (!cards.length) return;
    const currentIndex = cards.findIndex(card => card.dataset.lessonId === selectedRecommendationId);
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (currentIndex + direction + cards.length) % cards.length;
    event.preventDefault();
    selectRecommendation(cards[nextIndex].dataset.lessonId, true);
  });

  window.ClassModal = Object.freeze({ open: openClassModal });
})();
