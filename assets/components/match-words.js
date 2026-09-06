(function initMatchWordsComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function requiredText(value, field) {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if (!normalized) throw new Error(`MatchWords requires ${field}.`);
    return normalized;
  }

  function normalizeMatchWords(data) {
    if (!data || data.type !== 'matchWords' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('MatchWords requires a kebab-case id.');
    }
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 12) {
      throw new Error('MatchWords requires between 1 and 12 items.');
    }

    const ids = new Set([data.id]);
    const items = data.items.map((item) => {
      if (!item || !KEBAB_CASE.test(String(item.id || '')) || ids.has(item.id)) {
        throw new Error('MatchWords item ids must be unique kebab-case values.');
      }
      ids.add(item.id);
      const normalized = {
        id: item.id,
        term: requiredText(item.term, 'an item term'),
        imagePrompt: requiredText(item.imagePrompt, 'an image prompt'),
      };
      if (item.imageSrc != null) normalized.imageSrc = requiredText(item.imageSrc, 'a non-empty imageSrc');
      return normalized;
    });

    return {
      type: 'matchWords',
      id: data.id,
      title: requiredText(data.title, 'a title'),
      instruction: requiredText(data.instruction, 'an instruction'),
      items,
    };
  }

  function shuffled(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const next = Math.floor(Math.random() * (index + 1));
      [result[index], result[next]] = [result[next], result[index]];
    }
    return result;
  }

  function renderMatchWords(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('MatchWords requires a document.');

    let current = normalizeMatchWords(data);
    let editing = false;
    let busy = false;
    let selectedId = null;
    const matched = new Set();
    const cardsById = new Map();
    const targetsById = new Map();
    const section = doc.createElement('section');
    section.className = 'match-words';
    section.dataset.componentId = current.id;
    section.setAttribute('aria-label', current.title);

    const heading = doc.createElement('div');
    heading.className = 'match-words__heading';
    const title = doc.createElement('h2');
    title.className = 'match-words__title';
    title.textContent = current.title;
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'match-words__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать изображения Match the Words');
    heading.append(title);
    if (typeof settings.onUpload === 'function') heading.append(editButton);

    const instruction = doc.createElement('p');
    instruction.className = 'match-words__instruction';
    instruction.textContent = current.instruction;
    const pool = doc.createElement('div');
    pool.className = 'match-words__pool';
    pool.setAttribute('aria-label', 'Слова и фразы');
    const grid = doc.createElement('div');
    grid.className = 'match-words__grid';
    const status = doc.createElement('p');
    status.className = 'match-words__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    function notify(message) {
      if (typeof settings.onMessage === 'function') settings.onMessage(message);
    }

    function setStatus(message) {
      status.textContent = message;
    }

    function updateSelection(nextId) {
      selectedId = nextId;
      cardsById.forEach((card, id) => {
        const selected = id === selectedId;
        card.classList.toggle('match-words__chip--selected', selected);
        card.setAttribute('aria-pressed', String(selected));
      });
      targetsById.forEach(target => target.classList.toggle('match-words__target--ready', Boolean(selectedId)));
      if (selectedId) setStatus(`Выбрано: ${cardsById.get(selectedId)?.textContent || ''}. Теперь выберите картинку.`);
    }

    function removeGhost(ghost) {
      if (ghost && ghost.parentNode) ghost.remove();
    }

    function returnGhost(ghost, card) {
      if (!ghost) {
        card.classList.remove('match-words__chip--dragging');
        card.hidden = false;
        return;
      }
      const destination = card.getBoundingClientRect();
      ghost.style.transition = 'left 260ms ease, top 260ms ease, transform 260ms ease, opacity 260ms ease';
      ghost.style.left = `${destination.left}px`;
      ghost.style.top = `${destination.top}px`;
      ghost.style.transform = 'scale(.96)';
      root.setTimeout(() => {
        removeGhost(ghost);
        card.classList.remove('match-words__chip--dragging');
        card.hidden = false;
      }, 270);
    }

    function showWrong(target) {
      const cross = target.querySelector('.match-words__feedback--wrong');
      target.classList.remove('match-words__target--wrong');
      void target.offsetWidth;
      target.classList.add('match-words__target--wrong');
      cross.hidden = false;
      root.setTimeout(() => {
        cross.hidden = true;
        target.classList.remove('match-words__target--wrong');
      }, 1000);
    }

    function attemptMatch(termId, targetId, ghost) {
      const card = cardsById.get(termId);
      const target = targetsById.get(targetId);
      if (!card || !target || matched.has(termId) || editing || busy) {
        if (card) returnGhost(ghost, card);
        else removeGhost(ghost);
        return;
      }

      updateSelection(null);
      if (termId === targetId) {
        matched.add(termId);
        card.classList.remove('match-words__chip--dragging');
        card.hidden = true;
        target.classList.add('match-words__target--matched');
        target.removeAttribute('tabindex');
        target.setAttribute('aria-disabled', 'true');
        target.querySelector('.match-words__feedback--correct').hidden = false;
        target.querySelector('.match-words__drop-label').textContent = '';
        if (ghost) {
          ghost.style.transition = 'opacity 180ms ease, transform 180ms ease';
          ghost.style.opacity = '0';
          ghost.style.transform = 'scale(.88)';
          root.setTimeout(() => removeGhost(ghost), 190);
        }
        const done = matched.size;
        setStatus(done === current.items.length ? 'Все слова сопоставлены.' : `Верно. ${done} из ${current.items.length}.`);
        return;
      }

      showWrong(target);
      returnGhost(ghost, card);
      setStatus('Не совпало. Попробуйте ещё раз.');
    }

    async function copyPrompt(prompt, button) {
      try {
        const clipboard = root.navigator && root.navigator.clipboard;
        if (!clipboard || typeof clipboard.writeText !== 'function') throw new Error('Clipboard unavailable');
        await clipboard.writeText(prompt);
        button.classList.add('match-words__copy--done');
        notify('Промт скопирован.');
        root.setTimeout(() => button.classList.remove('match-words__copy--done'), 900);
      } catch (_error) {
        notify('Не удалось скопировать промт.');
      }
    }

    async function uploadImage(file, itemId) {
      if (!file || busy || typeof settings.onUpload !== 'function') return;
      busy = true;
      section.classList.add('match-words--busy');
      try {
        current = normalizeMatchWords(await settings.onUpload(file, current.id, itemId));
        renderItems();
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        busy = false;
        section.classList.remove('match-words--busy');
      }
    }

    async function deleteImage(itemId) {
      if (busy || typeof settings.onDelete !== 'function') return;
      if (typeof root.confirm === 'function' && !root.confirm('Удалить изображение и снова показать промт?')) return;
      busy = true;
      section.classList.add('match-words--busy');
      try {
        current = normalizeMatchWords(await settings.onDelete(current.id, itemId));
        renderItems();
      } catch (_error) {
        // The parent renderer owns the visible error toast.
      } finally {
        busy = false;
        section.classList.remove('match-words--busy');
      }
    }

    function enableDrag(card, itemId) {
      let drag = null;

      function removeDocumentListeners() {
        doc.removeEventListener('pointerup', finishDrag, true);
        doc.removeEventListener('pointercancel', cancelDrag, true);
      }

      function clearDropHover() {
        targetsById.forEach(target => target.classList.remove('match-words__target--over'));
      }

      function finishDrag(event) {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const finished = drag;
        drag = null;
        removeDocumentListeners();
        clearDropHover();
        if (!finished.active) return;
        event.preventDefault();
        const hit = doc.elementFromPoint(event.clientX, event.clientY);
        const pointerTarget = hit && hit.closest ? hit.closest('.match-words__target') : null;
        const target = pointerTarget && section.contains(pointerTarget) ? pointerTarget : targetsById.get(finished.targetId);
        if (target && section.contains(target) && !target.classList.contains('match-words__target--matched')) {
          attemptMatch(itemId, target.dataset.itemId, finished.ghost);
        } else {
          returnGhost(finished.ghost, card);
        }
      }

      function cancelDrag(event) {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const cancelled = drag;
        drag = null;
        removeDocumentListeners();
        clearDropHover();
        if (cancelled.active) returnGhost(cancelled.ghost, card);
      }

      card.addEventListener('pointerdown', (event) => {
        if (editing || busy || matched.has(itemId) || (event.pointerType === 'mouse' && event.button !== 0)) return;
        drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, ghost: null, targetId: null };
        doc.addEventListener('pointerup', finishDrag, true);
        doc.addEventListener('pointercancel', cancelDrag, true);
        card.setPointerCapture?.(event.pointerId);
      });

      card.addEventListener('pointermove', (event) => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
        if (!drag.active && distance < 7) return;
        if (!drag.active) {
          drag.active = true;
          const rect = card.getBoundingClientRect();
          const ghost = card.cloneNode(true);
          ghost.className = 'match-words__drag-ghost';
          ghost.style.width = `${rect.width}px`;
          ghost.style.left = `${rect.left}px`;
          ghost.style.top = `${rect.top}px`;
          doc.body.append(ghost);
          drag.ghost = ghost;
          card.classList.add('match-words__chip--dragging');
          updateSelection(null);
        }
        event.preventDefault();
        drag.ghost.style.left = `${event.clientX - drag.ghost.offsetWidth / 2}px`;
        drag.ghost.style.top = `${event.clientY - drag.ghost.offsetHeight / 2}px`;
        const hit = doc.elementFromPoint(event.clientX, event.clientY);
        const target = hit && hit.closest ? hit.closest('.match-words__target') : null;
        drag.targetId = target && section.contains(target) && !target.classList.contains('match-words__target--matched')
          ? target.dataset.itemId
          : null;
        targetsById.forEach((candidate, id) => candidate.classList.toggle('match-words__target--over', id === drag.targetId));
      });

    }

    function createChip(item) {
      const card = doc.createElement('button');
      card.type = 'button';
      card.className = 'match-words__chip';
      card.dataset.itemId = item.id;
      card.textContent = item.term;
      card.setAttribute('aria-pressed', 'false');
      card.addEventListener('click', () => {
        if (editing || busy || matched.has(item.id)) return;
        const next = selectedId === item.id ? null : item.id;
        updateSelection(next);
        card.setAttribute('aria-pressed', String(next === item.id));
      });
      enableDrag(card, item.id);
      cardsById.set(item.id, card);
      return card;
    }

    function createTarget(item) {
      const target = doc.createElement('article');
      target.className = 'match-words__target';
      target.dataset.itemId = item.id;
      target.tabIndex = 0;
      target.setAttribute('role', 'button');
      target.setAttribute('aria-label', settings.showImagePrompts === false ? 'Картинка для сопоставления' : `Картинка для сопоставления: ${item.imagePrompt}`);

      const media = doc.createElement('div');
      media.className = 'match-words__media';
      if (item.imageSrc) {
        const image = doc.createElement('img');
        image.src = item.imageSrc;
        image.alt = '';
        image.loading = 'lazy';
        media.append(image);
      } else if (settings.showImagePrompts === false) {
        media.textContent = 'Изображение не добавлено';
      } else {
        media.classList.add('match-words__media--prompt');
        const prompt = doc.createElement('span');
        prompt.className = 'match-words__prompt';
        prompt.textContent = item.imagePrompt;
        const copy = doc.createElement('button');
        copy.type = 'button';
        copy.className = 'match-words__copy';
        copy.textContent = '⧉';
        copy.title = 'Скопировать промт';
        copy.setAttribute('aria-label', 'Скопировать промт для изображения');
        copy.addEventListener('click', (event) => {
          event.stopPropagation();
          copyPrompt(item.imagePrompt, copy);
        });
        media.append(prompt, copy);
      }

      const correct = doc.createElement('span');
      correct.className = 'match-words__feedback match-words__feedback--correct';
      correct.textContent = '✓';
      correct.hidden = true;
      const wrong = doc.createElement('span');
      wrong.className = 'match-words__feedback match-words__feedback--wrong';
      wrong.textContent = '×';
      wrong.hidden = true;
      media.append(correct, wrong);

      if (typeof settings.onUpload === 'function') {
        const actions = doc.createElement('div');
        actions.className = 'match-words__image-actions';
        const input = doc.createElement('input');
        input.type = 'file';
        input.accept = 'image/jpeg,image/png,image/webp';
        input.hidden = true;
        const upload = doc.createElement('button');
        upload.type = 'button';
        upload.className = 'match-words__image-action';
        upload.textContent = item.imageSrc ? 'Заменить' : 'Загрузить';
        upload.addEventListener('click', (event) => {
          event.stopPropagation();
          input.click();
        });
        input.addEventListener('change', () => {
          const file = input.files && input.files[0];
          uploadImage(file, item.id);
          input.value = '';
        });
        actions.append(upload, input);
        if (item.imageSrc && typeof settings.onDelete === 'function') {
          const remove = doc.createElement('button');
          remove.type = 'button';
          remove.className = 'match-words__image-action match-words__image-action--remove';
          remove.textContent = 'Удалить';
          remove.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteImage(item.id);
          });
          actions.append(remove);
        }
        media.append(actions);
      }

      const dropLabel = doc.createElement('span');
      dropLabel.className = 'match-words__drop-label';
      dropLabel.textContent = 'Drop word here';
      target.append(media, dropLabel);
      target.addEventListener('click', (event) => {
        if (event.target.closest('button') || !selectedId || matched.has(item.id) || editing || busy) return;
        attemptMatch(selectedId, item.id, null);
      });
      target.addEventListener('keydown', (event) => {
        if ((event.key === 'Enter' || event.key === ' ') && selectedId && !matched.has(item.id) && !editing && !busy) {
          event.preventDefault();
          attemptMatch(selectedId, item.id, null);
        }
      });
      targetsById.set(item.id, target);
      return target;
    }

    function renderItems() {
      matched.clear();
      selectedId = null;
      cardsById.clear();
      targetsById.clear();
      pool.replaceChildren(...shuffled(current.items).map(createChip));
      grid.replaceChildren(...current.items.map(createTarget));
      section.classList.toggle('match-words--editing', editing);
      setStatus(`0 из ${current.items.length} сопоставлено.`);
    }

    editButton.addEventListener('click', () => {
      if (busy) return;
      editing = !editing;
      updateSelection(null);
      editButton.textContent = editing ? '✓' : '✎';
      editButton.setAttribute('aria-label', editing ? 'Закончить редактирование изображений' : 'Редактировать изображения Match the Words');
      section.classList.toggle('match-words--editing', editing);
    });

    renderItems();
    section.append(heading, instruction, pool, grid, status);
    return section;
  }

  const api = { normalizeMatchWords, renderMatchWords };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MatchWordsComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
