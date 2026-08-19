(function initCheckboxChoiceComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s|^\s*(?:[-*+]\s|\d+\.\s)/m;
  const COMPONENT_KEYS = ['type', 'id', 'title', 'instruction', 'items'];
  const ITEM_KEYS = ['id', 'question', 'options', 'answers'];

  function plainText(value, field, allowEmpty = false) {
    const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    if (!normalized && !allowEmpty) throw new Error(`CheckboxChoice requires ${field}.`);
    if (normalized && MARKUP.test(normalized)) {
      throw new Error(`CheckboxChoice does not allow HTML or Markdown in ${field}.`);
    }
    return normalized;
  }

  function optionLetter(index) {
    return String.fromCharCode(65 + index);
  }

  function shouldHintCorrect(viewerRole) {
    if (!['teacher', 'student'].includes(viewerRole)) {
      throw new Error('CheckboxChoice requires a supported viewer role.');
    }
    return viewerRole === 'teacher';
  }

  function normalizeChoice(options, answers) {
    if (!Array.isArray(options) || options.length < 2 || options.length > 8) {
      throw new Error('CheckboxChoice items require between 2 and 8 options.');
    }
    const normalizedOptions = options.map(option => plainText(option, 'an option'));
    if (new Set(normalizedOptions).size !== normalizedOptions.length) {
      throw new Error('CheckboxChoice options must be unique within each item.');
    }
    if (!Array.isArray(answers) || answers.length < 1) {
      throw new Error('CheckboxChoice items require at least one answer.');
    }
    const normalizedAnswers = answers.map(answer => plainText(answer, 'an item answer'));
    if (new Set(normalizedAnswers).size !== normalizedAnswers.length) {
      throw new Error('CheckboxChoice answers must be unique within each item.');
    }
    if (normalizedAnswers.some(answer => !normalizedOptions.includes(answer))) {
      throw new Error('CheckboxChoice answers must match the item options.');
    }
    return {
      options: normalizedOptions,
      answers: normalizedOptions.filter(option => normalizedAnswers.includes(option)),
    };
  }

  function normalizeItems(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
      throw new Error('CheckboxChoice requires between 1 and 12 items.');
    }
    const ids = new Set();
    return items.map((item) => {
      if (!item || Object.keys(item).some(key => !ITEM_KEYS.includes(key))) {
        throw new Error('CheckboxChoice items only support id, question, options, and answers.');
      }
      if (!KEBAB_CASE.test(String(item.id || '')) || ids.has(item.id)) {
        throw new Error('CheckboxChoice item ids must be unique kebab-case values.');
      }
      ids.add(item.id);
      const choice = normalizeChoice(item.options, item.answers);
      return {
        id: item.id,
        question: plainText(item.question, 'an item question'),
        options: choice.options,
        answers: choice.answers,
      };
    });
  }

  function normalizeCheckboxChoice(data) {
    if (!data || data.type !== 'checkboxChoice' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('CheckboxChoice requires type "checkboxChoice" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !COMPONENT_KEYS.includes(key))) {
      throw new Error('CheckboxChoice contains unsupported fields.');
    }
    return {
      type: 'checkboxChoice',
      id: data.id,
      title: plainText(data.title, 'a title'),
      instruction: plainText(data.instruction, 'an instruction'),
      items: normalizeItems(data.items),
    };
  }

  function createCheckIcon(doc) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS(namespace, 'path');
    path.setAttribute('d', 'm8.2 12.2 2.5 2.5 5.4-5.7');
    svg.append(path);
    return svg;
  }

  function renderCheckboxChoice(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('CheckboxChoice requires a document.');

    let current = normalizeCheckboxChoice(data);
    const viewerRole = settings.viewerRole || 'teacher';
    const hintCorrect = shouldHintCorrect(viewerRole);
    let draft = null;
    let initialSnapshot = '';
    let saving = false;
    const revealed = new Map();

    const section = doc.createElement('section');
    section.className = 'checkbox-choice';
    section.dataset.componentId = current.id;

    const header = doc.createElement('div');
    header.className = 'checkbox-choice__header';
    const title = doc.createElement('h2');
    title.className = 'checkbox-choice__title';
    const edit = doc.createElement('button');
    edit.type = 'button';
    edit.className = 'checkbox-choice__edit';
    edit.textContent = '✎';
    edit.setAttribute('aria-label', 'Редактировать Checkbox Choice');
    header.append(title);
    if (typeof settings.onSave === 'function') header.append(edit);

    const instruction = doc.createElement('p');
    instruction.className = 'checkbox-choice__instruction';
    const view = doc.createElement('div');
    view.className = 'checkbox-choice__view';
    const editor = doc.createElement('div');
    editor.className = 'checkbox-choice__editor';
    editor.hidden = true;

    function setDirty(value) {
      section.classList.toggle('checkbox-choice--dirty', value);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(value, current.id);
    }

    function snapshot() {
      return JSON.stringify({ title: draft.title, instruction: draft.instruction, items: draft.items });
    }

    function updateDirty() {
      setDirty(snapshot() !== initialSnapshot);
    }

    function revealedFor(itemId) {
      if (!revealed.has(itemId)) revealed.set(itemId, new Set());
      return revealed.get(itemId);
    }

    function isComplete(item) {
      const seen = revealedFor(item.id);
      return item.answers.every(answer => seen.has(answer));
    }

    function applyItemState(item, nodes) {
      const seen = revealedFor(item.id);
      const complete = isComplete(item);
      item.options.forEach((option, index) => {
        const button = nodes.buttons[index];
        const isSeen = seen.has(option);
        const isCorrect = item.answers.includes(option);
        button.classList.toggle('checkbox-choice__option--correct', isSeen && isCorrect);
        button.classList.toggle('checkbox-choice__option--wrong', isSeen && !isCorrect);
        button.classList.toggle('checkbox-choice__option--hint', hintCorrect && isCorrect && !isSeen);
        button.disabled = isSeen || complete;
        button.setAttribute('aria-checked', String(isSeen && isCorrect));
        nodes.ticks[index].hidden = !(isSeen && isCorrect);
      });
      nodes.status.textContent = isComplete(item)
        ? 'Вопрос верный.'
        : seen.size
          ? 'Неверный или неполный ответ. Продолжайте выбирать.'
          : '';
    }

    function renderItem(item, index, numbered) {
      const block = doc.createElement(numbered ? 'li' : 'div');
      block.className = 'checkbox-choice__item';
      if (numbered) block.value = index + 1;

      const question = doc.createElement(numbered ? 'h3' : 'p');
      question.className = 'checkbox-choice__question';
      if (numbered) {
        const number = doc.createElement('span');
        number.className = 'checkbox-choice__number';
        number.textContent = `${index + 1}.`;
        question.append(number, doc.createTextNode(' '));
      }
      question.append(doc.createTextNode(item.question));

      const group = doc.createElement('div');
      group.className = 'checkbox-choice__options';
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', item.question);

      const nodes = { buttons: [], ticks: [] };
      item.options.forEach((option, optionIndex) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'checkbox-choice__option';
        button.setAttribute('role', 'checkbox');
        button.setAttribute('aria-checked', 'false');
        const box = doc.createElement('span');
        box.className = 'checkbox-choice__box';
        const tick = doc.createElement('span');
        tick.className = 'checkbox-choice__tick';
        tick.hidden = true;
        tick.append(createCheckIcon(doc));
        box.append(tick);
        const label = doc.createElement('span');
        label.className = 'checkbox-choice__option-text';
        label.textContent = option;
        button.append(box, label);
        button.addEventListener('click', () => {
          const seen = revealedFor(item.id);
          if (seen.has(option)) return;
          seen.add(option);
          applyItemState(item, nodes);
          if (typeof settings.onActivity === 'function') {
            settings.onActivity(current.id, item.id, item.answers.includes(option) ? 'correct' : 'wrong');
          }
        });
        group.append(button);
        nodes.buttons.push(button);
        nodes.ticks.push(tick);
      });

      const status = doc.createElement('p');
      status.className = 'checkbox-choice__sr-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      nodes.status = status;

      block.append(question, group, status);
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
      list.className = 'checkbox-choice__items';
      current.items.forEach((item, index) => list.append(renderItem(item, index, true)));
      view.replaceChildren(list);
    }

    function makeItemId() {
      const random = root.crypto && typeof root.crypto.randomUUID === 'function'
        ? root.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return `checkbox-item-${random.toLowerCase()}`;
    }

    function field(labelText, value, onInput, multiline = false) {
      const label = doc.createElement('label');
      label.className = 'checkbox-choice__field';
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
      general.className = 'checkbox-choice__editor-general';
      general.append(
        field('Заголовок', draft.title, value => { draft.title = value; updateDirty(); }),
        field('Инструкция', draft.instruction, value => { draft.instruction = value; updateDirty(); }, true),
      );

      const rows = doc.createElement('div');
      rows.className = 'checkbox-choice__editor-items';
      draft.items.forEach((item, index) => {
        const row = doc.createElement('div');
        row.className = 'checkbox-choice__editor-item';
        const rowHeader = doc.createElement('div');
        rowHeader.className = 'checkbox-choice__editor-item-header';
        const rowTitle = doc.createElement('strong');
        rowTitle.textContent = `Вопрос ${index + 1}`;
        const controls = doc.createElement('div');
        controls.className = 'checkbox-choice__editor-controls';
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
        }, 'checkbox-choice__remove');
        remove.disabled = saving || draft.items.length === 1;
        controls.append(remove);
        rowHeader.append(rowTitle, controls);

        const options = doc.createElement('div');
        options.className = 'checkbox-choice__editor-options';
        item.options.forEach((option, optionIndex) => {
          const optionRow = doc.createElement('div');
          optionRow.className = 'checkbox-choice__editor-option';
          const correct = doc.createElement('label');
          correct.className = 'checkbox-choice__editor-correct';
          const checkbox = doc.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = item.answers.includes(option);
          checkbox.disabled = saving;
          checkbox.setAttribute('aria-label', `Верный вариант ${optionLetter(optionIndex)}`);
          checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
              if (!item.answers.includes(item.options[optionIndex])) {
                item.answers.push(item.options[optionIndex]);
              }
            } else {
              item.answers = item.answers.filter(answer => answer !== item.options[optionIndex]);
            }
            updateDirty();
          });
          const letter = doc.createElement('span');
          letter.textContent = optionLetter(optionIndex);
          correct.append(checkbox, letter);
          const input = doc.createElement('input');
          input.type = 'text';
          input.value = option;
          input.setAttribute('aria-label', `Вариант ${optionLetter(optionIndex)}`);
          input.addEventListener('input', () => {
            const previous = item.options[optionIndex];
            item.options[optionIndex] = input.value;
            item.answers = item.answers.map(answer => (answer === previous ? input.value : answer));
            updateDirty();
          });
          const optionControls = doc.createElement('div');
          optionControls.className = 'checkbox-choice__editor-controls';
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
            item.answers = item.answers.filter(answer => answer !== removed);
            paintEditor();
            updateDirty();
          }, 'checkbox-choice__remove');
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
        );
        rows.append(row);
      });

      const actions = doc.createElement('div');
      actions.className = 'checkbox-choice__editor-actions';
      const add = controlButton('+ Добавить вопрос', 'Добавить вопрос', () => {
        draft.items.push({
          id: makeItemId(),
          question: '',
          options: ['', ''],
          answers: [],
        });
        paintEditor();
        updateDirty();
      });
      add.disabled = saving || draft.items.length >= 12;
      const cancel = controlButton('Отмена', 'Отменить редактирование', leaveEditMode);
      const save = controlButton(saving ? 'Сохраняем…' : 'Сохранить', 'Сохранить Checkbox Choice', saveChanges, 'checkbox-choice__save');
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
          answers: item.answers.slice(),
        })),
      };
      initialSnapshot = snapshot();
      view.hidden = true;
      instruction.hidden = true;
      editor.hidden = false;
      edit.hidden = true;
      section.classList.add('checkbox-choice--editing');
      paintEditor();
    }

    function leaveEditMode() {
      if (saving) return;
      draft = null;
      view.hidden = false;
      instruction.hidden = false;
      editor.hidden = true;
      edit.hidden = false;
      section.classList.remove('checkbox-choice--editing');
      setDirty(false);
    }

    async function saveChanges() {
      if (saving) return;
      let candidate;
      try {
        candidate = normalizeCheckboxChoice({
          type: 'checkboxChoice',
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
        current = normalizeCheckboxChoice(saved || { ...current, ...candidate });
        revealed.clear();
        paintView();
        saving = false;
        leaveEditMode();
      } catch (error) {
        saving = false;
        paintEditor();
        if (typeof settings.onError === 'function') {
          settings.onError(error?.message || 'Не удалось сохранить Checkbox Choice.');
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
    normalizeCheckboxChoice,
    optionLetter,
    renderCheckboxChoice,
    shouldHintCorrect,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CheckboxChoiceComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
