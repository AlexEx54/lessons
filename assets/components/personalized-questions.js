(function initPersonalizedQuestionsComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('PersonalizedQuestions requires SafeMarkdown.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const UNSAFE_INLINE = /<[^>]*>|__|`|!\[|\[[^\]]+\]\(|\r|\n|^\s{0,3}#{1,6}\s|^\s*(?:[-+*]|\d+\.)\s/;

  function plainText(value, field, allowInlineMarkdown = false) {
    const source = typeof value === 'string' ? value.trim() : '';
    const normalized = source.replace(/\s+/g, ' ');
    if (!normalized) throw new Error(`PersonalizedQuestions requires ${field}.`);
    if (UNSAFE_INLINE.test(source) || /\*{4,}/.test(source) || (!allowInlineMarkdown && source.includes('*'))) {
      throw new Error(`PersonalizedQuestions only allows safe inline Markdown in ${field}.`);
    }
    return normalized;
  }

  function normalizeItems(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
      throw new Error('PersonalizedQuestions requires between 1 and 12 items.');
    }
    const ids = new Set();
    return items.map((item) => {
      if (!item || Object.keys(item).some(key => !['id', 'question', 'followUp'].includes(key))) {
        throw new Error('PersonalizedQuestions items only support id, question, and followUp.');
      }
      if (!KEBAB_CASE.test(String(item.id || '')) || ids.has(item.id)) {
        throw new Error('PersonalizedQuestions item ids must be unique kebab-case values.');
      }
      ids.add(item.id);
      return {
        id: item.id,
        question: plainText(item.question, 'an item question', true),
        followUp: plainText(item.followUp, 'an item follow-up'),
      };
    });
  }

  function normalizePersonalizedQuestions(data) {
    if (!data || data.type !== 'personalizedQuestions' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('PersonalizedQuestions requires type "personalizedQuestions" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !['type', 'id', 'title', 'instruction', 'items'].includes(key))) {
      throw new Error('PersonalizedQuestions contains unsupported fields.');
    }
    return {
      type: 'personalizedQuestions',
      id: data.id,
      title: plainText(data.title, 'a title'),
      instruction: plainText(data.instruction, 'an instruction'),
      items: normalizeItems(data.items),
    };
  }

  function renderInlineMarkdown(container, value, doc) {
    markdown.renderMarkdownInto(container, value, doc, 'personalized-questions__spacer');
  }

  function renderPersonalizedQuestions(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('PersonalizedQuestions requires a document.');

    let current = normalizePersonalizedQuestions(data);
    let draft = null;
    let initialSnapshot = '';
    let saving = false;

    const section = doc.createElement('section');
    section.className = 'personalized-questions';
    section.dataset.componentId = current.id;

    const header = doc.createElement('div');
    header.className = 'personalized-questions__header';
    const title = doc.createElement('h2');
    title.className = 'personalized-questions__title';
    const edit = doc.createElement('button');
    edit.type = 'button';
    edit.className = 'personalized-questions__edit';
    edit.textContent = '✎';
    edit.setAttribute('aria-label', 'Редактировать Personalised Questions');
    header.append(title);
    if (typeof settings.onSave === 'function') header.append(edit);

    const instruction = doc.createElement('p');
    instruction.className = 'personalized-questions__instruction';
    const view = doc.createElement('ol');
    view.className = 'personalized-questions__items';
    const editor = doc.createElement('div');
    editor.className = 'personalized-questions__editor';
    editor.hidden = true;

    function setDirty(value) {
      section.classList.toggle('personalized-questions--dirty', value);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(value, current.id);
    }

    function snapshot() {
      return JSON.stringify({ title: draft.title, instruction: draft.instruction, items: draft.items });
    }

    function updateDirty() {
      setDirty(snapshot() !== initialSnapshot);
    }

    function paintView() {
      title.textContent = current.title;
      instruction.textContent = current.instruction;
      const rows = current.items.map((item, index) => {
        const row = doc.createElement('li');
        row.className = 'personalized-questions__item';
        row.value = index + 1;
        const body = doc.createElement('div');
        body.className = 'personalized-questions__item-body';
        const question = doc.createElement('div');
        question.className = 'personalized-questions__question';
        renderInlineMarkdown(question, item.question, doc);
        const followUp = doc.createElement('div');
        followUp.className = 'personalized-questions__follow-up';
        const arrow = doc.createElement('span');
        arrow.className = 'personalized-questions__arrow';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '↪';
        const followUpText = doc.createElement('div');
        followUpText.className = 'personalized-questions__follow-up-text';
        renderInlineMarkdown(followUpText, `*Follow-up: ${item.followUp}*`, doc);
        followUp.append(arrow, followUpText);
        body.append(question, followUp);
        row.append(body);
        return row;
      });
      view.replaceChildren(...rows);
    }

    function makeItemId() {
      const random = root.crypto && typeof root.crypto.randomUUID === 'function'
        ? root.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return `personal-question-${random.toLowerCase()}`;
    }

    function field(labelText, value, onInput, multiline = false) {
      const label = doc.createElement('label');
      label.className = 'personalized-questions__field';
      const caption = doc.createElement('span');
      caption.textContent = labelText;
      const input = doc.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = 'text';
      input.value = value;
      input.addEventListener('input', () => onInput(input.value));
      label.append(caption, input);
      return label;
    }

    function paintEditor() {
      const general = doc.createElement('div');
      general.className = 'personalized-questions__editor-general';
      general.append(
        field('Заголовок', draft.title, value => { draft.title = value; updateDirty(); }),
        field('Инструкция', draft.instruction, value => { draft.instruction = value; updateDirty(); }, true),
      );
      const rows = doc.createElement('div');
      rows.className = 'personalized-questions__editor-items';
      draft.items.forEach((item, index) => {
        const row = doc.createElement('div');
        row.className = 'personalized-questions__editor-item';
        const rowHeader = doc.createElement('div');
        rowHeader.className = 'personalized-questions__editor-item-header';
        const rowTitle = doc.createElement('strong');
        rowTitle.textContent = `Вопрос ${index + 1}`;
        const controls = doc.createElement('div');
        controls.className = 'personalized-questions__editor-controls';
        [['↑', 'Переместить вверх', -1], ['↓', 'Переместить вниз', 1]].forEach(([symbol, label, offset]) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.textContent = symbol;
          button.setAttribute('aria-label', `${label}: вопрос ${index + 1}`);
          button.disabled = saving || index + offset < 0 || index + offset >= draft.items.length;
          button.addEventListener('click', () => {
            const [moved] = draft.items.splice(index, 1);
            draft.items.splice(index + offset, 0, moved);
            paintEditor();
            updateDirty();
          });
          controls.append(button);
        });
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'personalized-questions__remove';
        remove.textContent = 'Удалить';
        remove.disabled = saving || draft.items.length === 1;
        remove.addEventListener('click', () => {
          draft.items.splice(index, 1);
          paintEditor();
          updateDirty();
        });
        controls.append(remove);
        rowHeader.append(rowTitle, controls);
        row.append(
          rowHeader,
          field('Вопрос (поддерживает **выделение**)', item.question, value => { item.question = value; updateDirty(); }, true),
          field('Follow-up', item.followUp, value => { item.followUp = value; updateDirty(); }, true),
        );
        rows.append(row);
      });

      const actions = doc.createElement('div');
      actions.className = 'personalized-questions__editor-actions';
      const add = doc.createElement('button');
      add.type = 'button';
      add.textContent = '+ Добавить вопрос';
      add.disabled = saving || draft.items.length >= 12;
      add.addEventListener('click', () => {
        draft.items.push({ id: makeItemId(), question: '', followUp: '' });
        paintEditor();
        updateDirty();
      });
      const cancel = doc.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Отмена';
      cancel.disabled = saving;
      cancel.addEventListener('click', leaveEditMode);
      const save = doc.createElement('button');
      save.type = 'button';
      save.className = 'personalized-questions__save';
      save.textContent = saving ? 'Сохраняем…' : 'Сохранить';
      save.disabled = saving;
      save.addEventListener('click', saveChanges);
      actions.append(add, cancel, save);
      editor.replaceChildren(general, rows, actions);
    }

    function enterEditMode() {
      draft = {
        title: current.title,
        instruction: current.instruction,
        items: current.items.map(item => ({ ...item })),
      };
      initialSnapshot = snapshot();
      view.hidden = true;
      instruction.hidden = true;
      editor.hidden = false;
      edit.hidden = true;
      section.classList.add('personalized-questions--editing');
      paintEditor();
    }

    function leaveEditMode() {
      if (saving) return;
      draft = null;
      view.hidden = false;
      instruction.hidden = false;
      editor.hidden = true;
      edit.hidden = false;
      section.classList.remove('personalized-questions--editing');
      setDirty(false);
    }

    async function saveChanges() {
      if (saving) return;
      let candidate;
      try {
        candidate = normalizePersonalizedQuestions({ ...current, ...draft });
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      paintEditor();
      try {
        const changes = { title: candidate.title, instruction: candidate.instruction, items: candidate.items };
        const saved = await settings.onSave(changes, current.id);
        current = normalizePersonalizedQuestions(saved || candidate);
        paintView();
        saving = false;
        leaveEditMode();
      } catch (error) {
        saving = false;
        paintEditor();
        if (typeof settings.onError === 'function') {
          settings.onError(error?.message || 'Не удалось сохранить Personalised Questions.');
        }
      }
    }

    edit.addEventListener('click', enterEditMode);
    paintView();
    section.append(header, instruction, view, editor);
    return section;
  }

  const api = { normalizeItems, normalizePersonalizedQuestions, renderPersonalizedQuestions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PersonalizedQuestionsComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
