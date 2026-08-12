(() => {
  'use strict';

  const state = {
    lesson: null,
    draftId: '',
    draftStatus: '',
    activeIndex: 0,
    elapsedSeconds: 0,
    timer: null,
    dirtyComponents: new Set(),
  };
  const byId = id => document.getElementById(id);
  const plan = byId('lesson-plan');
  const stages = byId('lesson-stages');
  const content = byId('lesson-content');
  const loading = byId('lesson-loading');
  const errorBox = byId('lesson-error');
  const toast = byId('lesson-toast');
  let toastTimer;

  const componentRenderers = {
    teacherNote: component => window.TeacherNoteComponent.renderTeacherNote(component, {
      onSave: state.draftStatus === 'review' ? saveTeacherNote : undefined,
      onDirtyChange: (dirty, noteId) => {
        if (dirty) state.dirtyComponents.add(noteId);
        else state.dirtyComponents.delete(noteId);
      },
      onError: showToast,
    }),
    taskPrompt: component => window.TaskPromptComponent.renderTaskPrompt(component, {
      onSave: state.draftStatus === 'review' ? saveTaskPrompt : undefined,
      onDirtyChange: (dirty, promptId) => {
        if (dirty) state.dirtyComponents.add(promptId);
        else state.dirtyComponents.delete(promptId);
      },
      onError: showToast,
    }),
  };

  const icons = {
    sparkles: '✦', compass: '◴', cards: '▣', book: '▤', cap: '◇', chat: '◌', check: '✓',
  };

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const remainder = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('lesson-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('lesson-toast--visible'), 2600);
  }

  function stageButton(stage, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lesson-stage';
    button.dataset.stageIndex = String(index);

    const number = document.createElement('span');
    number.className = 'lesson-stage__number';
    number.textContent = String(stage.number);
    const icon = document.createElement('span');
    icon.className = 'lesson-stage__icon';
    icon.textContent = icons[stage.icon] || '•';
    const title = document.createElement('span');
    title.className = 'lesson-stage__title';
    title.textContent = stage.title;
    const duration = document.createElement('span');
    duration.className = 'lesson-stage__duration';
    duration.textContent = `${stage.durationMinutes} min`;
    button.append(number, icon, title, duration);
    button.addEventListener('click', () => selectStage(index));
    return button;
  }

  function selectStage(index) {
    const lesson = state.lesson;
    if (!lesson || index < 0 || index >= lesson.stages.length) return;
    if (state.dirtyComponents.size > 0) {
      const discard = window.confirm('Есть несохранённые изменения. Отменить их и перейти к другой стадии?');
      if (!discard) return;
      state.dirtyComponents.clear();
    }
    state.activeIndex = index;
    const stage = lesson.stages[index];
    [...stages.children].forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle('lesson-stage--active', active);
      button.setAttribute('aria-current', active ? 'step' : 'false');
    });
    byId('stage-number').textContent = `${stage.number}.`;
    byId('stage-title').textContent = stage.title;
    byId('stage-kicker').textContent = stage.id === 'warm-up' ? 'Let’s start!' : 'Lesson stage';
    renderStageContent(stage);
    byId('stage-progress').textContent = `${index + 1} из ${lesson.stages.length}`;
    byId('previous-stage').disabled = index === 0;
    byId('next-stage').disabled = index === lesson.stages.length - 1;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function emptyStage(stage) {
    const section = document.createElement('section');
    section.className = 'empty-stage';
    const titleId = `empty-stage-title-${stage.id}`;
    section.setAttribute('aria-labelledby', titleId);
    const icon = document.createElement('span');
    icon.className = 'empty-stage__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✦';
    const title = document.createElement('h2');
    title.id = titleId;
    title.textContent = 'Стадия готова к наполнению';
    const description = document.createElement('p');
    description.textContent = 'Структура урока уже создана из JSON. Контент для этой стадии будет сгенерирован на следующем этапе.';
    section.append(icon, title, description);
    const meta = document.createElement('div');
    meta.className = 'empty-stage__meta';
    const duration = document.createElement('span');
    duration.textContent = `${stage.durationMinutes} min`;
    const status = document.createElement('span');
    status.textContent = 'Контент пока не добавлен';
    meta.append(duration, status);
    section.append(meta);
    return section;
  }

  function unsupportedComponent(component) {
    const element = document.createElement('div');
    element.className = 'unsupported-component';
    element.textContent = `Компонент «${component?.type || 'unknown'}» пока не поддерживается.`;
    return element;
  }

  function renderStageContent(stage) {
    const container = byId('stage-components');
    if (!Array.isArray(stage.content) || stage.content.length === 0) {
      container.replaceChildren(emptyStage(stage));
      return;
    }
    const rendered = stage.content.map((component) => {
      const renderer = component && componentRenderers[component.type];
      if (!renderer) return unsupportedComponent(component);
      try {
        return renderer(component);
      } catch (_error) {
        return unsupportedComponent(component);
      }
    });
    container.replaceChildren(...rendered);
  }

  function render(lesson) {
    state.lesson = lesson;
    const meta = lesson.meta || {};
    document.title = `${meta.title || meta.topic || 'Урок'} — EasyClass`;
    byId('lesson-title').textContent = `${meta.title || meta.topic || 'Новый урок'} (${meta.level || 'A2'})`;
    byId('lesson-number').textContent = `Lesson ${meta.lessonNumber || 1} of 1`;
    byId('total-time').textContent = formatTime((meta.durationMinutes || 45) * 60);
    stages.replaceChildren(...lesson.stages.map(stageButton));
    loading.hidden = true;
    content.hidden = false;
    selectStage(0);
  }

  function findTeacherNote(lesson, noteId) {
    for (const stage of lesson.stages || []) {
      for (const component of stage.content || []) {
        if (component?.type === 'teacherNote' && component.id === noteId) return component;
      }
    }
    return null;
  }

  function findTaskPrompt(lesson, promptId) {
    for (const stage of lesson.stages || []) {
      for (const component of stage.content || []) {
        if (component?.type === 'taskPrompt' && component.id === promptId) return component;
      }
    }
    return null;
  }

  async function saveTeacherNote(text, noteId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/teacher-notes/${encodeURIComponent(noteId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Teacher’s Notes.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const savedNote = findTeacherNote(state.lesson, noteId);
      if (!savedNote) throw new Error('Сохранённая Teacher’s Notes не найдена в черновике.');
      showToast('Teacher’s Notes сохранена.');
      return savedNote;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Teacher’s Notes.');
      throw error;
    }
  }

  async function saveTaskPrompt(changes, promptId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/task-prompts/${encodeURIComponent(promptId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить блок задания.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const savedPrompt = findTaskPrompt(state.lesson, promptId);
      if (!savedPrompt) throw new Error('Сохранённый блок задания не найден в черновике.');
      showToast('Блок задания сохранён.');
      return savedPrompt;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить блок задания.');
      throw error;
    }
  }

  function showError(message) {
    loading.hidden = true;
    content.hidden = true;
    errorBox.hidden = false;
    byId('lesson-error-message').textContent = message;
  }

  async function loadLesson() {
    const match = window.location.pathname.match(/^\/lesson-drafts\/([^/]+)\/edit\/?$/);
    if (!match) return showError('Некорректная ссылка на урок.');
    try {
      const response = await fetch(`/api/lesson-drafts/${encodeURIComponent(decodeURIComponent(match[1]))}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Черновик урока не найден.');
      if (!payload.draft?.content?.stages?.length) throw new Error('В черновике пока нет структуры урока.');
      state.draftId = payload.draft.id;
      state.draftStatus = payload.draft.status;
      render(payload.draft.content);
    } catch (error) {
      showError(error.message || 'Не удалось загрузить структуру урока.');
    }
  }

  function setPlanVisible(visible) {
    plan.hidden = !visible;
    byId('show-plan').hidden = visible;
    document.body.classList.toggle('lesson-plan-hidden', !visible);
  }

  byId('hide-plan').addEventListener('click', () => setPlanVisible(false));
  byId('close-plan').addEventListener('click', () => setPlanVisible(false));
  byId('show-plan').addEventListener('click', () => setPlanVisible(true));
  byId('previous-stage').addEventListener('click', () => selectStage(state.activeIndex - 1));
  byId('next-stage').addEventListener('click', () => selectStage(state.activeIndex + 1));
  byId('teacher-screen').addEventListener('click', () => showToast('Экран преподавателя уже открыт.'));
  byId('lesson-timer').addEventListener('click', () => {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
      byId('timer-icon').textContent = '▶';
      return;
    }
    byId('timer-icon').textContent = 'Ⅱ';
    state.timer = window.setInterval(() => {
      state.elapsedSeconds += 1;
      byId('elapsed-time').textContent = formatTime(state.elapsedSeconds);
    }, 1000);
  });
  window.addEventListener('pagehide', () => window.clearInterval(state.timer));
  window.addEventListener('beforeunload', (event) => {
    if (state.dirtyComponents.size === 0) return;
    event.preventDefault();
    event.returnValue = '';
  });
  loadLesson();
})();
