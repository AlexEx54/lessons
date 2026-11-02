(() => {
  'use strict';
  // The messages, files and composer of a call chat, rendered into a container the page owns.
  // `params` go on every request (a session chat needs its role); `name()` introduces a sender the server cannot name.
  // The page decides when to sync and tells the chat whether it is visible, which drives `onUnread(count)`.
  function create({ container, endpoint, role, params = {}, name, onUnread = () => {} }) {
    let lastId = 0, syncing = false, again = false, unread = 0, busy = false, visible = false;
    let selected = [], attempt = null;
    const seen = new Set();
    const template = document.createElement('template');
    template.innerHTML = `<div class="chat-messages" role="log" aria-label="Сообщения"><p class="chat-empty">Здесь будут сообщения и файлы занятия.</p></div>
      <p class="chat-error" role="status"></p><button class="chat-refresh" type="button" hidden>Повторить загрузку</button>
      <form class="chat-form"><textarea aria-label="Сообщение" placeholder="Написать сообщение…" maxlength="10000" rows="3"></textarea>
      <div class="chat-files"></div><div class="chat-actions"><button type="button" class="chat-attach">Прикрепить</button><span>25 МБ · до 5 файлов</span><button type="submit">Отправить</button></div>
      <input type="file" multiple hidden /></form>`;
    const $ = selector => template.content.querySelector(selector);
    const log = $('.chat-messages'), status = $('.chat-error'), refresh = $('.chat-refresh'), form = $('.chat-form');
    const input = $('textarea'), files = $('.chat-files'), attach = $('.chat-attach'), submit = $('button[type="submit"]'), picker = $('input');
    container.append(template.content);
    function url(path = '', extra = {}) {
      const query = new URLSearchParams({ ...params, ...extra }).toString();
      return `${endpoint}${path}${query ? `?${query}` : ''}`;
    }
    function setVisible(value) {
      visible = value;
      if (!visible) return;
      unread = 0; onUnread(0);
      log.scrollTop = log.scrollHeight;
    }
    function receive(message, historical = false) {
      if (seen.has(message.id)) return;
      seen.add(message.id);
      log.querySelector('.chat-empty')?.remove();
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
        const path = `/attachments/${encodeURIComponent(file.id)}`;
        if (file.mime.startsWith('image/')) {
          const link = document.createElement('a'); link.href = url(path); link.target = '_blank'; link.rel = 'noopener noreferrer';
          const image = document.createElement('img'); image.src = url(path); image.alt = file.name; image.loading = 'lazy';
          image.addEventListener('load', () => { if (nearBottom) log.scrollTop = log.scrollHeight; });
          link.append(image); item.append(link);
        }
        const link = document.createElement('a'); link.className = 'chat-file'; link.href = url(path, { download: 1 });
        const size = file.size < 1024 ? `${file.size} Б` : file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} КБ` : `${(file.size / 1024 / 1024).toFixed(1)} МБ`;
        link.textContent = `↓ ${file.name} · ${size}`; item.append(link);
      }
      const next = [...log.children].find(child => Number(child.dataset.id) > message.id);
      log.insertBefore(item, next || null);
      if (nearBottom) log.scrollTop = log.scrollHeight;
      if (!historical && !visible && message.role !== role) onUnread(++unread);
      // Only history responses advance the cursor: socket events can overtake older messages.
    }
    async function request(target, options) {
      const response = await fetch(target, options);
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(result.error || 'Не удалось связаться с сервером.'), { status: response.status });
      return result;
    }
    async function sync() {
      if (syncing) { again = true; return; }
      syncing = true;
      try {
        let more; const historical = lastId === 0;
        do {
          const result = await request(url('', { after: lastId }));
          result.messages.forEach(message => { receive(message, historical); lastId = Math.max(lastId, message.id); });
          more = result.hasMore;
        } while (more);
        if (!refresh.hidden) { status.textContent = ''; refresh.hidden = true; }
      } catch (error) { status.textContent = error.message; refresh.hidden = false; }
      finally { syncing = false; if (again) { again = false; sync(); } }
    }
    refresh.addEventListener('click', sync);
    function renderFiles() {
      files.replaceChildren(...selected.map((file, index) => {
        const button = document.createElement('button'); button.type = 'button'; button.disabled = busy || Boolean(attempt);
        button.textContent = `${file.name} ×`; button.setAttribute('aria-label', `Убрать ${file.name}`);
        button.addEventListener('click', () => { selected.splice(index, 1); renderFiles(); }); return button;
      }));
    }
    function addFiles(list) {
      if (busy || attempt) return;
      const incoming = [...list];
      if (selected.length + incoming.length > 5) { status.textContent = 'Можно прикрепить до 5 файлов.'; return; }
      if (incoming.some(file => file.size === 0 || file.size > 25 * 1024 * 1024)) { status.textContent = 'Каждый файл должен быть не пустым и не больше 25 МБ.'; return; }
      selected.push(...incoming); status.textContent = ''; renderFiles();
    }
    attach.addEventListener('click', () => picker.click());
    picker.addEventListener('change', () => { addFiles(picker.files); picker.value = ''; });
    container.addEventListener('dragover', event => { event.preventDefault(); });
    container.addEventListener('drop', event => { event.preventDefault(); addFiles(event.dataTransfer.files); });
    input.addEventListener('paste', event => { if (event.clipboardData.files.length) { event.preventDefault(); addFiles(event.clipboardData.files); } });
    input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); } });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (busy || (!input.value.trim() && !selected.length && !attempt)) return;
      busy = true;
      if (!attempt) attempt = { clientId: crypto.randomUUID(), text: input.value, attachments: [], ...(name ? { name: name() } : {}) };
      input.disabled = true; attach.disabled = true; submit.disabled = true; renderFiles();
      try {
        for (let i = attempt.attachments.length; i < selected.length; i++) {
          status.textContent = `Загрузка файла ${i + 1} из ${selected.length}…`;
          const attachment = await request(url('/attachments', { name: selected[i].name }), {
            method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: selected[i],
          });
          attempt.attachments.push(attachment.id);
        }
        status.textContent = 'Отправляем…';
        const result = await request(url(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt) });
        receive(result.message); selected = []; attempt = null; input.value = ''; status.textContent = ''; sync();
      } catch (error) {
        if (error.status >= 400 && error.status < 500 && error.status !== 429) {
          // A definitive rejection is safe to edit; uncertain delivery keeps the same clientId.
          for (const id of attempt.attachments) {
            await request(url(`/attachments/${encodeURIComponent(id)}`), { method: 'DELETE' }).catch(() => {});
          }
          attempt = null;
          status.textContent = error.message;
          sync();
        } else status.textContent = `${error.message} Нажмите «Повторить отправку», чтобы повторить без дублирования.`;
      } finally {
        busy = false; input.disabled = Boolean(attempt); attach.disabled = Boolean(attempt);
        submit.disabled = false; submit.textContent = attempt ? 'Повторить отправку' : 'Отправить'; renderFiles();
      }
    });
    return { receive, sync, setVisible };
  }
  window.CallChat = { create };
})();
