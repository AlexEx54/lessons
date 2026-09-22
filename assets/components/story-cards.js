(function initStoryCards(root) {
  'use strict';
  const markdown = root.SafeMarkdown || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  function required(value, field) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`StoryCards requires ${field}.`);
    return value.trim();
  }
  function normalizeStoryCards(data) {
    if (!data || data.type !== 'storyCards' || typeof data.id !== 'string' || !ID.test(data.id)) throw new Error('StoryCards requires type and kebab-case id.');
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 12) throw new Error('StoryCards requires 1–12 stories.');
    const ids = new Set();
    const items = data.items.map(item => {
      if (!item || typeof item.id !== 'string' || !ID.test(item.id) || ids.has(item.id)) throw new Error('StoryCards requires unique story ids.');
      ids.add(item.id);
      if (typeof item.backgroundColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(item.backgroundColor)) throw new Error('StoryCards requires a HEX background color.');
      return { id: item.id, emoji: required(item.emoji, 'emoji'), title: required(item.title, 'story title'),
        text: required(item.text, 'story text'), backgroundColor: item.backgroundColor.toUpperCase() };
    });
    return { type: 'storyCards', id: data.id, title: required(data.title, 'title'), items };
  }
  function renderStoryCards(data, options, documentRef) {
    const settings = options || {}, doc = documentRef || root.document;
    let current = normalizeStoryCards(data), editing = false, saving = false;
    const section = doc.createElement('section');
    section.className = 'story-cards';
    section.dataset.componentId = current.id;
    const header = doc.createElement('header');
    header.className = 'story-cards__header';
    const heading = doc.createElement('h3');
    heading.className = 'story-cards__title';
    const grid = doc.createElement('div');
    grid.className = 'story-cards__grid';
    const editor = doc.createElement('div');
    editor.className = 'story-cards__editor';
    const error = doc.createElement('p');
    error.className = 'story-cards__error';
    error.setAttribute('role', 'alert');
    const edit = doc.createElement('button');
    edit.type = 'button'; edit.textContent = 'Редактировать'; edit.className = 'story-cards__edit';
    const dirty = value => settings.onDirtyChange?.(value, current.id);
    function paint() {
      heading.textContent = current.title;
      grid.replaceChildren();
      current.items.forEach(item => {
        const card = doc.createElement('article'); card.className = 'story-cards__item';
        card.style.setProperty('--story-background', item.backgroundColor);
        card.dataset.storyId = item.id;
        const title = doc.createElement('h4'); title.textContent = `${item.emoji} ${item.title}`;
        const body = doc.createElement('div'); body.className = 'story-cards__text';
        markdown.renderMarkdownInto(body, item.text, doc, 'story-cards__spacer', { pointerPrefix: `story-${item.id}` });
        card.append(title, body); grid.append(card);
      });
      editor.hidden = !editing; grid.hidden = editing; edit.hidden = editing;
    }
    function field(parent, label, value, multiline = false, type = 'text') {
      const wrapper = doc.createElement('label'); wrapper.className = 'story-cards__field';
      const caption = doc.createElement('span'); caption.textContent = label;
      const input = doc.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = type;
      input.value = value;
      input.required = true;
      wrapper.append(caption, input); parent.append(wrapper); return input;
    }
    edit.addEventListener('click', () => {
      editing = true; editor.replaceChildren(); error.textContent = '';
      const title = field(editor, 'Инструкция', current.title);
      const cards = doc.createElement('div');
      cards.className = 'story-cards__edit-grid';
      editor.append(cards);
      const fields = current.items.map((item, index) => {
        const group = doc.createElement('fieldset');
        group.className = 'story-cards__card-editor';
        group.style.setProperty('--story-background', item.backgroundColor);
        const legend = doc.createElement('legend');
        legend.textContent = `Карточка ${index + 1}`;
        group.append(legend);
        const row = doc.createElement('div'); row.className = 'story-cards__identity';
        const emoji = field(row, 'Эмодзи', item.emoji);
        const name = field(row, 'Название', item.title);
        group.append(row);
        const toolbar = doc.createElement('div'); toolbar.className = 'story-cards__toolbar';
        const bold = doc.createElement('button'); bold.type = 'button'; bold.textContent = 'B';
        bold.className = 'story-cards__bold';
        bold.setAttribute('aria-label', `Выделить жирным текст карточки ${index + 1}`);
        bold.title = 'Выделите слово в тексте и нажмите, чтобы сделать его жирным';
        const toggle = doc.createElement('button'); toggle.type = 'button';
        toggle.textContent = 'Предпросмотр'; toggle.setAttribute('aria-pressed', 'false');
        toolbar.append(bold, toggle); group.append(toolbar);
        const text = field(group, 'Текст истории', item.text, true);
        const preview = doc.createElement('div');
        preview.className = 'story-cards__preview story-cards__text'; preview.hidden = true;
        group.append(preview);
        const appearance = doc.createElement('div'); appearance.className = 'story-cards__appearance';
        const backgroundColor = field(appearance, 'Фон карточки', item.backgroundColor, false, 'color');
        group.append(appearance);
        const refreshPreview = () => {
          preview.replaceChildren();
          const previewTitle = doc.createElement('h4'); previewTitle.textContent = `${emoji.value} ${name.value}`;
          const body = doc.createElement('div');
          markdown.renderMarkdownInto(body, text.value, doc, 'story-cards__spacer');
          preview.append(previewTitle, body);
        };
        toggle.addEventListener('click', () => {
          preview.hidden = !preview.hidden;
          text.parentNode.hidden = !preview.hidden;
          bold.hidden = !preview.hidden;
          toggle.textContent = preview.hidden ? 'Предпросмотр' : 'К тексту';
          toggle.setAttribute('aria-pressed', String(!preview.hidden));
          if (!preview.hidden) refreshPreview();
        });
        bold.addEventListener('mousedown', event => event.preventDefault());
        bold.addEventListener('click', () => {
          const start = text.selectionStart, end = text.selectionEnd;
          const selected = text.value.slice(start, end) || 'слово';
          text.setRangeText(`**${selected}**`, start, end, 'select');
          text.focus(); updateDirty();
        });
        backgroundColor.addEventListener('input', () => group.style.setProperty('--story-background', backgroundColor.value));
        [emoji, name].forEach(input => input.addEventListener('input', () => { if (!preview.hidden) refreshPreview(); }));
        cards.append(group);
        return { id: item.id, emoji, title: name, text, backgroundColor };
      });
      const values = () => ({ title: title.value, items: fields.map(item => ({ id: item.id,
        emoji: item.emoji.value, title: item.title.value, text: item.text.value, backgroundColor: item.backgroundColor.value })) });
      const initial = JSON.stringify(values());
      const footer = doc.createElement('div'); footer.className = 'story-cards__footer';
      const status = doc.createElement('span'); status.className = 'story-cards__status';
      status.setAttribute('role', 'status'); status.textContent = 'Нет изменений';
      function updateDirty() {
        const changed = JSON.stringify(values()) !== initial;
        dirty(changed); status.textContent = changed ? 'Есть несохранённые изменения' : 'Нет изменений';
        error.textContent = '';
      }
      [title, ...fields.flatMap(item => [item.emoji, item.title, item.text, item.backgroundColor])]
        .forEach(input => input.addEventListener('input', updateDirty));
      const cancel = doc.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Отмена';
      cancel.addEventListener('click', () => { if (saving) return; editing = false; dirty(false); paint(); edit.focus(); });
      const save = doc.createElement('button'); save.type = 'button'; save.textContent = 'Сохранить';
      save.className = 'story-cards__save';
      save.addEventListener('click', async () => {
        if (saving) return;
        try {
          const inputs = [title, ...fields.flatMap(item => [item.emoji, item.title, item.text])];
          const empty = inputs.find(input => !input.value.trim());
          if (empty) { error.textContent = 'Заполните инструкцию, эмодзи, название и текст каждой карточки.'; empty.focus(); return; }
          const next = normalizeStoryCards({ ...current, ...values() });
          saving = true;
          save.textContent = 'Сохранение…';
          editor.setAttribute('aria-busy', 'true');
          editor.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = true; });
          const saved = await settings.onSave({ title: next.title, items: next.items }, current.id);
          current = normalizeStoryCards(saved || next); editing = false; dirty(false); paint(); edit.focus();
        } catch (failure) {
          error.textContent = failure.message || 'Не удалось сохранить истории.';
        } finally {
          saving = false;
          save.textContent = 'Сохранить';
          editor.setAttribute('aria-busy', 'false');
          editor.querySelectorAll('input, textarea, button').forEach(control => { control.disabled = false; });
        }
      });
      footer.append(status, cancel, save);
      editor.append(error, footer); paint(); title.focus();
    });
    header.append(heading);
    if (typeof settings.onSave === 'function' && settings.viewerRole !== 'student') header.append(edit);
    section.append(header, grid, editor); paint(); return section;
  }
  const api = { normalizeStoryCards, renderStoryCards };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StoryCardsComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
