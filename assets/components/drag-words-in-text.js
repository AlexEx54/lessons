(function initDragWordsInTextComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s|^\s*(?:[-*+]\s|\d+\.\s)/m;
  const COMPONENT_KEYS = ['type', 'id', 'title', 'instruction', 'words', 'text'];

  function normalizeSpace(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function plainText(value, field) {
    const normalized = normalizeSpace(value);
    if (!normalized) throw new Error(`DragWordsInText requires ${field}.`);
    if (MARKUP.test(normalized)) throw new Error(`DragWordsInText does not allow HTML or Markdown in ${field}.`);
    return normalized;
  }

  function parseMarkedText(value) {
    const source = typeof value === 'string' ? value.replace(/\r\n/g, '\n').trim() : '';
    if (!source) throw new Error('DragWordsInText requires text.');
    const parts = [];
    let lastIndex = 0;
    for (const match of source.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
      if (match.index > lastIndex) {
        parts.push({ type: 'text', text: source.slice(lastIndex, match.index) });
      }
      const inner = match[1];
      if (!inner.trim()) throw new Error('DragWordsInText does not allow empty gaps.');
      if (/[\[\]\n\r]/.test(inner)) {
        throw new Error('DragWordsInText gaps cannot contain brackets or line breaks.');
      }
      parts.push({ type: 'gap', answer: inner.trim().replace(/\s+/g, ' ') });
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < source.length) parts.push({ type: 'text', text: source.slice(lastIndex) });
    const gapCount = parts.filter(part => part.type === 'gap').length;
    if (gapCount < 1 || gapCount > 8) {
      throw new Error('DragWordsInText requires between 1 and 8 gaps.');
    }
    parts.forEach((part) => {
      if (part.type !== 'text') return;
      if (/\[\[|\]\]/.test(part.text)) throw new Error('DragWordsInText text has unmatched gap markers.');
      if (MARKUP.test(part.text)) {
        throw new Error('DragWordsInText does not allow HTML or Markdown in text.');
      }
    });
    return parts;
  }

  function serializeMarkedText(parts) {
    return parts
      .map(part => (part.type === 'gap' ? `[[${part.answer}]]` : part.text))
      .join('')
      .replace(/^\s+|\s+$/g, '');
  }

  function compactParts(parts) {
    const compacted = [];
    parts.forEach((part) => {
      if (!part) return;
      if (part.type === 'text') {
        if (!part.text) return;
        const previous = compacted[compacted.length - 1];
        if (previous && previous.type === 'text') {
          previous.text += part.text;
          return;
        }
        compacted.push({ type: 'text', text: part.text });
        return;
      }
      compacted.push({ type: 'gap', answer: normalizeSpace(part.answer) });
    });
    return compacted;
  }

  function normalizeWords(words) {
    if (!Array.isArray(words) || words.length < 2 || words.length > 12) {
      throw new Error('DragWordsInText requires between 2 and 12 words.');
    }
    const normalized = words.map(word => plainText(word, 'a bank word'));
    if (new Set(normalized).size !== normalized.length) {
      throw new Error('DragWordsInText words must be unique.');
    }
    return normalized;
  }

  function normalizeDragWordsInText(data) {
    if (!data || data.type !== 'dragWordsInText' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('DragWordsInText requires type "dragWordsInText" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !COMPONENT_KEYS.includes(key))) {
      throw new Error('DragWordsInText contains unsupported fields.');
    }
    const words = normalizeWords(data.words);
    const parts = parseMarkedText(data.text);
    const answers = parts.filter(part => part.type === 'gap').map(part => part.answer);
    if (new Set(answers).size !== answers.length) {
      throw new Error('DragWordsInText answers must be unique.');
    }
    if (answers.some(answer => !words.includes(answer))) {
      throw new Error('DragWordsInText answers must match the word bank.');
    }
    return {
      type: 'dragWordsInText',
      id: data.id,
      title: plainText(data.title, 'a title'),
      instruction: plainText(data.instruction, 'an instruction'),
      words,
      text: serializeMarkedText(parts),
    };
  }

  function prefersReducedMotion() {
    return Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function renderDragWordsInText(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('DragWordsInText requires a document.');

    let current = normalizeDragWordsInText(data);
    let editing = false;
    let saving = false;
    let initialSnapshot = '';
    let picked = null;
    let drag = null;
    let flashTimer = 0;
    const placed = new Map();

    const section = doc.createElement('section');
    section.className = 'drag-words-in-text';
    section.dataset.componentId = current.id;

    const header = doc.createElement('div');
    header.className = 'drag-words-in-text__header';
    const title = doc.createElement('h2');
    title.className = 'drag-words-in-text__title';
    title.dataset.placeholder = 'Введите заголовок';
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'drag-words-in-text__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать Complete the Rule');
    header.append(title);
    if (typeof settings.onSave === 'function') header.append(editButton);

    const instruction = doc.createElement('p');
    instruction.className = 'drag-words-in-text__instruction';
    instruction.dataset.placeholder = 'Введите инструкцию';

    const toolbar = doc.createElement('div');
    toolbar.className = 'drag-words-in-text__toolbar';
    toolbar.hidden = true;
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Правка пропусков');
    const gapTool = doc.createElement('button');
    gapTool.type = 'button';
    gapTool.className = 'drag-words-in-text__tool';
    gapTool.textContent = 'Пропуск';
    gapTool.setAttribute('aria-label', 'Сделать выделенный текст пропуском');
    toolbar.append(gapTool);

    const bank = doc.createElement('div');
    bank.className = 'drag-words-in-text__bank';
    const passage = doc.createElement('div');
    passage.className = 'drag-words-in-text__passage';
    const status = doc.createElement('p');
    status.className = 'drag-words-in-text__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    function setDirty(dirty) {
      section.classList.toggle('drag-words-in-text--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function parts() {
      return parseMarkedText(current.text);
    }

    function remainingWords() {
      const used = new Set(placed.values());
      return current.words.filter(word => !used.has(word));
    }

    function setPicked(word) {
      picked = word || null;
      bank.querySelectorAll('.drag-words-in-text__chip').forEach((chip) => {
        const on = Boolean(picked) && chip.dataset.word === picked;
        chip.classList.toggle('drag-words-in-text__chip--picked', on);
        chip.setAttribute('aria-pressed', String(on));
      });
    }

    function cleanupDrag() {
      if (!drag) return;
      if (drag.ghost) drag.ghost.remove();
      drag.chip.classList.remove('drag-words-in-text__chip--dragging');
      try {
        if (drag.chip.hasPointerCapture && drag.chip.hasPointerCapture(drag.pointerId)) {
          drag.chip.releasePointerCapture(drag.pointerId);
        }
      } catch (_error) { /* ignore */ }
      passage.querySelectorAll('.drag-words-in-text__gap--target').forEach((gap) => {
        gap.classList.remove('drag-words-in-text__gap--target');
      });
      drag = null;
    }

    function gapFromPoint(x, y) {
      const element = doc.elementFromPoint(x, y);
      const gap = element && element.closest ? element.closest('.drag-words-in-text__gap') : null;
      if (!gap || !passage.contains(gap) || gap.classList.contains('drag-words-in-text__gap--correct')) {
        return null;
      }
      return gap;
    }

    function highlightGapAt(x, y) {
      const target = gapFromPoint(x, y);
      passage.querySelectorAll('.drag-words-in-text__gap--target').forEach((gap) => {
        gap.classList.remove('drag-words-in-text__gap--target');
      });
      if (target) target.classList.add('drag-words-in-text__gap--target');
    }

    function flashGap(index) {
      const gap = passage.querySelector(`[data-gap-index="${index}"]`);
      if (!gap) return;
      gap.classList.add('drag-words-in-text__gap--wrong');
      root.clearTimeout(flashTimer);
      flashTimer = root.setTimeout(() => {
        gap.classList.remove('drag-words-in-text__gap--wrong');
      }, 450);
    }

    function tryPlace(word, index) {
      if (editing || placed.has(index) || !word) return;
      const gap = passage.querySelector(`[data-gap-index="${index}"]`);
      if (!gap || gap.dataset.answer !== word) {
        flashGap(index);
        setPicked(null);
        status.textContent = `Неверный вариант в пропуске ${index + 1}. Попробуйте ещё раз.`;
        if (typeof settings.onActivity === 'function') {
          settings.onActivity(current.id, `gap-${index + 1}`, 'wrong');
        }
        return;
      }
      placed.set(index, word);
      setPicked(null);
      paintPlay();
      const total = passage.querySelectorAll('.drag-words-in-text__gap').length;
      status.textContent = placed.size === total
        ? 'Все ответы верны.'
        : `Верно. ${placed.size} из ${total}.`;
      if (typeof settings.onActivity === 'function') {
        settings.onActivity(current.id, `gap-${index + 1}`, 'correct');
      }
    }

    function appendPlayText(container, text) {
      const lines = text.split('\n');
      lines.forEach((line, index) => {
        if (index > 0) container.append(doc.createElement('br'));
        if (line) container.append(doc.createTextNode(line));
      });
    }

    function bindPlayChip(chip, word) {
      chip.addEventListener('pointerdown', (event) => {
        if (editing || saving || event.button) return;
        event.preventDefault();
        try { chip.setPointerCapture(event.pointerId); } catch (_error) { /* ignore */ }
        drag = {
          word,
          chip,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
          ghost: null,
          wasPicked: picked === word,
        };
        setPicked(word);
      });
      chip.addEventListener('pointermove', (event) => {
        if (!drag || drag.chip !== chip || prefersReducedMotion()) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && (dx * dx) + (dy * dy) < 64) return;
        drag.moved = true;
        if (!drag.ghost) {
          drag.ghost = chip.cloneNode(true);
          drag.ghost.className = 'drag-words-in-text__chip drag-words-in-text__ghost';
          drag.ghost.removeAttribute('tabindex');
          drag.ghost.removeAttribute('role');
          doc.body.append(drag.ghost);
          chip.classList.add('drag-words-in-text__chip--dragging');
        }
        drag.ghost.style.left = `${event.clientX}px`;
        drag.ghost.style.top = `${event.clientY}px`;
        highlightGapAt(event.clientX, event.clientY);
      });
      function endPointer(event) {
        if (!drag || drag.chip !== chip) return;
        const moved = drag.moved;
        const wordValue = drag.word;
        const wasPicked = drag.wasPicked;
        const x = event.clientX;
        const y = event.clientY;
        cleanupDrag();
        if (moved) {
          setPicked(null);
          const gap = gapFromPoint(x, y);
          if (gap) tryPlace(wordValue, Number(gap.dataset.gapIndex));
          return;
        }
        if (wasPicked) setPicked(null);
      }
      chip.addEventListener('pointerup', endPointer);
      chip.addEventListener('pointercancel', endPointer);
      chip.addEventListener('keydown', (event) => {
        if (editing) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setPicked(picked === word ? null : word);
      });
    }

    function createPlayChip(word) {
      const chip = doc.createElement('span');
      chip.className = 'drag-words-in-text__chip';
      chip.dataset.word = word;
      chip.textContent = word;
      chip.tabIndex = 0;
      chip.setAttribute('role', 'button');
      chip.setAttribute('aria-pressed', 'false');
      chip.setAttribute('aria-label', `Слово ${word}`);
      bindPlayChip(chip, word);
      return chip;
    }

    function createPlayGap(answer, index) {
      const gap = doc.createElement('span');
      gap.className = 'drag-words-in-text__gap';
      gap.dataset.gapIndex = String(index);
      gap.dataset.answer = answer;
      const filled = placed.get(index);
      if (filled) {
        gap.classList.add('drag-words-in-text__gap--correct');
        gap.textContent = filled;
        gap.setAttribute('aria-label', `Пропуск ${index + 1}: ${filled}`);
        return gap;
      }
      gap.setAttribute('role', 'button');
      gap.tabIndex = 0;
      gap.setAttribute('aria-label', `Пропуск ${index + 1}`);
      const activate = () => {
        if (picked) tryPlace(picked, index);
      };
      gap.addEventListener('click', activate);
      gap.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        activate();
      });
      return gap;
    }

    function paintPlayPassage() {
      const paragraphs = [[]];
      parts().forEach((part) => {
        if (part.type === 'gap') {
          paragraphs[paragraphs.length - 1].push(part);
          return;
        }
        part.text.split('\n\n').forEach((chunk, index) => {
          if (index > 0) paragraphs.push([]);
          if (chunk) paragraphs[paragraphs.length - 1].push({ type: 'text', text: chunk });
        });
      });
      let gapIndex = 0;
      const nodes = [];
      paragraphs.forEach((paragraphParts) => {
        if (!paragraphParts.length) return;
        const paragraph = doc.createElement('p');
        paragraph.className = 'drag-words-in-text__paragraph';
        paragraphParts.forEach((part) => {
          if (part.type === 'text') {
            appendPlayText(paragraph, part.text);
            return;
          }
          paragraph.append(createPlayGap(part.answer, gapIndex));
          gapIndex += 1;
        });
        nodes.push(paragraph);
      });
      passage.replaceChildren(...nodes);
    }

    function paintPlayBank() {
      bank.replaceChildren(...remainingWords().map(createPlayChip));
      if (picked && remainingWords().includes(picked)) setPicked(picked);
      else picked = null;
    }

    function paintPlay() {
      title.textContent = current.title;
      instruction.textContent = current.instruction;
      title.contentEditable = 'false';
      instruction.contentEditable = 'false';
      paintPlayBank();
      paintPlayPassage();
    }

    function editorWords() {
      return [...bank.querySelectorAll('.drag-words-in-text__chip-text')]
        .map(chip => chip.textContent)
        .map(normalizeSpace)
        .filter(Boolean);
    }

    function editorParts() {
      return [...passage.children].map((node) => {
        if (node.classList.contains('drag-words-in-text__text')) {
          return { type: 'text', text: node.textContent };
        }
        if (node.classList.contains('drag-words-in-text__gap')) {
          const answer = node.querySelector('.drag-words-in-text__gap-answer');
          return { type: 'gap', answer: answer ? answer.textContent : '' };
        }
        return null;
      }).filter(Boolean);
    }

    function editorSnapshot() {
      return JSON.stringify({
        title: title.textContent,
        instruction: instruction.textContent,
        words: editorWords(),
        text: serializeMarkedText(compactParts(editorParts())),
      });
    }

    function updateDirty() {
      if (!editing || saving) return;
      setDirty(editorSnapshot() !== initialSnapshot);
    }

    function usedAnswers() {
      return new Set(
        editorParts()
          .filter(part => part.type === 'gap')
          .map(part => normalizeSpace(part.answer))
          .filter(Boolean),
      );
    }

    function makeTextSpan(text) {
      const span = doc.createElement('span');
      span.className = 'drag-words-in-text__text';
      span.contentEditable = 'true';
      span.textContent = text;
      span.addEventListener('input', updateDirty);
      return span;
    }

    function makeEditorGap(answer) {
      const gap = doc.createElement('span');
      gap.className = 'drag-words-in-text__gap drag-words-in-text__gap--editor';
      const value = doc.createElement('span');
      value.className = 'drag-words-in-text__gap-answer';
      value.contentEditable = 'true';
      value.dataset.placeholder = 'слово';
      value.textContent = answer;
      value.addEventListener('input', updateDirty);
      value.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault();
      });
      value.addEventListener('blur', () => {
        const next = normalizeSpace(value.textContent);
        if (next && !editorWords().includes(next)) addBankChip(next);
        updateRemoveStates();
        updateDirty();
      });
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.className = 'drag-words-in-text__gap-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', 'Убрать пропуск');
      remove.addEventListener('click', () => unwrapGap(gap));
      gap.append(value, remove);
      return gap;
    }

    function paintEditorPassage(sourceParts) {
      const nodes = [];
      const prepared = sourceParts.slice();
      if (!prepared.length || prepared[0].type === 'gap') prepared.unshift({ type: 'text', text: '' });
      const withCarets = [];
      prepared.forEach((part) => {
        if (part.type === 'gap' && withCarets.length && withCarets[withCarets.length - 1].type === 'gap') {
          withCarets.push({ type: 'text', text: '' });
        }
        withCarets.push(part);
      });
      if (withCarets[withCarets.length - 1].type === 'gap') withCarets.push({ type: 'text', text: '' });
      withCarets.forEach((part) => {
        nodes.push(part.type === 'gap' ? makeEditorGap(part.answer) : makeTextSpan(part.text));
      });
      passage.replaceChildren(...nodes);
    }

    function updateRemoveStates() {
      const used = usedAnswers();
      bank.querySelectorAll('.drag-words-in-text__chip--editor').forEach((chip) => {
        const word = normalizeSpace(chip.querySelector('.drag-words-in-text__chip-text').textContent);
        const remove = chip.querySelector('.drag-words-in-text__chip-remove');
        if (remove) remove.disabled = saving || used.has(word);
      });
    }

    function addBankChip(word) {
      const add = bank.querySelector('.drag-words-in-text__chip--add');
      bank.insertBefore(makeEditorChip(word), add);
      updateRemoveStates();
      updateDirty();
    }

    function makeEditorChip(word) {
      const chip = doc.createElement('span');
      chip.className = 'drag-words-in-text__chip drag-words-in-text__chip--editor';
      const label = doc.createElement('span');
      label.className = 'drag-words-in-text__chip-text';
      label.contentEditable = 'true';
      label.dataset.placeholder = 'слово';
      label.textContent = word;
      let previous = normalizeSpace(word);
      label.addEventListener('focus', () => { previous = normalizeSpace(label.textContent); });
      label.addEventListener('input', () => {
        const next = label.textContent;
        if (previous) {
          passage.querySelectorAll('.drag-words-in-text__gap-answer').forEach((answer) => {
            if (normalizeSpace(answer.textContent) === previous) answer.textContent = next;
          });
        }
        previous = normalizeSpace(next);
        updateRemoveStates();
        updateDirty();
      });
      label.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') event.preventDefault();
      });
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.className = 'drag-words-in-text__chip-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Удалить слово ${word || ''}`.trim());
      remove.addEventListener('click', () => {
        if (remove.disabled) return;
        chip.remove();
        updateDirty();
      });
      chip.append(label, remove);
      return chip;
    }

    function paintEditorBank(words) {
      const add = doc.createElement('button');
      add.type = 'button';
      add.className = 'drag-words-in-text__chip drag-words-in-text__chip--add';
      add.textContent = '+ слово';
      add.addEventListener('click', () => {
        addBankChip('');
        const labels = bank.querySelectorAll('.drag-words-in-text__chip-text');
        const last = labels[labels.length - 1];
        if (last) last.focus();
      });
      bank.replaceChildren(...words.map(makeEditorChip), add);
      updateRemoveStates();
    }

    function unwrapGap(gap) {
      const source = editorParts();
      const index = [...passage.children].indexOf(gap);
      const part = source[index];
      if (!part || part.type !== 'gap') return;
      const answer = normalizeSpace(part.answer);
      const before = source[index - 1];
      const after = source[index + 1];
      const start = before && before.type === 'text' ? index - 1 : index;
      const end = after && after.type === 'text' ? index + 1 : index;
      const merged = `${before && before.type === 'text' ? before.text : ''}${answer}${after && after.type === 'text' ? after.text : ''}`;
      paintEditorPassage([...source.slice(0, start), { type: 'text', text: merged }, ...source.slice(end + 1)]);
      updateRemoveStates();
      updateDirty();
    }

    function selectionInTextSpan() {
      const selection = doc.getSelection ? doc.getSelection() : root.getSelection && root.getSelection();
      if (!selection || selection.rangeCount === 0) return null;
      const range = selection.getRangeAt(0);
      const startSpan = range.startContainer.nodeType === 3
        ? range.startContainer.parentElement
        : range.startContainer;
      const endSpan = range.endContainer.nodeType === 3
        ? range.endContainer.parentElement
        : range.endContainer;
      if (!startSpan || startSpan !== endSpan || !startSpan.classList
        || !startSpan.classList.contains('drag-words-in-text__text')
        || !passage.contains(startSpan)) {
        return null;
      }
      const prefix = doc.createRange();
      prefix.selectNodeContents(startSpan);
      prefix.setEnd(range.startContainer, range.startOffset);
      const start = prefix.toString().length;
      prefix.setEnd(range.endContainer, range.endOffset);
      const end = prefix.toString().length;
      return { span: startSpan, start: Math.min(start, end), end: Math.max(start, end) };
    }

    function insertGap() {
      if (!editing || saving) return;
      const selection = selectionInTextSpan();
      if (!selection) return;
      const source = editorParts();
      const index = [...passage.children].indexOf(selection.span);
      const text = selection.span.textContent;
      const selected = text.slice(selection.start, selection.end);
      const answer = normalizeSpace(selected);
      const before = text.slice(0, selection.start);
      const after = text.slice(selection.end);
      const next = [
        ...source.slice(0, index),
        ...(before ? [{ type: 'text', text: before }] : []),
        { type: 'gap', answer },
        ...(after ? [{ type: 'text', text: after }] : []),
        ...source.slice(index + 1),
      ];
      if (answer && !editorWords().includes(answer)) addBankChip(answer);
      paintEditorPassage(next);
      updateRemoveStates();
      updateDirty();
      const answers = passage.querySelectorAll('.drag-words-in-text__gap-answer');
      const focusAt = next.slice(0, index + (before ? 2 : 1)).filter(part => part.type === 'gap').length - 1;
      const target = answers[focusAt] || answers[answers.length - 1];
      if (target) {
        target.focus();
        if (doc.getSelection && target.firstChild) {
          const range = doc.createRange();
          range.selectNodeContents(target);
          const sel = doc.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }

    function cancelEditing() {
      if (!editing || saving) return;
      title.textContent = current.title;
      instruction.textContent = current.instruction;
      leaveEditMode();
      editButton.focus();
    }

    function leaveEditMode() {
      editing = false;
      saving = false;
      cleanupDrag();
      toolbar.hidden = true;
      title.contentEditable = 'false';
      instruction.contentEditable = 'false';
      [title, instruction].forEach((element) => {
        element.removeAttribute('role');
        element.removeAttribute('aria-label');
        element.removeAttribute('aria-multiline');
      });
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать Complete the Rule');
      section.classList.remove('drag-words-in-text--editing', 'drag-words-in-text--saving');
      setDirty(false);
      paintPlay();
    }

    function enterEditMode() {
      if (editing) return;
      cleanupDrag();
      editing = true;
      placed.clear();
      picked = null;
      section.classList.add('drag-words-in-text--editing');
      toolbar.hidden = false;
      title.contentEditable = 'true';
      title.setAttribute('role', 'textbox');
      title.setAttribute('aria-label', 'Заголовок');
      instruction.contentEditable = 'true';
      instruction.setAttribute('role', 'textbox');
      instruction.setAttribute('aria-label', 'Инструкция');
      instruction.setAttribute('aria-multiline', 'true');
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить Complete the Rule');
      paintEditorBank(current.words);
      paintEditorPassage(parts());
      initialSnapshot = editorSnapshot();
      title.focus();
    }

    async function saveEditing() {
      if (!editing || saving) return;
      const candidate = {
        type: 'dragWordsInText',
        id: current.id,
        title: title.textContent,
        instruction: instruction.textContent,
        words: editorWords(),
        text: serializeMarkedText(compactParts(editorParts())),
      };
      try {
        normalizeDragWordsInText(candidate);
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      section.classList.add('drag-words-in-text--saving');
      editButton.disabled = true;
      try {
        const saved = await settings.onSave({
          title: candidate.title,
          instruction: candidate.instruction,
          words: candidate.words,
          text: candidate.text,
        }, current.id);
        current = normalizeDragWordsInText(saved || candidate);
        saving = false;
        leaveEditMode();
      } catch (_error) {
        saving = false;
        section.classList.remove('drag-words-in-text--saving');
        editButton.disabled = false;
      }
    }

    editButton.addEventListener('click', () => (editing ? saveEditing() : enterEditMode()));
    gapTool.addEventListener('mousedown', event => event.preventDefault());
    gapTool.addEventListener('click', insertGap);
    title.addEventListener('input', updateDirty);
    instruction.addEventListener('input', updateDirty);
    title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') event.preventDefault();
    });
    section.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (editing) {
        event.preventDefault();
        cancelEditing();
        return;
      }
      if (picked) setPicked(null);
    });
    section.addEventListener('paste', (event) => {
      if (!editing) return;
      const target = event.target && event.target.closest
        ? event.target.closest('[contenteditable="true"]')
        : null;
      if (!target) return;
      event.preventDefault();
      const plain = event.clipboardData && event.clipboardData.getData
        ? event.clipboardData.getData('text/plain')
        : '';
      const multiline = target.classList.contains('drag-words-in-text__text');
      const insert = multiline ? plain : plain.replace(/\s+/g, ' ');
      if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, insert);
      updateDirty();
    });
    passage.addEventListener('click', (event) => {
      if (!editing || event.target !== passage) return;
      const spans = passage.querySelectorAll('.drag-words-in-text__text');
      const last = spans[spans.length - 1];
      if (last) last.focus();
    });

    paintPlay();
    section.append(header, instruction, toolbar, bank, passage, status);
    return section;
  }

  const api = { normalizeDragWordsInText, parseMarkedText, renderDragWordsInText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.DragWordsInTextComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
