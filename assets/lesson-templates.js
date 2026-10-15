(() => {
  'use strict';

  const state = { templates: [], loading: true, error: '', editingId: null };
  const loading = document.getElementById('templates-loading');
  const errorState = document.getElementById('templates-error');
  const errorMessage = document.getElementById('templates-error-message');
  const content = document.getElementById('templates-content');
  const systemGrid = document.getElementById('templates-system');
  const copiesGrid = document.getElementById('templates-copies');
  const copiesEmpty = document.getElementById('templates-copies-empty');

  function formatDate(value) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value));
  }

  function addText(parent, tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function addButton(parent, className, text, onClick) {
    const button = addText(parent, 'button', className, text);
    button.type = 'button';
    button.addEventListener('click', () => onClick(button));
    return button;
  }

  async function request(method, url, body) {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось выполнить действие.');
    return payload;
  }

  // Runs a card action with its button disabled; a failure is shown as a toast.
  async function withButton(button, busyText, action) {
    const text = button.textContent;
    button.disabled = true;
    button.textContent = busyText;
    try {
      await action();
    } catch (error) {
      window.AppShell.showToast(error.message);
      button.disabled = false;
      button.textContent = text;
    }
  }

  function templateUrl(template, suffix = '') {
    return `/api/lesson-templates/${encodeURIComponent(template.id)}${suffix}`;
  }

  // The new copy opens for renaming at the top of the copies, where the server lists it too.
  function copyTemplate(template, button) {
    withButton(button, 'Копируем…', async () => {
      const { template: copy } = await request('POST', templateUrl(template, '/copy'), {});
      const firstCopy = state.templates.findIndex(item => !item.system);
      state.templates.splice(firstCopy < 0 ? state.templates.length : firstCopy, 0, copy);
      state.editingId = copy.id;
      render();
      window.AppShell.showToast('Копия создана. Задайте ей название.');
    });
  }

  function deleteTemplate(template, button) {
    if (!window.confirm(`Удалить шаблон «${template.title}»? Черновики, созданные по нему, останутся.`)) return;
    withButton(button, 'Удаляем…', async () => {
      await request('DELETE', templateUrl(template));
      state.templates = state.templates.filter(item => item.id !== template.id);
      render();
      window.AppShell.showToast('Шаблон удалён.');
    });
  }

  function sourceLabel(template) {
    const source = state.templates.find(item => item.id === template.sourceTemplateId);
    return source ? `Копия «${source.title}»` : 'Копия удалённого шаблона';
  }

  function editForm(template) {
    const form = document.createElement('form');
    form.className = 'template-form';
    const titleLabel = addText(form, 'label', '', 'Название');
    const title = document.createElement('input');
    title.name = 'title';
    title.maxLength = 80;
    title.required = true;
    title.value = template.title;
    titleLabel.append(title);
    const descriptionLabel = addText(form, 'label', '', 'Описание');
    const description = document.createElement('textarea');
    description.name = 'description';
    description.maxLength = 500;
    description.value = template.description;
    descriptionLabel.append(description);

    const actions = document.createElement('div');
    actions.className = 'template-card__actions';
    const save = addText(actions, 'button', 'template-card__primary', 'Сохранить');
    save.type = 'submit';
    addButton(actions, '', 'Отмена', () => {
      state.editingId = null;
      render();
    });
    form.append(actions);

    form.addEventListener('submit', event => {
      event.preventDefault();
      withButton(save, 'Сохраняем…', async () => {
        const { template: saved } = await request('PATCH', templateUrl(template), {
          revision: template.revision, title: title.value, description: description.value,
        });
        state.templates = state.templates.map(item => (item.id === saved.id ? saved : item));
        state.editingId = null;
        render();
      });
    });
    window.requestAnimationFrame(() => {
      title.focus();
      title.select();
    });
    return form;
  }

  function templateCard(template) {
    const card = document.createElement('article');
    card.className = `template-card${template.system ? ' template-card--system' : ''}`;
    if (state.editingId === template.id) {
      card.append(editForm(template));
      return card;
    }

    const top = document.createElement('div');
    top.className = 'template-card__top';
    addText(top, 'h4', '', template.title);
    if (template.system) addText(top, 'span', 'template-card__badge', 'Системный');
    card.append(top);
    if (template.description) addText(card, 'p', 'template-card__description', template.description);

    if (!template.system) {
      const meta = document.createElement('div');
      meta.className = 'template-card__meta';
      addText(meta, 'span', '', sourceLabel(template));
      if (template.createdBy) addText(meta, 'span', '', template.createdBy.name);
      addText(meta, 'span', '', `Изменён ${formatDate(template.updatedAt)}`);
      card.append(meta);
    }

    const actions = document.createElement('div');
    actions.className = 'template-card__actions';
    addButton(actions, template.system ? 'template-card__primary' : '', 'Копировать', button => copyTemplate(template, button));
    if (!template.system) {
      addButton(actions, '', 'Изменить', () => {
        state.editingId = template.id;
        render();
      });
      addButton(actions, 'template-card__delete', 'Удалить', button => deleteTemplate(template, button));
    }
    card.append(actions);
    return card;
  }

  function render() {
    loading.hidden = !state.loading;
    errorState.hidden = !state.error;
    errorMessage.textContent = state.error;
    content.hidden = state.loading || Boolean(state.error);
    const copies = state.templates.filter(template => !template.system);
    systemGrid.replaceChildren(...state.templates.filter(template => template.system).map(templateCard));
    copiesGrid.replaceChildren(...copies.map(templateCard));
    copiesEmpty.hidden = copies.length > 0;
  }

  async function loadTemplates() {
    state.loading = true;
    state.error = '';
    render();
    try {
      state.templates = (await request('GET', '/api/lesson-templates')).templates;
    } catch (error) {
      state.error = error.message;
    } finally {
      state.loading = false;
      render();
    }
  }

  document.getElementById('templates-retry-load').addEventListener('click', loadTemplates);
  loadTemplates();
})();
