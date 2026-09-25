(function initSentenceMatching(root) {
  'use strict';
  const model = root.ExerciseState || (typeof require === 'function' ? require('./exercise-state.js') : null);
  const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  function plain(value) {
    if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /<[^>]*>/.test(value)) {
      throw new Error('Sentence Matching requires plain text (1–1000 characters).');
    }
    return value.trim().replace(/\s+/g, ' ');
  }
  function keys(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported Sentence Matching fields.');
  }
  function normalizeSentenceMatching(data) {
    keys(data, ['type', 'id', 'title', 'instruction', 'items']);
    if (data.type !== 'sentenceMatching' || typeof data.id !== 'string' || !ID.test(data.id)) throw new Error('Invalid Sentence Matching id.');
    if (!Array.isArray(data.items) || data.items.length < 2 || data.items.length > 12) throw new Error('Sentence Matching requires 2–12 pairs.');
    const ids = new Set(), lefts = new Set(), rights = new Set();
    const items = data.items.map(item => {
      keys(item, ['id', 'left', 'right']);
      if (typeof item.id !== 'string' || !ID.test(item.id) || ids.has(item.id)) throw new Error('Pair ids must be unique.');
      const left = plain(item.left), right = plain(item.right);
      if (lefts.has(left.toLowerCase()) || rights.has(right.toLowerCase())) throw new Error('Sentence halves must be distinct.');
      ids.add(item.id); lefts.add(left.toLowerCase()); rights.add(right.toLowerCase());
      return { id: item.id, left, right };
    });
    return { type: data.type, id: data.id, title: plain(data.title), instruction: plain(data.instruction), items };
  }
  function renderSentenceMatching(data, options, documentRef) {
    let settings = options || {}, doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') { doc = options; settings = {}; }
    let author = settings.presentation ? null : normalizeSentenceMatching(data);
    let layout = author ? model.createLayout(author) : null;
    let current = settings.presentation || model.presentation(author, layout);
    let state = settings.exerciseState || {}, interactive = settings.interactive !== false;
    let editing = false, saving = false, draft, initialDraft;
    let leftCards = new Map(), rightCards = new Map(), order = [];
    const animations = new Set(), seen = new Set();
    let feedbackTimer = null, wrongFeedback = false, disposed = false;
    const el = (tag, name, text) => {
      const node = doc.createElement(tag); node.className = `sentence-matching__${name}`;
      if (text != null) node.textContent = text;
      if (tag === 'button') node.type = 'button';
      return node;
    };
    const section = doc.createElement('section'); section.className = 'sentence-matching';
    section.dataset.componentId = current.id;
    const header = el('div', 'header'), title = el('h2', 'title');
    const instruction = el('p', 'instruction'), grid = el('div', 'grid');
    const status = el('p', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const edit = el('button', 'edit', '✎'), cancel = el('button', 'cancel', 'Отмена');
    edit.setAttribute('aria-label', 'Редактировать пары'); cancel.hidden = true;
    const editor = el('div', 'editor'); editor.hidden = true;
    header.append(title);
    if (author && settings.onSave) header.append(cancel, edit);
    section.append(header, instruction, grid, status, editor);
    const dirty = value => settings.onDirtyChange?.(value, current.id);
    function clearFeedback() {
      root.clearTimeout(feedbackTimer); wrongFeedback = false;
      rightCards.forEach(card => card.classList.remove('sentence-matching__card--wrong'));
    }
    function stopAnimations() { animations.forEach(animation => animation.cancel()); animations.clear(); }
    function arrange(nextOrder, animate) {
      if (nextOrder.join('|') === order.join('|')) return;
      const cards = [...leftCards.values(), ...rightCards.values()];
      // Measure the visible position before cancelling an interrupted animation.
      const before = new Map(cards.map(card => [card, card.getBoundingClientRect()]));
      const focused = doc.activeElement;
      stopAnimations();
      nextOrder.forEach((id, i) => {
        grid.insertBefore(leftCards.get(current.items[i].id), null);
        grid.insertBefore(rightCards.get(id), null);
      });
      order = [...nextOrder];
      if (focused && grid.contains(focused) && doc.activeElement !== focused) focused.focus?.({ preventScroll: true });
      if (!animate || root.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      cards.forEach(card => {
        const from = before.get(card), to = card.getBoundingClientRect();
        const dx = from.left - to.left, dy = from.top - to.top;
        if ((!dx && !dy) || !card.animate) return;
        const animation = card.animate([
          { transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' },
        ], { duration: 480, easing: 'cubic-bezier(0.2, 0, 0, 1)' });
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      });
    }
    function paint(animate = true) {
      const matches = state.matches || {}, locked = new Set(Object.values(matches));
      const hint = settings.viewerRole === 'teacher' ? current.answerKey[state.selectedId] : null;
      leftCards.forEach((card, id) => {
        const correct = Boolean(matches[id]);
        card.disabled = !interactive || correct || editing;
        card.classList.toggle('sentence-matching__card--selected', state.selectedId === id && !correct);
        card.classList.toggle('sentence-matching__card--correct', correct);
        card.setAttribute('aria-pressed', String(state.selectedId === id && !correct));
        card.querySelector('.sentence-matching__check').hidden = !correct;
      });
      rightCards.forEach((card, id) => {
        const correct = locked.has(id);
        card.disabled = !interactive || correct || !state.selectedId || editing;
        card.classList.toggle('sentence-matching__card--hint', hint === id && !correct);
        card.classList.toggle('sentence-matching__card--correct', correct);
        card.querySelector('.sentence-matching__check').hidden = !correct;
      });
      arrange(state.rightOrder || current.targets.map(item => item.id), animate);
      const count = Object.keys(matches).length;
      status.textContent = wrongFeedback ? 'Try another ending.' : count === current.items.length ? 'All pairs matched.' : `${count} of ${current.items.length} pairs matched.`;
    }
    function dispatch(action) {
      if (!interactive || editing || disposed) return;
      const full = { ...action, componentId: current.id };
      section.updateState(model.apply(current, state, full));
      settings.onAction?.(full);
    }
    function card(item, index, side) {
      const node = el('button', `card sentence-matching__card--${side}`);
      node.dataset.itemId = item.id;
      const label = el('span', 'label', side === 'left' ? `${index + 1}.` : `${item.label}.`);
      const text = el('span', 'text', item.text), check = el('span', 'check', '✓');
      check.hidden = true;
      node.append(label, text, check);
      node.addEventListener('click', () => {
        if (node.disabled) return;
        if (side === 'left') dispatch({ type: 'select-word', itemId: state.selectedId === item.id ? null : item.id });
        else if (state.selectedId) dispatch({ type: 'match-word', itemId: state.selectedId, targetId: item.id, attemptId: root.crypto.randomUUID() });
      });
      return node;
    }
    function build() {
      stopAnimations(); clearFeedback(); grid.replaceChildren(); order = [];
      title.textContent = current.title; instruction.textContent = current.instruction;
      section.setAttribute('aria-label', current.title);
      leftCards = new Map(current.items.map((item, i) => [item.id, card(item, i, 'left')]));
      rightCards = new Map(current.targets.map((item, i) => [item.id, card(item, i, 'right')]));
      paint(false);
    }
    section.updateState = (next = {}, options = {}) => {
      if (disposed) return;
      const attempt = next.attempt, key = attempt && (attempt.id || attempt.sequence);
      const previousKey = state.attempt && (state.attempt.id || state.attempt.sequence);
      if (options.feedback === false || key !== previousKey || next.selectedId !== state.selectedId) clearFeedback();
      state = next; paint(options.feedback !== false);
      if (key && !seen.has(key)) {
        seen.add(key);
        if (!attempt.correct && options.feedback !== false) {
          const target = rightCards.get(attempt.targetId);
          target?.classList.add('sentence-matching__card--wrong');
          wrongFeedback = true; status.textContent = 'Try another ending.';
          feedbackTimer = root.setTimeout(() => { clearFeedback(); paint(false); }, 650);
        }
      }
    };
    section.setInteractive = value => { interactive = Boolean(value); paint(false); };
    section.dispose = () => { disposed = true; clearFeedback(); stopAnimations(); };
    function field(labelText, value, change) {
      const label = el('label', 'editor-label', labelText), input = el('input', 'editor-input');
      input.type = 'text'; input.value = value;
      input.addEventListener('input', () => { change(input.value); dirty(JSON.stringify(draft) !== initialDraft); });
      label.append(input); editor.append(label);
    }
    function finishEditing() {
      editing = false; editor.hidden = true; editor.replaceChildren(); grid.hidden = false;
      status.hidden = false; cancel.hidden = true; edit.textContent = '✎';
      edit.setAttribute('aria-label', 'Редактировать пары'); dirty(false); paint(false);
    }
    function enterEditing() {
      editing = true; clearFeedback(); stopAnimations(); grid.hidden = true; status.hidden = true; editor.hidden = false;
      cancel.hidden = false; edit.textContent = '✓'; edit.setAttribute('aria-label', 'Сохранить пары');
      draft = { title: author.title, instruction: author.instruction, items: author.items.map(item => ({ ...item })) };
      initialDraft = JSON.stringify(draft);
      field('Заголовок', draft.title, value => { draft.title = value; });
      field('Инструкция', draft.instruction, value => { draft.instruction = value; });
      draft.items.forEach((item, i) => {
        field(`${i + 1}. Начало`, item.left, value => { item.left = value; });
        field(`${i + 1}. Правильное окончание`, item.right, value => { item.right = value; });
      });
    }
    function lock(value) {
      saving = value; edit.disabled = value; cancel.disabled = value;
      editor.querySelectorAll('input').forEach(input => { input.disabled = value; });
    }
    async function save() {
      try {
        const candidate = normalizeSentenceMatching({ ...author, ...draft });
        lock(true);
        const result = await settings.onSave(draft, current.id);
        author = normalizeSentenceMatching(result || candidate);
        current = model.presentation(author, layout); state = {}; seen.clear();
        lock(false); build(); finishEditing();
      } catch (error) { lock(false); settings.onError?.(error.message); }
    }
    edit.addEventListener('click', () => { if (!saving) return editing ? save() : enterEditing(); });
    cancel.addEventListener('click', () => { if (!saving) finishEditing(); });
    section.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || saving) return;
      if (editing) { event.preventDefault(); finishEditing(); }
      else if (state.selectedId && interactive) dispatch({ type: 'select-word', itemId: null });
    });
    build();
    if (state.attempt) seen.add(state.attempt.id || state.attempt.sequence);
    return section;
  }
  const api = { normalizeSentenceMatching, renderSentenceMatching };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SentenceMatchingComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
