(() => {
  'use strict';

  // While the window is open a reply should show up without reloading; closed, nothing is polled.
  const POLL_MS = 10_000;
  const MAX_TEXTAREA_HEIGHT = 132;
  const chat = document.getElementById('support-chat');
  const openers = [...document.querySelectorAll('[data-support-chat-open]')];
  if (!chat || !openers.length) return;
  const scroller = chat.querySelector('[data-support-chat-scroll]');
  const list = chat.querySelector('[data-support-chat-messages]');
  const form = chat.querySelector('[data-support-chat-form]');
  const input = form.elements.text;
  const closeButton = chat.querySelector('[data-support-chat-close]');
  const mobileMedia = window.matchMedia('(max-width: 860px)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  // Message items by clientId, so a polled copy of a message sent from this tab is not drawn twice.
  const items = new Map();
  let lastId = 0;
  let loaded = false;
  let pollTimer = null;
  let lastOpener = null;

  function formatTime(iso) {
    const date = new Date(iso);
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === new Date().toDateString()) return time;
    return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
  }

  function isNearBottom() {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
  }

  function scrollToBottom() {
    scroller.scrollTop = scroller.scrollHeight;
  }

  function messageItem(sender, text) {
    const item = document.createElement('li');
    item.className = `support-message support-message--${sender}`;
    const body = document.createElement('p');
    body.textContent = text;
    const meta = document.createElement('small');
    meta.className = 'support-message__meta';
    item.append(body, meta);
    return item;
  }

  function isUnsent(item) {
    return item.classList.contains('support-message--pending') || item.classList.contains('support-message--failed');
  }

  // Saved messages stand in id order, so one polled after a later send still lands above it;
  // unsent ones stay at the bottom.
  function place(item, id) {
    item.dataset.id = id;
    const next = [...list.children].find(other => other !== item && (Number(other.dataset.id) > id || isUnsent(other)));
    list.insertBefore(item, next ?? null);
  }

  function showSaved(item, message) {
    item.classList.remove('support-message--pending', 'support-message--failed');
    place(item, message.id);
    const meta = item.querySelector('.support-message__meta');
    const time = document.createElement('time');
    time.dateTime = message.createdAt;
    time.textContent = formatTime(message.createdAt);
    meta.replaceChildren(time);
  }

  // Only loaded history moves the cursor: a sent message's id may be ahead of ones not polled yet.
  function addMessages(messages) {
    const stickToBottom = isNearBottom();
    for (const message of messages) {
      lastId = Math.max(lastId, message.id);
      let item = items.get(message.clientId);
      if (!item) {
        item = messageItem(message.sender, message.text);
        items.set(message.clientId, item);
      }
      showSaved(item, message);
    }
    if (stickToBottom) scrollToBottom();
  }

  async function poll() {
    if (document.hidden) return;
    try {
      const response = await fetch(`/api/support/messages?after=${lastId}`);
      if (!response.ok) return;
      const { messages } = await response.json();
      loaded = true;
      addMessages(messages);
    } catch (_error) {
      // The next poll catches up.
    }
  }

  async function send(item, clientId, text) {
    item.classList.remove('support-message--failed');
    item.classList.add('support-message--pending');
    item.querySelector('.support-message__meta').textContent = 'Отправляется…';
    let error = 'Не удалось отправить.';
    try {
      const response = await fetch('/api/support/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, text }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        showSaved(item, payload.message);
        return;
      }
      if (payload.error) error = payload.error;
    } catch (_error) {
      error = 'Нет связи с сервером.';
    }
    showFailed(item, clientId, text, error);
  }

  function showFailed(item, clientId, text, error) {
    item.classList.remove('support-message--pending');
    item.classList.add('support-message--failed');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Повторить';
    // The same clientId lets the server drop the copy if the first attempt did arrive.
    retry.addEventListener('click', () => send(item, clientId, text));
    item.querySelector('.support-message__meta').replaceChildren(`${error} `, retry);
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  function submit() {
    const text = input.value.trim();
    if (!text) return;
    const clientId = crypto.randomUUID();
    const item = messageItem('teacher', text);
    items.set(clientId, item);
    list.append(item);
    scrollToBottom();
    input.value = '';
    resizeInput();
    input.focus();
    send(item, clientId, text);
  }

  function isOpen() {
    return !chat.hidden;
  }

  function setExpanded(open) {
    openers.forEach(opener => opener.setAttribute('aria-expanded', String(open)));
  }

  function open(opener) {
    lastOpener = opener;
    window.AppShell.closeHeaderMenus();
    window.AppShell.closeNavigation({ restoreFocus: false });
    chat.hidden = false;
    document.body.classList.add('support-chat-open');
    setExpanded(true);
    if (!loaded) poll().then(scrollToBottom);
    else poll();
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(poll, POLL_MS);
    scrollToBottom();
    // A phone keyboard would cover half the thread, so only desktop jumps straight into typing.
    if (!coarsePointer.matches) input.focus();
    else closeButton.focus();
  }

  function close() {
    chat.hidden = true;
    document.body.classList.remove('support-chat-open');
    setExpanded(false);
    window.clearInterval(pollTimer);
    pollTimer = null;
    // On a phone the card sits in the closed navigation drawer, which cannot take focus.
    if (lastOpener && !mobileMedia.matches) lastOpener.focus();
  }

  openers.forEach(opener => opener.addEventListener('click', () => {
    if (isOpen()) close();
    else open(opener);
  }));
  closeButton.addEventListener('click', close);
  form.addEventListener('submit', event => {
    event.preventDefault();
    submit();
  });
  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', event => {
    // On a phone Enter is the only way to start a new line, so sending stays on the button there.
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing || coarsePointer.matches) return;
    event.preventDefault();
    submit();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.defaultPrevented || !isOpen()) return;
    event.preventDefault();
    close();
  });
  document.addEventListener('visibilitychange', () => {
    if (isOpen()) poll();
  });

  if (document.body.dataset.userRole === 'admin') {
    // Admins answer from the support inbox, which arrives in the next step; until then the
    // notification only tells them a question is waiting.
    window.Notifications?.register('support_question', payload => ({
      title: 'Вопрос в поддержку',
      text: `${payload.teacherName}: ${payload.preview}`,
      open() {},
    }));
  }
})();
