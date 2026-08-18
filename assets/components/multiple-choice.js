(function initMultipleChoiceComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s|^\s*(?:[-*+]\s|\d+\.\s)/m;
  const COMPONENT_KEYS = ['type', 'id', 'title', 'instruction', 'items'];
  const ITEM_KEYS = ['id', 'question', 'options', 'answer', 'explanation'];

  function plainText(value, field, allowEmpty = false) {
    const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    if (!normalized && !allowEmpty) throw new Error(`MultipleChoice requires ${field}.`);
    if (normalized && MARKUP.test(normalized)) {
      throw new Error(`MultipleChoice does not allow HTML or Markdown in ${field}.`);
    }
    return normalized;
  }

  function optionLetter(index) {
    return String.fromCharCode(65 + index);
  }

  function shouldHintCorrect(viewerRole) {
    if (!['teacher', 'student'].includes(viewerRole)) {
      throw new Error('MultipleChoice requires a supported viewer role.');
    }
    return viewerRole === 'teacher';
  }

  function normalizeOptions(options, answer) {
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) {
      throw new Error('MultipleChoice items require between 2 and 8 options.');
    }
    const normalized = options.map(option => plainText(option, 'an option'));
    if (new Set(normalized).size !== normalized.length) {
      throw new Error('MultipleChoice options must be unique within each item.');
    }
    const normalizedAnswer = plainText(answer, 'an item answer');
    if (!normalized.includes(normalizedAnswer)) {
      throw new Error('MultipleChoice answer must match one of its options.');
    }
    return { options: normalized, answer: normalizedAnswer };
  }

  function normalizeItems(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
      throw new Error('MultipleChoice requires between 1 and 12 items.');
    }
    const ids = new Set();
    return items.map((item) => {
      if (!item || Object.keys(item).some(key => !ITEM_KEYS.includes(key))) {
        throw new Error('MultipleChoice items only support id, question, options, answer, and explanation.');
      }
      if (!KEBAB_CASE.test(String(item.id || '')) || ids.has(item.id)) {
        throw new Error('MultipleChoice item ids must be unique kebab-case values.');
      }
      ids.add(item.id);
      const choice = normalizeOptions(item.options, item.answer);
      const next = {
        id: item.id,
        question: plainText(item.question, 'an item question'),
        options: choice.options,
        answer: choice.answer,
      };
      if (item.explanation !== undefined) {
        if (typeof item.explanation !== 'string') {
          throw new Error('MultipleChoice explanation must be a string.');
        }
        const explanation = plainText(item.explanation, 'an item explanation', true);
        if (explanation) next.explanation = explanation;
      }
      return next;
    });
  }

  function normalizeMultipleChoice(data) {
    if (!data || data.type !== 'multipleChoice' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('MultipleChoice requires type "multipleChoice" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !COMPONENT_KEYS.includes(key))) {
      throw new Error('MultipleChoice contains unsupported fields.');
    }
    return {
      type: 'multipleChoice',
      id: data.id,
      title: plainText(data.title, 'a title'),
      instruction: plainText(data.instruction, 'an instruction'),
      items: normalizeItems(data.items),
    };
  }

  function createCheckIcon(doc, circled = false) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (circled) {
      const circle = doc.createElementNS(namespace, 'circle');
      circle.setAttribute('cx', '12');
      circle.setAttribute('cy', '12');
      circle.setAttribute('r', '9');
      svg.append(circle);
    }
    const path = doc.createElementNS(namespace, 'path');
    path.setAttribute('d', 'm8.2 12.2 2.5 2.5 5.4-5.7');
    svg.append(path);
    return svg;
  }

  function renderMultipleChoice(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('MultipleChoice requires a document.');

    let current = normalizeMultipleChoice(data);
    const viewerRole = settings.viewerRole || 'teacher';
    const hintCorrect = shouldHintCorrect(viewerRole);
    let draft = null;
    let initialSnapshot = '';
    let saving = false;
    const selections = new Map();

    const section = doc.createElement('section');
    section.className = 'multiple-choice';
    section.dataset.componentId = current.id;

    const header = doc.createElement('div');
    header.className = 'multiple-choice__header';
    const title = doc.createElement('h2');
    title.className = 'multiple-choice__title';
    const edit = doc.createElement('button');
    edit.type = 'button';
    edit.className = 'multiple-choice__edit';
    edit.textContent = '✎';
    edit.setAttribute('aria-label', 'Редактировать Multiple Choice');
    header.append(title);
    if (typeof settings.onSave === 'function') header.append(edit);

    const instruction = doc.createElement('p');
    instruction.className = 'multiple-choice__instruction';
    const view = doc.createElement('div');
    view.className = 'multiple-choice__view';
    const editor = doc.createElement('div');
    editor.className = 'multiple-choice__editor';
    editor.hidden = true;

    function setDirty(value) {
      section.classList.toggle('multiple-choice--dirty', value);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(value, current.id);
    }

    function snapshot() {
      return JSON.stringify({ title: draft.title, instruction: draft.instruction, items: draft.items });
    }

    function updateDirty() {
      setDirty(snapshot() !== initialSnapshot);
    }

    function applyItemState(item, nodes) {
      const selected = selections.get(item.id);
      const locked = selected === item.answer;
      item.options.forEach((option, index) => {
        const button = nodes.buttons[index];
        const isSelected = selected === option;
        const isCorrect = option === item.answer;
        button.classList.toggle('multiple-choice__option--correct', isSelected && isCorrect);
        button.classList.toggle('multiple-choice__option--wrong', isSelected && !isCorrect);
        button.classList.toggle('multiple-choice__option--hint', hintCorrect && isCorrect && !locked);
        button.disabled = locked;
        button.setAttribute('aria-pressed', String(isSelected));
        nodes.checks[index].hidden = !(isSelected && isCorrect);
      });
      if (nodes.feedback) nodes.feedback.hidden = !(locked && item.explanation);
      nodes.status.textContent = locked
        ? `Вопрос верный.`
        : selected
          ? 'Неверный вариант. Попробуйте ещё раз.'
          : '';
    }

    function renderItem(item, index, numbered) {
      const block = doc.createElement(numbered ? 'li' : 'div');
      block.className = numbered
        ? 'multiple-choice__item multiple-choice__item--card'
        : 'multiple-choice__item';
      if (numbered) block.value = index + 1;

      const question = doc.createElement(numbered ? 'h3' : 'p');
      question.className = 'multiple-choice__question';
      if (numbered) {
        const number = doc.createElement('span');
        number.className = 'multiple-choice__number';
        number.textContent = `${index + 1}.`;
        question.append(number, doc.createTextNode(' '));
      }
      question.append(doc.createTextNode(item.question));

      const group = doc.createElement('div');
      group.className = 'multiple-choice__options';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', item.question);

      const nodes = { buttons: [], checks: [] };
      item.options.forEach((option, optionIndex) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'multiple-choice__option';
        const letter = doc.createElement('span');
        letter.className = 'multiple-choice__letter';
        letter.textContent = optionLetter(optionIndex);
        const label = doc.createElement('span');
        label.className = 'multiple-choice__option-text';
        label.textContent = option;
        const check = doc.createElement('span');
        check.className = 'multiple-choice__option-check';
        check.hidden = true;
        check.append(createCheckIcon(doc));
        button.append(letter, label, check);
        button.addEventListener('click', () => {
          if (selections.get(item.id) === item.answer) return;
          selections.set(item.id, option);
          applyItemState(item, nodes);
          if (typeof settings.onActivity === 'function') {
            settings.onActivity(current.id, item.id, option === item.answer ? 'correct' : 'wrong');
          }
        });
        group.append(button);
        nodes.buttons.push(button);
        nodes.checks.push(check);
      });

      const status = doc.createElement('p');
      status.className = 'multiple-choice__sr-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      nodes.status = status;

      block.append(question, group);
      if (item.explanation) {
        const feedback = doc.createElement('p');
        feedback.className = 'multiple-choice__feedback';
        feedback.hidden = true;
        const icon = doc.createElement('span');
        icon.className = 'multiple-choice__feedback-icon';
        icon.append(createCheckIcon(doc, true));
        feedback.append(icon, doc.createTextNode(`Correct! ${item.explanation}`));
        block.append(feedback);
        nodes.feedback = feedback;
      }
      block.append(status);
      applyItemState(item, nodes);
      return block;
    }

    function paintView() {
      title.textContent = current.title;
      instruction.textContent = current.instruction;
      if (current.items.length === 1) {
        view.replaceChildren(renderItem(current.items[0], 0, false));
        return;
      }
      const list = doc.createElement('ol');
      list.className = 'multiple-choice__items';
      current.items.forEach((item, index) => list.append(renderItem(item, index, true)));
      view.replaceChildren(list);
    }

    function makeItemId() {
      const random = root.crypto && typeof root.crypto.randomUUID === 'function'
        ? root.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return `choice-item-${random.toLowerCase()}`;
    }

    function field(labelText, value, onInput, multiline = false) {
      const label = doc.createElement('label');
      label.className = 'multiple-choice__field';
      const caption = doc.createElement('span');
      caption.textContent = labelText;
      const input = doc.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = 'text';
      input.value = value;
      input.addEventListener('input', () => onInput(input.value));
      label.append(caption, input);
      return label;
    }

    function controlButton(label, ariaLabel, onClick, className) {
      const button = doc.createElement('button');
      button.type = 'button';
      if (className) button.className = className;
      button.textContent = label;
      button.setAttribute('aria-label', ariaLabel);
      button.disabled = saving;
      button.addEventListener('click', onClick);
      return button;
    }

    function paintEditor() {
      const general = doc.createElement('div');
      general.className = 'multiple-choice__editor-general';
      general.append(
        field('Заголовок', draft.title, value => { draft.title = value; updateDirty(); }),
        field('Инструкция', draft.instruction, value => { draft.instruction = value; updateDirty(); }, true),
      );

      const rows = doc.createElement('div');
      rows.className = 'multiple-choice__editor-items';
      draft.items.forEach((item, index) => {
        const row = doc.createElement('div');
        row.className = 'multiple-choice__editor-item';
        const rowHeader = doc.createElement('div');
        rowHeader.className = 'multiple-choice__editor-item-header';
        const rowTitle = doc.createElement('strong');
        rowTitle.textContent = `Вопрос ${index + 1}`;
        const controls = doc.createElement('div');
        controls.className = 'multiple-choice__editor-controls';
        [['↑', 'Переместить вверх', -1], ['↓', 'Переместить вниз', 1]].forEach(([symbol, label, offset]) => {
          const button = controlButton(symbol, `${label}: вопрос ${index + 1}`, () => {
            const [moved] = draft.items.splice(index, 1);
            draft.items.splice(index + offset, 0, moved);
            paintEditor();
            updateDirty();
          });
          button.disabled = saving || index + offset < 0 || index + offset >= draft.items.length;
          controls.append(button);
        });
        const remove = controlButton('Удалить', `Удалить вопрос ${index + 1}`, () => {
          draft.items.splice(index, 1);
          paintEditor();
          updateDirty();
        }, 'multiple-choice__remove');
        remove.disabled = saving || draft.items.length === 1;
        controls.append(remove);
        rowHeader.append(rowTitle, controls);

        const options = doc.createElement('div');
        options.className = 'multiple-choice__editor-options';
        item.options.forEach((option, optionIndex) => {
          const optionRow = doc.createElement('div');
          optionRow.className = 'multiple-choice__editor-option';
          const correct = doc.createElement('label');
          correct.className = 'multiple-choice__editor-correct';
          const radio = doc.createElement('input');
          radio.type = 'radio';
          radio.name = `multiple-choice-answer-${current.id}-${item.id}`;
          radio.checked = option === item.answer;
          radio.disabled = saving;
          radio.addEventListener('change', () => {
            item.answer = item.options[optionIndex];
            updateDirty();
          });
          const letter = doc.createElement('span');
          letter.textContent = optionLetter(optionIndex);
          correct.append(radio, letter);
          const input = doc.createElement('input');
          input.type = 'text';
          input.value = option;
          input.setAttribute('aria-label', `Вариант ${optionLetter(optionIndex)}`);
          input.addEventListener('input', () => {
            const previous = item.options[optionIndex];
            item.options[optionIndex] = input.value;
            if (item.answer === previous) item.answer = input.value;
            updateDirty();
          });
          const optionControls = doc.createElement('div');
          optionControls.className = 'multiple-choice__editor-controls';
          [['↑', 'Переместить вверх', -1], ['↓', 'Переместить вниз', 1]].forEach(([symbol, label, offset]) => {
            const button = controlButton(symbol, `${label}: вариант ${optionLetter(optionIndex)}`, () => {
              const [moved] = item.options.splice(optionIndex, 1);
              item.options.splice(optionIndex + offset, 0, moved);
              paintEditor();
              updateDirty();
            });
            button.disabled = saving || optionIndex + offset < 0 || optionIndex + offset >= item.options.length;
            optionControls.append(button);
          });
          const removeOption = controlButton('×', `Удалить вариант ${optionLetter(optionIndex)}`, () => {
            const [removed] = item.options.splice(optionIndex, 1);
            if (item.answer === removed) item.answer = item.options[0] || '';
            paintEditor();
            updateDirty();
          }, 'multiple-choice__remove');
          removeOption.disabled = saving || item.options.length <= 2;
          optionControls.append(removeOption);
          optionRow.append(correct, input, optionControls);
          options.append(optionRow);
        });

        const addOption = controlButton('+ Вариант', `Добавить вариант к вопросу ${index + 1}`, () => {
          item.options.push('');
          paintEditor();
          updateDirty();
        });
        addOption.disabled = saving || item.options.length >= 8;

        row.append(
          rowHeader,
          field('Вопрос', item.question, value => { item.question = value; updateDirty(); }, true),
          options,
          addOption,
          field('Пояснение к правильному ответу', item.explanation || '', value => {
            item.explanation = value;
            updateDirty();
          }, true),
        );
        rows.append(row);
      });

      const actions = doc.createElement('div');
      actions.className = 'multiple-choice__editor-actions';
      const add = controlButton('+ Добавить вопрос', 'Добавить вопрос', () => {
        draft.items.push({
          id: makeItemId(),
          question: '',
          options: ['', ''],
          answer: '',
          explanation: '',
        });
        paintEditor();
        updateDirty();
      });
      add.disabled = saving || draft.items.length >= 12;
      const cancel = controlButton('Отмена', 'Отменить редактирование', leaveEditMode);
      const save = controlButton(saving ? 'Сохраняем…' : 'Сохранить', 'Сохранить Multiple Choice', saveChanges, 'multiple-choice__save');
      actions.append(add, cancel, save);
      editor.replaceChildren(general, rows, actions);
    }

    function enterEditMode() {
      draft = {
        title: current.title,
        instruction: current.instruction,
        items: current.items.map(item => ({
          id: item.id,
          question: item.question,
          options: item.options.slice(),
          answer: item.answer,
          explanation: item.explanation || '',
        })),
      };
      initialSnapshot = snapshot();
      view.hidden = true;
      instruction.hidden = true;
      editor.hidden = false;
      edit.hidden = true;
      section.classList.add('multiple-choice--editing');
      paintEditor();
    }

    function leaveEditMode() {
      if (saving) return;
      draft = null;
      view.hidden = false;
      instruction.hidden = false;
      editor.hidden = true;
      edit.hidden = false;
      section.classList.remove('multiple-choice--editing');
      setDirty(false);
    }

    async function saveChanges() {
      if (saving) return;
      let candidate;
      try {
        candidate = normalizeMultipleChoice({
          type: 'multipleChoice',
          id: current.id,
          title: draft.title,
          instruction: draft.instruction,
          items: draft.items,
        });
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      paintEditor();
      try {
        const changes = {
          title: candidate.title,
          instruction: candidate.instruction,
          items: candidate.items,
        };
        const saved = await settings.onSave(changes, current.id);
        current = normalizeMultipleChoice(saved || { ...current, ...candidate });
        selections.clear();
        paintView();
        saving = false;
        leaveEditMode();
      } catch (error) {
        saving = false;
        paintEditor();
        if (typeof settings.onError === 'function') {
          settings.onError(error?.message || 'Не удалось сохранить Multiple Choice.');
        }
      }
    }

    edit.addEventListener('click', enterEditMode);
    paintView();
    section.append(header, instruction, view, editor);
    return section;
  }

  const api = {
    normalizeItems,
    normalizeMultipleChoice,
    optionLetter,
    renderMultipleChoice,
    shouldHintCorrect,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MultipleChoiceComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
