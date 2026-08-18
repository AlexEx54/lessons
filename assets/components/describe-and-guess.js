(function initDescribeAndGuessComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const MARKUP = /<[^>]*>|\*\*|__|`|!\[|\[[^\]]+\]\(|\r|\n|^\s{0,3}#{1,6}\s|^\s*(?:[-+*]|\d+\.)\s/;

  function plainText(value, field) {
    const source = typeof value === 'string' ? value.trim() : '';
    const normalized = source.replace(/\s+/g, ' ');
    if (!normalized) throw new Error(`DescribeAndGuess requires ${field}.`);
    if (MARKUP.test(source)) throw new Error(`DescribeAndGuess does not allow HTML or Markdown in ${field}.`);
    return normalized;
  }

  function normalizeItems(items) {
    if (!Array.isArray(items) || items.length < 1 || items.length > 12) {
      throw new Error('DescribeAndGuess requires between 1 and 12 items.');
    }
    const ids = new Set();
    return items.map((item) => {
      if (!item || Object.keys(item).some(key => !['id', 'text'].includes(key))) {
        throw new Error('DescribeAndGuess items only support id and text.');
      }
      if (!KEBAB_CASE.test(String(item.id || '')) || ids.has(item.id)) {
        throw new Error('DescribeAndGuess item ids must be unique kebab-case values.');
      }
      ids.add(item.id);
      return { id: item.id, text: plainText(item.text, 'item text') };
    });
  }

  function normalizeHowToPlay(value) {
    if (!value || Object.keys(value).some(key => !['title', 'steps', 'tip'].includes(key))) {
      throw new Error('DescribeAndGuess requires a howToPlay object with title, steps, and tip.');
    }
    if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.length > 8) {
      throw new Error('DescribeAndGuess howToPlay requires between 1 and 8 steps.');
    }
    return {
      title: plainText(value.title, 'a How to Play title'),
      steps: value.steps.map(step => plainText(step, 'How to Play step text')),
      tip: plainText(value.tip, 'How to Play tip text'),
    };
  }

  function normalizeDescribeAndGuess(data) {
    if (!data || data.type !== 'describeAndGuess' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('DescribeAndGuess requires type "describeAndGuess" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !['type', 'id', 'title', 'instruction', 'items', 'howToPlay'].includes(key))) {
      throw new Error('DescribeAndGuess contains unsupported fields.');
    }
    return {
      type: 'describeAndGuess',
      id: data.id,
      title: plainText(data.title, 'a title'),
      instruction: plainText(data.instruction, 'an instruction'),
      items: normalizeItems(data.items),
      howToPlay: normalizeHowToPlay(data.howToPlay),
    };
  }

  function createEyeIcon(doc) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', 'M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z');
    const circle = doc.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '12');
    circle.setAttribute('cy', '12');
    circle.setAttribute('r', '2.5');
    svg.append(path, circle);
    return svg;
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

  function freshId(items) {
    const ids = new Set(items.map(item => item.id));
    let index = items.length + 1;
    while (ids.has(`word-${index}`)) index += 1;
    return `word-${index}`;
  }

  function renderDescribeAndGuess(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('DescribeAndGuess requires a document.');

    let current = normalizeDescribeAndGuess(data);
    let editing = false;
    let saving = false;
    let draft = null;
    let initialSnapshot = '';

    const section = doc.createElement('section');
    section.className = 'describe-and-guess';
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
      button.className = className || 'describe-and-guess__small-button';
      button.textContent = text;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', onClick);
      return button;
    }

    function renderView() {
      section.classList.remove('describe-and-guess--editing', 'describe-and-guess--saving');
      const header = doc.createElement('div');
      header.className = 'describe-and-guess__header';
      const heading = doc.createElement('div');
      const title = doc.createElement('h2');
      title.className = 'describe-and-guess__title';
      title.textContent = current.title;
      const instruction = doc.createElement('p');
      instruction.className = 'describe-and-guess__instruction';
      instruction.textContent = current.instruction;
      heading.append(title, instruction);

      const actions = doc.createElement('div');
      actions.className = 'describe-and-guess__actions';
      const show = doc.createElement('button');
      show.type = 'button';
      show.className = 'describe-and-guess__show';
      show.dataset.studentVisibilityControl = '';
      show.append(createEyeIcon(doc), doc.createTextNode('Показать'));
      show.setAttribute('aria-label', 'Показать дополнительное упражнение ученику');
      actions.append(show);
      if (typeof settings.onSave === 'function') {
        actions.append(actionButton('✎', 'Редактировать Describe and Guess', beginEditing, 'describe-and-guess__edit'));
      }
      header.append(heading, actions);

      const words = doc.createElement('div');
      words.className = 'describe-and-guess__words';
      current.items.forEach((item) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'describe-and-guess__word';
        button.textContent = item.text;
        button.dataset.itemId = item.id;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          const crossed = button.classList.toggle('describe-and-guess__word--crossed');
          button.setAttribute('aria-pressed', String(crossed));
        });
        words.append(button);
      });

      const guide = doc.createElement('div');
      guide.className = 'describe-and-guess__guide';
      const guideContent = doc.createElement('div');
      guideContent.className = 'describe-and-guess__guide-content';
      const guideHeading = doc.createElement('div');
      guideHeading.className = 'describe-and-guess__guide-heading';
      const gamepad = doc.createElement('img');
      gamepad.className = 'describe-and-guess__gamepad';
      gamepad.src = '/assets/images/describe-and-guess-gamepad-v2.png';
      gamepad.alt = '';
      gamepad.setAttribute('aria-hidden', 'true');
      const guideTitle = doc.createElement('h3');
      guideTitle.textContent = current.howToPlay.title;
      guideHeading.append(gamepad, guideTitle);
      const steps = doc.createElement('ol');
      steps.className = 'describe-and-guess__steps';
      current.howToPlay.steps.forEach((step) => {
        const item = doc.createElement('li');
        item.textContent = step;
        steps.append(item);
      });
      const tip = doc.createElement('p');
      tip.className = 'describe-and-guess__tip';
      const bulb = doc.createElement('span');
      bulb.setAttribute('aria-hidden', 'true');
      bulb.append(createBulbIcon(doc));
      const label = doc.createElement('strong');
      label.textContent = 'Tip: ';
      tip.append(bulb, label, doc.createTextNode(current.howToPlay.tip));
      guideContent.append(guideHeading, steps, tip);
      const dialogue = doc.createElement('img');
      dialogue.className = 'describe-and-guess__dialogue';
      dialogue.src = '/assets/images/describe-and-guess-dialogue.png';
      dialogue.alt = '';
      dialogue.setAttribute('aria-hidden', 'true');
      guide.append(guideContent, dialogue);
      section.replaceChildren(header, words, guide);
    }

    function textField(labelText, value, onInput, multiline = false) {
      const label = doc.createElement('label');
      label.className = 'describe-and-guess__field';
      const caption = doc.createElement('span');
      caption.textContent = labelText;
      const input = doc.createElement(multiline ? 'textarea' : 'input');
      if (!multiline) input.type = 'text';
      input.value = value;
      input.addEventListener('input', () => { onInput(input.value); notifyDirty(); });
      label.append(caption, input);
      return label;
    }

    function itemEditor(item, index, kind) {
      const row = doc.createElement('div');
      row.className = 'describe-and-guess__editor-row';
      const list = kind === 'word' ? draft.items : draft.howToPlay.steps;
      const value = kind === 'word' ? item.text : item;
      const input = doc.createElement('input');
      input.type = 'text';
      input.value = value;
      input.setAttribute('aria-label', kind === 'word' ? `Слово ${index + 1}` : `Правило ${index + 1}`);
      input.addEventListener('input', () => {
        if (kind === 'word') item.text = input.value;
        else list[index] = input.value;
        notifyDirty();
      });
      const controls = doc.createElement('div');
      controls.className = 'describe-and-guess__row-actions';
      controls.append(
        actionButton('↑', 'Переместить выше', () => move(list, index, -1)),
        actionButton('↓', 'Переместить ниже', () => move(list, index, 1)),
        actionButton('×', 'Удалить', () => {
          if (list.length <= 1) return;
          list.splice(index, 1);
          renderEditor();
          notifyDirty();
        }, 'describe-and-guess__small-button describe-and-guess__remove'),
      );
      row.append(input, controls);
      return row;
    }

    function renderEditor() {
      section.classList.add('describe-and-guess--editing');
      const editor = doc.createElement('div');
      editor.className = 'describe-and-guess__editor';
      editor.append(
        textField('Заголовок', draft.title, value => { draft.title = value; }),
        textField('Инструкция', draft.instruction, value => { draft.instruction = value; }, true),
      );

      const wordsHeading = doc.createElement('h3');
      wordsHeading.textContent = 'Слова';
      const words = doc.createElement('div');
      words.className = 'describe-and-guess__editor-list';
      draft.items.forEach((item, index) => words.append(itemEditor(item, index, 'word')));
      const addWord = actionButton('+ Добавить слово', 'Добавить слово', () => {
        if (draft.items.length >= 12) return;
        draft.items.push({ id: freshId(draft.items), text: '' });
        renderEditor();
        notifyDirty();
      }, 'describe-and-guess__add');

      const guideHeading = doc.createElement('h3');
      guideHeading.textContent = 'How to Play';
      const rules = doc.createElement('div');
      rules.className = 'describe-and-guess__editor-list';
      draft.howToPlay.steps.forEach((step, index) => rules.append(itemEditor(step, index, 'step')));
      const addRule = actionButton('+ Добавить шаг', 'Добавить шаг', () => {
        if (draft.howToPlay.steps.length >= 8) return;
        draft.howToPlay.steps.push('');
        renderEditor();
        notifyDirty();
      }, 'describe-and-guess__add');

      const buttons = doc.createElement('div');
      buttons.className = 'describe-and-guess__editor-actions';
      buttons.append(
        actionButton('Отмена', 'Отменить редактирование', cancelEditing),
        actionButton('Сохранить', 'Сохранить Describe and Guess', saveEditing, 'describe-and-guess__save'),
      );
      editor.append(
        wordsHeading, words, addWord,
        guideHeading,
        textField('Заголовок правил', draft.howToPlay.title, value => { draft.howToPlay.title = value; }),
        rules, addRule,
        textField('Tip', draft.howToPlay.tip, value => { draft.howToPlay.tip = value; }, true),
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
        normalized = normalizeDescribeAndGuess(draft);
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      section.classList.add('describe-and-guess--saving');
      try {
        const saved = await settings.onSave({
          title: normalized.title,
          instruction: normalized.instruction,
          items: normalized.items,
          howToPlay: normalized.howToPlay,
        }, current.id);
        current = normalizeDescribeAndGuess(saved || normalized);
        editing = false;
        draft = null;
        if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
        renderView();
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message || 'Не удалось сохранить Describe and Guess.');
      } finally {
        saving = false;
        section.classList.remove('describe-and-guess--saving');
      }
    }

    renderView();
    return section;
  }

  const api = { normalizeDescribeAndGuess, normalizeHowToPlay, normalizeItems, renderDescribeAndGuess };
  root.DescribeAndGuessComponent = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
