(function initSentenceCorrection(root) {
  'use strict';
  const model = root.ExerciseState || (typeof require === 'function' ? require('./exercise-state.js') : null);
  const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|[*_`]|!\[|\[[^\]]+\]\(|^\s*#/;
  function plain(value, label) {
    if (typeof value !== 'string' || !value.trim() || value.length > 1000 || MARKUP.test(value)) {
      throw new Error(`SentenceCorrection requires plain text for ${label} (1–1000 characters).`);
    }
    return value.trim().replace(/\s+/g, ' ');
  }
  function onlyKeys(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !keys.includes(key))) throw new Error('SentenceCorrection contains unsupported fields.');
  }
  function normalizeSentenceCorrection(data) {
    onlyKeys(data, ['type', 'id', 'title', 'instruction', 'accentColor', 'items']);
    if (data.type !== 'sentenceCorrection' || typeof data.id !== 'string' || !ID.test(data.id)) throw new Error('Invalid SentenceCorrection type or id.');
    const accentColor = data.accentColor == null ? '#6545F5' : String(data.accentColor).toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(accentColor)) throw new Error('SentenceCorrection requires a #RRGGBB accentColor.');
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 12) throw new Error('SentenceCorrection requires 1–12 items.');
    const ids = new Set();
    const items = data.items.map(item => {
      onlyKeys(item, ['id', 'text', 'answers']);
      if (typeof item.id !== 'string' || !ID.test(item.id) || ids.has(item.id)) throw new Error('SentenceCorrection requires unique item ids.');
      ids.add(item.id);
      if (!Array.isArray(item.answers) || item.answers.length < 1 || item.answers.length > 8) throw new Error('Each sentence requires 1–8 answers.');
      const answers = item.answers.map(answer => plain(answer, 'answer'));
      if (answers.some((answer, index) => model.correctionAnswersMatch(answer, answers.slice(0, index)))) {
        throw new Error('SentenceCorrection answers must be distinct.');
      }
      return { id: item.id, text: plain(item.text, 'sentence'), answers };
    });
    return { type: 'sentenceCorrection', id: data.id, title: plain(data.title, 'title'),
      instruction: plain(data.instruction, 'instruction'), accentColor, items };
  }
  function createSentenceCorrectionAnswerKey(data) {
    const task = normalizeSentenceCorrection(data);
    const answers = task.items.map((item, index) => `**${index + 1}.** ${item.answers.join(' / ')}`);
    const middle = Math.ceil(answers.length / 2);
    return { type: 'markdownCard', id: `${task.id}-answer-key`, title: 'Answer key',
      layout: 'columns', sections: [
        { id: 'answers-left', title: '', text: answers.slice(0, middle).join('\n\n') },
        ...(answers.length > 1 ? [{ id: 'answers-right', title: '', text: answers.slice(middle).join('\n\n') }] : []),
      ], icon: 'check', headingSize: 'large', accentColor: '#20A85B', studentVisibility: 'teacherOnly' };
  }
  function renderSentenceCorrection(data, options, documentRef) {
    let settings = options || {}, doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') { doc = options; settings = {}; }
    let current = normalizeSentenceCorrection(settings.presentation || data);
    let state = settings.exerciseState || {}, interactive = settings.interactive !== false;
    let editing = false, saving = false, draftItems = [], initialSnapshot = '';
    const fields = new Map();
    function el(tag, name, text) {
      const node = doc.createElement(tag);
      node.className = `sentence-correction__${name}`;
      if (text != null) node.textContent = text;
      return node;
    }
    function button(name, text) { const node = el('button', name, text); node.type = 'button'; return node; }
    const section = doc.createElement('section');
    section.className = 'sentence-correction';
    section.dataset.componentId = current.id;
    section.style.setProperty('--sentence-correction-accent', current.accentColor);
    const header = el('div', 'header'), title = el('h2', 'title'), instruction = el('p', 'instruction');
    const edit = button('edit', '✎'), cancel = button('cancel', 'Отмена');
    edit.setAttribute('aria-label', 'Редактировать Sentence Correction');
    cancel.hidden = true;
    header.append(title);
    if (typeof settings.onSave === 'function') header.append(cancel, edit);
    const columns = el('div', 'columns'), editor = el('div', 'editor');
    editor.hidden = true;
    section.append(header, instruction, columns, editor);
    function dirty(value) { settings.onDirtyChange?.(value, current.id); }
    function snapshot() { return JSON.stringify({ title: titleInput.value, instruction: instructionInput.value, items: draftItems }); }
    function updateDirty() { dirty(snapshot() !== initialSnapshot); }
    function authorField(labelText, value, multiline, onInput) {
      const label = el('label', 'editor-label', labelText);
      const input = el(multiline ? 'textarea' : 'input', 'editor-input');
      input.value = value;
      if (!multiline) input.type = 'text';
      input.rows = multiline ? 3 : undefined;
      input.addEventListener('input', () => { onInput(input.value); updateDirty(); });
      label.append(input); editor.append(label);
      return input;
    }
    let titleInput, instructionInput;
    function paintState() {
      for (const [id, { input, check, row, status }] of fields) {
        const answer = state.answers?.[id];
        if (input.value !== (answer?.value || '')) input.value = answer?.value || '';
        input.readOnly = !interactive;
        const correct = answer?.status === 'correct';
        row.classList.toggle('sentence-correction__item--correct', correct);
        check.hidden = !correct;
        status.textContent = correct ? 'Correct' : '';
      }
    }
    section.updateState = (next = {}) => { state = next; paintState(); };
    section.setInteractive = value => { interactive = Boolean(value); paintState(); };
    function paint() {
      title.textContent = current.title; instruction.textContent = current.instruction;
      section.setAttribute('aria-label', current.title);
      fields.clear(); columns.replaceChildren();
      const midpoint = Math.ceil(current.items.length / 2);
      for (let start = 0; start < current.items.length; start += midpoint) {
        const list = el('ol', 'list'); list.start = start + 1;
        current.items.slice(start, start + midpoint).forEach((item, offset) => {
          const index = start + offset;
          const row = el('li', 'item'), label = el('label', 'sentence', item.text);
          const field = el('div', 'field'), input = el('input', 'input');
          input.type = 'text'; input.placeholder = 'Type here...'; input.maxLength = 1000;
          input.autocomplete = 'off'; input.spellcheck = false;
          input.id = `${current.id}-${item.id}-answer`;
          label.setAttribute('for', input.id);
          input.setAttribute('aria-label', `${index + 1}. ${item.text} Rewrite correctly.`);
          const check = el('span', 'check', '✓'); check.setAttribute('aria-hidden', 'true');
          const status = el('span', 'status'); status.setAttribute('aria-live', 'polite');
          input.addEventListener('input', () => {
            if (!interactive || editing) { paintState(); return; }
            const action = { type: 'type-answer', componentId: current.id, itemId: item.id, value: input.value };
            section.updateState(model.apply(current, state, action));
            settings.onAction?.(action);
          });
          field.append(input, check, status); row.append(label, field); list.append(row);
          fields.set(item.id, { input, check, row, status });
        });
        columns.append(list);
      }
      paintState();
    }
    function leaveEditing() {
      editing = false; editor.hidden = true; editor.replaceChildren(); columns.hidden = false;
      edit.textContent = '✎'; edit.setAttribute('aria-label', 'Редактировать Sentence Correction');
      cancel.hidden = true; dirty(false); paint();
    }
    function enterEditing() {
      editing = true; columns.hidden = true; editor.hidden = false; cancel.hidden = false;
      edit.textContent = '✓'; edit.setAttribute('aria-label', 'Сохранить Sentence Correction');
      draftItems = current.items.map(item => ({ ...item, answers: [...item.answers] }));
      titleInput = authorField('Заголовок', current.title, false, () => {});
      instructionInput = authorField('Инструкция', current.instruction, false, () => {});
      draftItems.forEach((item, index) => {
        authorField(`${index + 1}. Предложение с ошибкой`, item.text, false, value => { item.text = value; });
        authorField('Допустимые ответы — по одному на строку', item.answers.join('\n'), true,
          value => { item.answers = value.split('\n').filter(answer => answer.trim()); });
      });
      initialSnapshot = snapshot();
    }
    function lockEditor(value) {
      saving = value; edit.disabled = value; cancel.disabled = value;
      for (const input of [...editor.querySelectorAll('input'), ...editor.querySelectorAll('textarea')]) input.disabled = value;
    }
    async function save() {
      let candidate;
      try {
        candidate = normalizeSentenceCorrection({ ...current, title: titleInput.value,
          instruction: instructionInput.value, items: draftItems });
      } catch (error) { settings.onError?.(error.message); return; }
      lockEditor(true);
      try {
        const saved = await settings.onSave({ title: candidate.title, instruction: candidate.instruction, items: candidate.items }, current.id);
        current = normalizeSentenceCorrection(saved || candidate);
        // Recheck local trial answers against the newly saved key.
        state = { answers: Object.fromEntries(current.items.map(item => {
          const value = state.answers?.[item.id]?.value || '';
          return [item.id, { value, status: model.correctionAnswersMatch(value, item.answers) ? 'correct' : 'pending' }];
        })) };
        lockEditor(false); leaveEditing();
      } catch (error) { lockEditor(false); settings.onError?.(error.message); }
    }
    edit.addEventListener('click', () => { if (saving) return; return editing ? save() : enterEditing(); });
    cancel.addEventListener('click', () => { if (!saving) leaveEditing(); });
    section.addEventListener('keydown', event => {
      if (event.key === 'Escape' && editing && !saving) { event.preventDefault(); leaveEditing(); }
    });
    paint();
    return section;
  }
  const api = { normalizeSentenceCorrection, createSentenceCorrectionAnswerKey, renderSentenceCorrection };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SentenceCorrectionComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
