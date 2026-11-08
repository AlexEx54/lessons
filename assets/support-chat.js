(() => {
  'use strict';

  // While the window is open a reply should show up without reloading; closed, nothing is polled.
  const POLL_MS = 10_000;
  const MAX_TEXTAREA_HEIGHT = 132;
  const chat = document.getElementById('support-chat');
  const openers = [...document.querySelectorAll('[data-support-chat-open]')];
  if (!chat || !openers.length) return;
  const isAdmin = document.body.dataset.userRole === 'admin';
  // Admins write for support; everyone else writes as a teacher.
  const ownSender = isAdmin ? 'support' : 'teacher';
  const scroller = chat.querySelector('[data-support-chat-scroll]');
  const list = chat.querySelector('[data-support-chat-messages]');
  const threadList = chat.querySelector('[data-support-chat-threads]');
  const threadsEmpty = chat.querySelector('[data-support-chat-threads-empty]');
  const title = chat.querySelector('[data-support-chat-title]');
  const subtitle = chat.querySelector('[data-support-chat-subtitle]');
  const mark = chat.querySelector('[data-support-chat-mark]');
  const form = chat.querySelector('[data-support-chat-form]');
  const input = form.elements.text;
  const backButton = chat.querySelector('[data-support-chat-back]');
  const closeButton = chat.querySelector('[data-support-chat-close]');
  const mobileMedia = window.matchMedia('(max-width: 860px)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  // What the window shows: a teacher always has their own thread; an admin starts at the inbox and
  // opens one teacher's thread from it. A response for a view the admin has left is dropped.
  let view = null;
  let pollTimer = null;
  let lastOpener = null;

  // `threadKey` is the notification subject of the thread, as threadKey() in lib/support-store.js.
  function threadView(url, threadKey) {
    // Message items by clientId, so a polled copy of a message sent from this tab is not drawn twice.
    return { kind: 'thread', url, threadKey, items: new Map(), lastId: 0, loaded: false };
  }

  const teacherThread = isAdmin ? null : threadView('/api/support/messages', chat.dataset.threadKey);

  function formatTime(iso) {
    const date = new Date(iso);
    const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === new Date().toDateString()) return time;
    return `${date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${time}`;
  }

  function timeElement(iso) {
    const time = document.createElement('time');
    time.dateTime = iso;
    time.textContent = formatTime(iso);
    return time;
  }

  function isNearBottom() {
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 48;
  }

  function scrollToBottom() {
    scroller.scrollTop = scroller.scrollHeight;
  }

  function messageItem(sender, text) {
    const item = document.createElement('li');
    item.className = `support-message support-message--${sender === ownSender ? 'own' : 'other'}`;
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
    item.querySelector('.support-message__meta').replaceChildren(timeElement(message.createdAt));
  }

  // Only loaded history moves the cursor: a sent message's id may be ahead of ones not polled yet.
  function addMessages(thread, messages) {
    const stickToBottom = !thread.loaded || isNearBottom();
    let heard = false;
    for (const message of messages) {
      thread.lastId = Math.max(thread.lastId, message.id);
      let item = thread.items.get(message.clientId);
      if (!item) {
        item = messageItem(message.sender, message.text);
        thread.items.set(message.clientId, item);
      }
      showSaved(item, message);
      if (message.sender !== ownSender) heard = true;
    }
    thread.loaded = true;
    if (stickToBottom) scrollToBottom();
    // What was read in the open window no longer needs the bell.
    if (heard) window.Notifications?.markRead(thread.threadKey);
  }

  function threadItem(thread) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'support-thread';
    const name = document.createElement('strong');
    name.textContent = thread.teacherName;
    const preview = document.createElement('span');
    preview.textContent = thread.preview;
    button.append(name, timeElement(thread.lastAt), preview);
    if (thread.waiting) {
      const badge = document.createElement('small');
      badge.className = 'support-thread__badge';
      badge.textContent = 'Ждёт ответа';
      button.append(badge);
    }
    button.addEventListener('click', () => showThread(thread.teacherId, thread.teacherName));
    item.append(button);
    return item;
  }

  function renderThreads(threads) {
    threadList.replaceChildren(...threads.map(threadItem));
    threadsEmpty.hidden = threads.length > 0;
  }

  async function refresh() {
    const current = view;
    if (document.hidden || !current) return;
    try {
      const url = current.kind === 'thread' ? `${current.url}?after=${current.lastId}` : current.url;
      const response = await fetch(url);
      if (!response.ok) return;
      const payload = await response.json();
      if (current !== view) return;
      if (current.kind === 'inbox') renderThreads(payload.threads);
      else addMessages(current, payload.messages);
    } catch (_error) {
      // The next poll catches up.
    }
  }

  function show(next) {
    view = next;
    window.clearInterval(pollTimer);
    pollTimer = window.setInterval(refresh, POLL_MS);
    refresh();
  }

  function setChrome({ heading, note, inbox }) {
    title.textContent = heading;
    subtitle.textContent = note;
    mark.hidden = !inbox;
    backButton.hidden = inbox;
    list.hidden = inbox;
    threadList.hidden = !inbox;
    threadsEmpty.hidden = true;
    form.hidden = inbox;
  }

  function showInbox() {
    setChrome({ heading: 'Обращения', note: 'Вопросы преподавателей в поддержку', inbox: true });
    threadList.replaceChildren();
    show({ kind: 'inbox', url: '/api/support/threads' });
    closeButton.focus();
  }

  function showThread(teacherId, teacherName) {
    setChrome({ heading: teacherName, note: 'Вы отвечаете от имени поддержки EasyClass', inbox: false });
    list.replaceChildren();
    show(threadView(`/api/support/threads/${teacherId}/messages`, `support:${teacherId}`));
    // A phone keyboard would cover half the thread, so only desktop jumps straight into typing.
    if (!coarsePointer.matches) input.focus();
    else backButton.focus();
  }

  async function send(thread, item, clientId, text) {
    item.classList.remove('support-message--failed');
    item.classList.add('support-message--pending');
    item.querySelector('.support-message__meta').textContent = 'Отправляется…';
    let error = 'Не удалось отправить.';
    try {
      const response = await fetch(thread.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, text }),
      });
      const payload = await response.json().catch(() => ({}));
      // The admin opened another thread meanwhile; this one shows the message when opened again.
      if (thread !== view) return;
      if (response.ok) {
        showSaved(item, payload.message);
        return;
      }
      if (payload.error) error = payload.error;
    } catch (_error) {
      error = 'Нет связи с сервером.';
    }
    if (thread === view) showFailed(thread, item, clientId, text, error);
  }

  function showFailed(thread, item, clientId, text, error) {
    item.classList.remove('support-message--pending');
    item.classList.add('support-message--failed');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Повторить';
    // The same clientId lets the server drop the copy if the first attempt did arrive.
    retry.addEventListener('click', () => send(thread, item, clientId, text));
    item.querySelector('.support-message__meta').replaceChildren(`${error} `, retry);
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }

  function submit() {
    const text = input.value.trim();
    if (!text || view?.kind !== 'thread') return;
    const clientId = crypto.randomUUID();
    const item = messageItem(ownSender, text);
    view.items.set(clientId, item);
    list.append(item);
    scrollToBottom();
    input.value = '';
    resizeInput();
    input.focus();
    send(view, item, clientId, text);
  }

  function isOpen() {
    return !chat.hidden;
  }

  function setExpanded(open) {
    openers.forEach(opener => opener.setAttribute('aria-expanded', String(open)));
  }

  // `showContent` puts the first view in place: the teacher's thread, or for an admin the inbox or
  // the thread a notification points at.
  function open(opener, showContent) {
    lastOpener = opener;
    window.AppShell.closeHeaderMenus();
    window.AppShell.closeNavigation({ restoreFocus: false });
    chat.hidden = false;
    document.body.classList.add('support-chat-open');
    setExpanded(true);
    showContent();
  }

  function openTeacherThread() {
    show(teacherThread);
    scrollToBottom();
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
    else open(opener, isAdmin ? showInbox : openTeacherThread);
  }));
  backButton.addEventListener('click', showInbox);
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
    if (isOpen()) refresh();
  });

  if (isAdmin) {
    // Admins read the window as an inbox: no greeting to themselves, no links to write elsewhere.
    chat.querySelector('[data-support-chat-welcome]').remove();
    chat.querySelector('[data-support-chat-footer]').hidden = true;
    window.Notifications?.register('support_question', payload => ({
      title: 'Вопрос в поддержку',
      text: `${payload.teacherName}: ${payload.preview}`,
      open: () => open(null, () => showThread(payload.teacherId, payload.teacherName)),
    }));
  } else {
    window.Notifications?.register('support_reply', payload => ({
      title: 'Ответ поддержки',
      text: payload.preview,
      open() {
        if (!isOpen()) open(null, openTeacherThread);
      },
    }));
  }
})();
