(function initCategorySort(root) {
  'use strict';
  const model = root.ExerciseState || (typeof require === 'function' ? require('./exercise-state.js') : null);
  const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const SVG = 'http://www.w3.org/2000/svg';
  const MAX_GROUPS = 4, MAX_CARDS = 16, MIN_CARDS = 4, MAX_TITLE = 40, MAX_CARD = 80;
  // The messages are for the teacher: the draft editor and the template controls show them as they are.
  function fail(message) { throw new Error(message); }
  function plain(value, max, label) {
    if (typeof value !== 'string' || !value.trim()) fail(`${label}: нужен текст.`);
    if (/<[^>]*>/.test(value)) fail(`${label}: уберите HTML-разметку.`);
    if (value.length > max) fail(`${label}: не больше ${max} символов.`);
    return value.trim().replace(/\s+/g, ' ');
  }
  function keys(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) fail('Неподдерживаемые поля в задании «Разложи по группам».');
  }
  function unique(values, what) {
    const seen = new Set();
    for (const value of values) {
      if (seen.has(value.toLowerCase())) fail(`Повторяется ${what}: «${value}».`);
      seen.add(value.toLowerCase());
    }
  }
  const validId = value => typeof value === 'string' && ID.test(value);
  function normalizeCategorySort(data) {
    keys(data, ['type', 'id', 'title', 'instruction', 'categories', 'items']);
    if (data.type !== 'categorySort' || !validId(data.id)) fail('Некорректный id задания.');
    if (!Array.isArray(data.categories) || data.categories.length < 2 || data.categories.length > MAX_GROUPS) fail(`Нужно от 2 до ${MAX_GROUPS} групп.`);
    if (!Array.isArray(data.items) || data.items.length < MIN_CARDS || data.items.length > MAX_CARDS) fail(`Нужно от ${MIN_CARDS} до ${MAX_CARDS} карточек.`);
    const categories = data.categories.map((category, index) => {
      keys(category, ['id', 'title']);
      if (!validId(category.id)) fail('Некорректный id группы.');
      return { id: category.id, title: plain(category.title, MAX_TITLE, `Название группы ${index + 1}`) };
    });
    unique(categories.map(category => category.id), 'id группы');
    const items = data.items.map(item => {
      keys(item, ['id', 'text', 'categoryId']);
      if (!validId(item.id)) fail('Некорректный id карточки.');
      const category = categories.find(candidate => candidate.id === item.categoryId);
      if (!category) fail('Карточка не относится ни к одной группе.');
      return { id: item.id, text: plain(item.text, MAX_CARD, `Карточка в группе «${category.title}»`), categoryId: item.categoryId };
    });
    unique(items.map(item => item.id), 'id карточки');
    unique(categories.map(category => category.title), 'название группы');
    unique(items.map(item => item.text), 'карточка');
    const empty = categories.find(category => !items.some(item => item.categoryId === category.id));
    if (empty) fail(`В группе «${empty.title}» нет карточек.`);
    return { type: data.type, id: data.id, title: plain(data.title, 1000, 'Заголовок'), instruction: plain(data.instruction, 1000, 'Инструкция'), categories, items };
  }
  // One basket drawing for every group; CSS paints it through custom properties on the group.
  const leaf = (min, rect, line, turn) => ['g', { class: 'category-sort__leaf', 'data-min': min }, [
    ['rect', { ...rect, rx: 3, transform: turn }], ['path', { d: line, transform: turn }]]];
  const BASKET = [
    ['ellipse', { class: 'category-sort__basket-shadow', cx: 80, cy: 113, rx: 54, ry: 5 }],
    ['path', { class: 'category-sort__basket-handle', d: 'M32 47 C32 4 128 4 128 47' }],
    // The sheets peek over the rim when something is inside: 1, 2, then 3 and more.
    leaf(2, { x: 50, y: 27, width: 28, height: 30 }, 'M56 33.5h14', 'rotate(-11 64 42)'),
    leaf(3, { x: 83, y: 26, width: 28, height: 30 }, 'M89 32.5h14', 'rotate(9 97 41)'),
    leaf(1, { x: 66, y: 21, width: 28, height: 34 }, 'M72 27.5h16M72 32.5h10', 'rotate(-2 80 38)'),
    ['path', { class: 'category-sort__basket-body', d: 'M18 49 H142 L131 99 Q129 108 120 108 H40 Q31 108 29 99 Z' }],
    ['path', { class: 'category-sort__basket-weave', d: 'M23 64H137M26.5 80H133.5M29.5 94H130.5M47 55L54.5 103M68 55L72 103M92 55L88 103M113 55L105.5 103' }],
    ['rect', { class: 'category-sort__basket-plaque', x: 34, y: 60, width: 92, height: 34, rx: 9 }],
    ['rect', { class: 'category-sort__basket-rim', x: 12, y: 40, width: 136, height: 15, rx: 7.5 }],
    ['rect', { class: 'category-sort__basket-shine', x: 22, y: 43.5, width: 116, height: 3, rx: 1.5 }],
  ];
  const CHECK = [['path', { d: 'M5 12.5l4.5 4.5L19 7.5' }]];
  const words = count => `${count} ${count === 1 ? 'word' : 'words'}`;
  const reducedMotion = () => Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  function renderCategorySort(data, options, documentRef) {
    let settings = options || {}, doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') { doc = options; settings = {}; }
    let author = settings.presentation ? null : normalizeCategorySort(data);
    let current = settings.presentation || model.presentation(author, model.createLayout(author));
    let state = settings.exerciseState || {}, interactive = settings.interactive !== false;
    let drag = null, handoff = null, ownAttemptId = null, suppressClick = false, disposed = false;
    let wrongTimer = null, wrongNodes = [], total = 0;
    let editing = false, saving = false, draft, initialDraft;
    const chips = new Map(), groups = new Map(), flights = new Map(), seen = new Set();
    const textOf = id => current.items.find(item => item.id === id).text;
    const el = (tag, name, text) => {
      const node = doc.createElement(tag); if (name) node.className = `category-sort__${name}`;
      if (text != null) node.textContent = text;
      if (tag === 'button') node.type = 'button';
      return node;
    };
    const svg = (shapes, attributes) => {
      const build = ([tag, attrs, children = []]) => {
        const node = doc.createElementNS(SVG, tag);
        Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
        node.append(...children.map(build));
        return node;
      };
      return build(['svg', { ...attributes, 'aria-hidden': 'true', focusable: 'false' }, shapes]);
    };
    const section = el('section'); section.className = 'category-sort';
    section.dataset.componentId = current.id;
    const heading = el('div', 'heading'), title = el('h2', 'title'), progress = el('span', 'progress');
    const instruction = el('p', 'instruction');
    progress.setAttribute('aria-hidden', 'true');
    heading.append(title, progress);
    const pool = el('div', 'pool'); pool.setAttribute('role', 'group'); pool.setAttribute('aria-label', 'Cards to sort');
    const banner = el('div', 'done'); banner.tabIndex = -1;
    const bannerIcon = el('span', 'done-icon'), bannerText = el('span'), bannerDetail = el('span', 'done-detail');
    bannerIcon.append(svg(CHECK, { viewBox: '0 0 24 24' }));
    bannerText.append(el('strong', 'done-title', 'All sorted!'), bannerDetail);
    banner.append(bannerIcon, bannerText);
    const groupRow = el('div', 'groups');
    const status = el('p', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    // The draft editor swaps the exercise for a form; in a class there is no onSave and no form.
    const board = el('div', 'board');
    board.append(pool, banner, groupRow, status);
    const edit = el('button', 'edit', '✎'), cancel = el('button', 'cancel', 'Отмена');
    edit.setAttribute('aria-label', 'Редактировать задание'); cancel.hidden = true;
    const editor = el('div', 'editor'), editorError = el('p', 'editor-error');
    editor.hidden = true; editorError.hidden = true; editorError.setAttribute('role', 'alert');
    if (author && settings.onSave) heading.append(cancel, edit);
    section.append(heading, instruction, editorError, board, editor);

    // A card in flight is not in its basket yet: it lands when the flight ends.
    const settled = () => (state.placed || []).filter(id => !flights.get(id)?.correct);
    function paint() {
      const placed = settled(), done = placed.length === total;
      const inside = categoryId => placed.filter(id => current.answerKey[id] === categoryId);
      section.classList.toggle('category-sort--done', done);
      progress.textContent = `${placed.length} / ${total}`;
      banner.hidden = !done; pool.hidden = done;
      chips.forEach((chip, id) => {
        chip.hidden = placed.includes(id);
        chip.disabled = !interactive || flights.has(id);
        chip.classList.toggle('category-sort__chip--selected', state.selectedId === id);
        chip.classList.toggle('category-sort__chip--dragging', flights.has(id) || drag?.itemId === id && Boolean(drag.ghost));
        chip.setAttribute('aria-pressed', String(state.selectedId === id));
      });
      current.categories.forEach(category => {
        const group = groups.get(category.id), basket = group.querySelector('.category-sort__basket');
        const ids = inside(category.id);
        group.classList.toggle('category-sort__group--ready', Boolean(interactive && state.selectedId && !done));
        group.classList.toggle('category-sort__group--over', drag?.overId === category.id);
        group.querySelectorAll('.category-sort__leaf').forEach(sheet => {
          sheet.classList.toggle('category-sort__leaf--shown', ids.length >= Number(sheet.getAttribute('data-min')));
        });
        basket.disabled = done;
        basket.setAttribute('aria-label', `${category.title}, ${words(ids.length)}`);
        const count = basket.querySelector('.category-sort__count');
        count.hidden = !ids.length; count.textContent = String(ids.length);
        // What is inside, in the order the cards were put in.
        const contents = group.querySelector('.category-sort__contents');
        contents.hidden = !ids.length;
        contents.replaceChildren(...ids.map(id => {
          const word = el('li', 'word', textOf(id)); word.dataset.itemId = id;
          return word;
        }));
      });
      const attempt = state.attempt;
      status.textContent = state.selectedId ? `Selected: ${textOf(state.selectedId)}. Now choose a basket.`
        : !attempt ? '' : !attempt.correct ? `Not “${current.categories.find(category => category.id === attempt.targetId)?.title}”. Try again.`
          : (state.placed || []).length === total ? 'All cards are sorted.' : `Correct. ${(state.placed || []).length} of ${total}.`;
    }
    function dispatch(action) {
      if (!interactive || disposed || editing) return;
      const full = { ...action, componentId: current.id };
      if (full.type === 'match-word') ownAttemptId = full.attemptId = root.crypto.randomUUID();
      section.updateState(model.apply(current, state, full));
      settings.onAction?.(full);
    }
    const replay = (node, name) => { node.classList.remove(name); void node.offsetWidth; node.classList.add(name); };
    function clearWrong() {
      root.clearTimeout(wrongTimer);
      wrongNodes.forEach(([node, name]) => node.classList.remove(name)); wrongNodes = [];
    }
    function showWrong(attempt) {
      clearWrong();
      const group = groups.get(attempt.targetId), chip = chips.get(attempt.itemId);
      replay(group, 'category-sort__group--wrong'); chip.classList.add('category-sort__chip--wrong');
      wrongNodes = [[group, 'category-sort__group--wrong'], [chip, 'category-sort__chip--wrong']];
      wrongTimer = root.setTimeout(clearWrong, 1000);
    }
    function createGhost(chip) {
      const rect = chip.getBoundingClientRect(), look = root.getComputedStyle?.(chip);
      const ghost = doc.createElement('div'); ghost.className = 'category-sort__ghost'; ghost.textContent = chip.textContent;
      Object.assign(ghost.style, { width: `${rect.width}px`, left: `${rect.left}px`, top: `${rect.top}px` },
        // The chip may be sized by a container query that does not reach <body>.
        look ? { minHeight: look.minHeight, padding: look.padding, fontSize: look.fontSize } : {});
      doc.body.append(ghost);
      return ghost;
    }
    const centre = rect => [rect.left + rect.width / 2, rect.top + rect.height / 2];
    // Moves the ghost's centre between two points. `translate` composes with the ghost's own tilt,
    // and the offsets count from where the ghost stood before its first flight.
    function fly(flight, [x, y], [toX, toY], { into = false, duration }, done) {
      const [baseX, baseY] = flight.base;
      const at = (px, py) => `${px - baseX}px ${py - baseY}px`;
      flight.animation = flight.ghost.animate([{ translate: at(x, y) },
        { translate: at(toX, toY), ...(into ? { scale: '.2', opacity: 0 } : {}) }], { duration, easing: 'ease-in-out', fill: 'forwards' });
      flight.animation.onfinish = done;
    }
    function returnHome(ghost, itemId) {
      const flight = { ghost, correct: false, base: centre(ghost.getBoundingClientRect()) };
      flights.set(itemId, flight);
      if (!ghost.animate || reducedMotion()) return land(itemId, flight);
      fly(flight, flight.base, centre(chips.get(itemId).getBoundingClientRect()), { duration: 260 }, () => land(itemId, flight));
    }
    function land(itemId, flight, categoryId) {
      flight.ghost.remove();
      if (flights.get(itemId) === flight) flights.delete(itemId);
      paint();
      if (categoryId) {
        const group = groups.get(categoryId);
        replay(group, 'category-sort__group--landed');
        // The new word slides into the list under the basket it went into.
        group.querySelector(`.category-sort__word[data-item-id="${itemId}"]`)?.animate?.(
          [{ opacity: 0, transform: 'translateY(-6px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
      }
      if (flight.own && settled().length === total) banner.focus?.({ preventScroll: true });
    }
    // Both participants see the same flight: the card goes into the basket, or bounces back to the pool.
    function animateAttempt(attempt) {
      const chip = chips.get(attempt.itemId), basket = groups.get(attempt.targetId)?.querySelector('.category-sort__basket');
      if (!chip || !basket) return;
      const handed = handoff?.itemId === attempt.itemId ? handoff.ghost : null;
      handoff = null;
      const from = chip.getBoundingClientRect(), target = basket.getBoundingClientRect();
      const visible = from.width > 0 && target.width > 0 && !reducedMotion();
      const ghost = handed || (visible ? createGhost(chip) : null);
      if (!ghost?.animate || !visible) {
        ghost?.remove();
        if (attempt.correct) replay(groups.get(attempt.targetId), 'category-sort__group--landed'); else showWrong(attempt);
        return;
      }
      const flight = { ghost, correct: attempt.correct, own: attempt.id === ownAttemptId, base: centre(ghost.getBoundingClientRect()) };
      flights.set(attempt.itemId, flight);
      const mouth = [target.left + target.width / 2, target.top + target.height * 0.36];
      if (attempt.correct) {
        fly(flight, flight.base, mouth, { into: true, duration: 320 }, () => land(attempt.itemId, flight, attempt.targetId));
        return;
      }
      fly(flight, flight.base, mouth, { duration: 260 }, () => {
        showWrong(attempt);
        fly(flight, mouth, centre(chip.getBoundingClientRect()), { duration: 260 }, () => land(attempt.itemId, flight));
      });
    }
    function groupAt(x, y) {
      const group = doc.elementFromPoint(x, y)?.closest?.('.category-sort__group');
      return group && section.contains(group) ? group.dataset.categoryId : null;
    }
    function stopDrag() {
      doc.removeEventListener('pointermove', moveDrag);
      doc.removeEventListener('pointerup', endDrag);
      doc.removeEventListener('pointercancel', endDrag);
      const finished = drag; drag = null;
      return finished;
    }
    function moveDrag(event) {
      if (event.pointerId !== drag.pointerId) return;
      if (!drag.ghost) {
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 7) return;
        drag.ghost = createGhost(drag.chip); suppressClick = true;
        if (state.selectedId !== drag.itemId) dispatch({ type: 'select-word', itemId: drag.itemId });
      }
      event.preventDefault();
      drag.ghost.style.left = `${event.clientX - drag.offsetX}px`;
      drag.ghost.style.top = `${event.clientY - drag.offsetY}px`;
      const overId = groupAt(event.clientX, event.clientY);
      if (overId !== drag.overId) { drag.overId = overId; paint(); }
    }
    function endDrag(event) {
      if (event.pointerId !== drag.pointerId) return;
      const finished = stopDrag();
      root.setTimeout(() => { suppressClick = false; }, 0);
      if (!finished.ghost) return;
      const categoryId = event.type === 'pointerup' && groupAt(event.clientX, event.clientY);
      if (categoryId) {
        handoff = { itemId: finished.itemId, ghost: finished.ghost };
        dispatch({ type: 'match-word', itemId: finished.itemId, targetId: categoryId });
      }
      if (handoff || !categoryId) {
        handoff = null;
        returnHome(finished.ghost, finished.itemId);
        if (state.selectedId === finished.itemId) dispatch({ type: 'select-word', itemId: null });
      }
      paint();
    }
    function chip(item) {
      const node = el('button', 'chip', item.text);
      node.dataset.itemId = item.id;
      node.addEventListener('click', () => {
        if (suppressClick || node.disabled) return;
        dispatch({ type: 'select-word', itemId: state.selectedId === item.id ? null : item.id });
      });
      node.addEventListener('pointerdown', event => {
        if (!interactive || drag || flights.has(item.id) || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const rect = node.getBoundingClientRect();
        drag = { itemId: item.id, chip: node, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
          offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, ghost: null, overId: null };
        doc.addEventListener('pointermove', moveDrag);
        doc.addEventListener('pointerup', endDrag);
        doc.addEventListener('pointercancel', endDrag);
      });
      return node;
    }
    function group(category) {
      const node = el('div', 'group'), basket = el('button', 'basket'), label = el('span', 'label');
      const length = [...category.title].length;
      node.dataset.categoryId = category.id;
      label.classList.toggle('category-sort__label--medium', length > 5 && length <= 10);
      label.classList.toggle('category-sort__label--long', length > 10);
      label.append(el('span', null, category.title));
      // Long names are clamped to two lines with an ellipsis.
      if (length > 18) basket.title = category.title;
      const count = el('span', 'count'), mark = el('span', 'mark', '×');
      count.setAttribute('aria-hidden', 'true'); mark.setAttribute('aria-hidden', 'true');
      basket.append(svg(BASKET, { viewBox: '0 0 160 120' }), label, count, mark);
      basket.addEventListener('click', () => {
        if (interactive && state.selectedId) dispatch({ type: 'match-word', itemId: state.selectedId, targetId: category.id });
      });
      const contents = el('ul', 'contents');
      node.append(basket, contents);
      return node;
    }
    function build() {
      total = current.items.length;
      section.setAttribute('aria-label', current.title);
      section.classList.toggle('category-sort--short', current.items.every(item => item.text.length <= 14));
      title.textContent = current.title; instruction.textContent = current.instruction;
      bannerDetail.textContent = `${total} of ${total} cards are in the right group.`;
      chips.clear(); groups.clear();
      current.items.forEach(item => chips.set(item.id, chip(item)));
      current.categories.forEach(category => groups.set(category.id, group(category)));
      pool.replaceChildren(...chips.values()); groupRow.replaceChildren(...groups.values());
      paint();
    }
    // Cancels whatever is under way: a drag, flights and the wrong-answer mark.
    function stopInteraction() {
      clearWrong();
      if (drag) stopDrag().ghost?.remove();
      flights.forEach(flight => { flight.animation?.cancel(); flight.ghost.remove(); }); flights.clear();
    }

    // Draft editor: one block per group with its name and cards; ids of kept groups and cards stay.
    let fields = new Map();
    const changed = () => settings.onDirtyChange?.(editing && JSON.stringify(draft) !== initialDraft, current.id);
    const freeId = (prefix, taken) => {
      let number = 1;
      while (taken.some(item => item.id === `${prefix}-${number}`)) number += 1;
      return `${prefix}-${number}`;
    };
    function input(value, max, label, change, focusId) {
      const node = el('input', 'editor-input');
      node.type = 'text'; node.value = value; node.maxLength = max; node.disabled = saving;
      node.setAttribute('aria-label', label);
      if (focusId) fields.set(focusId, node);
      node.addEventListener('input', () => { change(node.value); changed(); });
      return node;
    }
    // A structural change repaints the form; `action` may return the id of the field to focus next.
    const focusField = id => fields.get(id)?.focus();
    function button(text, name, label, disabled, action) {
      const node = el('button', name, text);
      node.disabled = saving || disabled;
      if (label) node.setAttribute('aria-label', label);
      node.addEventListener('click', () => {
        const next = action(); changed(); paintEditor();
        if (next) focusField(next);
      });
      return node;
    }
    const groupName = (category, index) => category.title.trim() || `Группа ${index + 1}`;
    function cardRow(item, number, index) {
      const row = el('div', 'editor-row'); row.classList.add('category-sort__editor-card');
      const select = el('select', 'editor-select');
      select.setAttribute('aria-label', 'Группа карточки'); select.disabled = saving;
      draft.categories.forEach((category, position) => {
        const option = el('option', null, groupName(category, position));
        option.value = category.id; option.dataset.categoryId = category.id;
        select.append(option);
      });
      select.value = item.categoryId;
      fields.set(`${item.id}:group`, select);
      select.addEventListener('change', () => { item.categoryId = select.value; changed(); paintEditor(); focusField(`${item.id}:group`); });
      row.append(input(item.text, MAX_CARD, `Карточка ${number} в группе ${index + 1}`, value => { item.text = value; }, item.id), select,
        button('×', 'editor-remove', 'Удалить карточку', draft.items.length <= MIN_CARDS, () => {
          draft.items.splice(draft.items.indexOf(item), 1);
        }));
      return row;
    }
    function groupBlock(category, index) {
      const block = el('div', 'editor-group'), row = el('div', 'editor-row');
      const name = input(category.title, MAX_TITLE, `Название группы ${index + 1}`, value => {
        category.title = value;
        // Keeps the group choices of every card in step with the name being typed.
        editor.querySelectorAll('option').forEach(option => {
          if (option.dataset.categoryId === category.id) option.textContent = groupName(category, index);
        });
      }, category.id);
      name.classList.add('category-sort__editor-name');
      row.append(name, button('×', 'editor-remove', 'Удалить группу с карточками', draft.categories.length <= 2, () => {
        draft.categories.splice(index, 1);
        draft.items = draft.items.filter(item => item.categoryId !== category.id);
      }));
      block.append(el('span', 'editor-caption', `Группа ${index + 1}`), row);
      draft.items.filter(item => item.categoryId === category.id).forEach((item, number) => block.append(cardRow(item, number + 1, index)));
      block.append(button('+ карточка', 'editor-add', null, draft.items.length >= MAX_CARDS, () => {
        const item = { id: freeId('card', draft.items), text: '', categoryId: category.id };
        draft.items.push(item);
        return item.id;
      }));
      return block;
    }
    function paintEditor() {
      if (!editing) return;
      fields = new Map();
      const titleLabel = el('label', 'editor-label', 'Заголовок'), instructionLabel = el('label', 'editor-label', 'Инструкция');
      titleLabel.append(input(draft.title, 1000, 'Заголовок', value => { draft.title = value; }));
      instructionLabel.append(input(draft.instruction, 1000, 'Инструкция', value => { draft.instruction = value; }));
      const blocks = el('div', 'editor-groups');
      blocks.append(...draft.categories.map(groupBlock));
      editor.replaceChildren(titleLabel, instructionLabel, blocks,
        button('+ группа', 'editor-add', null, draft.categories.length >= MAX_GROUPS, () => {
          const category = { id: freeId('group', draft.categories), title: '' };
          draft.categories.push(category);
          if (draft.items.length < MAX_CARDS) draft.items.push({ id: freeId('card', draft.items), text: '', categoryId: category.id });
          return category.id;
        }));
    }
    function showError(message) { editorError.textContent = message; editorError.hidden = !message; }
    function finishEditing() {
      editing = false; editor.hidden = true; editor.replaceChildren(); showError('');
      board.hidden = false; progress.hidden = false; cancel.hidden = true; edit.textContent = '✎';
      edit.setAttribute('aria-label', 'Редактировать задание'); changed(); paint();
    }
    function enterEditing() {
      stopInteraction();
      editing = true; board.hidden = true; progress.hidden = true; editor.hidden = false;
      cancel.hidden = false; edit.textContent = '✓'; edit.setAttribute('aria-label', 'Сохранить задание');
      draft = { title: author.title, instruction: author.instruction,
        categories: author.categories.map(category => ({ ...category })), items: author.items.map(item => ({ ...item })) };
      initialDraft = JSON.stringify(draft);
      paintEditor();
    }
    function lock(value) { saving = value; edit.disabled = value; cancel.disabled = value; paintEditor(); }
    async function save() {
      let candidate;
      try { candidate = normalizeCategorySort({ ...author, ...draft }); } catch (error) { showError(error.message); return; }
      showError(''); lock(true);
      try {
        const { type, id, ...changes } = candidate;
        author = normalizeCategorySort(await settings.onSave(changes, id) || candidate);
        current = model.presentation(author, model.createLayout(author)); state = {}; seen.clear();
        build(); finishEditing(); lock(false);
      } catch (error) { lock(false); showError(error.message || 'Не удалось сохранить задание.'); }
    }
    edit.addEventListener('click', () => { if (!saving) return editing ? save() : enterEditing(); });
    cancel.addEventListener('click', () => { if (!saving) finishEditing(); });

    section.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || saving) return;
      if (editing) { event.preventDefault?.(); finishEditing(); }
      else if (state.selectedId && interactive) dispatch({ type: 'select-word', itemId: null });
    });
    section.updateState = (next = {}, options = {}) => {
      if (disposed) return;
      const attempt = next.attempt, key = attempt && (attempt.id || `sequence:${attempt.sequence}`);
      const fresh = key && !seen.has(key);
      if (key) seen.add(key);
      state = next;
      // The other participant may sort the card that is being dragged here.
      if (drag && (next.placed || []).includes(drag.itemId)) stopDrag().ghost?.remove();
      if (fresh && options.feedback !== false) animateAttempt(attempt);
      paint();
    };
    section.setInteractive = value => {
      interactive = Boolean(value);
      if (!interactive && drag) {
        const finished = stopDrag();
        if (finished.ghost) returnHome(finished.ghost, finished.itemId);
      }
      paint();
    };
    section.dispose = () => { disposed = true; stopInteraction(); };
    if (state.attempt) seen.add(state.attempt.id || `sequence:${state.attempt.sequence}`);
    build();
    return section;
  }
  const api = { normalizeCategorySort, renderCategorySort };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CategorySortComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
