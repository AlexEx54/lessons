(() => {
  'use strict';
  // The room's chat window: a header toggle and a side panel around the shared call chat.
  let chat;
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'chat-toggle'; toggle.textContent = 'Чат'; toggle.hidden = true;
  toggle.setAttribute('aria-controls', 'call-chat'); toggle.setAttribute('aria-expanded', 'false');
  document.querySelector('.room-header').append(toggle);
  const panel = document.createElement('aside');
  panel.id = 'call-chat'; panel.className = 'call-chat'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Чат звонка');
  panel.innerHTML = `<div class="chat-heading"><strong>Чат звонка</strong><button type="button" class="chat-close" aria-label="Закрыть чат">×</button></div>
    <p class="chat-info">Переписка и файлы хранятся в комнате и доступны между звонками.</p>`;
  document.body.append(panel);
  function open() { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); document.body.classList.add('chat-open'); chat?.setVisible(true); }
  function close() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); document.body.classList.remove('chat-open'); chat?.setVisible(false); toggle.focus(); }
  toggle.addEventListener('click', () => panel.hidden ? open() : close());
  panel.querySelector('.chat-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  const sync = () => chat?.sync();
  window.RoomChat = { open, sync, receive: message => chat?.receive(message), init({ role, reference }) {
    chat = window.CallChat.create({
      container: panel, role,
      endpoint: `/api/${role === 'guest' ? 'public/' : ''}video-calls/${encodeURIComponent(reference)}/chat`,
      name: () => document.getElementById('participant-name').value,
      onUnread: count => { toggle.textContent = count ? `Чат (${count})` : 'Чат'; },
    });
    chat.setVisible(!panel.hidden);
    toggle.hidden = false; sync();
    // Also catches messages outside a call, when there is no socket to deliver them.
    setInterval(() => { if (!document.hidden) sync(); }, 5000);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  } };
})();
