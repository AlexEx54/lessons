(() => {
  'use strict';

  const state = { calls: [], loading: true, error: '' };
  const invitePaths = new Map();
  const grid = document.getElementById('calls-grid');
  const loading = document.getElementById('calls-loading');
  const empty = document.getElementById('calls-empty');
  const errorState = document.getElementById('calls-error');
  const errorMessage = document.getElementById('calls-error-message');
  const createButton = document.getElementById('create-video-call');

  const statusLabels = {
    waiting: 'Ожидает участника',
    active: 'Идёт сейчас',
    ended: 'Завершён',
    expired: 'Срок истёк',
  };

  function formatDate(value) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  }

  function button(label, className, handler) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className;
    element.textContent = label;
    element.addEventListener('click', () => handler(element));
    return element;
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    const copied = document.execCommand('copy');
    input.remove();
    if (!copied) throw new Error('Браузер не разрешил скопировать ссылку.');
  }

  async function copyInvite(call, trigger) {
    const original = trigger.textContent;
    trigger.disabled = true;
    trigger.textContent = 'Готовим ссылку…';
    try {
      let guestPath = invitePaths.get(call.id);
      let rotated = false;
      if (!guestPath) {
        const response = await fetch(`/api/video-calls/${encodeURIComponent(call.id)}/invite`, {
          method: 'POST',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Не удалось получить ссылку.');
        guestPath = payload.guestPath;
        invitePaths.set(call.id, guestPath);
        rotated = true;
      }
      await copyText(new URL(guestPath, window.location.origin).href);
      window.AppShell.showToast(rotated
        ? 'Новая ссылка скопирована. Предыдущая ссылка больше не действует.'
        : 'Ссылка для ученика скопирована.');
    } catch (error) {
      window.AppShell.showToast(error.message || 'Не удалось скопировать ссылку.');
    } finally {
      trigger.disabled = false;
      trigger.textContent = original;
    }
  }

  async function endCall(call, trigger) {
    trigger.disabled = true;
    trigger.textContent = 'Завершаем…';
    try {
      const response = await fetch(`/api/video-calls/${encodeURIComponent(call.id)}/end`, {
        method: 'POST',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось завершить звонок.');
      const index = state.calls.findIndex(item => item.id === call.id);
      if (index >= 0) state.calls[index] = payload.call;
      invitePaths.delete(call.id);
      render();
      window.AppShell.showToast('Видеозвонок завершён.');
    } catch (error) {
      trigger.disabled = false;
      trigger.textContent = 'Завершить';
      window.AppShell.showToast(error.message || 'Не удалось завершить звонок.');
    }
  }

  function renderCard(call) {
    const card = document.createElement('article');
    card.className = 'call-card';
    const top = document.createElement('div');
    top.className = 'call-card__top';
    const title = document.createElement('h3');
    title.textContent = `Видеозвонок от ${formatDate(call.createdAt)}`;
    const status = document.createElement('span');
    status.className = `call-status call-status--${call.status}`;
    status.textContent = statusLabels[call.status] || call.status;
    top.append(title, status);
    card.append(top);

    const meta = document.createElement('p');
    meta.className = 'call-card__meta';
    meta.textContent = call.startedAt
      ? `Начат ${formatDate(call.startedAt)} · ссылка до ${formatDate(call.expiresAt)}`
      : `Ссылка действует до ${formatDate(call.expiresAt)}`;
    card.append(meta);

    const actions = document.createElement('div');
    actions.className = 'call-card__actions';
    if (call.status === 'waiting' || call.status === 'active') {
      const join = document.createElement('a');
      join.className = 'call-card__join';
      join.href = `/video-calls/${encodeURIComponent(call.id)}`;
      join.textContent = call.status === 'active' ? 'Вернуться в звонок' : 'Войти в комнату';
      actions.append(
        join,
        button('Скопировать ссылку', 'call-card__copy', trigger => copyInvite(call, trigger)),
        button('Завершить', 'call-card__end', trigger => endCall(call, trigger)),
      );
    }
    card.append(actions);
    return card;
  }

  function render() {
    loading.hidden = !state.loading;
    errorState.hidden = !state.error;
    errorMessage.textContent = state.error;
    empty.hidden = state.loading || Boolean(state.error) || state.calls.length > 0;
    grid.hidden = state.loading || Boolean(state.error) || state.calls.length === 0;
    grid.replaceChildren(...state.calls.map(renderCard));
  }

  async function loadCalls() {
    state.loading = true;
    state.error = '';
    render();
    try {
      const response = await fetch('/api/video-calls');
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить видеозвонки.');
      state.calls = payload.calls || [];
    } catch (error) {
      state.error = error.message || 'Не удалось загрузить видеозвонки.';
    } finally {
      state.loading = false;
      render();
    }
  }

  async function createCall() {
    createButton.disabled = true;
    createButton.textContent = 'Создаём комнату…';
    try {
      const response = await fetch('/api/video-calls', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось создать видеозвонок.');
      state.calls.unshift(payload.call);
      invitePaths.set(payload.call.id, payload.guestPath);
      render();
      await copyText(new URL(payload.guestPath, window.location.origin).href);
      window.AppShell.showToast('Комната создана, ссылка для ученика скопирована.');
    } catch (error) {
      window.AppShell.showToast(error.message || 'Не удалось создать видеозвонок.');
    } finally {
      createButton.disabled = false;
      createButton.innerHTML = '<span aria-hidden="true">＋</span> Создать видеозвонок';
    }
  }

  createButton?.addEventListener('click', createCall);
  document.getElementById('calls-retry')?.addEventListener('click', loadCalls);
  loadCalls();
})();
