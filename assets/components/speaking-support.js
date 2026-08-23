(function initSpeakingSupportComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('SpeakingSupport requires SafeMarkdown.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const SECTION_DEFINITIONS = Object.freeze([
    Object.freeze({ key: 'reacting' }),
    Object.freeze({ key: 'followUpQuestions' }),
    Object.freeze({ key: 'clarification' }),
    Object.freeze({ key: 'suggestions' }),
    Object.freeze({ key: 'agreeingDisagreeing' }),
    Object.freeze({ key: 'decision' }),
  ]);
  const SECTION_KEYS = new Set(SECTION_DEFINITIONS.map(section => section.key));

  function normalizeTitle(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function exactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const expectedKeys = [...expected].sort();
    const keys = Object.keys(value).sort();
    return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
  }

  function normalizeSpeakingSupport(data) {
    if (!data || data.type !== 'speakingSupport' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('SpeakingSupport requires type "speakingSupport" and a kebab-case id.');
    }
    if (!exactKeys(data, ['type', 'id', 'title', 'sections'])) {
      throw new Error('SpeakingSupport contains unsupported fields.');
    }
    const title = normalizeTitle(data.title);
    if (!title) throw new Error('SpeakingSupport requires a title.');
    if (!exactKeys(data.sections, SECTION_KEYS)) {
      throw new Error('SpeakingSupport requires the fixed section set.');
    }
    const sections = {};
    SECTION_DEFINITIONS.forEach(({ key }) => {
      const section = data.sections[key];
      if (!exactKeys(section, ['title', 'text'])) {
        throw new Error(`SpeakingSupport section "${key}" has an invalid schema.`);
      }
      const sectionTitle = normalizeTitle(section.title);
      const text = typeof section.text === 'string' ? section.text.trim() : '';
      if (!sectionTitle || !text) {
        throw new Error(`SpeakingSupport section "${key}" requires a title and text.`);
      }
      sections[key] = { title: sectionTitle, text };
    });
    return { type: 'speakingSupport', id: data.id, title, sections };
  }

  function chatIcon(doc) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    svg.classList.add('speaking-support__icon');
    svg.setAttribute('viewBox', '0 0 32 32');
    svg.setAttribute('aria-hidden', 'true');
    const bubble = doc.createElementNS(ns, 'path');
    bubble.setAttribute('d', 'M27 15.2c0 6.1-5.4 10.7-12 10.7-1.8 0-3.5-.3-5-.9l-5.4 2 1.8-4.8A9.9 9.9 0 0 1 3 15.2C3 9.1 8.4 4.5 15 4.5s12 4.6 12 10.7Z');
    svg.append(bubble);
    [11, 15, 19].forEach((cx) => {
      const dot = doc.createElementNS(ns, 'circle');
      dot.setAttribute('cx', String(cx));
      dot.setAttribute('cy', '15');
      dot.setAttribute('r', '1.2');
      svg.append(dot);
    });
    return svg;
  }

  function renderSpeakingSupport(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('SpeakingSupport requires a document.');

    let current = normalizeSpeakingSupport(data);
    const canEdit = typeof settings.onSave === 'function';
    let editing = false;
    let saving = false;
    let initialSnapshot = '';
    let activeEditor = null;
    let titleEditor = null;
    const sectionEditors = new Map();

    const component = doc.createElement('section');
    component.className = 'speaking-support';
    component.dataset.componentId = current.id;

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

    function readEditorDraft() {
      if (!editing) return current;
      const sections = {};
      SECTION_DEFINITIONS.forEach(({ key }) => {
        const editors = sectionEditors.get(key);
        sections[key] = {
          title: normalizeTitle(editors.title.textContent),
          text: markdown.editorToMarkdown(editors.text),
        };
      });
      return {
        type: 'speakingSupport',
        id: current.id,
        title: normalizeTitle(titleEditor.textContent),
        sections,
      };
    }

    function notifyDirty() {
      if (!editing || typeof settings.onDirtyChange !== 'function') return;
      settings.onDirtyChange(JSON.stringify(readEditorDraft()) !== initialSnapshot, current.id);
    }

    function toolbar() {
      const bar = doc.createElement('div');
      bar.className = 'speaking-support__toolbar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Форматирование Speaking Support');
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
        normalized = normalizeSpeakingSupport(readEditorDraft());
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      component.classList.add('speaking-support--saving');
      try {
        const saved = await settings.onSave({ title: normalized.title, sections: normalized.sections }, current.id);
        current = normalizeSpeakingSupport(saved || normalized);
        editing = false;
        if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
        render();
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message || 'Не удалось сохранить Speaking Support.');
      } finally {
        saving = false;
        component.classList.remove('speaking-support--saving');
      }
    }

    function render() {
      activeEditor = null;
      titleEditor = null;
      sectionEditors.clear();
      component.classList.toggle('speaking-support--editing', editing);

      const children = [];
      if (editing) children.push(toolbar());
      const header = doc.createElement('header');
      header.className = 'speaking-support__header';
      header.append(chatIcon(doc));
      const heading = doc.createElement('h3');
      heading.textContent = current.title;
      header.append(heading);
      titleEditor = heading;
      if (editing) enableEditor(heading, 'Заголовок Speaking Support', false);
      children.push(header);

      const grid = doc.createElement('div');
      grid.className = 'speaking-support__grid';
      SECTION_DEFINITIONS.forEach(({ key }) => {
        const sectionData = current.sections[key];
        const section = doc.createElement('section');
        section.className = 'speaking-support__section';
        section.dataset.section = key;
        const sectionHeading = doc.createElement('h4');
        sectionHeading.textContent = sectionData.title;
        const body = doc.createElement('div');
        body.className = 'speaking-support__text safe-markdown';
        body.dataset.placeholder = 'Введите текст секции';
        markdown.renderMarkdownInto(body, sectionData.text, doc, 'speaking-support__spacer');
        section.append(sectionHeading, body);
        grid.append(section);
        sectionEditors.set(key, { title: sectionHeading, text: body });
        if (editing) {
          enableEditor(sectionHeading, `Заголовок секции ${sectionData.title}`, false);
          enableEditor(body, `Текст секции ${sectionData.title}`, true);
        }
      });
      children.push(grid);

      if (editing) {
        const actions = doc.createElement('div');
        actions.className = 'speaking-support__editor-actions';
        const cancel = doc.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Отмена';
        cancel.addEventListener('click', cancelEditing);
        const save = doc.createElement('button');
        save.type = 'button';
        save.className = 'speaking-support__save';
        save.textContent = 'Сохранить';
        save.addEventListener('click', saveEditing);
        actions.append(cancel, save);
        children.push(actions);
      } else if (canEdit) {
        const edit = doc.createElement('button');
        edit.type = 'button';
        edit.className = 'speaking-support__edit';
        edit.textContent = '✎';
        edit.setAttribute('aria-label', 'Редактировать Speaking Support');
        edit.addEventListener('click', beginEditing);
        children.push(edit);
      }
      component.replaceChildren(...children);
    }

    render();
    return component;
  }

  const api = { SECTION_DEFINITIONS, normalizeSpeakingSupport, renderSpeakingSupport };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SpeakingSupportComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
