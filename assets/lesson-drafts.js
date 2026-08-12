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

  function editorLink(draft) {
    const link = document.createElement('a');
    link.className = 'draft-card__editor-link';
    link.href = `/lesson-drafts/${encodeURIComponent(draft.id)}/edit`;
    link.textContent = 'Открыть редактор';
    return link;
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
    }

    if (draft.status === 'review') {
      addText(card, 'p', 'draft-card__hint', 'Контент сгенерирован и готов к проверке и редактированию.');
    }

    if (draft.status === 'published') {
      addText(card, 'p', 'draft-card__hint', `Урок опубликован${draft.publishedAt ? ` ${formatDate(draft.publishedAt)}` : ''}.`);
    }

    const actions = document.createElement('div');
    actions.className = 'draft-card__actions';
    if (draft.status === 'failed') {
      actions.append(futureAction('Повторить генерацию', 'Повторный запуск будет подключён вместе с генератором.'));
    }
    if (draft.status === 'review') {
      actions.append(
        editorLink(draft),
        futureAction('Добавить в библиотеку', 'Публикация будет доступна после подключения редактора.'),
      );
    }
    actions.append(deleteButton(draft));
    card.append(actions);
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
