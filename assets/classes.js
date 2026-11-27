(() => {
  'use strict';
  const Chips = window.ChoiceChips;
  const byId = id => document.getElementById(id);
  const status = byId('classes-status');
  const retry = byId('classes-retry');
  const empty = byId('classes-empty');
  const list = byId('classes-list');
  const dialog = byId('classes-edit-dialog');
  const form = dialog.querySelector('form');
  const nameInput = byId('classes-edit-name');
  const levelChoice = byId('classes-level-choice');
  const ageChoice = byId('classes-age-choice');
  const editError = byId('classes-edit-error');
  const deleteDialog = byId('classes-delete-dialog');
  const deleteText = byId('classes-delete-text');
  const deleteError = byId('classes-delete-error');
  const deleteConfirm = byId('classes-delete-confirm');
  const SAVE_FAILED = 'Не удалось сохранить класс.';
  const DELETE_FAILED = 'Не удалось удалить класс.';
  const formats = {
    next: new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
    day: new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }),
    dayOfYear: new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', year: 'numeric' }),
  };
  const plural = new Intl.PluralRules('ru');
  const SESSION_WORDS = { one: 'занятие', few: 'занятия', many: 'занятий', other: 'занятия' };
  const HELD_WORDS = { one: 'проведённое занятие', few: 'проведённых занятия', many: 'проведённых занятий', other: 'проведённого занятия' };
  const PLANNED_WORDS = { one: 'запланированное занятие', few: 'запланированных занятия', many: 'запланированных занятий', other: 'запланированного занятия' };
  let classes = [];
  let editedId = null;
  let saving = false;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function button(className, text, action) {
    const node = element('button', className, text);
    node.type = 'button';
    node.dataset.action = action;
    return node;
  }
  const counted = (count, words) => `${count} ${words[plural.select(count)]}`;
  const sessionCount = count => counted(count, SESSION_WORDS);
  // The year is shown only when it is not the current one.
  function historyDate(value) {
    const date = new Date(value);
    return (date.getFullYear() === new Date().getFullYear() ? formats.day : formats.dayOfYear).format(date);
  }

  const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>';

  // One quiet line: «Проведено 12 занятий · следующее 3 декабря в 18:00».
  function summary(item) {
    const parts = [
      item.held_count && `проведено ${sessionCount(item.held_count)}`,
      item.next_session_at && `следующее ${formats.next.format(new Date(item.next_session_at))}`,
    ].filter(Boolean);
    const text = parts.length ? parts.join(' · ') : 'занятий пока не было';
    return element('p', 'class-card__summary', text.charAt(0).toLocaleUpperCase('ru') + text.slice(1));
  }

  // Where the class stands in the program; the whole row leads to the library shown for this class.
  function programLink(item) {
    const link = element('a', 'class-card__program');
    link.href = `/library.html?class=${encodeURIComponent(item.id)}`;
    link.title = 'Программа класса';
    const text = element('span', 'class-card__program-text');
    const point = item.next_point;
    if (point) text.append(element('span', 'plan-mark plan-mark--next', 'Дальше по программе'), element('span', 'class-card__point', point.title));
    else text.append(element('span', 'class-card__point-none', `Новых тем с уроками на уровне ${item.level} нет`));
    link.append(text);
    link.insertAdjacentHTML('beforeend', CHEVRON);
    return link;
  }

  function classCard(item) {
    const card = element('article', 'class-card');
    card.dataset.classId = item.id;

    const head = element('header', 'class-card__head');
    const avatar = element('span', 'class-card__avatar', item.name.trim().charAt(0).toLocaleUpperCase('ru'));
    avatar.setAttribute('aria-hidden', 'true');
    const title = element('div', 'class-card__title');
    const name = element('div', 'class-card__name');
    name.append(element('h3', '', item.name));
    if (item.isGroup) name.append(element('span', 'class-card__badge', 'Группа'));
    // Classes created before levels and ages existed ask the teacher to fill them in.
    const profile = item.level && item.age
      ? element('p', 'class-card__profile', `${item.level} · ${item.age_label}`)
      : button('class-card__set-profile', 'Указать уровень и возраст', 'edit');
    title.append(name, profile);
    const edit = button('class-card__edit', '', 'edit');
    edit.setAttribute('aria-label', `Изменить класс «${item.name}»`);
    edit.title = 'Изменить';
    edit.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>';
    head.append(avatar, title, edit);

    const program = item.level && item.age ? programLink(item) : null;

    const history = element('div', 'class-card__history');
    history.id = `class-history-${item.id}`;
    history.hidden = true;
    const toggle = button('classes-action classes-action--quiet class-card__history-toggle', 'История', 'history');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', history.id);
    toggle.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>');
    const actions = element('div', 'class-card__actions');
    actions.append(button('classes-action classes-action--soft', 'Запланировать занятие', 'plan'), toggle);

    card.append(...[head, summary(item), program, actions, history].filter(Boolean));
    return card;
  }

  function historyItem(session) {
    const link = element('a', 'class-history__link');
    link.href = session.path;
    const meta = element('span', 'class-history__meta');
    meta.append(
      element('span', '', historyDate(session.scheduled_at)),
      element('span', `class-history__state${session.held ? '' : ' class-history__state--ahead'}`, session.held ? 'Проведено' : 'Запланировано'),
    );
    link.append(meta, element('span', 'class-history__title', session.title));
    if (session.grammar_title) link.append(element('span', 'class-history__grammar', session.grammar_title));
    const item = element('li');
    item.append(link);
    return item;
  }

  // Loaded on every opening, so a session planned or held since then is already there.
  async function showHistory(panel, classId) {
    panel.replaceChildren(element('p', 'class-history__status', 'Загружаем историю…'));
    try {
      const response = await fetch(`/api/classes/${classId}/sessions`, { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const { sessions } = await response.json();
      if (!sessions.length) { panel.replaceChildren(element('p', 'class-history__status', 'Занятий пока не было.')); return; }
      const items = element('ol', 'class-history');
      items.append(...sessions.map(historyItem));
      panel.replaceChildren(items);
    } catch {
      panel.replaceChildren(element('p', 'class-history__status', 'Не удалось загрузить историю.'));
    }
  }

  function toggleHistory(card, toggle) {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    const panel = card.querySelector('.class-card__history');
    toggle.setAttribute('aria-expanded', String(open));
    panel.hidden = !open;
    if (open) showHistory(panel, card.dataset.classId);
  }

  function render() {
    empty.hidden = classes.length > 0;
    list.replaceChildren(...classes.map(classCard));
  }

  // The server owns the order (as in the «Новое занятие» window), so a planned session is followed by a fresh load.
  async function load() {
    retry.hidden = true;
    if (!classes.length) status.textContent = 'Загружаем классы…';
    try {
      const response = await fetch('/api/classes', { cache: 'no-store' });
      if (response.status === 401) { location.href = '/login?next=/classes'; return; }
      if (!response.ok) throw new Error();
      classes = (await response.json()).classes;
    } catch {
      status.textContent = 'Не удалось загрузить классы.';
      retry.hidden = false;
      return;
    }
    status.textContent = '';
    render();
  }

  const planSession = classId => window.ClassModal.open({ classId, onCreated: load });

  function openEdit(item) {
    editedId = item.id;
    nameInput.value = item.name;
    Chips.pick(levelChoice, item.level);
    Chips.pick(ageChoice, item.age);
    editError.textContent = '';
    dialog.showModal();
    const unset = [levelChoice, ageChoice].find(group => !Chips.value(group));
    unset?.querySelector('[tabindex="0"]').focus();
  }

  function setSaving(value) {
    saving = value;
    form.querySelectorAll('button, input').forEach(control => { control.disabled = value; });
  }

  // Returns the message for what is still missing, marking the empty chip groups.
  function missingInput() {
    if (!nameInput.value.trim()) { nameInput.focus(); return 'Введите название класса.'; }
    const missing = Chips.markMissing([levelChoice, ageChoice]);
    if (missing.length > 1) return 'Выберите уровень и возраст класса.';
    if (missing.length) return missing[0] === levelChoice ? 'Выберите уровень класса.' : 'Выберите возраст класса.';
    return '';
  }

  async function saveClass() {
    const response = await fetch(`/api/classes/${editedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameInput.value.trim(), level: Chips.value(levelChoice), age: Chips.value(ageChoice) }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || SAVE_FAILED);
    return result.class;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (saving) return;
    editError.textContent = missingInput();
    if (editError.textContent) return;
    setSaving(true);
    try {
      const saved = await saveClass();
      classes = classes.map(item => (item.id === saved.id ? saved : item));
      list.querySelector(`[data-class-id="${saved.id}"]`).replaceWith(classCard(saved));
      dialog.close();
      window.AppShell.showToast('Класс сохранён.');
    } catch (failure) {
      // A fetch that never reached the server fails with a TypeError and a technical message.
      editError.textContent = failure instanceof TypeError ? SAVE_FAILED : failure.message;
    } finally {
      setSaving(false);
    }
  });
  // The warning names what goes with the class, so a class with a history is not deleted by a slip.
  function openDelete(item) {
    const losses = [
      item.held_count && `${counted(item.held_count, HELD_WORDS)} с заметками и чатом`,
      item.planned_count && counted(item.planned_count, PLANNED_WORDS),
      'постоянная ссылка для учеников',
    ].filter(Boolean);
    deleteDialog.querySelector('h3').textContent = `Удалить класс «${item.name}»?`;
    const list = element('ul');
    list.append(...losses.map(text => element('li', '', text)));
    deleteText.replaceChildren(element('p', '', 'Вместе с классом удалятся:'), list, element('p', '', 'Отменить удаление нельзя.'));
    deleteError.textContent = '';
    dialog.close();
    deleteDialog.showModal();
    deleteDialog.querySelector('[data-close]').focus();
  }

  async function deleteClass() {
    const item = classes.find(entry => entry.id === editedId);
    deleteDialog.querySelectorAll('button').forEach(control => { control.disabled = true; });
    try {
      const response = await fetch(`/api/classes/${item.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || DELETE_FAILED);
      classes = classes.filter(entry => entry.id !== item.id);
      render();
      deleteDialog.close();
      window.AppShell.showToast(`Класс «${item.name}» удалён.`);
    } catch (failure) {
      deleteError.textContent = failure instanceof TypeError ? DELETE_FAILED : failure.message;
    } finally {
      deleteDialog.querySelectorAll('button').forEach(control => { control.disabled = false; });
    }
  }

  [levelChoice, ageChoice].forEach(group => Chips.bind(group, () => { editError.textContent = ''; }));
  nameInput.addEventListener('input', () => { editError.textContent = ''; });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => { if (saving) event.preventDefault(); });
  byId('classes-delete').addEventListener('click', () => openDelete(classes.find(item => item.id === editedId)));
  deleteConfirm.addEventListener('click', deleteClass);
  deleteDialog.querySelector('[data-close]').addEventListener('click', () => deleteDialog.close());
  deleteDialog.addEventListener('cancel', event => { if (deleteConfirm.disabled) event.preventDefault(); });

  list.addEventListener('click', event => {
    const control = event.target.closest('[data-action]');
    if (!control) return;
    const card = control.closest('.class-card');
    const item = classes.find(entry => entry.id === card.dataset.classId);
    if (control.dataset.action === 'plan') planSession(item.id);
    if (control.dataset.action === 'edit') openEdit(item);
    if (control.dataset.action === 'history') toggleHistory(card, control);
  });
  byId('classes-create').addEventListener('click', () => planSession(null));
  retry.addEventListener('click', load);
  load();
})();
