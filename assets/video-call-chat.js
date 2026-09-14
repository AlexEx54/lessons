(() => {
  'use strict';
  let endpoint, role, call, lastId = 0, syncing = false, again = false, unread = 0, busy = false;
  let selected = [], attempt = null;
  const seen = new Set();
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'chat-toggle'; toggle.textContent = 'Чат'; toggle.hidden = true;
  toggle.setAttribute('aria-controls', 'call-chat'); toggle.setAttribute('aria-expanded', 'false');
  document.querySelector('.room-header').append(toggle);
  const panel = document.createElement('aside');
  panel.id = 'call-chat'; panel.className = 'call-chat'; panel.hidden = true;
  panel.setAttribute('aria-label', 'Чат звонка');
  panel.innerHTML = `<div class="chat-heading"><strong>Чат звонка</strong><button type="button" class="chat-close" aria-label="Закрыть чат">×</button></div>
    <p class="chat-info">Переписка и файлы сохраняются после звонка.</p>
    <div class="chat-messages" role="log" aria-label="Сообщения"><p class="chat-empty">Здесь будут сообщения и файлы занятия.</p></div>
    <p class="chat-error" role="status"></p><button class="chat-refresh" type="button" hidden>Повторить загрузку</button>
    <form class="chat-form"><textarea aria-label="Сообщение" placeholder="Написать сообщение…" maxlength="10000" rows="3"></textarea>
    <div class="chat-files"></div><div class="chat-actions"><button type="button" class="chat-attach">Прикрепить</button><span>25 МБ · до 5 файлов</span><button type="submit">Отправить</button></div>
    <input type="file" multiple hidden /></form><p class="chat-readonly" hidden>Звонок завершён. Можно читать чат и скачивать файлы.</p>`;
  document.body.append(panel);
  const $ = selector => panel.querySelector(selector);
  const log = $('.chat-messages'), form = $('.chat-form'), input = $('textarea'), picker = $('input');
  function open() { panel.hidden = false; toggle.setAttribute('aria-expanded', 'true'); document.body.classList.add('chat-open'); unread = 0; toggle.textContent = 'Чат'; log.scrollTop = log.scrollHeight; }
  function close() { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); document.body.classList.remove('chat-open'); toggle.focus(); }
  toggle.addEventListener('click', () => panel.hidden ? open() : close());
  $('.chat-close').addEventListener('click', close);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  function status(updated) {
    call = updated;
    const ended = !['waiting', 'active'].includes(call.status);
    form.hidden = ended; $('.chat-readonly').hidden = !ended;
  }
  function receive(message, historical = false) {
    if (seen.has(message.id)) return;
    seen.add(message.id);
    $('.chat-empty')?.remove();
    const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 100;
    const item = document.createElement('article'); item.className = 'chat-message'; item.dataset.id = message.id;
    item.classList.toggle('chat-message--own', message.role === role);
    const meta = document.createElement('p'); meta.className = 'chat-meta';
    meta.textContent = `${message.name} · ${new Date(message.createdAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
    item.append(meta);
    if (message.text) {
      const text = document.createElement('p'); text.className = 'chat-text';
      window.CallChatLinks.appendLinkedText(text, message.text);
      item.append(text);
    }
    for (const file of message.attachments) {
      const url = `${endpoint}/attachments/${encodeURIComponent(file.id)}`;
      if (file.mime.startsWith('image/')) {
        const link = document.createElement('a'); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
        const image = document.createElement('img'); image.src = url; image.alt = file.name; image.loading = 'lazy';
        image.addEventListener('load', () => { if (nearBottom) log.scrollTop = log.scrollHeight; });
        link.append(image); item.append(link);
      }
      const link = document.createElement('a'); link.className = 'chat-file'; link.href = `${url}?download=1`;
      const size = file.size < 1024 ? `${file.size} Б` : file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} КБ` : `${(file.size / 1024 / 1024).toFixed(1)} МБ`;
      link.textContent = `↓ ${file.name} · ${size}`; item.append(link);
    }
    const next = [...log.children].find(child => Number(child.dataset.id) > message.id);
    log.insertBefore(item, next || null);
    if (nearBottom) log.scrollTop = log.scrollHeight;
    if (!historical && panel.hidden && message.role !== role) { unread++; toggle.textContent = `Чат (${unread})`; }
    // Only history responses advance the cursor: socket events can overtake older messages.
  }
  async function request(url, options) {
    const response = await fetch(url, options);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(result.error || 'Не удалось связаться с сервером.'), { status: response.status });
    return result;
  }
  async function sync() {
    if (!endpoint) return;
    if (syncing) { again = true; return; }
    syncing = true;
    try {
      let more; const historical = lastId === 0;
      do {
        const result = await request(`${endpoint}?after=${lastId}`);
        status(result.call);
        result.messages.forEach(message => { receive(message, historical); lastId = Math.max(lastId, message.id); });
        more = result.hasMore;
      } while (more);
      if (!$('.chat-refresh').hidden) { $('.chat-error').textContent = ''; $('.chat-refresh').hidden = true; }
    } catch (error) { $('.chat-error').textContent = error.message; $('.chat-refresh').hidden = false; }
    finally { syncing = false; if (again) { again = false; sync(); } }
  }
  $('.chat-refresh').addEventListener('click', sync);
  function renderFiles() {
    $('.chat-files').replaceChildren(...selected.map((file, index) => {
      const button = document.createElement('button'); button.type = 'button'; button.disabled = busy || Boolean(attempt);
      button.textContent = `${file.name} ×`; button.setAttribute('aria-label', `Убрать ${file.name}`);
      button.addEventListener('click', () => { selected.splice(index, 1); renderFiles(); }); return button;
    }));
  }
  function addFiles(files) {
    if (busy || attempt) return;
    const incoming = [...files];
    if (selected.length + incoming.length > 5) { $('.chat-error').textContent = 'Можно прикрепить до 5 файлов.'; return; }
    if (incoming.some(file => file.size === 0 || file.size > 25 * 1024 * 1024)) { $('.chat-error').textContent = 'Каждый файл должен быть не пустым и не больше 25 МБ.'; return; }
    selected.push(...incoming); $('.chat-error').textContent = ''; renderFiles();
  }
  $('.chat-attach').addEventListener('click', () => picker.click());
  picker.addEventListener('change', () => { addFiles(picker.files); picker.value = ''; });
  panel.addEventListener('dragover', event => { event.preventDefault(); });
  panel.addEventListener('drop', event => { event.preventDefault(); if (!form.hidden) addFiles(event.dataTransfer.files); });
  input.addEventListener('paste', event => { if (event.clipboardData.files.length) { event.preventDefault(); addFiles(event.clipboardData.files); } });
  input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || form.hidden || (!input.value.trim() && !selected.length && !attempt)) return;
    busy = true;
    if (!attempt) attempt = { clientId: crypto.randomUUID(), text: input.value, attachments: [], name: document.getElementById('participant-name').value };
    input.disabled = true; $('.chat-attach').disabled = true; $('button[type="submit"]').disabled = true; renderFiles();
    try {
      for (let i = attempt.attachments.length; i < selected.length; i++) {
        $('.chat-error').textContent = `Загрузка файла ${i + 1} из ${selected.length}…`;
        const attachment = await request(`${endpoint}/attachments?name=${encodeURIComponent(selected[i].name)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: selected[i],
        });
        attempt.attachments.push(attachment.id);
      }
      $('.chat-error').textContent = 'Отправляем…';
      const result = await request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) });
      receive(result.message); selected = []; attempt = null; input.value = ''; $('.chat-error').textContent = ''; sync();
    } catch (error) {
      if (error.status >= 400 && error.status < 500 && error.status !== 429) {
        // A definitive rejection is safe to edit; uncertain delivery keeps the same clientId.
        for (const id of attempt.attachments) {
          await request(`${endpoint}/attachments/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
        }
        attempt = null;
        $('.chat-error').textContent = error.message;
        sync();
      } else $('.chat-error').textContent = `${error.message} Нажмите «Повторить отправку», чтобы повторить без дублирования.`;
    } finally {
      busy = false; input.disabled = Boolean(attempt); $('.chat-attach').disabled = Boolean(attempt);
      $('button[type="submit"]').disabled = false; $('button[type="submit"]').textContent = attempt ? 'Повторить отправку' : 'Отправить'; renderFiles();
    }
  });
  window.CallChat = { open, receive, sync, init(options) {
    role = options.role; status(options.call);
    endpoint = `/api/${role === 'guest' ? 'public/' : ''}video-calls/${encodeURIComponent(options.reference)}/chat`;
    toggle.hidden = false; sync();
    // Also catches updates before joining video and a missed final socket event.
    setInterval(() => { if (!document.hidden && ['waiting', 'active'].includes(call.status)) sync(); }, 5000);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  } };
})();
