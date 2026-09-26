(function initGuidedCommunicationCards(root) {
  'use strict';
  const flip = root.FlipCardComponent || (typeof require === 'function' ? require('./flip-card.js') : null);
  const taskView = root.CommunicationTaskComponent || (typeof require === 'function' ? require('./communication-task.js') : null);
  const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  function required(value, name) {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Заполните поле «${name}».`);
    return value.trim();
  }
  function lines(value, name) {
    if (!Array.isArray(value) || !value.length) throw new Error(`Добавьте строки в «${name}».`);
    return value.map(text => required(text, name));
  }
  function normalizeGuidedCommunicationCards(data) {
    if (!data || data.type !== 'guidedCommunicationCards' || !ID.test(String(data.id || ''))) throw new Error('GuidedCommunicationCards requires a kebab-case id.');
    if (!Array.isArray(data.items) || !data.items.length || data.items.length > 12) throw new Error('Требуется от 1 до 12 карточек.');
    const ids = new Set();
    const items = data.items.map(item => {
      if (!item || !ID.test(String(item.id || '')) || ids.has(item.id)) throw new Error('Карточкам нужны уникальные id.');
      ids.add(item.id);
      if (!/^#[0-9a-f]{6}$/i.test(item.cover?.backgroundColor || '')) throw new Error('Неверный цвет карточки.');
      const task = item.task;
      if (!task || !task.miniTask || !task.help) throw new Error('Заполните задание и Student Help.');
      if (typeof task.miniTask.example !== 'string') throw new Error('Пример должен быть строкой.');
      return { id: item.id, cover: {
        emoji: required(item.cover.emoji, 'Эмодзи'), title: required(item.cover.title, 'Обложка'),
        backgroundColor: item.cover.backgroundColor.toUpperCase(),
      }, task: { title: required(task.title, 'Название задания'), questions: lines(task.questions, 'Questions'),
        miniTask: { text: required(task.miniTask.text, 'Mini-task'), example: task.miniTask.example.trim() },
        help: Object.fromEntries(taskView.HELP.map(([key, title]) => [key, lines(task.help[key], title)])),
      } };
    });
    return { type: 'guidedCommunicationCards', id: data.id, items };
  }
  function renderGuidedCommunicationCards(data, options = {}, doc = root.document) {
    let current = normalizeGuidedCommunicationCards(data), editing = false, saving = false;
    const opened = new Set();
    const rootNode = doc.createElement('section'); rootNode.className = 'guided-communication-cards'; rootNode.dataset.componentId = current.id;
    const make = (tag, className, text) => {
      const node = doc.createElement(tag); node.className = className;
      if (text) node.textContent = text;
      if (tag === 'button') node.type = 'button';
      return node;
    };
    const dirty = value => options.onDirtyChange?.(value, current.id);
    function paint() {
      rootNode.replaceChildren();
      if (editing) { renderEditor(); return; }
      if (typeof options.onSave === 'function' && options.viewerRole !== 'student') {
        const edit = make('button', 'guided-communication-cards__edit', 'Редактировать');
        edit.addEventListener('click', () => { editing = true; paint(); }); rootNode.append(edit);
      }
      current.items.forEach(item => {
        const shell = make('article', 'communication-card'); shell.dataset.cardId = item.id;
        const flipper = make('div', 'communication-card__flipper');
        const cover = make('div', 'communication-card__cover');
        cover.style.setProperty('--cover-color', item.cover.backgroundColor);
        cover.append(make('span', 'communication-card__emoji', item.cover.emoji), make('strong', '', item.cover.title));
        const content = make('div', 'communication-card__content');
        content.append(taskView.renderCommunicationTask(item.task, doc));
        flipper.append(cover, content); shell.append(flipper); rootNode.append(shell);
        flip.bindFlipCard({ shell, flipper, cover, content,
          label: item.cover.title, expanded: opened.has(item.id),
          onExpandedChange: open => { if (open) opened.add(item.id); else opened.delete(item.id); },
        });
      });
    }
    function renderEditor() {
      const form = make('div', 'guided-communication-cards__editor');
      const controls = [];
      function field(parent, label, value, multiline = false, type = 'text') {
        const wrapper = make('label', 'guided-communication-cards__field');
        const input = make(multiline ? 'textarea' : 'input', '');
        if (!multiline) input.type = type;
        input.value = value; controls.push(input);
        wrapper.append(make('span', '', label), input); parent.append(wrapper); return input;
      }
      form.append(make('p', '', 'В списках — одна строка на пункт. Выделение: **жирный**, *курсив*.'));
      const readers = current.items.map(item => {
        const group = make('fieldset', ''); group.append(make('legend', '', item.cover.title));
        const emoji = field(group, 'Эмодзи', item.cover.emoji);
        const title = field(group, 'Обложка', item.cover.title);
        const color = field(group, 'Цвет обложки', item.cover.backgroundColor, false, 'color');
        const taskTitle = field(group, 'Название задания', item.task.title);
        const questions = field(group, 'Questions', item.task.questions.join('\n'), true);
        const text = field(group, 'Mini-task', item.task.miniTask.text, true);
        const example = field(group, 'Пример (необязательно)', item.task.miniTask.example, true);
        const help = taskView.HELP.map(([key, caption]) => [key, field(group, caption, item.task.help[key].join('\n'), true)]);
        const preview = make('div', 'guided-communication-cards__preview'); group.append(preview);
        const split = input => input.value.split('\n').map(line => line.trim()).filter(Boolean);
        const read = () => ({ id: item.id, cover: { emoji: emoji.value, title: title.value, backgroundColor: color.value },
          task: { title: taskTitle.value, questions: split(questions), miniTask: { text: text.value, example: example.value },
            help: Object.fromEntries(help.map(([key, input]) => [key, split(input)])) } });
        const refresh = () => preview.replaceChildren(taskView.renderCommunicationTask(read().task, doc));
        group.addEventListener('input', refresh); refresh(); form.append(group); return read;
      });
      const values = () => ({ ...current, items: readers.map(read => read()) });
      const initial = JSON.stringify(values());
      const error = make('p', 'guided-communication-cards__error'); error.setAttribute('role', 'alert');
      form.addEventListener('input', () => { dirty(JSON.stringify(values()) !== initial); error.textContent = ''; });
      const cancel = make('button', '', 'Отмена');
      cancel.addEventListener('click', () => { if (!saving) { editing = false; dirty(false); paint(); } });
      const save = make('button', '', 'Сохранить');
      save.addEventListener('click', async () => {
        if (saving) return;
        try {
          const next = normalizeGuidedCommunicationCards(values());
          saving = true; [...controls, save, cancel].forEach(node => { node.disabled = true; });
          form.setAttribute('aria-busy', 'true');
          const saved = await options.onSave({ items: next.items }, current.id);
          current = normalizeGuidedCommunicationCards(saved || next); editing = false; dirty(false); paint();
        } catch (failure) { error.textContent = failure.message || 'Не удалось сохранить карточки.'; }
        finally { saving = false; [...controls, save, cancel].forEach(node => { node.disabled = false; }); form.setAttribute('aria-busy', 'false'); }
      });
      form.append(error, cancel, save); rootNode.append(form);
    }
    paint(); return rootNode;
  }
  const api = { normalizeGuidedCommunicationCards, renderGuidedCommunicationCards };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GuidedCommunicationCardsComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
