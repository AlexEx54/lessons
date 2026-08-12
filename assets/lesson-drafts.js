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
  let pollTimer = null;

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

  function futureAction(label, message) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-disabled', 'true');
    button.addEventListener('click', () => window.AppShell.showToast(message));
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
    card.append(meta);

    if (draft.status === 'generating') {
      const progress = document.createElement('div');
      progress.className = 'draft-card__progress';
      progress.setAttribute('aria-hidden', 'true');
      card.append(progress);
      addText(card, 'p', 'draft-card__hint', 'Нейросеть готовит структуру и материалы урока. Статус обновится автоматически.');
    }

    if (draft.status === 'failed') {
      addText(card, 'p', 'draft-card__error', draft.errorMessage || 'Во время генерации произошла ошибка.');
      const actions = document.createElement('div');
      actions.className = 'draft-card__actions';
      actions.append(futureAction('Повторить генерацию', 'Повторный запуск будет подключён вместе с генератором.'));
      card.append(actions);
    }

    if (draft.status === 'review') {
      addText(card, 'p', 'draft-card__hint', 'Контент сгенерирован и готов к проверке и редактированию.');
      const actions = document.createElement('div');
      actions.className = 'draft-card__actions';
      actions.append(
        futureAction('Открыть редактор', 'Редактор урока скоро появится.'),
        futureAction('Добавить в библиотеку', 'Публикация будет доступна после подключения редактора.'),
      );
      card.append(actions);
    }

    if (draft.status === 'published') {
      addText(card, 'p', 'draft-card__hint', `Урок опубликован${draft.publishedAt ? ` ${formatDate(draft.publishedAt)}` : ''}.`);
    }
    return card;
  }

  function schedulePolling() {
    window.clearTimeout(pollTimer);
    if (state.drafts.some(draft => draft.status === 'generating')) {
      pollTimer = window.setTimeout(() => loadDrafts({ background: true }), POLL_INTERVAL_MS);
    }
  }

  function render() {
    loading.hidden = !state.loading;
    errorState.hidden = !state.error;
    errorMessage.textContent = state.error;
    const visible = state.filter === 'all'
      ? state.drafts
      : state.drafts.filter(draft => draft.status === state.filter);
    empty.hidden = state.loading || Boolean(state.error) || visible.length > 0;
    grid.hidden = state.loading || Boolean(state.error) || visible.length === 0;
    grid.replaceChildren(...visible.map(draftCard));
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
  window.addEventListener('pagehide', () => window.clearTimeout(pollTimer));
  loadDrafts();
})();
