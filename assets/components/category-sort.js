(function initCategorySort(root) {
  'use strict';
  const model = root.ExerciseState || (typeof require === 'function' ? require('./exercise-state.js') : null);
  const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const SVG = 'http://www.w3.org/2000/svg';
  function plain(value, max) {
    if (typeof value !== 'string' || !value.trim() || value.length > max || /<[^>]*>/.test(value)) {
      throw new Error(`Category Sort requires plain text (1–${max} characters).`);
    }
    return value.trim().replace(/\s+/g, ' ');
  }
  function keys(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('Unsupported Category Sort fields.');
  }
  function unique(values, message) {
    const seen = new Set(values.map(value => value.toLowerCase()));
    if (seen.size !== values.length) throw new Error(message);
  }
  function normalizeCategorySort(data) {
    keys(data, ['type', 'id', 'title', 'instruction', 'categories', 'items']);
    if (data.type !== 'categorySort' || typeof data.id !== 'string' || !ID.test(data.id)) throw new Error('Invalid Category Sort id.');
    if (!Array.isArray(data.categories) || data.categories.length < 2 || data.categories.length > 4) throw new Error('Category Sort requires 2–4 groups.');
    if (!Array.isArray(data.items) || data.items.length < 4 || data.items.length > 16) throw new Error('Category Sort requires 4–16 cards.');
    const categories = data.categories.map(category => {
      keys(category, ['id', 'title']);
      if (typeof category.id !== 'string' || !ID.test(category.id)) throw new Error('Invalid Category Sort group id.');
      return { id: category.id, title: plain(category.title, 40) };
    });
    const items = data.items.map(item => {
      keys(item, ['id', 'text', 'categoryId']);
      if (typeof item.id !== 'string' || !ID.test(item.id)) throw new Error('Invalid Category Sort card id.');
      if (!categories.some(category => category.id === item.categoryId)) throw new Error('Every card must belong to a group.');
      return { id: item.id, text: plain(item.text, 80), categoryId: item.categoryId };
    });
    unique(categories.map(category => category.id), 'Group ids must be unique.');
    unique(items.map(item => item.id), 'Card ids must be unique.');
    unique(categories.map(category => category.title), 'Group names must be distinct.');
    unique(items.map(item => item.text), 'Card texts must be distinct.');
    if (categories.some(category => !items.some(item => item.categoryId === category.id))) throw new Error('Every group needs at least one card.');
    return { type: data.type, id: data.id, title: plain(data.title, 1000), instruction: plain(data.instruction, 1000), categories, items };
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
    const author = settings.presentation ? null : normalizeCategorySort(data);
    const current = settings.presentation || model.presentation(author, model.createLayout(author));
    let state = settings.exerciseState || {}, interactive = settings.interactive !== false;
    let openId = null, drag = null, handoff = null, ownAttemptId = null, suppressClick = false, disposed = false;
    let wrongTimer = null, wrongNodes = [];
    const chips = new Map(), groups = new Map(), flights = new Map(), seen = new Set();
    const total = current.items.length;
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
    section.dataset.componentId = current.id; section.setAttribute('aria-label', current.title);
    if (current.items.every(item => item.text.length <= 14)) section.classList.add('category-sort--short');
    const heading = el('div', 'heading'), progress = el('span', 'progress');
    progress.setAttribute('aria-hidden', 'true');
    heading.append(el('h2', 'title', current.title), progress);
    const pool = el('div', 'pool'); pool.setAttribute('role', 'group'); pool.setAttribute('aria-label', 'Cards to sort');
    const banner = el('div', 'done'); banner.tabIndex = -1;
    const bannerIcon = el('span', 'done-icon'), bannerText = el('span');
    bannerIcon.append(svg(CHECK, { viewBox: '0 0 24 24' }));
    bannerText.append(el('strong', 'done-title', 'All sorted!'), el('span', 'done-detail', `${total} of ${total} cards are in the right group.`));
    banner.append(bannerIcon, bannerText);
    const groupRow = el('div', 'groups'), hint = el('p', 'hint', 'Tap a basket to see what’s inside');
    const peek = el('div', 'peek'), peekTitle = el('span', 'peek-title'), peekCount = el('span', 'peek-count');
    const peekHead = el('p', 'peek-head'), peekWords = el('ul', 'words'), peekEmpty = el('p', 'peek-empty', 'Empty for now');
    peek.setAttribute('role', 'group'); peekHead.append(peekTitle, peekCount); peek.append(peekHead, peekWords, peekEmpty);
    const status = el('p', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    section.append(heading, el('p', 'instruction', current.instruction), pool, banner, groupRow, hint, peek, status);
    const resize = root.ResizeObserver ? new root.ResizeObserver(() => { if (openId) placePeek(); }) : null;

    // A card in flight is not in its basket yet: it lands when the flight ends.
    const settled = () => (state.placed || []).filter(id => !flights.get(id)?.correct);
    function paint() {
      const placed = settled(), done = placed.length === total;
      const inside = categoryId => placed.filter(id => current.answerKey[id] === categoryId);
      section.classList.toggle('category-sort--done', done);
      progress.textContent = `${placed.length} / ${total}`;
      banner.hidden = !done; pool.hidden = done;
      hint.classList.toggle('category-sort__hint--off', !placed.length || done);
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
        basket.setAttribute('aria-expanded', String(openId === category.id));
        basket.setAttribute('aria-label', `${category.title}, ${words(ids.length)}`);
        const count = basket.querySelector('.category-sort__count');
        count.hidden = !ids.length; count.textContent = String(ids.length);
        const contents = group.querySelector('.category-sort__contents');
        contents.hidden = !done;
        contents.replaceChildren(...(done ? ids.map(id => el('li', 'word', textOf(id))) : []));
      });
      const open = !done && current.categories.find(category => category.id === openId);
      peek.hidden = !open;
      if (open) {
        const ids = inside(open.id);
        peek.setAttribute('aria-label', `${open.title}: what’s inside`);
        peekTitle.textContent = open.title; peekCount.textContent = ids.length ? words(ids.length) : '';
        peekEmpty.hidden = ids.length > 0;
        peekWords.replaceChildren(...ids.map(id => el('li', 'word', textOf(id))));
        placePeek();
      }
      const attempt = state.attempt;
      status.textContent = state.selectedId ? `Selected: ${textOf(state.selectedId)}. Now choose a basket.`
        : !attempt ? '' : !attempt.correct ? `Not “${current.categories.find(category => category.id === attempt.targetId)?.title}”. Try again.`
          : (state.placed || []).length === total ? 'All cards are sorted.' : `Correct. ${(state.placed || []).length} of ${total}.`;
    }
    // Keeps the panel inside the exercise: clamped to its edges, with the tail over the basket.
    function placePeek() {
      const box = section.getBoundingClientRect();
      const target = groups.get(openId).querySelector('.category-sort__basket').getBoundingClientRect();
      const inset = 10, width = Math.min(260, box.width - inset * 2);
      peek.style.width = `${width}px`;
      const middle = target.left + target.width / 2 - box.left;
      const left = Math.min(Math.max(middle - width / 2, inset), box.width - width - inset);
      peek.style.left = `${left - (section.clientLeft || 0)}px`;
      peek.style.setProperty('--tail', `${Math.min(Math.max(middle - left, 16), width - 16)}px`);
      const above = target.top - box.top - (peek.offsetHeight || 0) - 10, below = above < inset;
      peek.classList.toggle('category-sort__peek--below', below);
      peek.style.top = `${(below ? target.bottom - box.top + 10 : above) - (section.clientTop || 0)}px`;
    }
    function closeOutside(event) {
      const target = event.target;
      if (!peek.contains(target) && ![...groups.values()].some(group => group.contains(target))) setOpen(null);
    }
    function setOpen(id) {
      if (id === openId) return;
      if (!openId) { doc.addEventListener('click', closeOutside); resize?.observe(section); }
      if (!id) { doc.removeEventListener('click', closeOutside); resize?.disconnect(); }
      openId = id; paint();
    }
    function dispatch(action) {
      if (!interactive || disposed) return;
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
      if (categoryId) replay(groups.get(categoryId), 'category-sort__group--landed');
      paint();
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
        setOpen(null);
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
    current.items.forEach(item => {
      const chip = el('button', 'chip', item.text);
      chip.dataset.itemId = item.id;
      chip.addEventListener('click', () => {
        if (suppressClick || chip.disabled) return;
        setOpen(null);
        dispatch({ type: 'select-word', itemId: state.selectedId === item.id ? null : item.id });
      });
      chip.addEventListener('pointerdown', event => {
        if (!interactive || drag || flights.has(item.id) || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const rect = chip.getBoundingClientRect();
        drag = { itemId: item.id, chip, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
          offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, ghost: null, overId: null };
        doc.addEventListener('pointermove', moveDrag);
        doc.addEventListener('pointerup', endDrag);
        doc.addEventListener('pointercancel', endDrag);
      });
      chips.set(item.id, chip); pool.append(chip);
    });
    current.categories.forEach(category => {
      const group = el('div', 'group'), basket = el('button', 'basket'), label = el('span', 'label');
      const length = [...category.title].length;
      group.dataset.categoryId = category.id;
      label.classList.toggle('category-sort__label--medium', length > 5 && length <= 10);
      label.classList.toggle('category-sort__label--long', length > 10);
      label.append(el('span', null, category.title));
      // Long names are clamped to two lines with an ellipsis.
      if (length > 18) basket.title = category.title;
      const count = el('span', 'count'), mark = el('span', 'mark', '×');
      count.setAttribute('aria-hidden', 'true'); mark.setAttribute('aria-hidden', 'true');
      basket.append(svg(BASKET, { viewBox: '0 0 160 120' }), label, count, mark);
      basket.addEventListener('click', () => {
        if (interactive && state.selectedId) {
          setOpen(null);
          dispatch({ type: 'match-word', itemId: state.selectedId, targetId: category.id });
        } else setOpen(openId === category.id ? null : category.id);
      });
      const contents = el('ul', 'words'); contents.classList.add('category-sort__contents');
      group.append(basket, contents);
      groups.set(category.id, group); groupRow.append(group);
    });
    section.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      if (openId) setOpen(null);
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
    section.dispose = () => {
      disposed = true; setOpen(null); clearWrong();
      if (drag) stopDrag().ghost?.remove();
      flights.forEach(flight => { flight.animation?.cancel(); flight.ghost.remove(); }); flights.clear();
    };
    if (state.attempt) seen.add(state.attempt.id || `sequence:${state.attempt.sequence}`);
    paint();
    return section;
  }
  const api = { normalizeCategorySort, renderCategorySort };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CategorySortComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
