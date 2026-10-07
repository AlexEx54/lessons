(() => {
  'use strict';

  const state = { calls: [], loading: true, error: '' };
  // A presence poll requested before a local change would bring back the old list.
  let changedAt = 0;
  const grid = document.getElementById('calls-grid');
  const loading = document.getElementById('calls-loading');
  const empty = document.getElementById('calls-empty');
  const errorState = document.getElementById('calls-error');
  const errorMessage = document.getElementById('calls-error-message');
  const createButton = document.getElementById('create-video-call');
  const dialog = document.getElementById('create-call-dialog');
  const form = document.getElementById('create-call-form');
  const formError = document.getElementById('create-call-error');

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

  function link(label, className, href) {
    const element = document.createElement('a');
    element.className = className;
    element.href = href;
    element.textContent = label;
    return element;
  }

  async function request(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось связаться с сервером.');
    return payload;
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

  function inviteUrl(call) {
    return new URL(call.guestPath, window.location.origin).href;
  }

  async function copyInvite(call) {
    try {
      await copyText(inviteUrl(call));
      window.AppShell.showToast('Ссылка для ученика скопирована.');
    } catch (error) {
      window.AppShell.showToast(error.message || 'Не удалось скопировать ссылку.');
    }
  }

  async function deleteCall(call, trigger) {
    if (!window.confirm(`Удалить комнату «${call.name}»? Ссылка ученика перестанет работать, переписка и файлы будут удалены. Это действие нельзя отменить.`)) {
      return;
    }
    trigger.disabled = true;
    trigger.textContent = 'Удаляем…';
    try {
      await request(`/api/video-calls/${encodeURIComponent(call.id)}`, { method: 'DELETE' });
      changedAt = Date.now();
      state.calls = state.calls.filter(item => item.id !== call.id);
      render();
      window.AppShell.showToast(`Комната «${call.name}» удалена.`);
    } catch (error) {
      trigger.disabled = false;
      trigger.textContent = 'Удалить';
      window.AppShell.showToast(error.message || 'Не удалось удалить комнату.');
    }
  }

  function presenceBadge({ presence }) {
    if (presence.guest && presence.teacher) return { label: 'Идёт звонок', modifier: 'live' };
    if (presence.guest) return { label: 'Ученик ждёт', modifier: 'waiting' };
    return null;
  }

  function renderCard(call) {
    const card = document.createElement('article');
    card.className = 'call-card';
    const top = document.createElement('div');
    top.className = 'call-card__top';
    const title = document.createElement('h3');
    title.textContent = call.name;
    top.append(title);
    const badge = presenceBadge(call);
    if (badge) {
      const status = document.createElement('span');
      status.className = `call-status call-status--${badge.modifier}`;
      status.textContent = badge.label;
      top.append(status);
    }
    card.append(top);

    const meta = document.createElement('p');
    meta.className = 'call-card__meta';
    meta.textContent = call.lastCallAt ? `Последний звонок ${formatDate(call.lastCallAt)}` : 'Звонков ещё не было';
    card.append(meta);

    const room = `/video-calls/${encodeURIComponent(call.id)}`;
    const actions = document.createElement('div');
    actions.className = 'call-card__actions';
    actions.append(
      link('Войти в комнату', 'call-card__join', room),
      button('Скопировать ссылку', 'call-card__copy', () => copyInvite(call)),
      link('Чат', 'call-card__chat', `${room}?chat=1`),
      button('Удалить', 'call-card__delete', trigger => deleteCall(call, trigger)),
    );
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
      state.calls = (await request('/api/video-calls')).calls;
    } catch (error) {
      state.error = error.message || 'Не удалось загрузить комнаты.';
    } finally {
      state.loading = false;
      render();
    }
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.hidden = !message;
  }

  function lockForm(locked) {
    form.querySelectorAll('button, input').forEach(element => { element.disabled = locked; });
  }

  function openCreateDialog() {
    form.reset();
    showFormError('');
    dialog.showModal();
  }

  async function createCall(event) {
    event.preventDefault();
    showFormError('');
    lockForm(true);
    try {
      const { call } = await request('/api/video-calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.elements.name.value }),
      });
      changedAt = Date.now();
      state.calls.unshift(call);
      render();
      lockForm(false);
      dialog.close();
      try {
        await copyText(inviteUrl(call));
        window.AppShell.showToast('Комната создана, ссылка для ученика скопирована.');
      } catch (_error) {
        window.AppShell.showToast('Комната создана. Скопируйте ссылку на карточке комнаты.');
      }
    } catch (error) {
      lockForm(false);
      showFormError(error.message || 'Не удалось создать комнату.');
      form.elements.name.focus();
    }
  }

  // The shell polls the rooms on every page of the cabinet; here the same data refreshes the cards.
  document.addEventListener('video-calls:update', event => {
    const { calls, requestedAt } = event.detail;
    if (state.loading || requestedAt < changedAt) return;
    if (!state.error && JSON.stringify(calls) === JSON.stringify(state.calls)) return;
    state.calls = calls;
    state.error = '';
    render();
  });

  createButton.addEventListener('click', openCreateDialog);
  form.addEventListener('submit', createCall);
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (form.elements.name.disabled) event.preventDefault(); });
  document.getElementById('calls-retry').addEventListener('click', loadCalls);
  loadCalls();
})();
