(function initSentenceBuilder(root) {
  'use strict';
  const model = root.SentenceBuilderModel || (typeof require === 'function' ? require('./sentence-builder-model.js') : null);
  const exercises = root.ExerciseState || (typeof require === 'function' ? require('./exercise-state.js') : null);
  function renderSentenceBuilder(data, options, documentRef) {
    let settings = options || {}, doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') { doc = options; settings = {}; }
    let author = settings.presentation ? null : model.normalizeSentenceBuilder(data);
    let layout = author ? exercises.createLayout(author) : null;
    let task = settings.presentation || model.presentation(author, layout);
    let state = settings.exerciseState || {}, interactive = settings.interactive !== false;
    let disposed = false, pending = false, busy = false, editing = false, saving = false;
    let draft, originalDraft, drag = null, suppressClick = false, animationTimer;
    let cards = new Map(), animations = [], rendered = '', fromOverride = null;
    const seen = new Set(state.motion ? [state.motion.id || state.motion.sequence] : []);
    const el = (tag, name, text) => {
      const node = doc.createElement(tag); node.className = `sentence-builder__${name}`;
      if (text != null) node.textContent = text;
      if (tag === 'button') node.type = 'button';
      return node;
    };
    const section = doc.createElement('section'); section.className = 'sentence-builder'; section.dataset.componentId = task.id;
    const toolbar = el('div', 'toolbar'), edit = el('button', 'edit', '✎ Редактировать'), cancel = el('button', 'cancel', 'Отмена');
    cancel.hidden = true;
    if (author && settings.onSave) { toolbar.append(cancel, edit); section.append(toolbar); }
    const screen = el('div', 'screen'), top = el('div', 'top'), progress = el('progress', 'progress'), count = el('span', 'count');
    progress.setAttribute('aria-label', 'Completed sentences'); top.append(progress, count);
    const game = el('div', 'game'), title = el('h2', 'title'), instruction = el('p', 'instruction');
    const bankLabel = el('p', 'label', 'WORD CARDS'), bank = el('div', 'bank');
    const answerLabel = el('p', 'label', 'YOUR SENTENCE'), answer = el('div', 'answer');
    bank.setAttribute('role', 'group'); bank.setAttribute('aria-label', 'Available words');
    answer.setAttribute('role', 'group'); answer.setAttribute('aria-label', 'Your sentence');
    const help = el('p', 'help', 'Tap a word to move it. Drag to reorder, or use Alt + ← / →.');
    const status = el('p', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const footer = el('div', 'footer'), hint = el('button', 'hint', '☀ Hint'), check = el('button', 'check', 'Check →'), next = el('button', 'next', 'Next →');
    footer.append(hint, check, next);
    game.append(title, instruction, bankLabel, bank, answerLabel, answer, help, status, footer);
    const completion = el('div', 'completion'); completion.hidden = true;
    const completionTitle = el('h2', 'completion-title'), completionDetail = el('p', 'completion-detail', 'You put every sentence together!');
    const cat = el('img', 'cat'); cat.src = '/assets/sentence-builder/happy-cat.png'; cat.alt = 'A happy orange cat'; cat.width = 1254; cat.height = 1254;
    completion.append(completionTitle, completionDetail, cat);
    const paw = el('img', 'paw'); paw.src = '/assets/sentence-builder/paw.svg'; paw.alt = ''; paw.hidden = true; paw.setAttribute('aria-hidden', 'true');
    screen.append(top, game, completion, paw);
    const editor = el('div', 'editor'); editor.hidden = true;
    const error = el('p', 'error'); error.setAttribute('role', 'alert');
    section.append(screen, editor, error);
    const currentItem = () => task.items.find(item => item.id === (state.currentItemId || task.items[0].id));
    const currentRow = () => state.items?.[currentItem().id] || { placedIds: [], solved: false };
    const allowed = () => interactive && !pending && !busy && !editing && !disposed && !state.completed && !currentRow().solved;
    const reduced = () => doc.hidden || root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    function stopAnimation() {
      root.clearTimeout(animationTimer); animations.forEach(animation => animation.cancel()); animations = [];
      paw.hidden = true; busy = false;
    }
    function controls() {
      if (disposed) return;
      const row = currentRow(), item = currentItem();
      for (const card of cards.values()) card.disabled = !allowed();
      hint.hidden = !task.hintsEnabled || row.solved;
      hint.disabled = !allowed();
      check.hidden = row.solved; check.disabled = !allowed() || row.placedIds.length !== item.tokens.length;
      next.hidden = !row.solved; next.disabled = !interactive || pending || busy || editing;
      next.textContent = item === task.items[task.items.length - 1] ? 'Finish ✦' : 'Next →';
      screen.setAttribute('aria-busy', String(pending));
    }
    function animateTransfer(from, card) {
      if (!from || !card?.animate || reduced()) return;
      stopAnimation();
      const to = card.getBoundingClientRect(), bounds = screen.getBoundingClientRect();
      if (!to.width || !bounds.width) return;
      busy = true; paw.hidden = false;
      const duration = 760, dx = from.left - to.left, dy = from.top - to.top;
      animations.push(card.animate([
        { transform: `translate(${dx}px, ${dy}px) rotate(-4deg)`, offset: 0 },
        { transform: `translate(${dx}px, ${dy}px) rotate(-4deg)`, offset: .18 },
        { transform: 'translate(0, 0) rotate(2deg)', offset: .78 },
        { transform: 'translate(0, 0)', offset: 1 },
      ], { duration, easing: 'cubic-bezier(.22,.7,.25,1)' }));
      const point = rect => `translate(${rect.left - bounds.left + rect.width * .55 - 52}px, ${rect.top - bounds.top + rect.height * .5 - 20}px) rotate(-12deg)`;
      const off = `translate(${to.left - bounds.left}px, ${bounds.height + 30}px) rotate(-12deg)`;
      animations.push(paw.animate([
        { transform: off, offset: 0 }, { transform: point(from), offset: .18 },
        { transform: point(to), offset: .78 }, { transform: off, offset: 1 },
      ], { duration, easing: 'cubic-bezier(.22,.7,.25,1)' }));
      animationTimer = root.setTimeout(() => { stopAnimation(); controls(); }, duration);
    }
    function makeCard(token, placed) {
      const card = el('button', 'card', token.text); card.dataset.tokenId = token.id;
      card.setAttribute('aria-label', `${token.text}: ${placed ? 'return to word cards' : 'add to sentence'}`);
      card.addEventListener('click', event => {
        if (suppressClick) { suppressClick = false; if (event.detail !== 0) return; }
        if (!allowed()) return;
        dispatch({ type: placed ? 'return-token' : 'move-token', tokenId: token.id, toIndex: currentRow().placedIds.length });
      });
      card.addEventListener('keydown', event => {
        if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key) || !placed || !allowed()) return;
        event.preventDefault();
        const ids = currentRow().placedIds, index = ids.indexOf(token.id) + (event.key === 'ArrowLeft' ? -1 : 1);
        if (index >= 0 && index < ids.length) dispatch({ type: 'move-token', tokenId: token.id, toIndex: index });
      });
      card.addEventListener('pointerdown', event => {
        if (!allowed() || (event.button != null && event.button !== 0)) return;
        suppressClick = false;
        drag = { tokenId: token.id, x: event.clientX, y: event.clientY, pointerId: event.pointerId,
          rect: card.getBoundingClientRect(), card, ghost: null };
      });
      cards.set(token.id, card); return card;
    }
    function paint() {
      const item = currentItem(), row = currentRow();
      const fingerprint = JSON.stringify([item.id, row.placedIds, row.solved, state.completed]);
      title.textContent = `★ ${task.title}`; instruction.textContent = task.instruction;
      completionTitle.textContent = task.completionText;
      section.setAttribute('aria-label', task.title);
      progress.max = task.items.length; progress.value = task.items.filter(item => state.items?.[item.id]?.solved).length;
      count.textContent = state.completed ? `${task.items.length} / ${task.items.length}` : `${task.items.indexOf(item) + 1} / ${task.items.length}`;
      game.hidden = Boolean(state.completed); completion.hidden = !state.completed;
      if (fingerprint !== rendered) {
        const focused = doc.activeElement?.dataset?.tokenId;
        cards = new Map(); bank.replaceChildren(); answer.replaceChildren();
        item.tokens.filter(token => !row.placedIds.includes(token.id)).forEach(token => bank.append(makeCard(token, false)));
        row.placedIds.forEach(id => answer.append(makeCard(item.tokens.find(token => token.id === id), true)));
        for (let i = row.placedIds.length; i < item.tokens.length; i++) {
          const slot = el('span', 'slot', String(i + 1)); slot.setAttribute('aria-hidden', 'true'); answer.append(slot);
        }
        if (focused && !state.completed) cards.get(focused)?.focus?.({ preventScroll: true });
        rendered = fingerprint;
      }
      status.textContent = row.solved ? 'Perfect! You’ve got it.' : row.feedback === 'wrong' ? 'Almost! Try a different order.'
        : row.feedback === 'ready' ? 'Looks ready. Press Check!' : `${row.placedIds.length} of ${item.tokens.length} cards placed`;
      status.classList.toggle('sentence-builder__status--correct', Boolean(row.solved));
      answer.classList.toggle('sentence-builder__answer--correct', Boolean(row.solved));
      controls();
    }
    function dispatch(action) {
      if (disposed || pending || busy || !interactive || editing) return;
      const full = { ...action, componentId: task.id, itemId: currentItem().id, actionId: root.crypto.randomUUID() };
      error.textContent = '';
      try {
        if (settings.onAction) {
          // Only movements are predicted. Answers and hints are accepted by the server.
          if (['move-token', 'return-token'].includes(action.type)) section.updateState(model.apply(task, state, full));
          pending = true; controls(); settings.onAction(full);
        } else section.updateState(model.apply(author, state, full, layout));
      } catch (cause) { pending = false; fromOverride = null; error.textContent = cause.message; controls(); }
    }
    section.updateState = (nextState = {}, options = {}) => {
      if (disposed) return;
      const motionKey = nextState.motion && (nextState.motion.id || nextState.motion.sequence);
      const fresh = motionKey && !seen.has(motionKey);
      const from = fromOverride || (fresh && cards.get(nextState.motion.tokenId)?.getBoundingClientRect());
      fromOverride = null;
      const completed = state.completed;
      if (rendered && JSON.stringify(state) !== JSON.stringify(nextState)) stopAnimation();
      state = nextState; pending = Boolean(options.pending); paint();
      if (fresh) {
        seen.add(motionKey);
        if (options.feedback !== false) animateTransfer(from, cards.get(state.motion.tokenId));
      }
      if (!completed && state.completed && options.feedback !== false && !reduced()) {
        completion.classList.add('sentence-builder__completion--celebrate');
      }
      if (!state.completed) completion.classList.remove('sentence-builder__completion--celebrate');
      controls();
    };
    section.setInteractive = value => { interactive = Boolean(value); if (!interactive) { stopAnimation(); clearDrag(); } controls(); };
    function clearDrag() { drag?.ghost?.remove(); drag = null; }
    function pointerMove(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!drag.ghost && Math.hypot(dx, dy) < 7) return;
      if (!drag.ghost) {
        drag.ghost = el('div', 'drag-card', drag.card.textContent); drag.ghost.setAttribute('aria-hidden', 'true');
        Object.assign(drag.ghost.style, { position: 'fixed', left: `${drag.rect.left}px`, top: `${drag.rect.top}px`, width: `${drag.rect.width}px`, height: `${drag.rect.height}px` });
        doc.body.append(drag.ghost);
      }
      if (event.cancelable) event.preventDefault();
      drag.ghost.style.transform = `translate(${dx}px, ${dy}px) rotate(-4deg)`;
    }
    function pointerUp(event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (!drag.ghost) { clearDrag(); return; }
      const hit = doc.elementFromPoint(event.clientX, event.clientY), tokenId = drag.tokenId;
      fromOverride = drag.ghost.getBoundingClientRect();
      suppressClick = true; clearDrag();
      if (answer.contains(hit)) {
        const remaining = currentRow().placedIds.filter(id => id !== tokenId);
        const target = hit?.closest?.('.sentence-builder__card');
        let index = target ? remaining.indexOf(target.dataset.tokenId) : remaining.length;
        if (index < 0) index = remaining.length;
        else if (target && event.clientX > target.getBoundingClientRect().left + target.getBoundingClientRect().width / 2) index++;
        dispatch({ type: 'move-token', tokenId, toIndex: index });
      } else if (bank.contains(hit) && currentRow().placedIds.includes(tokenId)) dispatch({ type: 'return-token', tokenId });
      else fromOverride = null;
    }
    function pointerCancel() { clearDrag(); fromOverride = null; }
    doc.addEventListener('pointermove', pointerMove, { passive: false });
    doc.addEventListener('pointerup', pointerUp); doc.addEventListener('pointercancel', pointerCancel);
    const visibility = () => { if (doc.hidden) { stopAnimation(); clearDrag(); controls(); } };
    doc.addEventListener('visibilitychange', visibility);
    hint.addEventListener('click', () => dispatch({ type: 'request-hint' }));
    check.addEventListener('click', () => dispatch({ type: 'check-sentence' }));
    next.addEventListener('click', () => dispatch({ type: 'next-sentence' }));
    const dirty = () => settings.onDirtyChange?.(JSON.stringify(draft) !== originalDraft, task.id);
    function editorField(labelText, value, onChange, multiline = false) {
      const label = el('label', 'editor-label', labelText), input = el(multiline ? 'textarea' : 'input', 'input');
      input.value = value; if (multiline) input.rows = 3; else input.type = 'text';
      input.addEventListener('input', () => { onChange(input.value); dirty(); });
      label.append(input); editor.append(label); return input;
    }
    function buildEditor() {
      editor.replaceChildren();
      editor.append(el('h3', 'editor-title', 'Настроить игру'));
      editorField('Заголовок', draft.title, value => { draft.title = value; });
      editorField('Инструкция', draft.instruction, value => { draft.instruction = value; });
      editorField('Поздравление', draft.completionText, value => { draft.completionText = value; });
      const hintLabel = el('label', 'editor-label', 'Разрешить подсказки'), checkbox = el('input', 'checkbox');
      checkbox.type = 'checkbox'; checkbox.checked = draft.hintsEnabled;
      checkbox.addEventListener('change', () => { draft.hintsEnabled = checkbox.checked; dirty(); }); hintLabel.append(checkbox); editor.append(hintLabel);
      editor.append(el('p', 'editor-help', 'Первая строка — правильное предложение. Следующие строки — допустимые варианты из тех же карточек. Объединяйте слова в карточку скобками: The cat is lying [on the mat]. От 2 до 18 карточек в предложении.'));
      draft.rows.forEach((row, i) => {
        editorField(`Предложение ${i + 1} и варианты ответа`, row.text, value => { row.text = value; }, true);
        const remove = el('button', 'remove', `Удалить предложение ${i + 1}`); remove.disabled = draft.rows.length === 1;
        remove.addEventListener('click', () => { draft.rows.splice(i, 1); dirty(); buildEditor(); }); editor.append(remove);
      });
      const add = el('button', 'add', '+ Предложение'); add.disabled = draft.rows.length >= 12;
      add.addEventListener('click', () => { draft.rows.push({ id: `sentence-${root.crypto.randomUUID()}`, text: '' }); dirty(); buildEditor(); }); editor.append(add);
      let bulk = '';
      editorField('Быстро добавить несколько предложений — по одному на строке', '', value => { bulk = value; }, true);
      const importButton = el('button', 'add', 'Добавить строки');
      importButton.addEventListener('click', () => {
        const lines = bulk.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (lines.length + draft.rows.length > 12) { error.textContent = 'Можно добавить до 12 предложений.'; return; }
        draft.rows.push(...lines.map(text => ({ id: `sentence-${root.crypto.randomUUID()}`, text })));
        dirty(); buildEditor();
      }); editor.append(importButton);
    }
    function finishEditing() {
      editing = false; editor.hidden = true; screen.hidden = false; cancel.hidden = true;
      edit.textContent = '✎ Редактировать'; error.textContent = ''; settings.onDirtyChange?.(false, task.id); paint();
    }
    async function save() {
      try {
        const candidate = model.normalizeSentenceBuilder({ type: 'sentenceBuilder', id: task.id, title: draft.title,
          instruction: draft.instruction, completionText: draft.completionText, hintsEnabled: draft.hintsEnabled,
          items: draft.rows.map(row => model.itemFromText(row.text, row.id)) });
        saving = true; edit.disabled = true; cancel.disabled = true;
        editor.querySelectorAll('input').forEach(input => { input.disabled = true; });
        editor.querySelectorAll('textarea').forEach(input => { input.disabled = true; });
        editor.querySelectorAll('button').forEach(button => { button.disabled = true; });
        const { type, id, ...changes } = candidate;
        author = model.normalizeSentenceBuilder(await settings.onSave(changes, task.id) || candidate);
        layout = exercises.createLayout(author); task = model.presentation(author, layout); state = {}; rendered = ''; seen.clear();
        finishEditing();
      } catch (cause) { error.textContent = cause.message; settings.onError?.(cause.message); if (editing) buildEditor(); }
      finally { saving = false; edit.disabled = false; cancel.disabled = false; }
    }
    edit.addEventListener('click', () => {
      if (saving) return;
      if (editing) return save();
      stopAnimation(); clearDrag(); editing = true; screen.hidden = true; editor.hidden = false; cancel.hidden = false;
      edit.textContent = '✓ Сохранить';
      draft = { title: author.title, instruction: author.instruction, completionText: author.completionText,
        hintsEnabled: author.hintsEnabled, rows: author.items.map(item => ({ id: item.id, text: model.itemToText(item) })) };
      originalDraft = JSON.stringify(draft); buildEditor();
    });
    cancel.addEventListener('click', () => { if (!saving) finishEditing(); });
    section.addEventListener('keydown', event => {
      if (event.key === 'Escape') { clearDrag(); if (editing && !saving) finishEditing(); }
    });
    section.dispose = () => {
      disposed = true; stopAnimation(); clearDrag();
      doc.removeEventListener('pointermove', pointerMove); doc.removeEventListener('pointerup', pointerUp);
      doc.removeEventListener('pointercancel', pointerCancel); doc.removeEventListener('visibilitychange', visibility);
    };
    paint(); return section;
  }
  const api = { renderSentenceBuilder, normalizeSentenceBuilder: model.normalizeSentenceBuilder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SentenceBuilderComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
