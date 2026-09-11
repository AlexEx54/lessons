import { Editor, Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { linkNotesTransaction } from '../../lib/lesson-notes-links.js';
const NotesLinks = Extension.create({
  name: 'notesLinks',
  addProseMirrorPlugins() {
    return [new Plugin({
      appendTransaction: (transactions, _old, state) => transactions.some(tr => tr.docChanged || tr.getMeta('notesLinksInit')) ? linkNotesTransaction(state) : null,
    })];
  },
  onCreate() { this.editor.view.dispatch(this.editor.state.tr.setMeta('notesLinksInit', true)); },
});
import Collaboration from '@tiptap/extension-collaboration';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import { StarterKit } from '@tiptap/starter-kit';
import { Highlight } from '@tiptap/extension-highlight';
import { starterOptions, isNotesLink } from '../../lib/lesson-notes-config.js';
const notesExtensions = () => [StarterKit.configure(starterOptions), Highlight, NotesLinks];
import { EMPTY_NOTES, validateNotes } from '../../lib/lesson-notes-schema.js';

const encode = value => {
  let text = '';
  for (let i = 0; i < value.length; i += 8192) text += String.fromCharCode(...value.subarray(i, i + 8192));
  return btoa(text);
};
const decode = value => Uint8Array.from(atob(value), character => character.charCodeAt(0));
let mounted = false;
window.LessonNotes = { mount, isDirty: () => false, flush: async () => {} };
function mount(options) {
  if (mounted) return;
  mounted = true;
  const aside = document.getElementById('lesson-plan');
  const plan = document.getElementById('lesson-stages');
  const heading = aside.querySelector('.lesson-plan__heading');
  heading.querySelector('strong').hidden = true;
  heading.classList.add('notes-heading');
  const tabs = document.createElement('div');
  tabs.className = 'notes-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'Материалы урока');
  tabs.innerHTML = '<button type="button" role="tab" id="plan-tab" aria-controls="lesson-stages" aria-selected="true">План урока</button><button type="button" role="tab" id="notes-tab" aria-controls="lesson-notes" aria-selected="false" tabindex="-1">Заметки</button>';
  heading.prepend(tabs);
  const panel = document.createElement('section');
  panel.id = 'lesson-notes';
  panel.className = 'lesson-notes';
  panel.hidden = true;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'notes-tab');
  panel.innerHTML = '<div class="notes-status" role="status" aria-live="polite">Загружаем заметки…</div><div class="notes-presence" hidden></div><div class="notes-toolbar" role="toolbar" aria-label="Форматирование заметок"></div><div class="notes-editor"></div><p class="notes-hint"></p><button type="button" class="notes-retry" hidden>Повторить сохранение</button>';
  plan.setAttribute('role', 'tabpanel');
  plan.setAttribute('aria-labelledby', 'plan-tab');
  aside.append(panel);
  const buttons = [...tabs.children];
  const select = index => {
    buttons.forEach((button, i) => { button.setAttribute('aria-selected', String(index === i)); button.tabIndex = index === i ? 0 : -1; });
    plan.hidden = index === 1;
    panel.hidden = index === 0;
    document.getElementById('hide-plan').hidden = index === 1;
  };
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - index;
        select(next); buttons[next].focus();
      }
    });
  });
  const label = panel.querySelector('.notes-status');
  const hint = panel.querySelector('.notes-hint');
  const retry = panel.querySelector('.notes-retry');
  const status = (text, state = '') => { label.textContent = text; label.dataset.state = state; };
  let editor, dirty = false, disposed = false;
  window.LessonNotes.isDirty = () => dirty;
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  function createEditor(content, doc, editable, onUpdate) {
    editor = new Editor({
      element: panel.querySelector('.notes-editor'),
      extensions: [...notesExtensions(), ...(doc ? [Collaboration.configure({ document: doc, field: 'notes' })] : [])],
      ...(doc ? {} : { content }),
      editable,
      editorProps: { attributes: { 'aria-label': 'Заметки к уроку', role: 'textbox', 'aria-multiline': 'true', title: 'Открыть ссылку: Cmd/Ctrl + клик', 'data-placeholder': 'Запишите слова, вопросы или важные мысли…' } },
      onUpdate: () => onUpdate?.(),
      onTransaction: () => queueMicrotask(refreshToolbar),
    });
    const toolbar = panel.querySelector('.notes-toolbar');
    const actions = [
      ['bold', '<path d="M7 4h6a4 4 0 0 1 0 8H7zm0 8h7a4 4 0 0 1 0 8H7z"/>', 'Жирный', 'toggleBold'],
      ['italic', '<path d="M10 4h9M5 20h9M15 4 9 20"/>', 'Курсив', 'toggleItalic'],
      ['bulletList', '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>', 'Маркированный список', 'toggleBulletList'],
      ['highlight', '<path d="m9 11 7-7 4 4-7 7zM9 11l-3 3 4 4 3-3M6 14l-2 6 6-2"/><path class="notes-marker-color" d="M3 22h18"/>', 'Выделить цветом', 'toggleHighlight'],
    ];
    for (const [name, icon, title, command] of actions) {
      const button = document.createElement('button');
      button.type = 'button'; button.title = title;
      button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icon}</svg>`;
      button.setAttribute('aria-label', title); button.dataset.mark = name;
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => editor.chain().focus()[command]().run());
      toolbar.append(button);
    }
    editor.view.dom.addEventListener('click', event => {
      const link = event.target.closest('a[href]');
      if (!link) return;
      event.preventDefault();
      if ((!editor.isEditable || event.metaKey || event.ctrlKey) && isNotesLink(link.getAttribute('href'))) {
        window.open(link.getAttribute('href'), '_blank', 'noopener,noreferrer');
      }
    });
    refreshToolbar();
  }
  function refreshToolbar() {
    if (!editor || disposed) return;
    for (const button of panel.querySelectorAll('[data-mark]')) {
      button.disabled = !editor.isEditable;
      button.setAttribute('aria-pressed', String(editor.isActive(button.dataset.mark)));
    }
  }
  function lock() { editor?.setEditable(false); refreshToolbar(); }
  async function draft() {
    window.LessonNotes.flush = async () => { throw new Error('Дождитесь загрузки заметок. Если загрузка не удалась, перезагрузите страницу.'); };
    const url = `/api/lesson-drafts/${encodeURIComponent(options.id)}/notes`;
    const response = await fetch(url, { cache: 'no-store' });
    const initial = await response.json();
    if (!response.ok) throw new Error(initial.error || 'Не удалось загрузить заметки.');
    let version = initial.version, timer, saving, conflict = false, serial = 0;
    const key = `lesson-notes:draft:${options.id}`;
    let restored;
    try { restored = JSON.parse(localStorage.getItem(key)); } catch {}
    let content = initial.content;
    if (restored && initial.editable) {
      try {
        validateNotes(restored.content);
        if (JSON.stringify(restored.content) !== JSON.stringify(initial.content)) {
          content = restored.content; dirty = true;
          conflict = restored.version !== version;
        } else localStorage.removeItem(key);
      } catch { restored = null; }
    }
    function localSave() {
      try { localStorage.setItem(key, JSON.stringify({ content: editor.getJSON(), version })); }
      catch { hint.textContent = 'Локальная копия недоступна. Не закрывайте страницу до сохранения.'; }
    }
    async function flush() {
      clearTimeout(timer);
      if (saving) { await saving; if (dirty && !conflict) return flush(); return; }
      if (!dirty) return;
      if (conflict) throw new Error('Заметки изменены в другой вкладке. Скопируйте свой текст и перезагрузите страницу.');
      const sent = serial;
      status('Сохраняем…', 'saving'); retry.hidden = true;
      saving = (async () => {
        try {
          const content = validateNotes(editor.getJSON());
          const response = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ version, content }) });
          const result = await response.json();
          if (!response.ok) { if (response.status === 409) conflict = true; throw new Error(result.error || 'Не удалось сохранить заметки.'); }
          version = result.version;
          dirty = sent !== serial;
          if (dirty) localSave(); else { try { localStorage.removeItem(key); } catch {} }
          status(dirty ? 'Сохраняем…' : 'Сохранено', dirty ? 'saving' : 'saved');
        } catch (error) {
          status(error.message, 'error'); retry.hidden = conflict;
          throw error;
        } finally { saving = null; }
      })();
      await saving;
      if (dirty) return flush();
    }
    createEditor(content, null, initial.editable, () => {
      dirty = true; serial++; localSave(); status('Сохраняем…', 'saving');
      clearTimeout(timer); timer = setTimeout(() => flush().catch(() => {}), 500);
    });
    window.LessonNotes.flush = flush;
    retry.addEventListener('click', () => flush().catch(() => {}));
    window.addEventListener('online', () => { if (dirty && !conflict) flush().catch(() => {}); });
    hint.textContent = initial.editable ? 'Эти заметки станут заготовкой для новых занятий.' : 'Редактирование доступно в черновике на проверке.';
    status(conflict ? 'Восстановлена локальная копия. На сервере другая версия: скопируйте свой текст перед перезагрузкой.' : dirty ? 'Восстановлены несохранённые заметки' : 'Сохранено', conflict ? 'error' : 'saved');
    if (dirty && !conflict) flush().catch(() => {});
    window.addEventListener('pagehide', () => { clearTimeout(timer); });
  }
  function live() {
    const doc = new Y.Doc();
    let socket, persistence, identity, connected = false, stopped = false, reconnectTimer, sendTimer;
    let vector, flight = null, sequence = 0, serial = 0, backoff = 500;
    const remote = {};
    hint.textContent = 'Общие заметки: учитель и ученик могут писать одновременно.';
    function flush() {
      clearTimeout(sendTimer);
      if (!connected || flight || !dirty || socket.readyState !== WebSocket.OPEN) return;
      flight = { id: ++sequence, serial };
      socket.send(JSON.stringify({ type: 'sync', id: flight.id, update: encode(Y.encodeStateAsUpdate(doc, vector)) }));
      status('Сохраняем…', 'saving');
    }
    doc.on('update', (_update, origin) => {
      if (origin === remote || origin === persistence) return;
      serial++; dirty = true;
      status(connected ? 'Сохраняем…' : 'Нет связи — изменения ожидают отправки', connected ? 'saving' : 'offline');
      clearTimeout(sendTimer); sendTimer = setTimeout(flush, 100);
    });
    function connect() {
      if (stopped) return;
      status('Подключаемся…', 'saving');
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws/notes/${options.id}?role=${options.role}`);
      const current = socket;
      let messages = Promise.resolve();
      socket.addEventListener('message', event => {
        messages = messages.then(async () => {
          if (current !== socket || stopped) return;
          const message = JSON.parse(event.data);
          if (message.type === 'hello') {
            if (identity && identity !== message.identity) { stopped = true; lock(); status('Сессия изменилась. Перезагрузите страницу.', 'error'); current.close(); return; }
            identity = message.identity;
            if (!persistence) {
              persistence = new IndexeddbPersistence(`lesson-notes:class:${options.id}:${identity}`, doc);
              let timeout;
              try {
                await Promise.race([persistence.whenSynced, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Локальное хранилище недоступно. Проверьте настройки браузера и перезагрузите страницу.')), 8000); })]);
              } finally { clearTimeout(timeout); }
            }
            if (current !== socket || current.readyState !== WebSocket.OPEN || stopped) return;
            Y.applyUpdate(doc, decode(message.state), remote);
            vector = decode(message.vector);
            if (!editor) createEditor(null, doc, true);
            connected = true; backoff = 500; flight = null; dirty = true;
            flush();
          } else if (message.type === 'update') {
            Y.applyUpdate(doc, decode(message.update), remote);
          } else if (message.type === 'ack' && flight?.id === message.id) {
            vector = decode(message.vector); dirty = serial !== flight.serial; flight = null;
            if (dirty) flush(); else status('Сохранено', 'saved');
          } else if (message.type === 'presence') {
            const presence = panel.querySelector('.notes-presence'); presence.hidden = false;
            presence.textContent = message.peerPresent ? 'Оба участника подключены' : options.role === 'teacher' ? 'Ожидаем ученика' : 'Ожидаем учителя';
          } else if (message.type === 'error') {
            stopped = true; lock(); status(message.error, 'error');
          }
        }).catch(error => { stopped = true; lock(); status(error.message || 'Не удалось открыть заметки.', 'error'); current.close(); });
      });
      socket.addEventListener('close', event => {
        if (current !== socket) return;
        connected = false; flight = null;
        panel.querySelector('.notes-presence').hidden = true;
        if (stopped) return;
        if ([4001, 4003, 4004, 4008, 4009].includes(event.code)) {
          stopped = true; lock(); status(event.reason || 'Подключение закрыто.', 'error'); return;
        }
        status('Нет связи — переподключаемся…', 'offline');
        reconnectTimer = setTimeout(connect, backoff); backoff = Math.min(backoff * 2, 10000);
      });
    }
    connect();
    window.addEventListener('pagehide', () => {
      stopped = true; clearTimeout(reconnectTimer); clearTimeout(sendTimer); socket?.close();
      persistence?.destroy().catch(() => {}); editor?.destroy(); doc.destroy(); disposed = true;
    });
  }
  if (options.mode === 'class') live();
  else if (options.mode === 'draft') draft().catch(error => status(error.message, 'error'));
  else {
    createEditor(options.content || EMPTY_NOTES, null, false);
    status('Заметки к уроку'); hint.textContent = 'В каждом занятии будет своя копия этих заметок.';
  }
}
