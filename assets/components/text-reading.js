(function initTextReadingComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('TextReading requires SafeMarkdown.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const SIDES = new Set(['header', 'text']);

  function normalizeLine(value, field, required) {
    if (value == null) {
      if (required) throw new Error(`TextReading requires ${field}.`);
      return '';
    }
    if (typeof value !== 'string') throw new Error(`TextReading ${field} must be a string.`);
    const normalized = value.trim().replace(/\s+/g, ' ');
    if (required && !normalized) throw new Error(`TextReading requires ${field}.`);
    return normalized;
  }

  function normalizePicture(value, field) {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`TextReading ${field} must be an object.`);
    }
    const imagePrompt = normalizeLine(value.imagePrompt, `${field}.imagePrompt`, true);
    const picture = { imagePrompt };
    if (value.imageSrc != null) {
      picture.imageSrc = normalizeLine(value.imageSrc, `${field}.imageSrc`, true);
    }
    return picture;
  }

  function normalizeTextReading(data) {
    if (!data || data.type !== 'textReading' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('TextReading requires type "textReading" and a kebab-case id.');
    }
    const title = normalizeLine(data.title, 'title', true);
    const subtitle = normalizeLine(data.subtitle, 'subtitle', false);
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (!text) throw new Error('TextReading requires text.');

    const normalized = {
      type: 'textReading',
      id: data.id,
      title,
    };
    if (subtitle) normalized.subtitle = subtitle;
    const headerImage = normalizePicture(data.headerImage, 'headerImage');
    if (headerImage) normalized.headerImage = headerImage;
    normalized.text = text;
    const textImage = normalizePicture(data.textImage, 'textImage');
    if (textImage) normalized.textImage = textImage;
    return normalized;
  }

  function pictureRenderMode(picture, editing, canUpload) {
    if (!picture) return 'hidden';
    if (picture.imageSrc) return 'image';
    return editing && canUpload ? 'placeholder' : 'hidden';
  }

  function createBookIcon(documentRef) {
    const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    [['path', { d: 'M4 5.2c2.9 0 5.8.6 8 2.1v12c-2.2-1.5-5.1-2.1-8-2.1z' }],
      ['path', { d: 'M20 5.2c-2.9 0-5.8 0.6-8 2.1v12c2.2-1.5 5.1-2.1 8-2.1z' }]]
      .forEach(([tag, attributes]) => {
        const shape = documentRef.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.entries(attributes).forEach(([name, value]) => shape.setAttribute(name, value));
        svg.append(shape);
      });
    return svg;
  }

  function renderTextReading(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('TextReading requires a document.');

    let current = normalizeTextReading(data);
    let editing = false;
    let saving = false;
    let imageBusy = false;
    let subtitleEditorVisible = Boolean(current.subtitle);
    let initialSnapshot = '';
    let activeEditor = null;

    const reading = doc.createElement('article');
    reading.className = 'text-reading';
    reading.dataset.componentId = current.id;

    const readLabel = doc.createElement('div');
    readLabel.className = 'text-reading__read-label';
    readLabel.append(createBookIcon(doc));
    readLabel.append(doc.createTextNode('Read the text.'));

    const header = doc.createElement('header');
    header.className = 'text-reading__header';
    const headerMedia = doc.createElement('div');
    headerMedia.className = 'text-reading__header-media';
    const headingBlock = doc.createElement('div');
    headingBlock.className = 'text-reading__heading-block';
    const title = doc.createElement('h2');
    title.className = 'text-reading__title';
    title.dataset.placeholder = 'Введите заголовок';
    const subtitleRow = doc.createElement('div');
    subtitleRow.className = 'text-reading__subtitle-row';
    const subtitle = doc.createElement('p');
    subtitle.className = 'text-reading__subtitle';
    subtitle.dataset.placeholder = 'Введите серый подзаголовок';
    const subtitleActions = doc.createElement('span');
    subtitleActions.className = 'text-reading__subtitle-actions';
    const addSubtitleButton = doc.createElement('button');
    addSubtitleButton.type = 'button';
    addSubtitleButton.className = 'text-reading__subtitle-add';
    addSubtitleButton.textContent = '＋ Добавить подзаголовок';
    addSubtitleButton.setAttribute('aria-label', 'Добавить подзаголовок');
    const removeSubtitleButton = doc.createElement('button');
    removeSubtitleButton.type = 'button';
    removeSubtitleButton.className = 'text-reading__subtitle-remove';
    removeSubtitleButton.textContent = 'Удалить';
    removeSubtitleButton.setAttribute('aria-label', 'Удалить подзаголовок');
    subtitleActions.append(addSubtitleButton, removeSubtitleButton);
    subtitleRow.append(subtitle, subtitleActions);
    headingBlock.append(title, subtitleRow);

    const actions = doc.createElement('div');
    actions.className = 'text-reading__actions';
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'text-reading__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать текст для чтения');
    actions.append(editButton);
    header.append(headerMedia, headingBlock, actions);

    const toolbar = doc.createElement('div');
    toolbar.className = 'text-reading__toolbar';
    toolbar.hidden = true;
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Форматирование текста для чтения');
    const formattingControls = [];
    [['B', 'Жирный', 'bold'], ['I', 'Курсив', 'italic'], ['• ≡', 'Маркированный список', 'insertUnorderedList'], ['1. ≡', 'Нумерованный список', 'insertOrderedList']]
      .forEach(([label, ariaLabel, command]) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'text-reading__format';
        button.textContent = label;
        button.setAttribute('aria-label', ariaLabel);
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', () => {
          if (!editing || saving || !activeEditor) return;
          activeEditor.focus();
          if (typeof doc.execCommand === 'function') doc.execCommand(command, false, null);
          updateDirty();
        });
        formattingControls.push(button);
        toolbar.append(button);
      });
    (markdown.TEXT_SIZES || []).forEach((size) => {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'text-reading__format text-reading__format--size';
      button.textContent = size.toUpperCase();
      button.setAttribute('aria-label', `Размер текста ${size.toUpperCase()}`);
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        if (!editing || saving || !activeEditor) return;
        activeEditor.focus();
        markdown.applyTextSize(doc, size);
        updateDirty();
      });
      formattingControls.push(button);
      toolbar.append(button);
    });

    const bodyLayout = doc.createElement('div');
    bodyLayout.className = 'text-reading__body-layout';
    const body = doc.createElement('div');
    body.className = 'text-reading__text';
    body.dataset.placeholder = 'Введите текст';
    const textMedia = doc.createElement('div');
    textMedia.className = 'text-reading__text-media';
    bodyLayout.append(body, textMedia);

    function notify(message) {
      if (typeof settings.onMessage === 'function') settings.onMessage(message);
      else if (typeof settings.onError === 'function') settings.onError(message);
    }

    function snapshot() {
      return JSON.stringify({
        title: normalizeLine(title.textContent, 'title', false),
        subtitle: normalizeLine(subtitle.textContent, 'subtitle', false),
        text: markdown.editorToMarkdown(body),
      });
    }

    function setDirty(dirty) {
      reading.classList.toggle('text-reading--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function updateDirty() {
      if (editing) setDirty(snapshot() !== initialSnapshot);
    }

    async function copyPrompt(prompt, button) {
      try {
        const clipboard = root.navigator && root.navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('Clipboard unavailable');
        await clipboard.writeText(prompt);
        button.classList.add('text-reading__copy--done');
        notify('Промт скопирован.');
        root.setTimeout(() => button.classList.remove('text-reading__copy--done'), 900);
      } catch (_error) {
        notify('Не удалось скопировать промт.');
      }
    }

    async function uploadImage(file, side) {
      if (!file || imageBusy || typeof settings.onUpload !== 'function' || !SIDES.has(side)) return;
      imageBusy = true;
      reading.classList.add('text-reading--busy');
      try {
        const saved = await settings.onUpload(file, current.id, side);
        current = normalizeTextReading(saved);
        renderPictures();
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        imageBusy = false;
        reading.classList.remove('text-reading--busy');
      }
    }

    async function deleteImage(side) {
      if (imageBusy || typeof settings.onDelete !== 'function' || !SIDES.has(side)) return;
      if (typeof root.confirm === 'function' && !root.confirm('Удалить изображение и снова показать промт?')) return;
      imageBusy = true;
      reading.classList.add('text-reading--busy');
      try {
        const saved = await settings.onDelete(current.id, side);
        current = normalizeTextReading(saved);
        renderPictures();
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        imageBusy = false;
        reading.classList.remove('text-reading--busy');
      }
    }

    function imageControls(side, hasImage) {
      const controls = doc.createElement('span');
      controls.className = 'text-reading__image-actions';
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.hidden = true;
      const upload = doc.createElement('button');
      upload.type = 'button';
      upload.className = 'text-reading__image-action';
      upload.textContent = hasImage ? 'Заменить' : 'Загрузить';
      upload.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        uploadImage(file, side);
        input.value = '';
      });
      controls.append(upload, input);
      if (hasImage && typeof settings.onDelete === 'function') {
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'text-reading__image-action text-reading__image-action--remove';
        remove.textContent = 'Удалить';
        remove.addEventListener('click', () => deleteImage(side));
        controls.append(remove);
      }
      return controls;
    }

    function pictureElement(side, picture) {
      const canUpload = typeof settings.onUpload === 'function';
      const mode = pictureRenderMode(picture, editing, canUpload);
      if (mode === 'hidden') return null;
      const media = doc.createElement('div');
      media.className = `text-reading__picture text-reading__picture--${side}`;
      media.dataset.side = side;
      if (mode === 'image') {
        const image = doc.createElement('img');
        image.src = picture.imageSrc;
        image.alt = '';
        image.loading = 'lazy';
        media.append(image);
        if (editing && canUpload) media.append(imageControls(side, true));
        return media;
      }

      media.classList.add('text-reading__picture--placeholder');
      const prompt = doc.createElement('span');
      prompt.className = 'text-reading__prompt';
      prompt.textContent = picture.imagePrompt;
      const copy = doc.createElement('button');
      copy.type = 'button';
      copy.className = 'text-reading__copy';
      copy.textContent = '⧉';
      copy.title = 'Скопировать промт';
      copy.setAttribute('aria-label', 'Скопировать промт для изображения');
      copy.addEventListener('click', () => copyPrompt(picture.imagePrompt, copy));
      media.append(prompt, copy, imageControls(side, false));
      return media;
    }

    function renderPictures() {
      headerMedia.replaceChildren();
      const headerPicture = pictureElement('header', current.headerImage);
      if (headerPicture) headerMedia.append(headerPicture);
      headerMedia.hidden = !headerPicture;

      textMedia.replaceChildren();
      const textPicture = pictureElement('text', current.textImage);
      if (textPicture) textMedia.append(textPicture);
      textMedia.hidden = !textPicture;
    }

    function renderHeader() {
      if (!editing) title.textContent = current.title;
      if (!editing) subtitle.textContent = current.subtitle || '';
      else if (!subtitleEditorVisible) subtitle.textContent = '';
      const showSubtitle = editing ? subtitleEditorVisible : Boolean(current.subtitle);
      subtitle.hidden = !showSubtitle;
      subtitleActions.hidden = !editing;
      addSubtitleButton.hidden = !editing || showSubtitle;
      removeSubtitleButton.hidden = !editing || !showSubtitle;
      subtitleRow.classList.toggle('text-reading__subtitle-row--empty', !current.subtitle && showSubtitle);
      renderPictures();
    }

    function paint(value, replaceCurrent = false) {
      current = normalizeTextReading(replaceCurrent ? value : { ...current, ...value });
      if (!editing) subtitleEditorVisible = Boolean(current.subtitle);
      title.textContent = current.title;
      subtitle.textContent = current.subtitle || '';
      markdown.renderMarkdownInto(body, current.text, doc, 'text-reading__spacer');
      renderHeader();
      reading.classList.toggle('text-reading--editing', editing);
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      subtitleEditorVisible = Boolean(current.subtitle);
      title.contentEditable = 'false';
      subtitle.contentEditable = 'false';
      body.contentEditable = 'false';
      [title, subtitle, body].forEach(element => {
        element.removeAttribute('role');
        element.removeAttribute('aria-label');
        element.removeAttribute('aria-multiline');
      });
      toolbar.hidden = true;
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать текст для чтения');
      formattingControls.forEach(control => { control.disabled = false; });
      reading.classList.remove('text-reading--editing', 'text-reading--saving');
      setDirty(false);
      renderHeader();
    }

    function enterEditMode() {
      if (editing) return;
      editing = true;
      subtitleEditorVisible = Boolean(current.subtitle);
      title.contentEditable = 'true';
      title.setAttribute('role', 'textbox');
      title.setAttribute('aria-label', 'Заголовок текста для чтения');
      subtitle.contentEditable = 'true';
      subtitle.setAttribute('role', 'textbox');
      subtitle.setAttribute('aria-label', 'Подзаголовок текста для чтения');
      body.contentEditable = 'true';
      body.setAttribute('role', 'textbox');
      body.setAttribute('aria-label', 'Текст для чтения');
      body.setAttribute('aria-multiline', 'true');
      activeEditor = body;
      initialSnapshot = snapshot();
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить текст для чтения');
      toolbar.hidden = false;
      reading.classList.add('text-reading--editing');
      renderHeader();
      body.focus();
    }

    function cancelEditing() {
      if (!editing || saving) return;
      paint(current);
      leaveEditMode();
      editButton.focus();
    }

    async function saveEditing() {
      if (!editing || saving) return;
      const changes = {
        title: normalizeLine(title.textContent, 'title', false),
        subtitle: normalizeLine(subtitle.textContent, 'subtitle', false),
        text: markdown.editorToMarkdown(body),
      };
      try {
        normalizeTextReading({ ...current, ...changes });
      } catch (_error) {
        notify('Введите заголовок и текст для чтения.');
        return;
      }
      saving = true;
      reading.classList.add('text-reading--saving');
      editButton.disabled = true;
      formattingControls.forEach(control => { control.disabled = true; });
      try {
        const saved = await settings.onSave(changes, current.id);
        paint(saved || { ...current, ...changes }, Boolean(saved));
        leaveEditMode();
      } catch (_error) {
        saving = false;
        reading.classList.remove('text-reading--saving');
        editButton.disabled = false;
        formattingControls.forEach(control => { control.disabled = false; });
        body.focus();
      }
    }

    editButton.addEventListener('click', () => editing ? saveEditing() : enterEditMode());
    addSubtitleButton.addEventListener('click', () => {
      if (!editing || saving) return;
      subtitleEditorVisible = true;
      renderHeader();
      subtitle.focus();
      updateDirty();
    });
    removeSubtitleButton.addEventListener('click', () => {
      if (!editing || saving) return;
      subtitle.textContent = '';
      subtitleEditorVisible = false;
      renderHeader();
      updateDirty();
    });
    [title, subtitle, body].forEach((element) => {
      element.addEventListener('input', () => { if (editing) updateDirty(); });
      element.addEventListener('focus', () => { activeEditor = element; });
      element.addEventListener('paste', (event) => {
        if (!editing) return;
        event.preventDefault();
        const plainText = event.clipboardData?.getData('text/plain') || '';
        if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
      });
    });
    [title, subtitle].forEach(element => {
      element.addEventListener('keydown', (event) => {
        if (editing && event.key === 'Enter') event.preventDefault();
      });
    });
    reading.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });

    paint(current);
    if (typeof settings.onSave !== 'function') actions.replaceChildren();
    reading.append(readLabel, header, toolbar, bodyLayout);
    return reading;
  }

  const api = { normalizeTextReading, pictureRenderMode, renderTextReading };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextReadingComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
