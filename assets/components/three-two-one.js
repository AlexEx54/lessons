(function initThreeTwoOneComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('ThreeTwoOne requires SafeMarkdown.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const LABEL_MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|\r|\n|^\s{0,3}#{1,6}\s|^\s*(?:[-+*]|\d+\.)\s/;
  const STEP_DEFINITIONS = Object.freeze([
    Object.freeze({ key: 'three', count: 3 }),
    Object.freeze({ key: 'two', count: 2 }),
    Object.freeze({ key: 'one', count: 1 }),
  ]);
  const STEP_KEYS = new Set(STEP_DEFINITIONS.map(step => step.key));

  function normalizeTitle(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function exactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const expectedKeys = [...expected].sort();
    const keys = Object.keys(value).sort();
    return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
  }

  function normalizeStep(data, key) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error(`ThreeTwoOne step "${key}" has an invalid schema.`);
    }
    const allowed = new Set(['prompt', 'text', 'label']);
    if (Object.keys(data).some(field => !allowed.has(field))) {
      throw new Error(`ThreeTwoOne step "${key}" has an invalid schema.`);
    }
    const prompt = typeof data.prompt === 'string' ? data.prompt.trim() : '';
    if (!prompt) throw new Error(`ThreeTwoOne step "${key}" requires a prompt.`);
    const step = { prompt };
    if (data.text != null) {
      const text = typeof data.text === 'string' ? data.text.trim() : '';
      if (!text) throw new Error(`ThreeTwoOne step "${key}" requires a non-empty text value.`);
      step.text = text;
    }
    if (data.label != null) {
      const label = normalizeTitle(data.label);
      if (!label) throw new Error(`ThreeTwoOne step "${key}" requires a non-empty label.`);
      if (LABEL_MARKUP.test(data.label)) {
        throw new Error(`ThreeTwoOne step "${key}" does not allow HTML or Markdown in the label.`);
      }
      step.label = label;
    }
    return step;
  }

  function normalizeThreeTwoOne(data) {
    if (!data || data.type !== 'threeTwoOne' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('ThreeTwoOne requires type "threeTwoOne" and a kebab-case id.');
    }
    if (!exactKeys(data, ['type', 'id', 'steps'])) {
      throw new Error('ThreeTwoOne contains unsupported fields.');
    }
    if (!exactKeys(data.steps, STEP_KEYS)) {
      throw new Error('ThreeTwoOne requires the fixed 3-2-1 step set.');
    }
    const steps = {};
    STEP_DEFINITIONS.forEach(({ key }) => {
      steps[key] = normalizeStep(data.steps[key], key);
    });
    return { type: 'threeTwoOne', id: data.id, steps };
  }

  function renderThreeTwoOne(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('ThreeTwoOne requires a document.');

    let current = normalizeThreeTwoOne(data);
    const canEdit = typeof settings.onSave === 'function';
    let editing = false;
    let saving = false;
    let initialSnapshot = '';
    let activeEditor = null;
    const stepEditors = new Map();

    const component = doc.createElement('section');
    component.className = 'three-two-one';
    component.dataset.componentId = current.id;
    component.setAttribute('aria-label', '3–2–1');

    function enableEditor(element, label, multiline) {
      element.contentEditable = 'true';
      element.setAttribute('role', 'textbox');
      element.setAttribute('aria-label', label);
      if (multiline) element.setAttribute('aria-multiline', 'true');
      element.addEventListener('focus', () => { activeEditor = multiline ? element : null; });
      element.addEventListener('input', notifyDirty);
      element.addEventListener('paste', (event) => {
        event.preventDefault();
        const plainText = event.clipboardData?.getData('text/plain') || '';
        if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
      });
      if (!multiline) {
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') event.preventDefault();
        });
      }
    }

    function readStepDraft(key) {
      const editors = stepEditors.get(key);
      const step = { prompt: markdown.editorToMarkdown(editors.prompt) };
      const text = markdown.editorToMarkdown(editors.text);
      const label = normalizeTitle(editors.label.textContent);
      if (text) step.text = text;
      if (label) step.label = label;
      return step;
    }

    function readEditorDraft() {
      if (!editing) return current;
      const steps = {};
      STEP_DEFINITIONS.forEach(({ key }) => { steps[key] = readStepDraft(key); });
      return { type: 'threeTwoOne', id: current.id, steps };
    }

    function notifyDirty() {
      if (!editing || typeof settings.onDirtyChange !== 'function') return;
      settings.onDirtyChange(JSON.stringify(readEditorDraft()) !== initialSnapshot, current.id);
    }

    function toolbar() {
      const bar = doc.createElement('div');
      bar.className = 'three-two-one__toolbar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Форматирование 3–2–1');
      [['B', 'Жирный', 'bold'], ['I', 'Курсив', 'italic'], ['• ≡', 'Маркированный список', 'insertUnorderedList'], ['1. ≡', 'Нумерованный список', 'insertOrderedList']]
        .forEach(([label, ariaLabel, command]) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.setAttribute('aria-label', ariaLabel);
          button.addEventListener('mousedown', event => event.preventDefault());
          button.addEventListener('click', () => {
            if (!activeEditor || saving) return;
            activeEditor.focus();
            if (typeof doc.execCommand === 'function') doc.execCommand(command, false, null);
            notifyDirty();
          });
          bar.append(button);
        });
      return bar;
    }

    function beginEditing() {
      editing = true;
      initialSnapshot = JSON.stringify(current);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
      render();
    }

    function cancelEditing() {
      editing = false;
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
      render();
    }

    async function saveEditing() {
      if (saving) return;
      let normalized;
      try {
        normalized = normalizeThreeTwoOne(readEditorDraft());
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      component.classList.add('three-two-one--saving');
      try {
        const saved = await settings.onSave({ steps: normalized.steps }, current.id);
        current = normalizeThreeTwoOne(saved || normalized);
        editing = false;
        if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
        render();
      } catch (error) {
        if (typeof settings.onError === 'function') {
          settings.onError(error.message || 'Не удалось сохранить 3–2–1.');
        }
      } finally {
        saving = false;
        component.classList.remove('three-two-one--saving');
      }
    }

    function countBadge(count) {
      const badge = doc.createElement('div');
      badge.className = 'three-two-one__count';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = String(count);
      return badge;
    }

    function render() {
      activeEditor = null;
      stepEditors.clear();
      component.classList.toggle('three-two-one--editing', editing);

      const children = [];
      if (editing) children.push(toolbar());

      STEP_DEFINITIONS.forEach(({ key, count }) => {
        const step = current.steps[key];
        const card = doc.createElement('article');
        card.className = 'three-two-one__card';
        card.dataset.step = key;
        card.append(countBadge(count));

        const label = doc.createElement('div');
        label.className = 'three-two-one__label';
        label.dataset.placeholder = 'Подпись (необязательно)';
        if (step.label) label.textContent = step.label;

        const prompt = doc.createElement('div');
        prompt.className = 'three-two-one__prompt safe-markdown';
        prompt.dataset.placeholder = 'Текст шага';
        markdown.renderMarkdownInto(prompt, step.prompt, doc, 'three-two-one__spacer');

        const text = doc.createElement('div');
        text.className = 'three-two-one__text safe-markdown';
        text.dataset.placeholder = 'Дополнительный текст (необязательно)';
        if (step.text) markdown.renderMarkdownInto(text, step.text, doc, 'three-two-one__spacer');

        if (editing) {
          enableEditor(label, `Подпись шага ${count}`, false);
          enableEditor(prompt, `Текст шага ${count}`, true);
          enableEditor(text, `Дополнительный текст шага ${count}`, true);
          card.append(label, prompt, text);
          stepEditors.set(key, { label, prompt, text });
        } else {
          if (step.label) card.append(label);
          card.append(prompt);
          if (step.text) card.append(text);
        }
        children.push(card);
      });

      if (editing) {
        const actions = doc.createElement('div');
        actions.className = 'three-two-one__editor-actions';
        const cancel = doc.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Отмена';
        cancel.addEventListener('click', cancelEditing);
        const save = doc.createElement('button');
        save.type = 'button';
        save.className = 'three-two-one__save';
        save.textContent = 'Сохранить';
        save.addEventListener('click', saveEditing);
        actions.append(cancel, save);
        children.push(actions);
      } else if (canEdit) {
        const edit = doc.createElement('button');
        edit.type = 'button';
        edit.className = 'three-two-one__edit';
        edit.textContent = '✎';
        edit.setAttribute('aria-label', 'Редактировать 3–2–1');
        edit.addEventListener('click', beginEditing);
        children.push(edit);
      }
      component.replaceChildren(...children);
    }

    render();
    return component;
  }

  const api = { STEP_DEFINITIONS, normalizeThreeTwoOne, renderThreeTwoOne };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ThreeTwoOneComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
