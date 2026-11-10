(function initLineOrder(root) {
  'use strict';
  const model = root.ExerciseState || (typeof require === 'function' ? require('./exercise-state.js') : null);
  const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const SVG = 'http://www.w3.org/2000/svg';
  const MIN_LINES = 3, MAX_LINES = 8, MAX_LINE = 160, MAX_NAME = 24;
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
      || Object.keys(value).some(key => !allowed.includes(key))) fail('Неподдерживаемые поля в задании «Расставь по порядку».');
  }
  function unique(values, what) {
    const seen = new Set();
    for (const value of values) {
      if (seen.has(value.toLowerCase())) fail(`Повторяется ${what}: «${value}».`);
      seen.add(value.toLowerCase());
    }
  }
  const validId = value => typeof value === 'string' && ID.test(value);
  // The lines come in the right order; only a dialogue has speakers.
  function normalizeLineOrder(data) {
    const dialogue = data?.look === 'dialogue', speakerKey = dialogue ? ['speakerId'] : [];
    keys(data, ['type', 'id', 'title', 'instruction', 'look', ...(dialogue ? ['speakers'] : []), 'lines']);
    if (data.type !== 'lineOrder' || !validId(data.id)) fail('Некорректный id задания.');
    if (!dialogue && data.look !== 'story') fail('Вид задания — диалог или история.');
    if (!Array.isArray(data.lines) || data.lines.length < MIN_LINES || data.lines.length > MAX_LINES) fail(`Нужно от ${MIN_LINES} до ${MAX_LINES} строк.`);
    let speakers = null;
    if (dialogue) {
      if (!Array.isArray(data.speakers) || data.speakers.length !== 2) fail('В диалоге должно быть два собеседника.');
      speakers = data.speakers.map((speaker, index) => {
        keys(speaker, ['id', 'name']);
        if (!validId(speaker.id)) fail('Некорректный id собеседника.');
        return { id: speaker.id, name: plain(speaker.name, MAX_NAME, `Имя собеседника ${index + 1}`) };
      });
      unique(speakers.map(speaker => speaker.id), 'id собеседника');
      unique(speakers.map(speaker => speaker.name), 'имя собеседника');
    }
    const lines = data.lines.map((line, index) => {
      keys(line, ['id', 'text', ...speakerKey]);
      if (!validId(line.id)) fail('Некорректный id строки.');
      const text = plain(line.text, MAX_LINE, `Строка ${index + 1}`);
      if (!dialogue) return { id: line.id, text };
      if (!speakers.some(speaker => speaker.id === line.speakerId)) fail(`Строка ${index + 1}: укажите собеседника.`);
      return { id: line.id, text, speakerId: line.speakerId };
    });
    unique(lines.map(line => line.id), 'id строки');
    unique(lines.map(line => line.text), 'строка');
    const silent = speakers?.find(speaker => !lines.some(line => line.speakerId === speaker.id));
    if (silent) fail(`У собеседника «${silent.name}» нет реплик.`);
    return { type: data.type, id: data.id, title: plain(data.title, 1000, 'Заголовок'), instruction: plain(data.instruction, 1000, 'Инструкция'),
      look: data.look, ...(speakers ? { speakers } : {}), lines };
  }
  const ARROWS = { up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6' };
  const same = (a, b) => a.join() === b.join();
  const reducedMotion = () => Boolean(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  function renderLineOrder(data, options, documentRef) {
    let settings = options || {}, doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') { doc = options; settings = {}; }
    let author = settings.presentation ? null : normalizeLineOrder(data);
    let current = settings.presentation || model.presentation(author, model.createLayout(author));
    let state = settings.exerciseState || {}, interactive = settings.interactive !== false;
    let drag = null, ownCheckId = null, disposed = false, total = 0;
    let editing = false, saving = false, draft, initialDraft;
    const rows = new Map(), seen = new Set();
    const orderOf = () => state.order || current.lines.map(line => line.id);
    const lockedOf = () => state.locked || [];
    const el = (tag, name, text) => {
      const node = doc.createElement(tag); if (name) node.className = `line-order__${name}`;
      if (text != null) node.textContent = text;
      if (tag === 'button') node.type = 'button';
      return node;
    };
    const icon = path => {
      const svg = doc.createElementNS(SVG, 'svg'), shape = doc.createElementNS(SVG, 'path');
      svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
      shape.setAttribute('d', path); svg.append(shape);
      return svg;
    };
    const dialogue = current.look === 'dialogue';
    const section = el('section'); section.className = `line-order line-order--${current.look}`;
    section.dataset.componentId = current.id; section.setAttribute('aria-label', current.title);
    const heading = el('div', 'heading'), title = el('h2', 'title'), instruction = el('p', 'instruction');
    heading.append(title);
    // Safari drops the list role of an unstyled list unless it is set explicitly.
    const list = el('ol', 'list'); list.setAttribute('role', 'list'); list.setAttribute('aria-label', dialogue ? 'Dialogue lines' : 'Story events');
    const footer = el('div', 'footer'), note = el('p', 'note'), check = el('button', 'check', 'Check');
    footer.append(note, check);
    const banner = el('div', 'done'); banner.tabIndex = -1;
    const bannerIcon = el('span', 'done-icon'), bannerText = el('span');
    bannerIcon.append(icon('M5 12.5l4.5 4.5L19 7.5'));
    bannerText.append(el('strong', 'done-title', 'Well done!'),
      el('span', 'done-detail', `The whole ${dialogue ? 'dialogue' : 'story'} is in the right order.`));
    banner.append(bannerIcon, bannerText);
    const status = el('p', 'status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    // The draft editor swaps the exercise for a form; in a class there is no onSave and no form.
    const board = el('div', 'board');
    board.append(list, footer, banner, status);
    const edit = el('button', 'edit', '✎'), cancel = el('button', 'cancel', 'Отмена');
    edit.setAttribute('aria-label', 'Редактировать задание'); cancel.hidden = true;
    const editor = el('div', 'editor'), editorError = el('p', 'editor-error');
    editor.hidden = true; editorError.hidden = true; editorError.setAttribute('role', 'alert');
    if (author && settings.onSave) heading.append(cancel, edit);
    section.append(heading, instruction, editorError, board, editor);

    // Puts the rows in `order`; the rows that change place glide there from where they were (FLIP).
    function arrange(order) {
      const nodes = order.map(id => rows.get(id));
      if (nodes.every((node, index) => list.children[index] === node)) return;
      const glide = typeof list.animate === 'function' && !reducedMotion();
      const before = glide ? new Map(nodes.map(node => [node, node.getBoundingClientRect().top])) : null;
      const active = doc.activeElement;
      nodes.forEach((node, index) => { if (list.children[index] !== node) list.insertBefore(node, list.children[index] || null); });
      // Moving a focused node in the DOM blurs it.
      if (active && active !== doc.activeElement && section.contains(active) && !active.disabled) active.focus({ preventScroll: true });
      if (!glide) return;
      nodes.forEach(node => {
        const shift = before.get(node) - node.getBoundingClientRect().top;
        if (node !== drag?.node && Math.abs(shift) > 0.5) {
          node.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2, .7, .3, 1)' });
        }
      });
    }
    function paint() {
      const order = drag?.order || orderOf(), locked = lockedOf(), done = locked.length === total;
      const free = order.filter(id => !locked.includes(id));
      // A move after a check makes its result out of date.
      const missed = Boolean(state.check && !state.check.stale && !done);
      section.classList.toggle('line-order--done', done);
      section.classList.toggle('line-order--static', !interactive);
      footer.hidden = done; banner.hidden = !done;
      check.disabled = !interactive || Boolean(drag);
      note.textContent = missed ? `${state.check.correct} of ${total} in place. Move the other lines and check again.` : '';
      status.textContent = done ? `All ${total} lines are in order.` : note.textContent;
      arrange(order);
      order.forEach((id, index) => {
        const row = rows.get(id), fixed = locked.includes(id), place = free.indexOf(id);
        row.classList.toggle('line-order__row--locked', fixed);
        row.classList.toggle('line-order__row--not-yet', missed && !fixed);
        row.classList.toggle('line-order__row--lifted', drag?.id === id);
        const number = row.querySelector('.line-order__num');
        if (number) number.textContent = String(index + 1);
        const [up, down] = row.querySelectorAll('.line-order__move');
        up.disabled = !interactive || fixed || place === 0;
        down.disabled = !interactive || fixed || place === free.length - 1;
        up.setAttribute('aria-label', `Move line ${index + 1} up`);
        down.setAttribute('aria-label', `Move line ${index + 1} down`);
      });
    }
    function dispatch(action) {
      if (!interactive || disposed || editing) return;
      const full = { ...action, componentId: current.id };
      if (full.type === 'check-order') ownCheckId = full.checkId = root.crypto.randomUUID();
      section.updateState(model.apply(current, state, full));
      settings.onAction?.(full);
    }
    const replay = (node, name) => { node.classList.remove(name); void node.offsetWidth; node.classList.add(name); };
    // Both participants see a new check once: fresh green lines pop, the others give a nudge.
    function showCheck(fresh) {
      rows.forEach((row, id) => {
        if (fresh.includes(id)) replay(row, 'line-order__row--landed');
        else if (row.classList.contains('line-order__row--not-yet')) replay(row, 'line-order__row--nudge');
      });
      if (state.check.id === ownCheckId && lockedOf().length === total) banner.focus?.({ preventScroll: true });
    }
    function step(id, delta, button) {
      const place = orderOf().filter(other => !lockedOf().includes(other)).indexOf(id) + delta;
      dispatch({ type: 'move-line', itemId: id, toIndex: place });
      // At the edge the pressed arrow turns off; the focus goes to the other one.
      if (button.disabled) [...button.parentNode.children].find(other => !other.disabled)?.focus({ preventScroll: true });
      status.textContent = `Moved to position ${orderOf().indexOf(id) + 1} of ${total}.`;
    }

    // Dragging rearranges the rows here only; the shared state gets the one move made on release.
    function startDrag(event, id) {
      if (!interactive || drag || lockedOf().includes(id) || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      const node = rows.get(id), from = orderOf();
      drag = { id, node, pointerId: event.pointerId, clientY: event.clientY, grab: event.clientY - node.getBoundingClientRect().top,
        from, order: from, locked: lockedOf() };
      if (root.requestAnimationFrame) { drag.scroller = scrollParent(); drag.frame = root.requestAnimationFrame(autoScroll); }
      section.classList.add('line-order--dragging');
      doc.addEventListener('pointermove', moveDrag);
      doc.addEventListener('pointerup', endDrag);
      doc.addEventListener('pointercancel', endDrag);
      paint();
    }
    function moveDrag(event) {
      if (event.pointerId !== drag.pointerId) return;
      event.preventDefault();
      drag.clientY = event.clientY;
      follow();
    }
    // Places the held row under the pointer and moves it among the others.
    function follow() {
      const top = drag.clientY - list.getBoundingClientRect().top - drag.grab, middle = top + drag.node.offsetHeight / 2;
      const others = drag.order.filter(id => id !== drag.id);
      const passed = others.filter(id => rows.get(id).offsetTop + rows.get(id).offsetHeight / 2 < middle);
      const toIndex = passed.filter(id => !drag.locked.includes(id)).length;
      const order = model.apply(current, { ...state, order: drag.order }, { type: 'move-line', itemId: drag.id, toIndex }).order;
      if (!same(order, drag.order)) { drag.order = order; paint(); }
      drag.node.style.transform = `translateY(${top - drag.node.offsetTop}px)`;
    }
    // A long list may not fit the screen: a row held near the top or bottom edge scrolls the
    // nearest scrolling ancestor (a stage panel in a class) or the window, faster closer to the edge.
    function scrollParent() {
      for (let node = list.parentElement; node && node !== doc.documentElement; node = node.parentElement) {
        if (/auto|scroll/.test(root.getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight) return node;
      }
      return null;
    }
    function autoScroll() {
      const box = drag.scroller?.getBoundingClientRect(), zone = 56, y = drag.clientY;
      const top = Math.max(box?.top ?? 0, 0), bottom = Math.min(box?.bottom ?? root.innerHeight, root.innerHeight);
      const depth = y < top + zone ? -Math.min(zone, top + zone - y) : y > bottom - zone ? Math.min(zone, y - bottom + zone) : 0;
      if (depth) {
        (drag.scroller || root).scrollBy({ top: Math.round(depth / 4), behavior: 'instant' });
        follow();
      }
      drag.frame = root.requestAnimationFrame(autoScroll);
    }
    // Drops the row where it is drawn; `settle` then glides it into its place.
    function stopDrag() {
      doc.removeEventListener('pointermove', moveDrag);
      doc.removeEventListener('pointerup', endDrag);
      doc.removeEventListener('pointercancel', endDrag);
      const finished = drag; drag = null;
      root.cancelAnimationFrame?.(finished.frame);
      finished.top = finished.node.getBoundingClientRect().top;
      finished.node.style.transform = '';
      section.classList.remove('line-order--dragging');
      return finished;
    }
    function settle({ node, top }) {
      const shift = top - node.getBoundingClientRect().top;
      if (Math.abs(shift) > 0.5 && typeof node.animate === 'function' && !reducedMotion()) {
        node.animate([{ transform: `translateY(${shift}px)` }, { transform: 'none' }], { duration: 180, easing: 'ease-out' });
      }
    }
    function endDrag(event) {
      if (event.pointerId !== drag.pointerId) return;
      const finished = stopDrag();
      if (event.type === 'pointerup' && !same(finished.order, finished.from)) {
        const free = finished.order.filter(id => !finished.locked.includes(id));
        dispatch({ type: 'move-line', itemId: finished.id, toIndex: free.indexOf(finished.id) });
      } else paint();
      settle(finished);
    }
    function row(line) {
      const node = el('li', 'row'), handle = el('span', 'handle'), moves = el('span', 'moves');
      node.dataset.lineId = line.id; handle.setAttribute('aria-hidden', 'true');
      handle.addEventListener('pointerdown', event => startDrag(event, line.id));
      let content;
      if (dialogue) {
        const side = current.speakers.findIndex(speaker => speaker.id === line.speakerId);
        node.classList.add(`line-order__row--${side ? 'right' : 'left'}`);
        content = el('div', 'line');
        content.append(el('span', 'speaker', current.speakers[side].name), el('p', 'bubble', line.text));
      } else {
        content = el('div', 'card');
        const number = el('span', 'num'); number.setAttribute('aria-hidden', 'true');
        content.append(number, el('span', 'text', line.text));
      }
      for (const [direction, delta] of [['up', -1], ['down', 1]]) {
        const button = el('button', 'move'); button.append(icon(ARROWS[direction]));
        button.addEventListener('click', () => { if (!button.disabled) step(line.id, delta, button); });
        moves.append(button);
      }
      node.append(handle, content, moves);
      return node;
    }
    check.addEventListener('click', () => { if (!check.disabled) dispatch({ type: 'check-order' }); });
    function build() {
      total = current.lines.length;
      section.setAttribute('aria-label', current.title);
      title.textContent = current.title; instruction.textContent = current.instruction;
      rows.clear();
      current.lines.forEach(line => rows.set(line.id, row(line)));
      list.replaceChildren(...rows.values());
      paint();
    }

    // Draft editor: the lines in the right order, with their speakers; ids of kept lines stay.
    let fields = new Map();
    const changed = () => settings.onDirtyChange?.(editing && JSON.stringify(draft) !== initialDraft, current.id);
    const freeId = () => {
      let number = 1;
      while (draft.lines.some(line => line.id === `line-${number}`)) number += 1;
      return `line-${number}`;
    };
    function input(tag, value, max, label, change, focusId) {
      const node = el(tag, 'editor-input');
      if (tag === 'input') node.type = 'text'; else node.rows = 2;
      node.value = value; node.maxLength = max; node.disabled = saving;
      node.setAttribute('aria-label', label);
      if (focusId) fields.set(focusId, node);
      node.addEventListener('input', () => { change(node.value); changed(); });
      return node;
    }
    // A structural change repaints the form; `action` may name the fields to focus next, the first enabled one wins.
    const focusField = ids => [ids].flat().map(id => fields.get(id)).find(node => node && !node.disabled)?.focus();
    function button(text, name, label, disabled, action, focusId) {
      const node = el('button', name, text);
      node.disabled = saving || disabled;
      if (label) node.setAttribute('aria-label', label);
      if (focusId) fields.set(focusId, node);
      node.addEventListener('click', () => {
        const next = action(); changed(); paintEditor();
        if (next) focusField(next);
      });
      return node;
    }
    const labelled = (text, field) => { const node = el('label', 'editor-label', text); node.append(field); return node; };
    const speakerName = (speaker, index) => speaker.name.trim() || `Собеседник ${index + 1}`;
    function lineRow(line, index) {
      const lines = draft.lines, node = el('li', 'editor-line'), tools = el('div', 'editor-tools');
      const shift = delta => () => {
        lines.splice(index, 1); lines.splice(index + delta, 0, line);
        return [`${line.id}:${delta < 0 ? 'up' : 'down'}`, `${line.id}:${delta < 0 ? 'down' : 'up'}`];
      };
      if (dialogue) {
        const select = el('select', 'editor-select');
        select.setAttribute('aria-label', `Кто говорит строку ${index + 1}`); select.disabled = saving;
        draft.speakers.forEach((speaker, position) => {
          const option = el('option', null, speakerName(speaker, position));
          option.value = speaker.id; option.dataset.speakerId = speaker.id;
          select.append(option);
        });
        select.value = line.speakerId;
        select.addEventListener('change', () => { line.speakerId = select.value; changed(); });
        tools.append(select);
      }
      tools.append(
        button('↑', 'editor-move', `Поднять строку ${index + 1}`, index === 0, shift(-1), `${line.id}:up`),
        button('↓', 'editor-move', `Опустить строку ${index + 1}`, index === lines.length - 1, shift(1), `${line.id}:down`),
        button('×', 'editor-remove', `Удалить строку ${index + 1}`, lines.length <= MIN_LINES, () => {
          lines.splice(index, 1);
          return lines[Math.min(index, lines.length - 1)].id;
        }));
      node.append(el('span', 'editor-number', String(index + 1)),
        input('textarea', line.text, MAX_LINE, `Строка ${index + 1}`, value => { line.text = value; }, line.id), tools);
      return node;
    }
    function paintEditor() {
      if (!editing) return;
      fields = new Map();
      const parts = [
        labelled('Заголовок', input('input', draft.title, 1000, 'Заголовок', value => { draft.title = value; })),
        labelled('Инструкция', input('input', draft.instruction, 1000, 'Инструкция', value => { draft.instruction = value; })),
      ];
      if (dialogue) {
        const speakers = el('div', 'editor-speakers');
        speakers.append(...draft.speakers.map((speaker, index) => labelled(`Собеседник ${index + 1} — ${index ? 'справа' : 'слева'}`,
          input('input', speaker.name, MAX_NAME, `Собеседник ${index + 1}`, value => {
            speaker.name = value;
            // Keeps the speaker choices of every line in step with the name being typed.
            editor.querySelectorAll('option').forEach(option => {
              if (option.dataset.speakerId === speaker.id) option.textContent = speakerName(speaker, index);
            });
          }))));
        parts.push(speakers);
      }
      const lines = el('ol', 'editor-lines');
      lines.append(...draft.lines.map(lineRow));
      parts.push(el('p', 'editor-caption', 'Строки в правильном порядке — ученик увидит их перемешанными.'), lines,
        button('+ строка', 'editor-add', null, draft.lines.length >= MAX_LINES, () => {
          // A new dialogue line goes to the speaker who did not say the last one.
          const last = draft.lines.at(-1), line = { id: freeId(), text: '' };
          if (dialogue) line.speakerId = draft.speakers.find(speaker => speaker.id !== last.speakerId).id;
          draft.lines.push(line);
          return line.id;
        }));
      editor.replaceChildren(...parts);
    }
    function showError(message) { editorError.textContent = message; editorError.hidden = !message; }
    function finishEditing() {
      editing = false; editor.hidden = true; editor.replaceChildren(); showError('');
      board.hidden = false; cancel.hidden = true; edit.textContent = '✎';
      edit.setAttribute('aria-label', 'Редактировать задание'); changed(); paint();
    }
    function enterEditing() {
      if (drag) stopDrag();
      editing = true; board.hidden = true; editor.hidden = false;
      cancel.hidden = false; edit.textContent = '✓'; edit.setAttribute('aria-label', 'Сохранить задание');
      draft = { title: author.title, instruction: author.instruction,
        ...(dialogue ? { speakers: author.speakers.map(speaker => ({ ...speaker })) } : {}), lines: author.lines.map(line => ({ ...line })) };
      initialDraft = JSON.stringify(draft);
      paintEditor();
    }
    function lock(value) { saving = value; edit.disabled = value; cancel.disabled = value; paintEditor(); }
    async function save() {
      let candidate;
      try { candidate = normalizeLineOrder({ ...author, ...draft }); } catch (error) { showError(error.message); return; }
      showError(''); lock(true);
      try {
        const { type, id, look, ...changes } = candidate;
        author = normalizeLineOrder(await settings.onSave(changes, id) || candidate);
        current = model.presentation(author, model.createLayout(author)); state = {}; seen.clear();
        build(); finishEditing(); lock(false);
      } catch (error) { lock(false); showError(error.message || 'Не удалось сохранить задание.'); }
    }
    edit.addEventListener('click', () => { if (!saving) return editing ? save() : enterEditing(); });
    cancel.addEventListener('click', () => { if (!saving) finishEditing(); });
    section.addEventListener('keydown', event => {
      if (event.key === 'Escape' && editing && !saving) { event.preventDefault?.(); finishEditing(); }
    });

    section.updateState = (next = {}, options = {}) => {
      if (disposed) return;
      const result = next.check, key = result && (result.id || `sequence:${result.sequence}`);
      const fresh = key && !seen.has(key);
      if (key) seen.add(key);
      const locked = lockedOf();
      state = next;
      // The other participant may move a line, or a check may lock lines, while a row is dragged here.
      const cancelled = drag && (!same(orderOf(), drag.from) || !same(lockedOf(), drag.locked)) ? stopDrag() : null;
      paint();
      if (cancelled) settle(cancelled);
      if (fresh && options.feedback !== false) showCheck(lockedOf().filter(id => !locked.includes(id)));
    };
    section.setInteractive = value => {
      interactive = Boolean(value);
      const cancelled = !interactive && drag ? stopDrag() : null;
      paint();
      if (cancelled) settle(cancelled);
    };
    section.dispose = () => { disposed = true; if (drag) stopDrag(); };
    if (state.check) seen.add(state.check.id || `sequence:${state.check.sequence}`);
    build();
    return section;
  }
  const api = { normalizeLineOrder, renderLineOrder };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LineOrderComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
