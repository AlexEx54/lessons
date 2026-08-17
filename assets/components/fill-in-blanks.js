(function initFillInBlanksComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s|^\s*(?:[-*+]\s|\d+\.\s)/m;

  function plainText(value, field, allowEmpty = false) {
    const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    if (!normalized && !allowEmpty) throw new Error(`FillInBlanks requires ${field}.`);
    if (MARKUP.test(normalized)) throw new Error(`FillInBlanks does not allow HTML or Markdown in ${field}.`);
    return normalized;
  }

  function normalizeItems(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
      throw new Error('FillInBlanks requires between 1 and 12 items.');
    }
    const ids = new Set();
    return items.map((item) => {
      if (!item || Object.keys(item).some(key => !['id', 'before', 'answer', 'after'].includes(key))) {
        throw new Error('FillInBlanks items only support id, before, answer, and after.');
      }
      if (!KEBAB_CASE.test(String(item.id || '')) || ids.has(item.id)) {
        throw new Error('FillInBlanks item ids must be unique kebab-case values.');
      }
      ids.add(item.id);
      const before = plainText(item.before, 'item before text', true);
      const after = plainText(item.after, 'item after text', true);
      if (!before && !after) throw new Error('FillInBlanks items require sentence text before or after the blank.');
      return {
        id: item.id,
        before,
        answer: plainText(item.answer, 'an item answer'),
        after,
      };
    });
  }

  function normalizeFillInBlanks(data) {
    if (!data || data.type !== 'fillInBlanks' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('FillInBlanks requires type "fillInBlanks" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !['type', 'id', 'title', 'instruction', 'items'].includes(key))) {
      throw new Error('FillInBlanks contains unsupported fields.');
    }
    return {
      type: 'fillInBlanks',
      id: data.id,
      title: plainText(data.title, 'a title'),
      instruction: plainText(data.instruction, 'an instruction'),
      items: normalizeItems(data.items),
    };
  }

  function comparableAnswer(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase() : '';
  }

  function answersMatch(value, answer) {
    return Boolean(comparableAnswer(value)) && comparableAnswer(value) === comparableAnswer(answer);
  }

  function shouldShowAnswerKey(viewerRole) {
    if (!['teacher', 'student'].includes(viewerRole)) throw new Error('FillInBlanks requires a supported viewer role.');
    return viewerRole === 'teacher';
  }

  function createCheckIcon(doc, circled = false) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS(namespace, 'path');
    path.setAttribute('d', 'm8.2 12.2 2.5 2.5 5.4-5.7');
    if (circled) {
      const circle = doc.createElementNS(namespace, 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '9');
      svg.append(circle);
    }
    svg.append(path);
    return svg;
  }

  function renderFillInBlanks(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('FillInBlanks requires a document.');

    let current = normalizeFillInBlanks(data);
    const viewerRole = settings.viewerRole || 'teacher';
    shouldShowAnswerKey(viewerRole);
    let editing = false;
    let saving = false;
    let draftItems = [];
    let initialSnapshot = '';

    const section = doc.createElement('section');
    section.className = 'fill-in-blanks';
    section.dataset.componentId = current.id;

    const header = doc.createElement('div');
    header.className = 'fill-in-blanks__header';
    const title = doc.createElement('h2');
    title.className = 'fill-in-blanks__title';
    title.textContent = current.title;
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'fill-in-blanks__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать Fill in the Blanks');
    header.append(title);
    if (typeof settings.onSave === 'function') header.append(editButton);

    const instruction = doc.createElement('p');
    instruction.className = 'fill-in-blanks__instruction';
    instruction.textContent = current.instruction;
    const view = doc.createElement('div');
    view.className = 'fill-in-blanks__view';
    const editor = doc.createElement('div');
    editor.className = 'fill-in-blanks__editor';
    editor.hidden = true;

    function setDirty(dirty) {
      section.classList.toggle('fill-in-blanks--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function updateDirty() {
      setDirty(JSON.stringify(draftItems) !== initialSnapshot);
    }

    function paintView() {
      const list = doc.createElement('ol');
      list.className = 'fill-in-blanks__items';
      current.items.forEach((item, index) => {
        const row = doc.createElement('li');
        row.className = 'fill-in-blanks__item';
        const sentence = doc.createElement('div');
        sentence.className = 'fill-in-blanks__sentence';
        if (item.before) sentence.append(doc.createTextNode(item.before));
        const field = doc.createElement('span');
        field.className = 'fill-in-blanks__field';
        const input = doc.createElement('input');
        input.type = 'text';
        input.className = 'fill-in-blanks__input';
        input.autocomplete = 'off';
        input.spellcheck = false;
        input.dataset.itemId = item.id;
        input.setAttribute('aria-label', `Пропуск ${index + 1}`);
        const check = doc.createElement('span');
        check.className = 'fill-in-blanks__check';
        check.hidden = true;
        check.setAttribute('aria-hidden', 'true');
        const status = doc.createElement('span');
        status.className = 'fill-in-blanks__sr-status';
        status.setAttribute('aria-live', 'polite');
        input.addEventListener('input', () => {
          const correct = answersMatch(input.value, item.answer);
          field.classList.toggle('fill-in-blanks__field--correct', correct);
          check.hidden = !correct;
          status.textContent = correct ? `Ответ ${index + 1} верный.` : '';
          if (typeof settings.onActivity === 'function') settings.onActivity(current.id, item.id, correct ? 'correct' : 'pending');
        });
        field.append(input, check, status);
        sentence.append(field);
        if (item.after) sentence.append(doc.createTextNode(item.after));
        row.append(sentence);
        list.append(row);
      });
      const children = [list];
      if (shouldShowAnswerKey(viewerRole)) {
        const key = doc.createElement('aside');
        key.className = 'fill-in-blanks__answer-key';
        const keyHeader = doc.createElement('div');
        keyHeader.className = 'fill-in-blanks__answer-header';
        const keyTitle = doc.createElement('h3');
        keyTitle.className = 'fill-in-blanks__answer-title';
        const keyIcon = doc.createElement('span');
        keyIcon.className = 'fill-in-blanks__answer-icon';
        keyIcon.append(createCheckIcon(doc, true));
        keyTitle.append(keyIcon, doc.createTextNode('Answer Key'));
        keyHeader.append(keyTitle);
        if (typeof settings.onSave === 'function') {
          const keyEdit = doc.createElement('button');
          keyEdit.type = 'button';
          keyEdit.className = 'fill-in-blanks__answer-edit';
          keyEdit.textContent = '✎';
          keyEdit.setAttribute('aria-label', 'Редактировать Answer Key');
          keyEdit.addEventListener('click', enterEditMode);
          keyHeader.append(keyEdit);
        }
        const answers = doc.createElement('ol');
        answers.className = 'fill-in-blanks__answers';
        current.items.forEach((item) => {
          const answer = doc.createElement('li');
          answer.textContent = item.answer;
          answers.append(answer);
        });
        key.append(keyHeader, answers);
        children.push(key);
      }
      view.replaceChildren(...children);
    }

    function makeItemId() {
      const random = root.crypto && typeof root.crypto.randomUUID === 'function'
        ? root.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return `fill-item-${random.toLowerCase()}`;
    }

    function editorField(labelText, value, onInput) {
      const label = doc.createElement('label');
      label.className = 'fill-in-blanks__editor-field';
      const caption = doc.createElement('span');
      caption.textContent = labelText;
      const input = doc.createElement('input');
      input.type = 'text';
      input.value = value;
      input.addEventListener('input', () => onInput(input.value));
      label.append(caption, input);
      return label;
    }

    function paintEditor() {
      const rows = doc.createElement('div');
      rows.className = 'fill-in-blanks__editor-items';
      draftItems.forEach((item, index) => {
        const row = doc.createElement('div');
        row.className = 'fill-in-blanks__editor-item';
        const rowTitle = doc.createElement('strong');
        rowTitle.textContent = `Предложение ${index + 1}`;
        const controls = doc.createElement('div');
        controls.className = 'fill-in-blanks__editor-controls';
        [['↑', 'Переместить вверх', -1], ['↓', 'Переместить вниз', 1]].forEach(([symbol, label, offset]) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.textContent = symbol;
          button.setAttribute('aria-label', `${label}: предложение ${index + 1}`);
          button.disabled = saving || index + offset < 0 || index + offset >= draftItems.length;
          button.addEventListener('click', () => {
            const [moved] = draftItems.splice(index, 1);
            draftItems.splice(index + offset, 0, moved);
            paintEditor();
            updateDirty();
          });
          controls.append(button);
        });
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'fill-in-blanks__remove';
        remove.textContent = 'Удалить';
        remove.disabled = saving || draftItems.length === 1;
        remove.addEventListener('click', () => {
          draftItems.splice(index, 1);
          paintEditor();
          updateDirty();
        });
        controls.append(remove);
        row.append(rowTitle, controls);
        row.append(
          editorField('Текст до пропуска', item.before, value => { item.before = value; updateDirty(); }),
          editorField('Answer Key', item.answer, value => { item.answer = value; updateDirty(); }),
          editorField('Текст после пропуска', item.after, value => { item.after = value; updateDirty(); }),
        );
        rows.append(row);
      });

      const actions = doc.createElement('div');
      actions.className = 'fill-in-blanks__editor-actions';
      const add = doc.createElement('button');
      add.type = 'button';
      add.textContent = '+ Добавить предложение';
      add.disabled = saving || draftItems.length >= 12;
      add.addEventListener('click', () => {
        draftItems.push({ id: makeItemId(), before: '', answer: '', after: '' });
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
      save.className = 'fill-in-blanks__save';
      save.textContent = saving ? 'Сохраняем…' : 'Сохранить';
      save.disabled = saving;
      save.addEventListener('click', saveChanges);
      actions.append(add, cancel, save);
      editor.replaceChildren(rows, actions);
    }

    function enterEditMode() {
      if (editing) return;
      editing = true;
      draftItems = current.items.map(item => ({ ...item }));
      initialSnapshot = JSON.stringify(draftItems);
      view.hidden = true;
      editor.hidden = false;
      section.classList.add('fill-in-blanks--editing');
      editButton.hidden = true;
      paintEditor();
    }

    function leaveEditMode() {
      if (saving) return;
      editing = false;
      view.hidden = false;
      editor.hidden = true;
      section.classList.remove('fill-in-blanks--editing');
      editButton.hidden = false;
      setDirty(false);
    }

    async function saveChanges() {
      if (saving) return;
      let candidate;
      try {
        candidate = normalizeFillInBlanks({ ...current, items: draftItems });
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      paintEditor();
      try {
        const saved = await settings.onSave({ items: candidate.items }, current.id);
        current = normalizeFillInBlanks(saved || candidate);
        paintView();
        saving = false;
        leaveEditMode();
      } catch (error) {
        saving = false;
        paintEditor();
        if (typeof settings.onError === 'function') settings.onError(error?.message || 'Не удалось сохранить Fill in the Blanks.');
      }
    }

    editButton.addEventListener('click', enterEditMode);
    paintView();
    section.append(header, instruction, view, editor);
    return section;
  }

  const api = {
    answersMatch,
    normalizeFillInBlanks,
    normalizeItems,
    renderFillInBlanks,
    shouldShowAnswerKey,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FillInBlanksComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
