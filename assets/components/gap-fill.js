(function initGapFillComponent(root) {
  'use strict';

  const inlineGapText = root.InlineGapText
    || (typeof require === 'function' ? require('./inline-gap-text.js') : null);
  if (!inlineGapText) throw new Error('GapFill requires InlineGapText.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const HEX_COLOR = /^#[0-9A-F]{6}$/;
  const DEFAULT_ACCENT_COLOR = '#17182D';
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s/m;
  const UNSUPPORTED_ACCENT_MARKUP = /<[^>]*>|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s/m;
  const COMPONENT_KEYS = ['type', 'id', 'title', 'instruction', 'text', 'gaps', 'accentColor'];
  const GAP_KEYS = ['id', 'answer', 'example'];

  function normalizeSpace(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function plainText(value, field) {
    const normalized = normalizeSpace(value);
    if (!normalized) throw new Error(`GapFill requires ${field}.`);
    if (MARKUP.test(normalized)) throw new Error(`GapFill does not allow HTML or Markdown in ${field}.`);
    return normalized;
  }

  function parseAccentMarkdown(value, field = 'text') {
    const source = String(value || '');
    if (UNSUPPORTED_ACCENT_MARKUP.test(source)) {
      throw new Error(`GapFill allows only **bold** Markdown in ${field}.`);
    }
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const opening = source.indexOf('**', index);
      const strayAsterisk = source.indexOf('*', index);
      if (opening === -1) {
        if (strayAsterisk !== -1) {
          throw new Error(`GapFill allows only **bold** Markdown in ${field}.`);
        }
        if (index < source.length) tokens.push({ type: 'text', value: source.slice(index) });
        break;
      }
      if (strayAsterisk !== opening) {
        throw new Error(`GapFill allows only **bold** Markdown in ${field}.`);
      }
      if (opening > index) tokens.push({ type: 'text', value: source.slice(index, opening) });
      const closing = source.indexOf('**', opening + 2);
      if (closing === -1) throw new Error(`GapFill has unclosed bold Markdown in ${field}.`);
      const content = source.slice(opening + 2, closing);
      if (!content.trim() || content.includes('\n') || content.includes('*')) {
        throw new Error(`GapFill has invalid bold Markdown in ${field}.`);
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
    if (!normalized) throw new Error(`GapFill requires ${field}.`);
    parseAccentMarkdown(normalized, field);
    return normalized;
  }

  function stripAccentMarkdown(value) {
    return parseAccentMarkdown(value).map(token => token.value).join('');
  }

  function parseGapText(value) {
    const parts = inlineGapText.parseMarkedText(value, {
      label: 'GapFill', minimum: 1, maximum: 12,
    });
    parts.forEach((part) => {
      if (part.type === 'text') parseAccentMarkdown(part.text, 'text');
      if (part.type === 'gap' && !KEBAB_CASE.test(part.token)) {
        throw new Error('GapFill gap markers must contain kebab-case gap ids.');
      }
    });
    return parts;
  }

  function comparableAnswer(value) {
    return typeof value === 'string'
      ? value.trim().replace(/\s+/g, ' ').replace(/[\u2018\u2019\u02BC]/g, "'").toLocaleLowerCase()
      : '';
  }

  function answersMatch(value, answer) {
    return Boolean(comparableAnswer(value)) && comparableAnswer(value) === comparableAnswer(answer);
  }

  function normalizeGaps(gaps) {
    if (!Array.isArray(gaps) || gaps.length < 1 || gaps.length > 12) {
      throw new Error('GapFill requires between 1 and 12 gaps.');
    }
    const ids = new Set();
    return gaps.map((gap) => {
      const id = typeof gap?.id === 'string' ? gap.id.trim() : '';
      if (!KEBAB_CASE.test(id) || ids.has(id)) {
        throw new Error('GapFill gap ids must be unique kebab-case values.');
      }
      if (Object.keys(gap || {}).some(key => !GAP_KEYS.includes(key))) {
        throw new Error('GapFill gaps contain unsupported fields.');
      }
      ids.add(id);
      const answer = plainText(gap.answer, 'an answer');
      const example = normalizeSpace(gap.example);
      if (example && MARKUP.test(example)) {
        throw new Error('GapFill does not allow HTML or Markdown in an example.');
      }
      return example ? { id, answer, example } : { id, answer };
    });
  }

  function normalizeGapFill(data) {
    if (!data || data.type !== 'gapFill' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('GapFill requires type "gapFill" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !COMPONENT_KEYS.includes(key))) {
      throw new Error('GapFill contains unsupported fields.');
    }
    const accentColor = data.accentColor == null
      ? DEFAULT_ACCENT_COLOR
      : String(data.accentColor).trim().toUpperCase();
    if (!HEX_COLOR.test(accentColor)) throw new Error('GapFill requires a #RRGGBB accentColor.');
    const parts = parseGapText(data.text);
    const gaps = normalizeGaps(data.gaps);
    const markers = parts.filter(part => part.type === 'gap').map(part => part.token);
    const ids = gaps.map(gap => gap.id);
    if (new Set(markers).size !== markers.length) {
      throw new Error('GapFill gap markers must be unique in text.');
    }
    if (markers.length !== gaps.length || markers.some(id => !ids.includes(id)) || ids.some(id => !markers.includes(id))) {
      throw new Error('GapFill text markers and gaps must match exactly.');
    }
    return {
      type: 'gapFill',
      id: data.id,
      title: accentText(data.title, 'a title', true),
      instruction: plainText(data.instruction, 'an instruction'),
      text: inlineGapText.serializeMarkedText(parts),
      gaps,
      accentColor,
    };
  }

  function slug(value) {
    const base = String(value || '').toLowerCase().normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return base || 'gap';
  }

  function appendAccentMarkdown(parent, value, documentRef, preserveBreaks = false) {
    parseAccentMarkdown(value).forEach((token) => {
      const target = token.type === 'strong' ? documentRef.createElement('strong') : parent;
      if (token.type === 'strong') target.className = 'gap-fill__accent';
      if (preserveBreaks) inlineGapText.appendTextWithBreaks(target, token.value, documentRef);
      else target.append(documentRef.createTextNode(token.value));
      if (target !== parent) parent.append(target);
    });
  }

  function renderGapFill(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') { doc = options; settings = {}; }
    if (!doc) throw new Error('GapFill requires a document.');

    let current = normalizeGapFill(data);
    let editing = false;
    let saving = false;
    let initialSnapshot = '';
    let editorGaps = [];

    const section = doc.createElement('section');
    section.className = 'gap-fill';
    section.dataset.componentId = current.id;
    section.style.setProperty('--gap-fill-accent', current.accentColor);
    section.setAttribute('aria-label', stripAccentMarkdown(current.title));
    const header = doc.createElement('div');
    header.className = 'gap-fill__header';
    const title = doc.createElement('h2');
    title.className = 'gap-fill__title';
    title.dataset.placeholder = 'Введите заголовок';
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'gap-fill__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать Gap Fill');
    const headerActions = doc.createElement('div');
    headerActions.className = 'gap-fill__header-actions';
    const cancelButton = doc.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'gap-fill__cancel';
    cancelButton.textContent = 'Отмена';
    cancelButton.hidden = true;
    header.append(title);
    if (typeof settings.onSave === 'function') {
      headerActions.append(cancelButton, editButton);
      header.append(headerActions);
    }
    const instruction = doc.createElement('p');
    instruction.className = 'gap-fill__instruction';
    instruction.dataset.placeholder = 'Введите инструкцию';
    const toolbar = doc.createElement('div');
    toolbar.className = 'gap-fill__toolbar';
    toolbar.hidden = true;
    const gapTool = doc.createElement('button');
    gapTool.type = 'button';
    gapTool.className = 'gap-fill__tool';
    gapTool.textContent = 'Пропуск';
    gapTool.setAttribute('aria-label', 'Сделать выделенный текст пропуском');
    toolbar.append(gapTool);
    const passage = doc.createElement('div');
    passage.className = 'gap-fill__passage';
    const gapEditor = doc.createElement('div');
    gapEditor.className = 'gap-fill__gaps-editor';
    gapEditor.hidden = true;

    function parts() { return parseGapText(current.text); }
    function gapById(id) { return current.gaps.find(gap => gap.id === id); }
    function editorGapById(id) { return editorGaps.find(gap => gap.id === id); }
    function setDirty(dirty) {
      section.classList.toggle('gap-fill--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function makePlayInput(gap, index) {
      const field = doc.createElement('span');
      field.className = 'gap-fill__field';
      const input = doc.createElement('input');
      input.type = 'text';
      input.className = 'gap-fill__input';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.dataset.gapId = gap.id;
      if (gap.example) input.placeholder = gap.example;
      input.setAttribute('aria-label', gap.example
        ? `Пропуск ${index + 1}, пример: ${gap.example}`
        : `Пропуск ${index + 1}`);
      const check = doc.createElement('span');
      check.className = 'gap-fill__check';
      check.hidden = true;
      check.setAttribute('aria-hidden', 'true');
      const status = doc.createElement('span');
      status.className = 'gap-fill__sr-status';
      status.setAttribute('aria-live', 'polite');
      input.addEventListener('input', () => {
        const correct = answersMatch(input.value, gap.answer);
        field.classList.toggle('gap-fill__field--correct', correct);
        check.hidden = !correct;
        status.textContent = correct ? `Ответ ${index + 1} верный.` : '';
        if (typeof settings.onActivity === 'function') {
          settings.onActivity(current.id, gap.id, correct ? 'correct' : 'pending');
        }
      });
      field.append(input, check, status);
      return field;
    }

    function paintPlay() {
      section.style.setProperty('--gap-fill-accent', current.accentColor);
      section.setAttribute('aria-label', stripAccentMarkdown(current.title));
      title.replaceChildren();
      appendAccentMarkdown(title, current.title, doc);
      instruction.textContent = current.instruction;
      title.contentEditable = 'false';
      instruction.contentEditable = 'false';
      let gapIndex = 0;
      passage.replaceChildren(...inlineGapText.splitParagraphs(parts()).map((paragraphParts) => {
        const paragraph = doc.createElement('p');
        paragraph.className = 'gap-fill__paragraph';
        paragraphParts.forEach((part) => {
          if (part.type === 'text') appendAccentMarkdown(paragraph, part.text, doc, true);
          else {
            gapIndex += 1;
            paragraph.append(makePlayInput(gapById(part.token), gapIndex));
          }
        });
        return paragraph;
      }));
    }

    function makeTextSpan(text) {
      const span = doc.createElement('span');
      span.className = 'gap-fill__text';
      span.contentEditable = 'true';
      span.textContent = text;
      span.addEventListener('input', updateDirty);
      return span;
    }

    function gapLabel(gap) {
      return (gap && (gap.example || gap.answer)) || gap?.id || '';
    }

    function makeEditorGap(id) {
      const chip = doc.createElement('span');
      chip.className = 'gap-fill__gap-editor';
      chip.dataset.gapId = id;
      const label = doc.createElement('span');
      label.className = 'gap-fill__gap-label';
      label.textContent = gapLabel(editorGapById(id)) || id;
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Убрать пропуск ${id}`);
      remove.addEventListener('click', () => unwrapGap(chip));
      chip.append(label, remove);
      return chip;
    }

    function editorParts() {
      return [...passage.children].map((node) => {
        if (node.classList.contains('gap-fill__text')) return { type: 'text', text: node.textContent };
        if (node.classList.contains('gap-fill__gap-editor')) return { type: 'gap', token: node.dataset.gapId };
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
      passage.replaceChildren(...withCarets.map(part => (
        part.type === 'gap' ? makeEditorGap(part.token) : makeTextSpan(part.text)
      )));
    }

    function uniqueGapId(value) {
      const used = new Set(editorGaps.map(gap => gap.id));
      const base = slug(value);
      let candidate = base;
      let index = 2;
      while (used.has(candidate)) { candidate = `${base}-${index}`; index += 1; }
      return candidate;
    }

    function refreshGapLabel(id) {
      const label = passage.querySelector(`[data-gap-id="${id}"] .gap-fill__gap-label`);
      if (label) label.textContent = gapLabel(editorGapById(id)) || id;
    }

    function paintGapEditors() {
      const ordered = editorParts()
        .filter(part => part.type === 'gap')
        .map(part => editorGapById(part.token))
        .filter(Boolean);
      gapEditor.replaceChildren(...ordered.map((gap) => {
        const card = doc.createElement('fieldset');
        card.className = 'gap-fill__gap-fields';
        const legend = doc.createElement('legend');
        legend.textContent = gap.id;
        const answerField = doc.createElement('label');
        answerField.className = 'gap-fill__editor-field';
        const answerCaption = doc.createElement('span');
        answerCaption.textContent = 'Answer Key';
        const answerInput = doc.createElement('input');
        answerInput.type = 'text';
        answerInput.value = gap.answer || '';
        answerInput.placeholder = 'Правильный ответ';
        answerInput.addEventListener('input', () => {
          gap.answer = answerInput.value;
          refreshGapLabel(gap.id);
          updateDirty();
        });
        answerField.append(answerCaption, answerInput);
        const exampleField = doc.createElement('label');
        exampleField.className = 'gap-fill__editor-field';
        const exampleCaption = doc.createElement('span');
        exampleCaption.textContent = 'Example';
        const exampleInput = doc.createElement('input');
        exampleInput.type = 'text';
        exampleInput.value = gap.example || '';
        exampleInput.placeholder = 'Необязательно';
        exampleInput.addEventListener('input', () => {
          gap.example = exampleInput.value;
          refreshGapLabel(gap.id);
          updateDirty();
        });
        exampleField.append(exampleCaption, exampleInput);
        card.append(legend, answerField, exampleField);
        return card;
      }));
    }

    function editorSnapshot() {
      return JSON.stringify({
        title: title.textContent,
        instruction: instruction.textContent,
        text: inlineGapText.serializeMarkedText(inlineGapText.compactParts(editorParts())),
        gaps: editorGaps,
      });
    }
    function updateDirty() { if (editing && !saving) setDirty(editorSnapshot() !== initialSnapshot); }

    function selectionInTextSpan() {
      const selection = doc.getSelection ? doc.getSelection() : root.getSelection?.();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      const start = range.startContainer.nodeType === 3 ? range.startContainer.parentElement : range.startContainer;
      const end = range.endContainer.nodeType === 3 ? range.endContainer.parentElement : range.endContainer;
      if (!start || start !== end || !start.classList?.contains('gap-fill__text') || !passage.contains(start)) return null;
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
      if (!selection || editorGaps.length >= 12) return;
      const source = editorParts();
      const index = [...passage.children].indexOf(selection.span);
      const value = selection.span.textContent;
      const example = normalizeSpace(value.slice(selection.start, selection.end));
      if (!example) return;
      const id = uniqueGapId(example);
      const next = [...source.slice(0, index),
        ...(value.slice(0, selection.start) ? [{ type: 'text', text: value.slice(0, selection.start) }] : []),
        { type: 'gap', token: id },
        ...(value.slice(selection.end) ? [{ type: 'text', text: value.slice(selection.end) }] : []),
        ...source.slice(index + 1)];
      editorGaps.push({ id, example, answer: example });
      paintEditorPassage(next);
      paintGapEditors();
      updateDirty();
    }

    function unwrapGap(chip) {
      const source = editorParts();
      const index = [...passage.children].indexOf(chip);
      const id = chip.dataset.gapId;
      const gap = editorGapById(id);
      const restored = normalizeSpace(gap?.example) || normalizeSpace(gap?.answer) || '';
      editorGaps = editorGaps.filter(item => item.id !== id);
      const replacement = source.slice();
      replacement.splice(index, 1, { type: 'text', text: restored });
      paintEditorPassage(inlineGapText.compactParts(replacement));
      paintGapEditors();
      updateDirty();
    }

    function enterEditMode() {
      if (editing) return;
      editing = true;
      editorGaps = current.gaps.map(gap => ({ ...gap }));
      section.classList.add('gap-fill--editing');
      toolbar.hidden = false;
      gapEditor.hidden = false;
      title.textContent = current.title;
      title.contentEditable = 'true';
      instruction.contentEditable = 'true';
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить Gap Fill');
      cancelButton.hidden = false;
      paintEditorPassage(parts());
      paintGapEditors();
      initialSnapshot = editorSnapshot();
      title.focus();
    }

    function leaveEditMode() {
      if (saving) return;
      editing = false;
      toolbar.hidden = true;
      gapEditor.hidden = true;
      section.classList.remove('gap-fill--editing', 'gap-fill--saving');
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать Gap Fill');
      cancelButton.hidden = true;
      setDirty(false);
      paintPlay();
    }

    async function saveEditing() {
      const candidate = {
        type: 'gapFill',
        id: current.id,
        title: title.textContent,
        instruction: instruction.textContent,
        text: inlineGapText.serializeMarkedText(inlineGapText.compactParts(editorParts())),
        gaps: editorGaps,
        accentColor: current.accentColor,
      };
      try { normalizeGapFill(candidate); } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      section.classList.add('gap-fill--saving');
      editButton.disabled = true;
      try {
        const saved = await settings.onSave({
          title: candidate.title,
          instruction: candidate.instruction,
          text: candidate.text,
          gaps: candidate.gaps,
        }, current.id);
        current = normalizeGapFill(saved || candidate);
        saving = false;
        leaveEditMode();
      } catch (_error) {
        saving = false;
        section.classList.remove('gap-fill--saving');
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

    section.append(header, instruction, toolbar, passage, gapEditor);
    paintPlay();
    return section;
  }

  const api = {
    DEFAULT_ACCENT_COLOR,
    answersMatch,
    normalizeGapFill,
    parseAccentMarkdown,
    parseGapText,
    renderGapFill,
    stripAccentMarkdown,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GapFillComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
