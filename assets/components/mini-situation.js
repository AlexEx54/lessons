(function initMiniSituationComponent(root) {
  'use strict';

  const illustrated = root.IllustratedTextPanelComponent
    || (typeof require === 'function' ? require('./text-panel.js') : null);
  if (!illustrated || typeof illustrated.normalizeIllustratedTextPanel !== 'function') {
    throw new Error('MiniSituation requires IllustratedTextPanel.');
  }

  const componentTree = root.ComponentTree
    || (typeof require === 'function' ? require('./component-tree.js') : null);
  if (componentTree && typeof componentTree.registerChildSlots === 'function') {
    componentTree.registerChildSlots('miniSituation', component => (
      component && component.situation ? [component.situation] : []
    ));
  }

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|^\s{0,3}#{1,6}\s|^\s*(?:[-*+]\s|\d+\.\s)/m;
  const COMPONENT_KEYS = ['type', 'id', 'title', 'instruction', 'sentenceCount', 'situation'];
  const MIN_SENTENCES = 3;
  const MAX_SENTENCES = 8;

  function plainText(value, field) {
    const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
    if (!normalized) throw new Error(`MiniSituation requires ${field}.`);
    if (MARKUP.test(normalized)) throw new Error(`MiniSituation does not allow HTML or Markdown in ${field}.`);
    return normalized;
  }

  function normalizeSentenceCount(value) {
    if (!Number.isInteger(value) || value < MIN_SENTENCES || value > MAX_SENTENCES) {
      throw new Error(`MiniSituation requires sentenceCount between ${MIN_SENTENCES} and ${MAX_SENTENCES}.`);
    }
    return value;
  }

  function normalizeMiniSituation(data) {
    if (!data || data.type !== 'miniSituation' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('MiniSituation requires type "miniSituation" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !COMPONENT_KEYS.includes(key))) {
      throw new Error('MiniSituation contains unsupported fields.');
    }
    const situation = illustrated.normalizeIllustratedTextPanel(data.situation);
    if (!situation.leadingPicture) {
      throw new Error('MiniSituation situation requires leadingPicture.');
    }
    return {
      type: 'miniSituation',
      id: data.id,
      title: plainText(data.title, 'a title'),
      instruction: plainText(data.instruction, 'an instruction'),
      sentenceCount: normalizeSentenceCount(data.sentenceCount),
      situation,
    };
  }

  function createManualCheckIcon(documentRef) {
    const svg = documentRef.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const shield = documentRef.createElementNS('http://www.w3.org/2000/svg', 'path');
    shield.setAttribute('d', 'M12 3.4 19.1 6.5v5.5c0 4.5-3.1 8-7.1 9.6-4-1.6-7.1-5.1-7.1-9.6V6.5Z');
    const check = documentRef.createElementNS('http://www.w3.org/2000/svg', 'path');
    check.setAttribute('d', 'm8.6 12.2 2.3 2.3 4.6-5');
    svg.append(shield, check);
    return svg;
  }

  function renderMiniSituation(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('MiniSituation requires a document.');

    let current = normalizeMiniSituation(data);
    let editing = false;
    let saving = false;
    let workingCount = current.sentenceCount;
    let initialSnapshot = '';

    const section = doc.createElement('section');
    section.className = 'mini-situation';
    section.dataset.componentId = current.id;

    const header = doc.createElement('div');
    header.className = 'mini-situation__header';
    const title = doc.createElement('h2');
    title.className = 'mini-situation__title';
    title.dataset.placeholder = 'Введите заголовок';
    const headerActions = doc.createElement('div');
    headerActions.className = 'mini-situation__header-actions';
    const cancelButton = doc.createElement('button');
    cancelButton.type = 'button';
    cancelButton.className = 'mini-situation__cancel';
    cancelButton.textContent = 'Отмена';
    cancelButton.hidden = true;
    const editButton = doc.createElement('button');
    editButton.type = 'button';
    editButton.className = 'mini-situation__edit';
    editButton.textContent = '✎';
    editButton.setAttribute('aria-label', 'Редактировать Mini Situation');
    header.append(title);
    if (typeof settings.onSave === 'function') {
      headerActions.append(cancelButton, editButton);
      header.append(headerActions);
    }

    const instruction = doc.createElement('p');
    instruction.className = 'mini-situation__instruction';
    instruction.dataset.placeholder = 'Введите инструкцию';

    const situationMount = doc.createElement('div');
    situationMount.className = 'mini-situation__situation';
    const situationNode = illustrated.renderIllustratedTextPanel(current.situation, {
      onSave: settings.onSituationSave,
      onUpload: settings.onSituationUpload,
      onDelete: settings.onSituationDelete,
      onDirtyChange: settings.onDirtyChange,
      onMessage: settings.onMessage,
    }, doc);
    situationMount.append(situationNode);

    const slots = doc.createElement('ol');
    slots.className = 'mini-situation__slots';
    const addSlot = doc.createElement('button');
    addSlot.type = 'button';
    addSlot.className = 'mini-situation__add';
    addSlot.textContent = '+ Добавить предложение';
    addSlot.hidden = true;

    const check = doc.createElement('div');
    check.className = 'mini-situation__check';
    const checkIcon = doc.createElement('span');
    checkIcon.className = 'mini-situation__check-icon';
    checkIcon.append(createManualCheckIcon(doc));
    const checkLabel = doc.createElement('span');
    checkLabel.textContent = 'Manual check';
    check.append(checkIcon, checkLabel);

    function setDirty(dirty) {
      section.classList.toggle('mini-situation--dirty', dirty);
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(dirty, current.id);
    }

    function snapshot() {
      return JSON.stringify({
        title: title.textContent.trim().replace(/\s+/g, ' '),
        instruction: instruction.textContent.trim().replace(/\s+/g, ' '),
        sentenceCount: workingCount,
      });
    }

    function updateDirty() {
      if (editing) setDirty(snapshot() !== initialSnapshot);
    }

    function slotValues() {
      return [...slots.querySelectorAll('.mini-situation__input')].map(input => input.value);
    }

    function paintSlots(count, values) {
      const rows = [];
      for (let index = 0; index < count; index += 1) {
        const row = doc.createElement('li');
        row.className = 'mini-situation__slot';
        const number = doc.createElement('span');
        number.className = 'mini-situation__index';
        number.textContent = String(index + 1);
        const input = doc.createElement('input');
        input.type = 'text';
        input.className = 'mini-situation__input';
        input.autocomplete = 'off';
        input.spellcheck = true;
        input.placeholder = `Type sentence ${index + 1}...`;
        input.setAttribute('aria-label', `Предложение ${index + 1}`);
        input.value = values[index] || '';
        row.append(number, input);
        if (editing) {
          const remove = doc.createElement('button');
          remove.type = 'button';
          remove.className = 'mini-situation__remove';
          remove.textContent = 'Удалить';
          remove.setAttribute('aria-label', `Удалить предложение ${index + 1}`);
          remove.disabled = saving || count <= MIN_SENTENCES;
          remove.addEventListener('click', () => removeSlot(index));
          row.append(remove);
        }
        rows.push(row);
      }
      slots.replaceChildren(...rows);
      addSlot.hidden = !editing;
      addSlot.disabled = saving || count >= MAX_SENTENCES;
    }

    function addSentence() {
      if (!editing || saving || workingCount >= MAX_SENTENCES) return;
      const values = slotValues();
      values.push('');
      workingCount = values.length;
      paintSlots(workingCount, values);
      updateDirty();
    }

    function removeSlot(index) {
      if (!editing || saving || workingCount <= MIN_SENTENCES) return;
      const values = slotValues();
      values.splice(index, 1);
      workingCount = values.length;
      paintSlots(workingCount, values);
      updateDirty();
    }

    function paintCopy() {
      title.textContent = current.title;
      instruction.textContent = current.instruction;
    }

    function enableEditor(element, label, multiline) {
      element.contentEditable = 'true';
      element.setAttribute('role', 'textbox');
      element.setAttribute('aria-label', label);
      if (multiline) element.setAttribute('aria-multiline', 'true');
    }

    function disableEditor(element) {
      element.contentEditable = 'false';
      element.removeAttribute('role');
      element.removeAttribute('aria-label');
      element.removeAttribute('aria-multiline');
    }

    function leaveEditMode() {
      if (saving) return;
      editing = false;
      workingCount = current.sentenceCount;
      section.classList.remove('mini-situation--editing', 'mini-situation--saving');
      disableEditor(title);
      disableEditor(instruction);
      editButton.textContent = '✎';
      editButton.disabled = false;
      editButton.setAttribute('aria-label', 'Редактировать Mini Situation');
      cancelButton.hidden = true;
      cancelButton.disabled = false;
      paintCopy();
      paintSlots(current.sentenceCount, slotValues());
      setDirty(false);
    }

    function enterEditMode() {
      if (editing) return;
      editing = true;
      workingCount = current.sentenceCount;
      section.classList.add('mini-situation--editing');
      enableEditor(title, 'Заголовок Mini Situation', false);
      enableEditor(instruction, 'Инструкция Mini Situation', true);
      editButton.textContent = '✓';
      editButton.setAttribute('aria-label', 'Сохранить Mini Situation');
      cancelButton.hidden = false;
      paintSlots(workingCount, slotValues());
      initialSnapshot = snapshot();
      title.focus();
    }

    function cancelEditing() {
      if (!editing || saving) return;
      paintCopy();
      workingCount = current.sentenceCount;
      leaveEditMode();
      editButton.focus();
    }

    async function saveEditing() {
      if (!editing || saving) return;
      const candidate = {
        type: 'miniSituation',
        id: current.id,
        title: title.textContent,
        instruction: instruction.textContent,
        sentenceCount: workingCount,
        situation: current.situation,
      };
      try {
        normalizeMiniSituation(candidate);
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      section.classList.add('mini-situation--saving');
      editButton.disabled = true;
      cancelButton.disabled = true;
      paintSlots(workingCount, slotValues());
      try {
        const saved = await settings.onSave({
          title: candidate.title,
          instruction: candidate.instruction,
          sentenceCount: candidate.sentenceCount,
        }, current.id);
        current = normalizeMiniSituation(saved || candidate);
        saving = false;
        leaveEditMode();
      } catch (_error) {
        saving = false;
        section.classList.remove('mini-situation--saving');
        editButton.disabled = false;
        cancelButton.disabled = false;
        paintSlots(workingCount, slotValues());
      }
    }

    editButton.addEventListener('click', () => (editing ? saveEditing() : enterEditMode()));
    cancelButton.addEventListener('click', cancelEditing);
    addSlot.addEventListener('click', addSentence);
    title.addEventListener('input', updateDirty);
    instruction.addEventListener('input', updateDirty);
    title.addEventListener('keydown', (event) => {
      if (editing && event.key === 'Enter') event.preventDefault();
    });
    [title, instruction].forEach((element) => {
      element.addEventListener('paste', (event) => {
        if (!editing) return;
        event.preventDefault();
        const plain = event.clipboardData?.getData('text/plain') || '';
        if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plain);
        updateDirty();
      });
    });
    section.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !editing || saving) return;
      if (situationMount.contains(event.target)) return;
      event.preventDefault();
      cancelEditing();
    });

    paintCopy();
    paintSlots(current.sentenceCount, []);
    section.append(header, instruction, situationMount, slots, addSlot, check);
    return section;
  }

  const api = {
    MAX_SENTENCES,
    MIN_SENTENCES,
    normalizeMiniSituation,
    renderMiniSituation,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MiniSituationComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
