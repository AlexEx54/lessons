(function initThisOrThatComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function requiredText(value, field) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) throw new Error(`ThisOrThat requires ${field}.`);
    return normalized;
  }

  function normalizeThisOrThat(data) {
    if (!data || data.type !== 'thisOrThat' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('ThisOrThat requires a kebab-case id.');
    }
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 8) {
      throw new Error('ThisOrThat requires between 1 and 8 items.');
    }

    const ids = new Set([data.id]);
    const items = data.items.map((item) => {
      if (!item || !KEBAB_CASE.test(String(item.id || '')) || ids.has(item.id)) {
        throw new Error('ThisOrThat item ids must be unique kebab-case values.');
      }
      ids.add(item.id);
      if (!Array.isArray(item.options) || item.options.length !== 2) {
        throw new Error('Each ThisOrThat item requires exactly two options.');
      }
      return {
        id: item.id,
        options: item.options.map((option) => {
          if (!option || !KEBAB_CASE.test(String(option.id || '')) || ids.has(option.id)) {
            throw new Error('ThisOrThat option ids must be unique kebab-case values.');
          }
          ids.add(option.id);
          const normalized = {
            id: option.id,
            caption: requiredText(option.caption, 'an option caption'),
            imagePrompt: requiredText(option.imagePrompt, 'an image prompt'),
          };
          if (option.imageSrc != null) {
            normalized.imageSrc = requiredText(option.imageSrc, 'a non-empty imageSrc');
          }
          return normalized;
        }),
      };
    });
    return { type: 'thisOrThat', id: data.id, items };
  }

  function createCopyIcon(doc) {
    const span = doc.createElement('span');
    span.setAttribute('aria-hidden', 'true');
    span.textContent = '⧉';
    return span;
  }

  function renderThisOrThat(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('ThisOrThat requires a document.');

    let current = normalizeThisOrThat(data);
    let editing = false;
    let busy = false;
    const section = doc.createElement('section');
    section.className = 'this-or-that';
    section.dataset.componentId = current.id;
    section.setAttribute('aria-label', 'This or That');

    const header = doc.createElement('div');
    header.className = 'this-or-that__header';
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'this-or-that__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать изображения This or That');
    if (typeof settings.onUpload === 'function') header.append(editButton);

    const grid = doc.createElement('div');
    grid.className = 'this-or-that__grid';

    function notify(message) {
      if (typeof settings.onMessage === 'function') settings.onMessage(message);
    }

    async function copyPrompt(prompt, button) {
      try {
        const clipboard = root.navigator && root.navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('Clipboard unavailable');
        await clipboard.writeText(prompt);
        button.classList.add('this-or-that__copy--done');
        notify('Промт скопирован.');
        root.setTimeout(() => button.classList.remove('this-or-that__copy--done'), 900);
      } catch (_error) {
        notify('Не удалось скопировать промт.');
      }
    }

    async function uploadImage(file, itemId, optionId) {
      if (!file || busy || typeof settings.onUpload !== 'function') return;
      busy = true;
      section.classList.add('this-or-that--busy');
      try {
        const saved = await settings.onUpload(file, current.id, itemId, optionId);
        current = normalizeThisOrThat(saved);
        renderItems();
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        busy = false;
        section.classList.remove('this-or-that--busy');
      }
    }

    async function deleteImage(itemId, optionId) {
      if (busy || typeof settings.onDelete !== 'function') return;
      if (typeof root.confirm === 'function' && !root.confirm('Удалить изображение и снова показать промт?')) return;
      busy = true;
      section.classList.add('this-or-that--busy');
      try {
        const saved = await settings.onDelete(current.id, itemId, optionId);
        current = normalizeThisOrThat(saved);
        renderItems();
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        busy = false;
        section.classList.remove('this-or-that--busy');
      }
    }

    function optionElement(item, option, pair) {
      const optionElement = doc.createElement('div');
      optionElement.className = 'this-or-that__option';
      optionElement.dataset.optionId = option.id;

      const media = doc.createElement('span');
      media.className = 'this-or-that__media';
      if (option.imageSrc) {
        const image = doc.createElement('img');
        image.src = option.imageSrc;
        image.alt = option.caption;
        image.loading = 'lazy';
        media.append(image);
      } else {
        media.classList.add('this-or-that__media--prompt');
        const prompt = doc.createElement('span');
        prompt.className = 'this-or-that__prompt';
        prompt.textContent = option.imagePrompt;
        const copy = doc.createElement('button');
        copy.type = 'button';
        copy.className = 'this-or-that__copy';
        copy.setAttribute('aria-label', 'Скопировать промт для изображения');
        copy.title = 'Скопировать промт';
        copy.append(createCopyIcon(doc));
        copy.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          copyPrompt(option.imagePrompt, copy);
        });
        media.append(prompt, copy);
      }

      const caption = doc.createElement('span');
      caption.className = 'this-or-that__caption';
      caption.textContent = option.caption;
      const selectButton = doc.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'this-or-that__select';
      selectButton.setAttribute('aria-pressed', 'false');
      selectButton.setAttribute('aria-label', option.caption);
      selectButton.addEventListener('click', () => {
        if (editing || busy) return;
        pair.querySelectorAll('.this-or-that__option').forEach((candidate) => {
          const selected = candidate === optionElement;
          candidate.classList.toggle('this-or-that__option--selected', selected);
          candidate.classList.toggle('this-or-that__option--dimmed', !selected);
          candidate.querySelector('.this-or-that__select').setAttribute('aria-pressed', String(selected));
        });
      });

      if (typeof settings.onUpload === 'function') {
        const actions = doc.createElement('span');
        actions.className = 'this-or-that__image-actions';
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.hidden = true;
        const upload = doc.createElement('button');
        upload.type = 'button';
        upload.className = 'this-or-that__image-action';
        upload.textContent = option.imageSrc ? 'Заменить' : 'Загрузить';
        upload.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          input.click();
        });
        input.addEventListener('change', () => {
          const file = input.files && input.files[0];
          uploadImage(file, item.id, option.id);
          input.value = '';
        });
        actions.append(upload, input);
        if (option.imageSrc && typeof settings.onDelete === 'function') {
          const remove = doc.createElement('button');
          remove.type = 'button';
          remove.className = 'this-or-that__image-action this-or-that__image-action--remove';
          remove.textContent = 'Удалить';
          remove.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            deleteImage(item.id, option.id);
          });
          actions.append(remove);
        }
        media.append(actions);
      }
      optionElement.append(media, caption, selectButton);
      return optionElement;
    }

    function renderItems() {
      const pairs = current.items.map((item, index) => {
        const pair = doc.createElement('article');
        pair.className = 'this-or-that__pair';
        pair.dataset.itemId = item.id;
        const number = doc.createElement('span');
        number.className = 'this-or-that__number';
        number.textContent = String(index + 1);
        const choices = doc.createElement('div');
        choices.className = 'this-or-that__choices';
        const divider = doc.createElement('span');
        divider.className = 'this-or-that__or';
        divider.textContent = 'OR';
        divider.setAttribute('aria-hidden', 'true');
        choices.append(optionElement(item, item.options[0], pair), divider, optionElement(item, item.options[1], pair));
        pair.append(number, choices);
        return pair;
      });
      grid.replaceChildren(...pairs);
      section.classList.toggle('this-or-that--editing', editing);
    }

    editButton.addEventListener('click', () => {
      if (busy) return;
      editing = !editing;
      editButton.textContent = editing ? '✓' : '✎';
      editButton.setAttribute('aria-label', editing ? 'Закончить редактирование изображений' : 'Редактировать изображения This or That');
      section.classList.toggle('this-or-that--editing', editing);
    });

    renderItems();
    section.append(header, grid);
    return section;
  }

  const api = { normalizeThisOrThat, renderThisOrThat };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ThisOrThatComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
