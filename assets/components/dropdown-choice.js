(function initDropdownChoiceComponent(root) {
  'use strict';

  const inlineGapText = root.InlineGapText
    || (typeof require === 'function' ? require('./inline-gap-text.js') : null);
  if (!inlineGapText) throw new Error('DropdownChoice requires InlineGapText.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const HEX_COLOR = /^#[0-9A-F]{6}$/;
  const DEFAULT_ACCENT_COLOR = '#17182D';
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s/m;
  const UNSUPPORTED_ACCENT_MARKUP = /<[^>]*>|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s/m;
  const COMPONENT_KEYS = ['type', 'id', 'title', 'instruction', 'text', 'choices', 'accentColor'];

  function normalizeSpace(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function plainText(value, field) {
    const normalized = normalizeSpace(value);
    if (!normalized) throw new Error(`DropdownChoice requires ${field}.`);
    if (MARKUP.test(normalized)) throw new Error(`DropdownChoice does not allow HTML or Markdown in ${field}.`);
    return normalized;
  }

  function parseAccentMarkdown(value, field = 'text') {
    const source = String(value || '');
    if (UNSUPPORTED_ACCENT_MARKUP.test(source)) {
      throw new Error(`DropdownChoice allows only **bold** Markdown in ${field}.`);
    }
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const opening = source.indexOf('**', index);
      const strayAsterisk = source.indexOf('*', index);
      if (opening === -1) {
        if (strayAsterisk !== -1) {
          throw new Error(`DropdownChoice allows only **bold** Markdown in ${field}.`);
        }
        if (index < source.length) tokens.push({ type: 'text', value: source.slice(index) });
        break;
      }
      if (strayAsterisk !== opening) {
        throw new Error(`DropdownChoice allows only **bold** Markdown in ${field}.`);
      }
      if (opening > index) tokens.push({ type: 'text', value: source.slice(index, opening) });
      const closing = source.indexOf('**', opening + 2);
      if (closing === -1) throw new Error(`DropdownChoice has unclosed bold Markdown in ${field}.`);
      const content = source.slice(opening + 2, closing);
      if (!content.trim() || content.includes('\n') || content.includes('*')) {
        throw new Error(`DropdownChoice has invalid bold Markdown in ${field}.`);
      }
      tokens.push({ type: 'strong', value: content });
      index = closing + 2;
    }
    return tokens;
  }

  function accentText(value, field, collapseWhitespace = false) {
    const normalized = collapseWhitespace
      ? normalizeSpace(value)
      : (typeof value === 'string' ? value.trim() : '');
    if (!normalized) throw new Error(`DropdownChoice requires ${field}.`);
    parseAccentMarkdown(normalized, field);
    return normalized;
  }

  function stripAccentMarkdown(value) {
    return parseAccentMarkdown(value).map(token => token.value).join('');
  }

  function parseChoiceText(value) {
    const parts = inlineGapText.parseMarkedText(value, {
      label: 'DropdownChoice', minimum: 1, maximum: 12,
    });
    parts.forEach((part) => {
      if (part.type === 'text') parseAccentMarkdown(part.text, 'text');
      if (part.type === 'gap' && !KEBAB_CASE.test(part.token)) {
        throw new Error('DropdownChoice gap markers must contain kebab-case choice ids.');
      }
    });
    return parts;
  }

  function normalizeDropdownChoice(data) {
    if (!data || data.type !== 'dropdownChoice' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('DropdownChoice requires type "dropdownChoice" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !COMPONENT_KEYS.includes(key))) {
      throw new Error('DropdownChoice contains unsupported fields.');
    }
    const accentColor = data.accentColor == null
      ? DEFAULT_ACCENT_COLOR
      : String(data.accentColor).trim().toUpperCase();
    if (!HEX_COLOR.test(accentColor)) throw new Error('DropdownChoice requires a #RRGGBB accentColor.');
    const parts = parseChoiceText(data.text);
    if (!Array.isArray(data.choices) || data.choices.length < 1 || data.choices.length > 12) {
      throw new Error('DropdownChoice requires between 1 and 12 choices.');
    }
    const ids = new Set();
    const choices = data.choices.map((choice) => {
      const id = typeof choice?.id === 'string' ? choice.id.trim() : '';
      if (!KEBAB_CASE.test(id) || ids.has(id)) {
        throw new Error('DropdownChoice choice ids must be unique kebab-case values.');
      }
      if (Object.keys(choice || {}).some(key => !['id', 'options', 'answer'].includes(key))) {
        throw new Error('DropdownChoice choices contain unsupported fields.');
      }
      if (!Array.isArray(choice.options) || choice.options.length < 2 || choice.options.length > 12) {
        throw new Error('DropdownChoice choices require between 2 and 12 options.');
      }
      const options = choice.options.map(option => plainText(option, 'an option'));
      if (new Set(options).size !== options.length) {
        throw new Error('DropdownChoice options must be unique within each choice.');
      }
      const answer = plainText(choice.answer, 'an answer');
      if (!options.includes(answer)) throw new Error('DropdownChoice answer must match one of its options.');
      ids.add(id);
      return { id, options, answer };
    });
    const markers = parts.filter(part => part.type === 'gap').map(part => part.token);
    if (new Set(markers).size !== markers.length) {
      throw new Error('DropdownChoice choice markers must be unique in text.');
    }
    if (markers.length !== choices.length || markers.some(id => !ids.has(id)) || choices.some(choice => !markers.includes(choice.id))) {
      throw new Error('DropdownChoice text markers and choices must match exactly.');
    }
    return {
      type: 'dropdownChoice', id: data.id,
      title: accentText(data.title, 'a title', true),
      instruction: plainText(data.instruction, 'an instruction'),
      text: inlineGapText.serializeMarkedText(parts), choices, accentColor,
    };
  }

  function getSelectionState(value, answer) {
    if (!value) return 'empty';
    return value === answer ? 'correct' : 'wrong';
  }

  function slug(value) {
    const base = String(value || '').toLowerCase().normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'choice';
  }

  function appendAccentMarkdown(parent, value, documentRef, preserveBreaks = false) {
    parseAccentMarkdown(value).forEach((token) => {
      const target = token.type === 'strong' ? documentRef.createElement('strong') : parent;
      if (token.type === 'strong') target.className = 'dropdown-choice__accent';
      if (preserveBreaks) inlineGapText.appendTextWithBreaks(target, token.value, documentRef);
      else target.append(documentRef.createTextNode(token.value));
      if (target !== parent) parent.append(target);
    });
  }

  function makeChoiceNumberLabel(number, documentRef) {
    const label = documentRef.createElement('span');
    label.className = 'dropdown-choice__number';
    label.textContent = `(${number})`;
    label.setAttribute('aria-hidden', 'true');
    return label;
  }

  function renderDropdownChoice(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') { doc = options; settings = {}; }
    if (!doc) throw new Error('DropdownChoice requires a document.');

    let current = normalizeDropdownChoice(data);
    let editing = false;
    let saving = false;
    let initialSnapshot = '';
    let editorChoices = [];
    const correct = new Set();

    const section = doc.createElement('section');
    section.className = 'dropdown-choice';
    section.dataset.componentId = current.id;
    section.style.setProperty('--dropdown-choice-accent', current.accentColor);
    section.setAttribute('aria-label', stripAccentMarkdown(current.title));
    const header = doc.createElement('div');
    header.className = 'dropdown-choice__header';
    const title = doc.createElement('h2');
    title.className = 'dropdown-choice__title';
    title.dataset.placeholder = 'Введите заголовок';
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'dropdown-choice__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать Dropdown Choice');
    const headerActions = doc.createElement('div');
    headerActions.className = 'dropdown-choice__header-actions';
    const cancelButton = doc.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'dropdown-choice__cancel';
    cancelButton.textContent = 'Отмена';
    cancelButton.hidden = true;
    header.append(title);
    if (typeof settings.onSave === 'function') {
      headerActions.append(cancelButton, editButton);
      header.append(headerActions);
    }
    const instruction = doc.createElement('p');
    instruction.className = 'dropdown-choice__instruction';
    instruction.dataset.placeholder = 'Введите инструкцию';
    const toolbar = doc.createElement('div');
    toolbar.className = 'dropdown-choice__toolbar';
    toolbar.hidden = true;
    const gapTool = doc.createElement('button');
    gapTool.type = 'button';
    gapTool.className = 'dropdown-choice__tool';
    gapTool.textContent = 'Dropdown';
    gapTool.setAttribute('aria-label', 'Сделать выделенный текст выпадающим списком');
    toolbar.append(gapTool);
    const passage = doc.createElement('div');
    passage.className = 'dropdown-choice__passage';
    const choiceEditor = doc.createElement('div');
    choiceEditor.className = 'dropdown-choice__choices-editor';
    choiceEditor.hidden = true;
    const status = doc.createElement('p');
    status.className = 'dropdown-choice__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    function parts() { return parseChoiceText(current.text); }
    function choiceById(id) { return current.choices.find(choice => choice.id === id); }
    function editorChoiceById(id) { return editorChoices.find(choice => choice.id === id); }
    function setDirty(dirty) {
      section.classList.toggle('dropdown-choice--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function makePlaySelect(choice, number) {
      const field = doc.createElement('span');
      field.className = 'dropdown-choice__field';
      const select = doc.createElement('select');
      select.className = 'dropdown-choice__select';
      select.dataset.choiceId = choice.id;
      select.dataset.state = 'empty';
      select.setAttribute('aria-label', `Выбор ${number}. Выберите вариант для ${choice.id}`);
      const placeholder = doc.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Choose…';
      select.append(placeholder);
      choice.options.forEach((option) => {
        const element = doc.createElement('option');
        element.value = option;
        element.textContent = option;
        select.append(element);
      });
      select.addEventListener('change', () => {
        const state = getSelectionState(select.value, choice.answer);
        select.dataset.state = state;
        select.classList.toggle('dropdown-choice__select--correct', state === 'correct');
        select.classList.toggle('dropdown-choice__select--wrong', state === 'wrong');
        select.setAttribute('aria-invalid', String(state === 'wrong'));
        if (state === 'correct') {
          correct.add(choice.id);
          select.disabled = true;
          status.textContent = correct.size === current.choices.length
            ? 'Все ответы верны.' : `Верно. ${correct.size} из ${current.choices.length}.`;
        } else if (state === 'wrong') status.textContent = 'Неверный вариант. Попробуйте ещё раз.';
        else status.textContent = `${correct.size} из ${current.choices.length} ответов верны.`;
        if (typeof settings.onActivity === 'function') settings.onActivity(current.id, choice.id, state);
      });
      field.append(makeChoiceNumberLabel(number, doc), select);
      return field;
    }

    function paintPlay() {
      section.style.setProperty('--dropdown-choice-accent', current.accentColor);
      section.setAttribute('aria-label', stripAccentMarkdown(current.title));
      title.replaceChildren();
      appendAccentMarkdown(title, current.title, doc);
      instruction.textContent = current.instruction;
      title.contentEditable = 'false';
      instruction.contentEditable = 'false';
      let choiceNumber = 0;
      passage.replaceChildren(...inlineGapText.splitParagraphs(parts()).map((paragraphParts) => {
        const paragraph = doc.createElement('p');
        paragraph.className = 'dropdown-choice__paragraph';
        paragraphParts.forEach((part) => {
          if (part.type === 'text') appendAccentMarkdown(paragraph, part.text, doc, true);
          else {
            choiceNumber += 1;
            paragraph.append(makePlaySelect(choiceById(part.token), choiceNumber));
          }
        });
        return paragraph;
      }));
      correct.clear();
      status.textContent = `0 из ${current.choices.length} ответов верны.`;
    }

    function makeTextSpan(text) {
      const span = doc.createElement('span');
      span.className = 'dropdown-choice__text';
      span.contentEditable = 'true';
      span.textContent = text;
      span.addEventListener('input', updateDirty);
      return span;
    }

    function makeEditorGap(id, number) {
      const gap = doc.createElement('span');
      gap.className = 'dropdown-choice__gap-editor';
      gap.dataset.choiceId = id;
      const label = doc.createElement('span');
      label.className = 'dropdown-choice__gap-label';
      label.textContent = editorChoiceById(id)?.answer || id;
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Убрать dropdown ${id}`);
      remove.addEventListener('click', () => unwrapGap(gap));
      gap.append(makeChoiceNumberLabel(number, doc), label, remove);
      return gap;
    }

    function editorParts() {
      return [...passage.children].map((node) => {
        if (node.classList.contains('dropdown-choice__text')) return { type: 'text', text: node.textContent };
        if (node.classList.contains('dropdown-choice__gap-editor')) return { type: 'gap', token: node.dataset.choiceId };
        return null;
      }).filter(Boolean);
    }

    function paintEditorPassage(sourceParts) {
      const prepared = sourceParts.slice();
      if (!prepared.length || prepared[0].type === 'gap') prepared.unshift({ type: 'text', text: '' });
      const withCarets = [];
      prepared.forEach((part) => {
        if (part.type === 'gap' && withCarets.at(-1)?.type === 'gap') withCarets.push({ type: 'text', text: '' });
        withCarets.push(part);
      });
      if (withCarets.at(-1)?.type === 'gap') withCarets.push({ type: 'text', text: '' });
      let choiceNumber = 0;
      passage.replaceChildren(...withCarets.map(part => {
        if (part.type !== 'gap') return makeTextSpan(part.text);
        choiceNumber += 1;
        return makeEditorGap(part.token, choiceNumber);
      }));
    }

    function uniqueChoiceId(answer) {
      const used = new Set(editorChoices.map(choice => choice.id));
      const base = slug(answer);
      let candidate = base;
      let index = 2;
      while (used.has(candidate)) { candidate = `${base}-${index}`; index += 1; }
      return candidate;
    }

    function paintChoiceEditors() {
      choiceEditor.replaceChildren(...editorChoices.map((choice) => {
        const card = doc.createElement('fieldset');
        card.className = 'dropdown-choice__choice-editor';
        const legend = doc.createElement('legend');
        legend.textContent = choice.id;
        const rows = doc.createElement('div');
        rows.className = 'dropdown-choice__option-rows';
        choice.options.forEach((option, optionIndex) => {
          const row = doc.createElement('div');
          row.className = 'dropdown-choice__option-row';
          const radio = doc.createElement('input');
          radio.type = 'radio';
          radio.name = `answer-${current.id}-${choice.id}`;
          radio.checked = option === choice.answer;
          radio.setAttribute('aria-label', 'Правильный вариант');
          radio.addEventListener('change', () => {
            choice.answer = choice.options[optionIndex];
            const label = passage.querySelector(`[data-choice-id="${choice.id}"] .dropdown-choice__gap-label`);
            if (label) label.textContent = choice.answer || choice.id;
            updateDirty();
          });
          const input = doc.createElement('input');
          input.type = 'text';
          input.value = option;
          input.placeholder = 'Вариант';
          input.addEventListener('input', () => {
            const wasAnswer = choice.answer === choice.options[optionIndex];
            choice.options[optionIndex] = input.value;
            if (wasAnswer) choice.answer = input.value;
            const label = passage.querySelector(`[data-choice-id="${choice.id}"] .dropdown-choice__gap-label`);
            if (label && wasAnswer) label.textContent = input.value || choice.id;
            updateDirty();
          });
          const remove = doc.createElement('button');
          remove.type = 'button';
          remove.textContent = '×';
          remove.disabled = choice.options.length <= 2;
          remove.setAttribute('aria-label', 'Удалить вариант');
          remove.addEventListener('click', () => {
            const removed = choice.options.splice(optionIndex, 1)[0];
            if (choice.answer === removed) choice.answer = choice.options[0] || '';
            paintChoiceEditors();
            updateDirty();
          });
          row.append(radio, input, remove);
          rows.append(row);
        });
        const add = doc.createElement('button');
        add.type = 'button';
        add.className = 'dropdown-choice__add-option';
        add.textContent = '+ вариант';
        add.disabled = choice.options.length >= 12;
        add.addEventListener('click', () => {
          choice.options.push('');
          paintChoiceEditors();
          updateDirty();
          const inputs = choiceEditor.querySelectorAll('input[type="text"]');
          inputs[inputs.length - 1]?.focus();
        });
        card.append(legend, rows, add);
        return card;
      }));
    }

    function editorSnapshot() {
      return JSON.stringify({ title: title.textContent, instruction: instruction.textContent,
        text: inlineGapText.serializeMarkedText(inlineGapText.compactParts(editorParts())), choices: editorChoices });
    }
    function updateDirty() { if (editing && !saving) setDirty(editorSnapshot() !== initialSnapshot); }

    function selectionInTextSpan() {
      const selection = doc.getSelection ? doc.getSelection() : root.getSelection?.();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      const start = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      const end = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;
      if (!start || start !== end || !start.classList?.contains('dropdown-choice__text') || !passage.contains(start)) return null;
      const prefix = doc.createRange();
      prefix.selectNodeContents(start);
      prefix.setEnd(range.startContainer, range.startOffset);
      const from = prefix.toString().length;
      prefix.setEnd(range.endContainer, range.endOffset);
      const to = prefix.toString().length;
      return { span: start, start: Math.min(from, to), end: Math.max(from, to) };
    }

    function insertGap() {
      const selection = selectionInTextSpan();
      if (!selection || editorChoices.length >= 12) return;
      const source = editorParts();
      const index = [...passage.children].indexOf(selection.span);
      const value = selection.span.textContent;
      const answer = normalizeSpace(value.slice(selection.start, selection.end));
      if (!answer) return;
      const id = uniqueChoiceId(answer);
      const next = [...source.slice(0, index),
        ...(value.slice(0, selection.start) ? [{ type: 'text', text: value.slice(0, selection.start) }] : []),
        { type: 'gap', token: id },
        ...(value.slice(selection.end) ? [{ type: 'text', text: value.slice(selection.end) }] : []),
        ...source.slice(index + 1)];
      editorChoices.push({ id, options: [answer, ''], answer });
      paintEditorPassage(next);
      paintChoiceEditors();
      updateDirty();
    }

    function unwrapGap(gap) {
      const source = editorParts();
      const index = [...passage.children].indexOf(gap);
      const id = gap.dataset.choiceId;
      const answer = editorChoiceById(id)?.answer || '';
      editorChoices = editorChoices.filter(choice => choice.id !== id);
      const replacement = source.slice();
      replacement.splice(index, 1, { type: 'text', text: answer });
      paintEditorPassage(inlineGapText.compactParts(replacement));
      paintChoiceEditors();
      updateDirty();
    }

    function enterEditMode() {
      editing = true;
      correct.clear();
      editorChoices = current.choices.map(choice => ({ ...choice, options: choice.options.slice() }));
      section.classList.add('dropdown-choice--editing');
      toolbar.hidden = false;
      choiceEditor.hidden = false;
      title.textContent = current.title;
      title.contentEditable = 'true';
      instruction.contentEditable = 'true';
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить Dropdown Choice');
      cancelButton.hidden = false;
      paintEditorPassage(parts());
      paintChoiceEditors();
      initialSnapshot = editorSnapshot();
      title.focus();
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      toolbar.hidden = true;
      choiceEditor.hidden = true;
      section.classList.remove('dropdown-choice--editing', 'dropdown-choice--saving');
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать Dropdown Choice');
      cancelButton.hidden = true;
      setDirty(false);
      paintPlay();
    }

    async function saveEditing() {
      const candidate = { type: 'dropdownChoice', id: current.id,
        title: title.textContent, instruction: instruction.textContent,
        text: inlineGapText.serializeMarkedText(inlineGapText.compactParts(editorParts())),
        choices: editorChoices, accentColor: current.accentColor };
      try { normalizeDropdownChoice(candidate); } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      section.classList.add('dropdown-choice--saving');
      editButton.disabled = true;
      try {
        const saved = await settings.onSave({ title: candidate.title, instruction: candidate.instruction,
          text: candidate.text, choices: candidate.choices }, current.id);
        current = normalizeDropdownChoice(saved || candidate);
        leaveEditMode();
      } catch (_error) {
        saving = false;
        section.classList.remove('dropdown-choice--saving');
        editButton.disabled = false;
      }
    }

    editButton.addEventListener('click', () => (editing ? saveEditing() : enterEditMode()));
    cancelButton.addEventListener('click', () => { if (editing && !saving) leaveEditMode(); });
    gapTool.addEventListener('mousedown', event => event.preventDefault());
    gapTool.addEventListener('click', insertGap);
    title.addEventListener('input', updateDirty);
    instruction.addEventListener('input', updateDirty);
    title.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });
    instruction.addEventListener('keydown', (event) => { if (event.key === 'Enter') event.preventDefault(); });

    section.append(header, instruction, toolbar, passage, choiceEditor, status);
    paintPlay();
    return section;
  }

  const api = {
    DEFAULT_ACCENT_COLOR,
    getSelectionState,
    normalizeDropdownChoice,
    parseAccentMarkdown,
    parseChoiceText,
    renderDropdownChoice,
    stripAccentMarkdown,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DropdownChoiceComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
