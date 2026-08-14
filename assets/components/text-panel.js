(function initTextPanelComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('TextPanel requires SafeMarkdown.');

  const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const HEX_COLOR = /^#[0-9a-f]{6}$/i;
  const SIDES = new Set(['leading', 'trailing']);
  const DARK_TEXT = '#171a2b';
  const LIGHT_TEXT = '#ffffff';

  function requiredText(value, field) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) throw new Error(`TextPanel requires ${field}.`);
    return normalized;
  }

  function normalizePicture(value, field) {
    if (value == null) return null;
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new Error(`TextPanel ${field} must be an object.`);
    }
    const picture = { imagePrompt: requiredText(value.imagePrompt, `${field}.imagePrompt`) };
    if (value.imageSrc != null) picture.imageSrc = requiredText(value.imageSrc, `${field}.imageSrc`);
    return picture;
  }

  function normalizePanelBasics(data, expectedType, componentName) {
    if (!data || data.type !== expectedType || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error(`${componentName} requires a kebab-case id.`);
    }
    const backgroundColor = typeof data.backgroundColor === 'string' ? data.backgroundColor.trim() : '';
    if (!HEX_COLOR.test(backgroundColor)) {
      throw new Error(`${componentName} requires backgroundColor in #RRGGBB format.`);
    }
    return {
      type: expectedType,
      id: data.id,
      text: requiredText(data.text, 'text'),
      backgroundColor: backgroundColor.toUpperCase(),
    };
  }

  function normalizeTextPanel(data) {
    if (data && (data.leadingPicture != null || data.trailingPicture != null)) {
      throw new Error('TextPanel does not support picture fields.');
    }
    return normalizePanelBasics(data, 'textPanel', 'TextPanel');
  }

  function normalizeIllustratedTextPanel(data) {
    const panel = normalizePanelBasics(data, 'illustratedTextPanel', 'IllustratedTextPanel');
    return {
      ...panel,
      leadingPicture: normalizePicture(data.leadingPicture, 'leadingPicture'),
      trailingPicture: normalizePicture(data.trailingPicture, 'trailingPicture'),
    };
  }

  function linearChannel(channel) {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }

  function relativeLuminance(hexColor) {
    const value = hexColor.slice(1);
    const red = linearChannel(Number.parseInt(value.slice(0, 2), 16));
    const green = linearChannel(Number.parseInt(value.slice(2, 4), 16));
    const blue = linearChannel(Number.parseInt(value.slice(4, 6), 16));
    return (0.2126 * red) + (0.7152 * green) + (0.0722 * blue);
  }

  function contrastRatio(first, second) {
    const lighter = Math.max(first, second);
    const darker = Math.min(first, second);
    return (lighter + 0.05) / (darker + 0.05);
  }

  function foregroundForBackground(backgroundColor) {
    const normalized = String(backgroundColor || '').trim();
    if (!HEX_COLOR.test(normalized)) throw new Error('Cannot calculate contrast for an invalid HEX color.');
    const background = relativeLuminance(normalized);
    const dark = relativeLuminance(DARK_TEXT);
    return contrastRatio(background, dark) >= contrastRatio(background, 1) ? DARK_TEXT : LIGHT_TEXT;
  }

  function pictureRenderMode(picture, editing, canUpload) {
    if (!picture) return 'hidden';
    if (picture.imageSrc) return 'image';
    return editing && canUpload ? 'placeholder' : 'hidden';
  }

  function renderPanel(data, options, documentRef, illustrated) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('TextPanel requires a document.');

    const normalize = illustrated ? normalizeIllustratedTextPanel : normalizeTextPanel;
    let current = normalize(data);
    let editing = false;
    let saving = false;
    let imageBusy = false;
    let initialSnapshot = '';
    let activeEditor = null;

    const panel = doc.createElement('section');
    panel.className = `text-panel text-panel--${illustrated ? 'illustrated' : 'plain'}`;
    panel.dataset.componentId = current.id;

    const controls = doc.createElement('div');
    controls.className = 'text-panel__controls';
    controls.hidden = true;

    const colorLabel = doc.createElement('label');
    colorLabel.className = 'text-panel__color-label';
    colorLabel.textContent = 'Цвет фона';
    const colorPicker = doc.createElement('input');
    colorPicker.type = 'color';
    colorPicker.className = 'text-panel__color-picker';
    colorPicker.setAttribute('aria-label', 'Цвет фона панели');
    colorPicker.title = 'Выбрать цвет фона';
    const colorText = doc.createElement('input');
    colorText.type = 'text';
    colorText.className = 'text-panel__color-text';
    colorText.maxLength = 7;
    colorText.spellcheck = false;
    colorText.setAttribute('aria-label', 'HEX-код цвета фона панели');
    colorLabel.append(colorPicker, colorText);

    const formattingControls = [];
    [['B', 'Жирный', 'bold'], ['I', 'Курсив', 'italic'], ['• ≡', 'Маркированный список', 'insertUnorderedList'], ['1. ≡', 'Нумерованный список', 'insertOrderedList']]
      .forEach(([label, ariaLabel, command]) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'text-panel__format';
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
      });
    controls.append(colorLabel, ...formattingControls);

    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'text-panel__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать текстовую панель');

    const layout = doc.createElement('div');
    layout.className = 'text-panel__layout';
    const body = doc.createElement('div');
    body.className = 'text-panel__text';

    function notify(message) {
      if (typeof settings.onMessage === 'function') settings.onMessage(message);
    }

    function snapshot() {
      return JSON.stringify({
        text: markdown.editorToMarkdown(body),
        backgroundColor: colorText.value.trim().toUpperCase(),
      });
    }

    function setDirty(dirty) {
      panel.classList.toggle('text-panel--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function updateDirty() {
      if (editing) setDirty(snapshot() !== initialSnapshot);
    }

    function applyColors(backgroundColor) {
      panel.style.setProperty('--text-panel-background', backgroundColor);
      panel.style.setProperty('--text-panel-foreground', foregroundForBackground(backgroundColor));
    }

    async function copyPrompt(prompt, button) {
      try {
        const clipboard = root.navigator && root.navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('Clipboard unavailable');
        await clipboard.writeText(prompt);
        button.classList.add('text-panel__copy--done');
        notify('Промт скопирован.');
        root.setTimeout(() => button.classList.remove('text-panel__copy--done'), 900);
      } catch (_error) {
        notify('Не удалось скопировать промт.');
      }
    }

    async function uploadImage(file, side) {
      if (!file || imageBusy || typeof settings.onUpload !== 'function' || !SIDES.has(side)) return;
      imageBusy = true;
      panel.classList.add('text-panel--busy');
      try {
        const saved = await settings.onUpload(file, current.id, side);
        current = normalize(saved);
        renderLayout();
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        imageBusy = false;
        panel.classList.remove('text-panel--busy');
      }
    }

    async function deleteImage(side) {
      if (imageBusy || typeof settings.onDelete !== 'function' || !SIDES.has(side)) return;
      if (typeof root.confirm === 'function' && !root.confirm('Удалить изображение и снова показать промт?')) return;
      imageBusy = true;
      panel.classList.add('text-panel--busy');
      try {
        const saved = await settings.onDelete(current.id, side);
        current = normalize(saved);
        renderLayout();
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        imageBusy = false;
        panel.classList.remove('text-panel--busy');
      }
    }

    function imageControls(side, hasImage) {
      const actions = doc.createElement('span');
      actions.className = 'text-panel__image-actions';
      const input = doc.createElement('input');
      input.type = 'file';
      input.accept = 'image/jpeg,image/png,image/webp';
      input.hidden = true;
      const upload = doc.createElement('button');
      upload.type = 'button';
      upload.className = 'text-panel__image-action';
      upload.textContent = hasImage ? 'Заменить' : 'Загрузить';
      upload.addEventListener('click', () => input.click());
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        uploadImage(file, side);
        input.value = '';
      });
      actions.append(upload, input);
      if (hasImage && typeof settings.onDelete === 'function') {
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'text-panel__image-action text-panel__image-action--remove';
        remove.textContent = 'Удалить';
        remove.addEventListener('click', () => deleteImage(side));
        actions.append(remove);
      }
      return actions;
    }

    function pictureElement(side, picture) {
      const canUpload = typeof settings.onUpload === 'function';
      const mode = pictureRenderMode(picture, editing, canUpload);
      if (mode === 'hidden') return null;
      const media = doc.createElement('div');
      media.className = `text-panel__picture text-panel__picture--${side}`;
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

      media.classList.add('text-panel__picture--placeholder');
      const prompt = doc.createElement('span');
      prompt.className = 'text-panel__prompt';
      prompt.textContent = picture.imagePrompt;
      const copy = doc.createElement('button');
      copy.type = 'button';
      copy.className = 'text-panel__copy';
      copy.textContent = '⧉';
      copy.title = 'Скопировать промт';
      copy.setAttribute('aria-label', 'Скопировать промт для изображения');
      copy.addEventListener('click', () => copyPrompt(picture.imagePrompt, copy));
      media.append(prompt, copy, imageControls(side, false));
      return media;
    }

    function renderLayout() {
      const elements = [];
      const leading = illustrated ? pictureElement('leading', current.leadingPicture) : null;
      const trailing = illustrated ? pictureElement('trailing', current.trailingPicture) : null;
      if (leading) elements.push(leading);
      elements.push(body);
      if (trailing) elements.push(trailing);
      layout.replaceChildren(...elements);
      panel.classList.toggle('text-panel--editing', editing);
    }

    function paint(value) {
      current = normalize({ ...current, ...value });
      colorPicker.value = current.backgroundColor;
      colorText.value = current.backgroundColor;
      applyColors(current.backgroundColor);
      markdown.renderMarkdownInto(body, current.text, doc, 'text-panel__spacer');
      renderLayout();
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      body.contentEditable = 'false';
      body.removeAttribute('role');
      body.removeAttribute('aria-label');
      controls.hidden = true;
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать текстовую панель');
      formattingControls.forEach(control => { control.disabled = false; });
      panel.classList.remove('text-panel--editing', 'text-panel--saving');
      setDirty(false);
      renderLayout();
    }

    function enterEditMode() {
      editing = true;
      controls.hidden = false;
      body.contentEditable = 'true';
      body.setAttribute('role', 'textbox');
      body.setAttribute('aria-label', 'Текст панели');
      body.setAttribute('aria-multiline', 'true');
      activeEditor = body;
      initialSnapshot = snapshot();
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить текстовую панель');
      panel.classList.add('text-panel--editing');
      renderLayout();
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
        text: markdown.editorToMarkdown(body),
        backgroundColor: colorText.value.trim().toUpperCase(),
      };
      try {
        normalize({ ...current, ...changes });
      } catch (_error) {
        notify('Введите текст и корректный HEX-цвет в формате #RRGGBB.');
        return;
      }
      saving = true;
      panel.classList.add('text-panel--saving');
      editButton.disabled = true;
      formattingControls.forEach(control => { control.disabled = true; });
      try {
        const saved = await settings.onSave(changes, current.id);
        paint(saved || changes);
        leaveEditMode();
      } catch (_error) {
        saving = false;
        panel.classList.remove('text-panel--saving');
        editButton.disabled = false;
        formattingControls.forEach(control => { control.disabled = false; });
      }
    }

    editButton.addEventListener('click', () => editing ? saveEditing() : enterEditMode());
    body.addEventListener('input', updateDirty);
    body.addEventListener('focus', () => { activeEditor = body; });
    body.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelEditing();
      }
    });
    body.addEventListener('paste', (event) => {
      if (!editing) return;
      event.preventDefault();
      const plainText = event.clipboardData?.getData('text/plain') || '';
      if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
    });
    colorPicker.addEventListener('input', () => {
      colorText.value = colorPicker.value.toUpperCase();
      applyColors(colorText.value);
      updateDirty();
    });
    colorText.addEventListener('input', () => {
      const value = colorText.value.trim();
      if (HEX_COLOR.test(value)) {
        colorPicker.value = value;
        applyColors(value);
      }
      updateDirty();
    });

    paint(current);
    if (typeof settings.onSave === 'function') panel.append(editButton);
    panel.append(controls, layout);
    return panel;
  }

  function renderTextPanel(data, options, documentRef) {
    return renderPanel(data, options, documentRef, false);
  }

  function renderIllustratedTextPanel(data, options, documentRef) {
    return renderPanel(data, options, documentRef, true);
  }

  const api = {
    foregroundForBackground,
    normalizeIllustratedTextPanel,
    normalizeTextPanel,
    pictureRenderMode,
    renderIllustratedTextPanel,
    renderTextPanel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TextPanelComponent = { foregroundForBackground, normalizeTextPanel, renderTextPanel };
  root.IllustratedTextPanelComponent = {
    foregroundForBackground,
    normalizeIllustratedTextPanel,
    pictureRenderMode,
    renderIllustratedTextPanel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
