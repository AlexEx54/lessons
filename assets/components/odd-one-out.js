(function initOddOneOut(root) {
  'use strict';
  const model = root.ExerciseState || (typeof require === 'function' ? require('./exercise-state.js') : null);
  const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  function fail(message) { throw new Error(message); }
  function text(value, label) {
    if (typeof value !== 'string' || !value.trim()) fail(`Заполните ${label}.`);
    if (/<[^>]*>|[*_`\[\]\\#]/.test(value)) fail(`В поле «${label}» нужен обычный текст без разметки.`);
    return value.trim().replace(/\s+/g, ' ');
  }
  function normalizeOddOneOut(data) {
    if (!data || data.type !== 'oddOneOut' || !ID.test(data.id || '')) fail('Некорректный идентификатор задания.');
    if (Object.keys(data).some(key => !['type', 'id', 'title', 'instruction', 'items'].includes(key))) fail('Неизвестное поле задания.');
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 12) fail('Добавьте от 1 до 12 строк.');
    const ids = new Set();
    return { type: data.type, id: data.id, title: text(data.title, 'заголовок'), instruction: text(data.instruction, 'инструкцию'),
      items: data.items.map((item, index) => {
        const label = `строке ${index + 1}`;
        if (!item || !ID.test(item.id || '') || ids.has(item.id)) fail(`Некорректный идентификатор в ${label}.`);
        if (Object.keys(item).some(key => !['id', 'options', 'answer', 'explanation'].includes(key))) fail(`Неизвестное поле в ${label}.`);
        ids.add(item.id);
        if (!Array.isArray(item.options) || item.options.length !== 4) fail(`В ${label} должно быть четыре слова.`);
        const options = item.options.map(value => text(value, `слова в ${label}`));
        if (new Set(options.map(value => value.toLocaleLowerCase())).size !== 4) fail(`Слова в ${label} не должны повторяться.`);
        const answer = text(item.answer, `лишнее слово в ${label}`);
        if (!options.includes(answer)) fail(`Отметьте лишнее слово в ${label}.`);
        return { id: item.id, options, answer, explanation: text(item.explanation, `пояснение в ${label}`) };
      }),
    };
  }
  function createOddOneOutAnswerKey(data) {
    const exercise = normalizeOddOneOut(data);
    return { type: 'markdownCard', id: `${exercise.id}-answer-key`, title: 'Answer Keys', icon: 'check',
      accentColor: '#20A85B', studentVisibility: 'teacherOnly',
      text: exercise.items.map((item, index) => `${index + 1}. **${item.answer}** — ${item.explanation}`).join('\n'),
    };
  }
  function renderOddOneOut(data, settings = {}, documentRef) {
    const doc = documentRef || root.document;
    let current = normalizeOddOneOut(settings.presentation || data);
    let exerciseState = settings.exerciseState || {};
    let interactive = settings.interactive !== false;
    let draft = null, initial = '', saving = false, choosing = false;
    const nodes = new Map();
    const el = (tag, cls, value) => {
      const node = doc.createElement(tag);
      if (cls) node.className = `odd-one-out__${cls}`;
      if (value !== undefined) node.textContent = value;
      return node;
    };
    const button = (label, cls, action) => {
      const node = el('button', cls, label);
      node.type = 'button';
      node.addEventListener('click', action);
      return node;
    };
    const section = el('section');
    section.className = 'odd-one-out';
    section.dataset.componentId = current.id;
    const header = el('div', 'header');
    const title = el('h2', 'title');
    const edit = button('Редактировать', 'edit', enterEditor);
    header.append(title);
    if (typeof settings.onSave === 'function') header.append(edit);
    const instruction = el('p', 'instruction');
    const view = el('div', 'view');
    const editor = el('div', 'editor');
    editor.hidden = true;
    const errorBox = el('p', 'error');
    errorBox.setAttribute('role', 'alert');
    errorBox.hidden = true;
    function dirty(value) {
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(value, current.id);
    }
    function changed() { dirty(JSON.stringify(draft) !== initial); }
    function showError(message) {
      errorBox.textContent = message;
      errorBox.hidden = false;
    }
    function updateState(state = {}) {
      exerciseState = state;
      current.items.forEach(item => {
        const row = nodes.get(item.id);
        if (!row) return;
        const answer = state.answers?.[item.id];
        const locked = answer?.status === 'correct';
        row.buttons.forEach((node, index) => {
          const selected = answer?.value === item.options[index];
          node.classList.toggle('odd-one-out__word--correct', selected && locked);
          node.classList.toggle('odd-one-out__word--wrong', selected && answer?.status === 'wrong');
          node.disabled = locked || !interactive;
          node.setAttribute('aria-pressed', String(selected));
        });
        row.status.textContent = locked ? 'Верно!' : answer?.status === 'wrong' ? 'Попробуйте ещё раз.' : '';
      });
    }
    function paintView() {
      title.textContent = current.title;
      instruction.textContent = current.instruction;
      nodes.clear();
      view.replaceChildren();
      current.items.forEach((item, index) => {
        const row = el('div', 'row');
        row.dataset.pointerPart = `row:${item.id}`;
        row.append(el('span', 'number', index + 1));
        const group = el('div', 'words');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-label', `Строка ${index + 1}. Найдите лишнее слово`);
        const buttons = item.options.map((word, wordIndex) => {
          const node = button(word, 'word', () => {
            if (!interactive || exerciseState.answers?.[item.id]?.status === 'correct') return;
            const action = { type: 'choose-option', componentId: current.id, itemId: item.id, value: word };
            updateState(model.apply(current, exerciseState, action));
            if (typeof settings.onAction === 'function') settings.onAction(action);
          });
          node.dataset.pointerPart = `option:${item.id}:${wordIndex}`;
          group.append(node);
          return node;
        });
        const status = el('p', 'status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        nodes.set(item.id, { buttons, status });
        row.append(group, status);
        view.append(row);
      });
      updateState(exerciseState);
    }
    function field(labelText, value, onInput, multiline = false) {
      const label = el('label', 'field');
      const input = el(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = 'text';
      input.value = value;
      input.disabled = saving;
      input.addEventListener('input', () => { onInput(input.value); changed(); });
      label.append(el('span', '', labelText), input);
      return label;
    }
    function paintEditor() {
      const general = el('div', 'general');
      general.append(field('Заголовок', draft.title, value => { draft.title = value; }),
        field('Инструкция ученику', draft.instruction, value => { draft.instruction = value; }, true));
      const mode = button(choosing ? 'Готово, вернуться к словам' : 'Отметить лишнее', 'mode', () => {
        choosing = !choosing;
        paintEditor();
        editor.querySelector('.odd-one-out__mode')?.focus();
      });
      mode.disabled = saving;
      mode.setAttribute('aria-pressed', String(choosing));
      const help = el('p', 'help', choosing
        ? 'Нажмите на одно лишнее слово в каждой строке. Оно будет отмечено галочкой.'
        : 'Редактируйте слова в ячейках. Чтобы изменить ответ, нажмите «Отметить лишнее».');
      const rows = el('div', 'editor-rows');
      draft.items.forEach((item, index) => {
        const row = el('div', 'editor-row');
        const line = el('div', 'row');
        line.append(el('span', 'number', index + 1));
        const words = el('div', 'words');
        item.options.forEach((word, wordIndex) => {
          const cell = el('div', 'cell');
          cell.classList.toggle('odd-one-out__cell--answer', item.answerIndex === wordIndex);
          if (choosing) {
            const choose = button(word || 'Пустая ячейка', 'word', () => {
              item.answerIndex = wordIndex;
              changed();
              paintEditor();
              editor.querySelectorAll('.odd-one-out__editor-row')[index]?.querySelectorAll('.odd-one-out__word')[wordIndex]?.focus();
            });
            choose.disabled = saving;
            choose.setAttribute('aria-pressed', String(item.answerIndex === wordIndex));
            choose.setAttribute('aria-label', `Строка ${index + 1}: ${word || 'пустая ячейка'} — лишнее слово`);
            cell.append(choose);
          } else {
            const input = el('input', 'word-input');
            input.type = 'text';
            input.value = word;
            input.disabled = saving;
            input.setAttribute('aria-label', `Строка ${index + 1}, слово ${wordIndex + 1}${item.answerIndex === wordIndex ? ', лишнее' : ''}`);
            input.addEventListener('input', () => { item.options[wordIndex] = input.value; changed(); });
            cell.append(input);
          }
          if (item.answerIndex === wordIndex) {
            const mark = el('span', 'answer-mark', '✓');
            mark.setAttribute('aria-label', 'Лишнее слово');
            cell.append(mark);
          }
          words.append(cell);
        });
        line.append(words);
        const explanation = field('Почему это слово лишнее? · Для преподавателя', item.explanation,
          value => { item.explanation = value; });
        const menu = el('details', 'row-menu');
        menu.append(el('summary', '', 'Действия со строкой'));
        const controls = el('div', 'row-actions');
        [['Выше', -1], ['Ниже', 1]].forEach(([label, offset]) => {
          const move = button(label, '', () => {
            const [moved] = draft.items.splice(index, 1);
            draft.items.splice(index + offset, 0, moved);
            changed(); paintEditor();
          });
          move.disabled = saving || index + offset < 0 || index + offset >= draft.items.length;
          controls.append(move);
        });
        const remove = button('Удалить строку', '', () => { draft.items.splice(index, 1); changed(); paintEditor(); });
        remove.disabled = saving || draft.items.length === 1;
        controls.append(remove);
        menu.append(controls);
        row.append(line, explanation, menu);
        rows.append(row);
      });
      const actions = el('div', 'actions');
      const add = button('+ Добавить строку', 'add', () => {
        draft.items.push({ id: `odd-row-${root.crypto.randomUUID()}`, options: ['', '', '', ''], answerIndex: -1, explanation: '' });
        choosing = false; changed(); paintEditor();
        editor.querySelectorAll('.odd-one-out__editor-row')[draft.items.length - 1]?.querySelector('input')?.focus();
      });
      add.disabled = saving || draft.items.length >= 12;
      const cancel = button('Отмена', '', leaveEditor);
      cancel.disabled = saving;
      const save = button(saving ? 'Сохраняем…' : 'Сохранить', 'save', saveChanges);
      save.disabled = saving;
      actions.append(add, cancel, save);
      editor.replaceChildren(general, mode, help, rows, actions);
    }
    function enterEditor() {
      choosing = false;
      draft = { title: current.title, instruction: current.instruction, items: current.items.map(item => ({
        id: item.id, options: [...item.options], answerIndex: item.options.indexOf(item.answer), explanation: item.explanation,
      })) };
      initial = JSON.stringify(draft);
      view.hidden = instruction.hidden = edit.hidden = true;
      editor.hidden = false;
      paintEditor();
    }
    function leaveEditor() {
      if (saving) return;
      draft = null;
      view.hidden = instruction.hidden = edit.hidden = false;
      editor.hidden = errorBox.hidden = true;
      dirty(false);
      edit.focus();
    }
    async function saveChanges() {
      if (saving) return;
      let candidate;
      try {
        candidate = normalizeOddOneOut({ type: current.type, id: current.id, title: draft.title, instruction: draft.instruction,
          items: draft.items.map(({ answerIndex, ...item }) => ({ ...item, answer: item.options[answerIndex] })),
        });
      } catch (error) { showError(error.message); return; }
      errorBox.hidden = true;
      saving = true;
      paintEditor();
      try {
        const { title, instruction, items } = candidate;
        const saved = await settings.onSave({ title, instruction, items }, current.id);
        current = normalizeOddOneOut(saved || candidate);
        exerciseState = {};
        paintView();
        saving = false;
        leaveEditor();
      } catch (error) {
        saving = false;
        paintEditor();
        showError(error.message || 'Не удалось сохранить задание. Попробуйте ещё раз.');
      }
    }
    section.updateState = updateState;
    section.setInteractive = value => { interactive = Boolean(value); updateState(exerciseState); };
    paintView();
    section.append(header, instruction, view, editor, errorBox);
    return section;
  }
  const api = { normalizeOddOneOut, createOddOneOutAnswerKey, renderOddOneOut };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.OddOneOutComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
