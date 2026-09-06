(() => {
  'use strict';

  const POLL_INTERVAL_MS = 5000;
  const statusLabels = {
    generating: 'Генерируется',
    review: 'На проверке',
    failed: 'Ошибка',
    published: 'Опубликован',
  };
  const state = { drafts: [], filter: 'all', loading: true, error: '' };
  const grid = document.getElementById('draft-grid');
  const loading = document.getElementById('draft-loading');
  const empty = document.getElementById('draft-empty');
  const errorState = document.getElementById('draft-error');
  const errorMessage = document.getElementById('draft-error-message');
  const generationLog = document.getElementById('generation-log');
  const generationLogDialog = generationLog?.querySelector('.generation-log__dialog');
  const generationLogTitle = document.getElementById('generation-log-title');
  const generationLogStatus = document.getElementById('generation-log-status');
  const generationLogReasoning = document.getElementById('generation-log-reasoning');
  const generationLogOutput = document.getElementById('generation-log-output');
  let pollTimer = null;
  let progressTimer = null;
  let generationSource = null;
  let generationLogReturnFocus = null;

  function formatDate(value) {
    if (!value) return 'Дата неизвестна';
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  }

  function addText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }


  function formatCost(draft) {
    const cost = draft.generation?.costUsd;
    if (Number.isFinite(cost)) return `Стоимость: $${cost.toFixed(4)}`;
    if (draft.status === 'generating') return 'Стоимость: рассчитывается';
    return 'Стоимость: недоступна';
  }

  function generationProgress(draft) {
    const startedAt = Date.parse(draft.generation?.startedAt || draft.createdAt || '');
    if (!Number.isFinite(startedAt)) return 0;
    return Math.max(0, Math.min(99, ((Date.now() - startedAt) / 180000) * 100));
  }

  function updateProgressBars() {
    document.querySelectorAll('[data-generation-started-at]').forEach(progress => {
      const startedAt = Date.parse(progress.dataset.generationStartedAt || '');
      const value = Number.isFinite(startedAt)
        ? Math.max(0, Math.min(99, ((Date.now() - startedAt) / 180000) * 100))
        : 0;
      progress.setAttribute('aria-valuenow', String(Math.round(value)));
      progress.querySelector('.draft-card__progress-value')?.style.setProperty('width', `${value}%`);
    });
  }

  function scheduleProgressUpdates() {
    window.clearInterval(progressTimer);
    progressTimer = null;
    if (state.drafts.some(draft => draft.status === 'generating')) {
      progressTimer = window.setInterval(updateProgressBars, 1000);
    }
  }

  function editorLink(draft) {
    const link = document.createElement('a');
    link.className = 'draft-card__editor-link';
    link.href = `/lesson-drafts/${encodeURIComponent(draft.id)}/edit`;
    link.textContent = 'Открыть редактор';
    return link;
  }

  async function changeImageGeneration(draft, action, button) {
    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = action === 'stop' ? 'Останавливаем…' : 'Запускаем…';
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(draft.id)}/image-generation/${action}`,
        { method: 'POST' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось изменить генерацию изображений.');
      const index = state.drafts.findIndex(item => item.id === draft.id);
      if (index >= 0 && payload.draft) state.drafts[index] = payload.draft;
      render();
    } catch (error) {
      button.disabled = false;
      button.textContent = originalText;
      window.AppShell.showToast(error.message || 'Не удалось изменить генерацию изображений.');
    }
  }

  function imageGenerationPanel(draft) {
    const generation = draft.imageGeneration;
    if (!generation) return null;
    const panel = document.createElement('div');
    panel.className = `draft-card__image-generation draft-card__image-generation--${generation.status}`;
    const row = document.createElement('div');
    row.className = 'draft-card__image-generation-row';
    const labels = {
      pending: 'Изображения ожидают запуска',
      running: `Изображения ${generation.completed} из ${generation.total}`,
      completed: generation.total > 0
        ? `Все изображения готовы · ${generation.completed} из ${generation.total}`
        : 'В уроке нет изображений для генерации',
      stopped: `Генерация остановлена · ${generation.completed} из ${generation.total}`,
      unavailable: `Draw Things недоступен · ${generation.completed} из ${generation.total}`,
      failed: `Ошибка изображений · ${generation.completed} из ${generation.total}`,
    };
    addText(row, 'strong', '', labels[generation.status] || 'Генерация изображений');
    if (['pending', 'running'].includes(generation.status)) {
      const button = addText(row, 'button', 'draft-card__image-action', 'Остановить');
      button.type = 'button';
      button.addEventListener('click', () => changeImageGeneration(draft, 'stop', button));
    } else if (['stopped', 'unavailable', 'failed'].includes(generation.status)) {
      const button = addText(row, 'button', 'draft-card__image-action', 'Продолжить');
      button.type = 'button';
      button.addEventListener('click', () => changeImageGeneration(draft, 'start', button));
    }
    panel.append(row);
    if (generation.total > 0) {
      const progress = document.createElement('div');
      progress.className = 'draft-card__image-progress';
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', String(generation.total));
      progress.setAttribute('aria-valuenow', String(generation.completed));
      const value = document.createElement('span');
      value.style.width = `${Math.min(100, (generation.completed / generation.total) * 100)}%`;
      progress.append(value);
      panel.append(progress);
    }
    if (generation.errorMessage && ['unavailable', 'failed'].includes(generation.status)) {
      addText(panel, 'p', '', generation.errorMessage);
    }
    return panel;
  }

  function deleteButton(draft) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'draft-card__delete';
    button.textContent = 'Удалить';
    button.addEventListener('click', async () => {
      if (!window.confirm(`Удалить черновик «${draft.topic}»? Это действие нельзя отменить.`)) return;
      button.disabled = true;
      button.textContent = 'Удаляем…';
      try {
        const response = await fetch(`/api/lesson-drafts/${encodeURIComponent(draft.id)}`, {
          method: 'DELETE',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось удалить черновик.');
        state.drafts = state.drafts.filter(item => item.id !== draft.id);
        render();
        window.AppShell.showToast('Черновик удалён.');
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Удалить';
        window.AppShell.showToast(error.message || 'Не удалось удалить черновик.');
      }
    });
    return button;
  }

  function closeGenerationLog() {
    generationSource?.close();
    generationSource = null;
    if (!generationLog || generationLog.hidden) return;
    generationLog.hidden = true;
    document.body.classList.remove('generation-log-open');
    generationLogReturnFocus?.focus();
    generationLogReturnFocus = null;
  }

  function setGenerationStatus(text, stateName = '') {
    generationLogStatus.textContent = text;
    generationLogStatus.dataset.state = stateName;
  }

  function parseGenerationEvent(event) {
    try {
      return JSON.parse(event.data);
    } catch (_error) {
      return {};
    }
  }

  function openGenerationLog(draft, trigger) {
    if (!generationLog) return;
    generationSource?.close();
    generationLogReturnFocus = trigger;
    generationLog.hidden = false;
    document.body.classList.add('generation-log-open');
    generationLogTitle.textContent = draft.topic;
    generationLogReasoning.textContent = 'Ожидаем данные…';
    generationLogOutput.textContent = 'Ожидаем результат…';
    setGenerationStatus(draft.status === 'generating' ? 'Подключаемся к генерации…' : 'Загружаем сохранённый журнал…');
    window.requestAnimationFrame(() => generationLogDialog?.querySelector('.generation-log__close')?.focus());

    const source = new EventSource(`/api/lesson-drafts/${encodeURIComponent(draft.id)}/generation-stream`);
    generationSource = source;
    source.addEventListener('snapshot', event => {
      const snapshot = parseGenerationEvent(event);
      generationLogReasoning.textContent = snapshot.reasoning || (snapshot.mode === 'synthetic'
        ? 'Синтетический урок создан без обращения к нейросети.'
        : 'Модель пока не передала рассуждения.');
      generationLogOutput.textContent = snapshot.output || 'Модель пока не передала результат.';
      const cost = Number.isFinite(snapshot.costUsd) ? ` · $${snapshot.costUsd.toFixed(4)}` : '';
      setGenerationStatus(snapshot.status === 'running' ? `Генерация продолжается${cost}` : `Журнал сохранён${cost}`, snapshot.status);
    });
    source.addEventListener('reasoning', event => {
      const payload = parseGenerationEvent(event);
      if (generationLogReasoning.textContent === 'Модель пока не передала рассуждения.'
        || generationLogReasoning.textContent === 'Ожидаем данные…') generationLogReasoning.textContent = '';
      generationLogReasoning.textContent += payload.delta || '';
      generationLogReasoning.scrollTop = generationLogReasoning.scrollHeight;
    });
    source.addEventListener('output', event => {
      const payload = parseGenerationEvent(event);
      if (generationLogOutput.textContent === 'Модель пока не передала результат.'
        || generationLogOutput.textContent === 'Ожидаем результат…') generationLogOutput.textContent = '';
      generationLogOutput.textContent += payload.delta || '';
      generationLogOutput.scrollTop = generationLogOutput.scrollHeight;
    });
    source.addEventListener('usage', event => {
      const payload = parseGenerationEvent(event);
      if (Number.isFinite(payload.costUsd)) setGenerationStatus(`Генерация продолжается · $${payload.costUsd.toFixed(4)}`, 'running');
    });
    source.addEventListener('done', event => {
      const payload = parseGenerationEvent(event);
      const cost = Number.isFinite(payload.costUsd) ? ` · $${payload.costUsd.toFixed(4)}` : '';
      setGenerationStatus(`Генерация завершена${cost}`, 'completed');
      source.close();
      if (generationSource === source) generationSource = null;
      loadDrafts({ background: true });
    });
    source.addEventListener('generation-error', event => {
      const payload = parseGenerationEvent(event);
      const cost = Number.isFinite(payload.costUsd) ? ` · $${payload.costUsd.toFixed(4)}` : '';
      setGenerationStatus(`${payload.message || 'Генерация завершилась с ошибкой.'}${cost}`, 'failed');
      source.close();
      if (generationSource === source) generationSource = null;
      loadDrafts({ background: true });
    });
    source.onerror = () => {
      if (generationSource !== source) return;
      setGenerationStatus('Соединение с журналом прервано. EventSource попробует подключиться снова.', 'failed');
    };
  }

  function generationLogButton(draft) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'draft-card__generation-log';
    button.title = 'Журнал генерации';
    button.setAttribute('aria-label', `Открыть журнал генерации урока «${draft.topic}»`);
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5zM8 9h8M8 12h8M8 15h5" /></svg>';
    button.addEventListener('click', () => openGenerationLog(draft, button));
    return button;
  }

  function retryGenerationButton(draft) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Повторить генерацию';
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = 'Запускаем…';
      try {
        const response = await fetch(
          `/api/lesson-drafts/${encodeURIComponent(draft.id)}/retry`,
          { method: 'POST' },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось повторить генерацию.');
        const index = state.drafts.findIndex(item => item.id === draft.id);
        if (index >= 0 && payload.draft) state.drafts[index] = payload.draft;
        render();
      } catch (error) {
        button.disabled = false;
        button.textContent = 'Повторить генерацию';
        window.AppShell.showToast(error.message || 'Не удалось повторить генерацию.');
      }
    });
    return button;
  }

  function publicationButton(draft) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = draft.publication ? 'Публикация урока' : 'Добавить в библиотеку';
    button.addEventListener('click', () => window.LessonPublication.open(draft.id, {
      onChange: () => loadDrafts({ background: true }),
    }));
    return button;
  }

  function draftCard(draft) {
    const card = document.createElement('article');
    card.className = 'draft-card';

    const top = document.createElement('div');
    top.className = 'draft-card__top';
    addText(top, 'h3', '', draft.topic);
    addText(top, 'span', `draft-status draft-status--${draft.status}`, statusLabels[draft.status] || draft.status);
    card.append(top);

    const meta = document.createElement('div');
    meta.className = 'draft-card__meta';
    addText(meta, 'span', '', draft.template === 'template-1' ? 'Шаблон 1' : draft.template);
    addText(meta, 'span', '', `Обновлён ${formatDate(draft.updatedAt)}`);
    addText(meta, 'span', 'draft-card__cost', formatCost(draft));
    card.append(meta);
    if (draft.publication) {
      const link = document.createElement(draft.publication.is_published ? 'a' : 'span');
      link.textContent = draft.publication.is_published ? 'В библиотеке ↗' : 'Снят с публикации';
      if (draft.publication.is_published) link.href = `/library/${encodeURIComponent(draft.publication.id)}`;
      meta.append(link);
    }

    if (draft.status === 'generating') {
      const progress = document.createElement('div');
      progress.className = 'draft-card__progress';
      progress.dataset.generationStartedAt = draft.generation?.startedAt || draft.createdAt || '';
      progress.setAttribute('role', 'progressbar');
      progress.setAttribute('aria-label', 'Оценочный прогресс генерации');
      progress.setAttribute('aria-valuemin', '0');
      progress.setAttribute('aria-valuemax', '100');
      progress.setAttribute('aria-valuenow', String(Math.round(generationProgress(draft))));
      const progressValue = document.createElement('span');
      progressValue.className = 'draft-card__progress-value';
      progressValue.style.width = `${generationProgress(draft)}%`;
      progress.append(progressValue);
      card.append(progress);
      addText(card, 'p', 'draft-card__hint', 'Нейросеть готовит Warm-Up. Обычно это занимает около трёх минут.');
    }

    if (draft.status === 'failed') {
      addText(card, 'p', 'draft-card__error', draft.errorMessage || 'Во время генерации произошла ошибка.');
    }

    if (draft.status === 'review') {
      addText(card, 'p', 'draft-card__hint', 'Контент сгенерирован и готов к проверке и редактированию.');
      const imagePanel = imageGenerationPanel(draft);
      if (imagePanel) card.append(imagePanel);
    }

    if (draft.status === 'published') {
      addText(card, 'p', 'draft-card__hint', `Урок опубликован${draft.publishedAt ? ` ${formatDate(draft.publishedAt)}` : ''}.`);
    }

    const actions = document.createElement('div');
    actions.className = 'draft-card__actions';
    if (draft.status === 'failed') {
      actions.append(retryGenerationButton(draft));
    }
    if (draft.status === 'review') {
      actions.append(
        editorLink(draft),
        publicationButton(draft),
      );
    }
    const managementActions = document.createElement('div');
    managementActions.className = 'draft-card__management-actions';
    managementActions.append(generationLogButton(draft), deleteButton(draft));
    actions.append(managementActions);
    card.append(actions);
    return card;
  }

  function schedulePolling() {
    window.clearTimeout(pollTimer);
    if (state.drafts.some(draft => draft.status === 'generating'
      || ['pending', 'running'].includes(draft.imageGeneration?.status))) {
      pollTimer = window.setTimeout(() => loadDrafts({ background: true }), POLL_INTERVAL_MS);
    }
  }

  function render() {
    loading.hidden = !state.loading;
    errorState.hidden = !state.error;
    errorMessage.textContent = state.error;
    const visible = state.filter === 'all'
      ? state.drafts
      : state.drafts.filter(draft => state.filter === 'published' ? draft.publication?.is_published : draft.status === state.filter);
    empty.hidden = state.loading || Boolean(state.error) || visible.length > 0;
    grid.hidden = state.loading || Boolean(state.error) || visible.length === 0;
    grid.replaceChildren(...visible.map(draftCard));
    scheduleProgressUpdates();
    schedulePolling();
  }

  async function loadDrafts({ background = false } = {}) {
    if (!background) state.loading = true;
    state.error = '';
    render();
    try {
      const response = await fetch('/api/lesson-drafts', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Попробуйте обновить страницу.');
      state.drafts = Array.isArray(payload.drafts) ? payload.drafts : [];
    } catch (error) {
      state.error = error.message || 'Попробуйте обновить страницу.';
    } finally {
      state.loading = false;
      render();
    }
  }

  document.getElementById('draft-filters').addEventListener('click', event => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    state.filter = button.dataset.status;
    document.querySelectorAll('.draft-filter').forEach(filter => {
      const active = filter === button;
      filter.classList.toggle('draft-filter--active', active);
      filter.setAttribute('aria-pressed', String(active));
    });
    render();
  });
  document.getElementById('draft-retry-load').addEventListener('click', () => loadDrafts());
  generationLog?.querySelectorAll('[data-close-generation-log]').forEach(button => {
    button.addEventListener('click', closeGenerationLog);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab' && generationLog && !generationLog.hidden && generationLogDialog) {
      const focusable = [...generationLogDialog.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first && last && event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (first && last && !event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === 'Escape' && generationLog && !generationLog.hidden) {
      event.preventDefault();
      closeGenerationLog();
    }
  });
  window.addEventListener('pagehide', () => {
    window.clearTimeout(pollTimer);
    window.clearInterval(progressTimer);
    generationSource?.close();
  });
  loadDrafts();
})();
