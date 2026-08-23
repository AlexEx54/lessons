(function initHowToPlayComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|\r|\n|^\s{0,3}#{1,6}\s|^\s*(?:[-+*]|\d+\.)\s/;

  function plainText(value, field) {
    const source = typeof value === 'string' ? value.trim() : '';
    const normalized = source.replace(/\s+/g, ' ');
    if (!normalized) throw new Error(`HowToPlay requires ${field}.`);
    if (MARKUP.test(source)) throw new Error(`HowToPlay does not allow HTML or Markdown in ${field}.`);
    return normalized;
  }

  function normalizeHowToPlay(data) {
    if (!data || data.type !== 'howToPlay' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('HowToPlay requires type "howToPlay" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !['type', 'id', 'title', 'steps', 'tip'].includes(key))) {
      throw new Error('HowToPlay contains unsupported fields.');
    }
    if (!Array.isArray(data.steps) || data.steps.length < 1 || data.steps.length > 8) {
      throw new Error('HowToPlay requires between 1 and 8 steps.');
    }
    const normalized = {
      type: 'howToPlay',
      id: data.id,
      title: plainText(data.title, 'a title'),
      steps: data.steps.map(step => plainText(step, 'step text')),
    };
    if (data.tip != null) normalized.tip = plainText(data.tip, 'tip text');
    return normalized;
  }

  function createBulbIcon(doc) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const bulb = doc.createElementNS(ns, 'path');
    bulb.setAttribute('d', 'M9 17h6m-5 3h4m-7.2-8.6A5.3 5.3 0 1 1 17.2 13c-.8.8-1.5 1.7-1.7 2.8h-7C8.3 14 7.5 13.3 6.8 12.5a5.3 5.3 0 0 1 0-1.1Z');
    svg.append(bulb);
    return svg;
  }

  function renderHowToPlay(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('HowToPlay requires a document.');

    let current = normalizeHowToPlay(data);
    let editing = false;
    let saving = false;
    let draft = null;
    let initialSnapshot = '';

    const section = doc.createElement('section');
    section.className = 'how-to-play';
    section.dataset.componentId = current.id;

    function notifyDirty() {
      if (typeof settings.onDirtyChange !== 'function' || !editing) return;
      settings.onDirtyChange(JSON.stringify(draft) !== initialSnapshot, current.id);
    }

    function move(list, index, direction) {
      const next = index + direction;
      if (next < 0 || next >= list.length) return;
      [list[index], list[next]] = [list[next], list[index]];
      renderEditor();
      notifyDirty();
    }

    function actionButton(text, label, onClick, className) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = className || 'how-to-play__small-button';
      button.textContent = text;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', onClick);
      return button;
    }

    function renderView() {
      section.classList.remove('how-to-play--editing', 'how-to-play--saving');
      const guide = doc.createElement('div');
      guide.className = 'how-to-play__guide';
      const guideContent = doc.createElement('div');
      guideContent.className = 'how-to-play__guide-content';
      const guideHeading = doc.createElement('div');
      guideHeading.className = 'how-to-play__guide-heading';
      const gamepad = doc.createElement('img');
      gamepad.className = 'how-to-play__gamepad';
      gamepad.src = '/assets/images/describe-and-guess-gamepad-v2.png';
      gamepad.alt = '';
      gamepad.setAttribute('aria-hidden', 'true');
      const guideTitle = doc.createElement('h3');
      guideTitle.textContent = current.title;
      guideHeading.append(gamepad, guideTitle);
      const steps = doc.createElement('ol');
      steps.className = 'how-to-play__steps';
      current.steps.forEach((step) => {
        const item = doc.createElement('li');
        item.textContent = step;
        steps.append(item);
      });
      guideContent.append(guideHeading, steps);
      if (current.tip) {
        const tip = doc.createElement('p');
        tip.className = 'how-to-play__tip';
        const bulb = doc.createElement('span');
        bulb.setAttribute('aria-hidden', 'true');
        bulb.append(createBulbIcon(doc));
        const label = doc.createElement('strong');
        label.textContent = 'Tip: ';
        tip.append(bulb, label, doc.createTextNode(current.tip));
        guideContent.append(tip);
      }
      const dialogue = doc.createElement('img');
      dialogue.className = 'how-to-play__dialogue';
      dialogue.src = '/assets/images/describe-and-guess-dialogue.png';
      dialogue.alt = '';
      dialogue.setAttribute('aria-hidden', 'true');
      guide.append(guideContent, dialogue);
      section.replaceChildren(guide);
      if (typeof settings.onSave === 'function') {
        const editButton = doc.createElement('button');
        editButton.type = 'button';
        editButton.className = 'how-to-play__edit';
        editButton.textContent = '✎';
        editButton.setAttribute('aria-label', 'Редактировать How to Play');
        editButton.addEventListener('click', beginEditing);
        section.append(editButton);
      }
    }

    function textField(labelText, value, onInput, multiline = false) {
      const label = doc.createElement('label');
      label.className = 'how-to-play__field';
      const caption = doc.createElement('span');
      caption.textContent = labelText;
      const input = doc.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = 'text';
      input.value = value;
      input.addEventListener('input', () => { onInput(input.value); notifyDirty(); });
      label.append(caption, input);
      return label;
    }

    function itemEditor(step, index) {
      const row = doc.createElement('div');
      row.className = 'how-to-play__editor-row';
      const input = doc.createElement('input');
      input.type = 'text';
      input.value = step;
      input.setAttribute('aria-label', `Шаг ${index + 1}`);
      input.addEventListener('input', () => {
        draft.steps[index] = input.value;
        notifyDirty();
      });
      const controls = doc.createElement('div');
      controls.className = 'how-to-play__row-actions';
      controls.append(
        actionButton('↑', 'Переместить выше', () => move(draft.steps, index, -1)),
        actionButton('↓', 'Переместить ниже', () => move(draft.steps, index, 1)),
        actionButton('×', 'Удалить', () => {
          if (draft.steps.length <= 1) return;
          draft.steps.splice(index, 1);
          renderEditor();
          notifyDirty();
        }, 'how-to-play__small-button how-to-play__remove'),
      );
      row.append(input, controls);
      return row;
    }

    function renderEditor() {
      section.classList.add('how-to-play--editing');
      const editor = doc.createElement('div');
      editor.className = 'how-to-play__editor';
      editor.append(
        textField('Заголовок', draft.title, value => { draft.title = value; }),
      );
      const stepsHeading = doc.createElement('h3');
      stepsHeading.textContent = 'Шаги';
      const rules = doc.createElement('div');
      rules.className = 'how-to-play__editor-list';
      draft.steps.forEach((step, index) => rules.append(itemEditor(step, index)));
      const addRule = actionButton('+ Добавить шаг', 'Добавить шаг', () => {
        if (draft.steps.length >= 8) return;
        draft.steps.push('');
        renderEditor();
        notifyDirty();
      }, 'how-to-play__add');

      const buttons = doc.createElement('div');
      buttons.className = 'how-to-play__editor-actions';
      buttons.append(
        actionButton('Отмена', 'Отменить редактирование', cancelEditing),
        actionButton('Сохранить', 'Сохранить How to Play', saveEditing, 'how-to-play__save'),
      );
      editor.append(
        stepsHeading, rules, addRule,
        textField('Tip', draft.tip || '', value => { draft.tip = value; }, true),
        buttons,
      );
      section.replaceChildren(editor);
    }

    function beginEditing() {
      draft = JSON.parse(JSON.stringify(current));
      initialSnapshot = JSON.stringify(draft);
      editing = true;
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
      renderEditor();
    }

    function cancelEditing() {
      editing = false;
      draft = null;
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
      renderView();
    }

    async function saveEditing() {
      if (saving) return;
      let normalized;
      try {
        normalized = normalizeHowToPlay({
          type: 'howToPlay',
          id: current.id,
          title: draft.title,
          steps: draft.steps,
          tip: draft.tip && draft.tip.trim() ? draft.tip : undefined,
        });
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      section.classList.add('how-to-play--saving');
      try {
        const saved = await settings.onSave({
          title: normalized.title,
          steps: normalized.steps,
          tip: normalized.tip,
        }, current.id);
        current = normalizeHowToPlay({ ...current, ...(saved || normalized) });
        editing = false;
        draft = null;
        if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
        renderView();
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message || 'Не удалось сохранить How to Play.');
      } finally {
        saving = false;
        section.classList.remove('how-to-play--saving');
      }
    }

    renderView();
    return section;
  }

  const api = { normalizeHowToPlay, renderHowToPlay };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.HowToPlayComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
