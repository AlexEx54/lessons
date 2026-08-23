(function initGuidedRoleCardsComponent(root) {
  'use strict';

  const markdown = root.SafeMarkdown
    || (typeof require === 'function' ? require('./safe-markdown.js') : null);
  if (!markdown) throw new Error('GuidedRoleCards requires SafeMarkdown.');

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const ROLE_KEYS = Object.freeze(['student', 'teacher']);
  const VIEWER_ROLES = new Set(ROLE_KEYS);
  const SECTIONS = Object.freeze([
    Object.freeze({ key: 'want', title: 'You want:', icon: 'want.png' }),
    Object.freeze({ key: 'avoid', title: "You don’t want:", icon: 'avoid.png' }),
    Object.freeze({ key: 'secret', title: 'Only you know:', icon: 'secret.png' }),
    Object.freeze({ key: 'mission', title: 'Secret mission:', icon: 'mission.png' }),
    Object.freeze({ key: 'goal', title: 'Goal:', icon: 'goal.png' }),
  ]);
  const SECTION_KEYS = new Set(SECTIONS.map(section => section.key));
  const IMAGE_BASE = '/assets/images/guided-communication/';

  function normalizeTitle(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function exactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const expectedKeys = [...expected].sort();
    const keys = Object.keys(value).sort();
    return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
  }

  function normalizeGuidedRoleCards(data) {
    if (!data || data.type !== 'guidedRoleCards' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('GuidedRoleCards requires type "guidedRoleCards" and a kebab-case id.');
    }
    if (!exactKeys(data, ['type', 'id', 'roles'])) {
      throw new Error('GuidedRoleCards contains unsupported fields.');
    }
    if (!exactKeys(data.roles, ROLE_KEYS)) {
      throw new Error('GuidedRoleCards requires exactly student and teacher roles.');
    }

    const roles = {};
    ROLE_KEYS.forEach((roleKey) => {
      const role = data.roles[roleKey];
      if (!exactKeys(role, ['title', 'sections'])) {
        throw new Error(`GuidedRoleCards ${roleKey} role has an invalid schema.`);
      }
      const title = normalizeTitle(role.title);
      if (!title) throw new Error(`GuidedRoleCards ${roleKey} role requires a title.`);
      if (!exactKeys(role.sections, SECTION_KEYS)) {
        throw new Error('GuidedRoleCards requires the fixed section set.');
      }
      const sections = {};
      SECTIONS.forEach(({ key }) => {
        const text = typeof role.sections[key] === 'string' ? role.sections[key].trim() : '';
        if (!text) throw new Error(`GuidedRoleCards section "${key}" cannot be empty.`);
        sections[key] = text;
      });
      roles[roleKey] = { title, sections };
    });

    return { type: 'guidedRoleCards', id: data.id, roles };
  }

  function visibleRoleKeys(viewerRole) {
    const role = viewerRole || 'teacher';
    if (!VIEWER_ROLES.has(role)) throw new Error('GuidedRoleCards requires a supported viewer role.');
    return role === 'student' ? ['student'] : [...ROLE_KEYS];
  }

  function renderGuidedRoleCards(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('GuidedRoleCards requires a document.');

    let current = normalizeGuidedRoleCards(data);
    const viewerRole = settings.viewerRole || 'teacher';
    const renderedRoles = visibleRoleKeys(viewerRole);
    const canEdit = viewerRole === 'teacher' && typeof settings.onSave === 'function';
    const openRoles = new Set();
    let editing = false;
    let saving = false;
    let draft = null;
    let initialSnapshot = '';
    let activeEditor = null;
    const editors = new Map();

    const component = doc.createElement('section');
    component.className = 'guided-role-cards';
    component.dataset.componentId = current.id;

    function image(name, className, alt = '') {
      const element = doc.createElement('img');
      element.className = className;
      element.src = `${IMAGE_BASE}${name}`;
      element.alt = alt;
      if (!alt) element.setAttribute('aria-hidden', 'true');
      return element;
    }

    function notifyDirty() {
      if (!editing || typeof settings.onDirtyChange !== 'function') return;
      settings.onDirtyChange(JSON.stringify(readEditorDraft()) !== initialSnapshot, current.id);
    }

    function enableEditor(element, label, multiline) {
      element.contentEditable = 'true';
      element.setAttribute('role', 'textbox');
      element.setAttribute('aria-label', label);
      if (multiline) element.setAttribute('aria-multiline', 'true');
      element.addEventListener('focus', () => { activeEditor = multiline ? element : null; });
      element.addEventListener('input', notifyDirty);
      element.addEventListener('paste', (event) => {
        event.preventDefault();
        const plainText = event.clipboardData?.getData('text/plain') || '';
        if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
      });
      if (!multiline) {
        element.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') event.preventDefault();
        });
      }
    }

    function roleCard(roleKey, role, editable) {
      const shell = doc.createElement('article');
      shell.className = `guided-role-card guided-role-card--${roleKey}`;
      shell.dataset.role = roleKey;
      shell.classList.toggle('guided-role-card--open', editable || openRoles.has(roleKey));

      const flipper = doc.createElement('div');
      flipper.className = 'guided-role-card__flipper';
      if (!editable) {
        flipper.tabIndex = 0;
        flipper.setAttribute('role', 'button');
        flipper.setAttribute('aria-expanded', String(openRoles.has(roleKey)));
        flipper.setAttribute('aria-label', `${openRoles.has(roleKey) ? 'Скрыть' : 'Открыть'} карточку ${role.title}`);
        const toggle = () => {
          if (openRoles.has(roleKey)) openRoles.delete(roleKey);
          else openRoles.add(roleKey);
          render();
        };
        flipper.addEventListener('click', toggle);
        flipper.addEventListener('keydown', (event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          toggle();
        });
      }

      const back = doc.createElement('div');
      back.className = 'guided-role-card__face guided-role-card__back';
      back.setAttribute('aria-hidden', String(editable || openRoles.has(roleKey)));
      if (editable || openRoles.has(roleKey)) back.setAttribute('inert', '');
      back.append(
        image(`${roleKey}.png`, 'guided-role-card__back-avatar'),
        Object.assign(doc.createElement('strong'), { textContent: role.title }),
        image('flip.png', 'guided-role-card__flip-icon'),
        Object.assign(doc.createElement('span'), { textContent: 'Tap to reveal' }),
      );

      const front = doc.createElement('div');
      front.className = 'guided-role-card__face guided-role-card__front';
      front.setAttribute('aria-hidden', String(!editable && !openRoles.has(roleKey)));
      if (!editable && !openRoles.has(roleKey)) front.setAttribute('inert', '');
      const header = doc.createElement('header');
      header.className = 'guided-role-card__header';
      header.append(image(`${roleKey}.png`, 'guided-role-card__avatar'));
      const heading = doc.createElement('h3');
      heading.textContent = role.title;
      header.append(heading);
      front.append(header);

      const roleEditors = { title: heading, sections: {} };
      SECTIONS.forEach((sectionDefinition) => {
        const section = doc.createElement('section');
        section.className = 'guided-role-card__section';
        const sectionHeading = doc.createElement('div');
        sectionHeading.className = 'guided-role-card__section-heading';
        sectionHeading.append(image(sectionDefinition.icon, 'guided-role-card__section-icon'));
        const label = doc.createElement('h4');
        label.textContent = sectionDefinition.title;
        sectionHeading.append(label);
        const body = doc.createElement('div');
        body.className = 'guided-role-card__section-body safe-markdown';
        body.dataset.placeholder = 'Введите текст раздела';
        markdown.renderMarkdownInto(body, role.sections[sectionDefinition.key], doc, 'guided-role-card__spacer');
        section.append(sectionHeading, body);
        front.append(section);
        roleEditors.sections[sectionDefinition.key] = body;
        if (editable) enableEditor(body, `${role.title}: ${sectionDefinition.title}`, true);
      });
      if (editable) enableEditor(heading, `Название роли ${roleKey}`, false);
      editors.set(roleKey, roleEditors);
      flipper.append(back, front);
      shell.append(flipper);
      return shell;
    }

    function readEditorDraft() {
      if (!editing) return current;
      const roles = {};
      ROLE_KEYS.forEach((roleKey) => {
        const roleEditors = editors.get(roleKey);
        const sections = {};
        SECTIONS.forEach(({ key }) => {
          sections[key] = markdown.editorToMarkdown(roleEditors.sections[key]);
        });
        roles[roleKey] = { title: normalizeTitle(roleEditors.title.textContent), sections };
      });
      return { type: 'guidedRoleCards', id: current.id, roles };
    }

    function toolbar() {
      const bar = doc.createElement('div');
      bar.className = 'guided-role-cards__toolbar';
      bar.setAttribute('role', 'toolbar');
      bar.setAttribute('aria-label', 'Форматирование role cards');
      [['B', 'Жирный', 'bold'], ['I', 'Курсив', 'italic'], ['• ≡', 'Маркированный список', 'insertUnorderedList'], ['1. ≡', 'Нумерованный список', 'insertOrderedList']]
        .forEach(([label, ariaLabel, command]) => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.textContent = label;
          button.setAttribute('aria-label', ariaLabel);
          button.addEventListener('mousedown', event => event.preventDefault());
          button.addEventListener('click', () => {
            if (!activeEditor || saving) return;
            activeEditor.focus();
            if (typeof doc.execCommand === 'function') doc.execCommand(command, false, null);
            notifyDirty();
          });
          bar.append(button);
        });
      return bar;
    }

    function beginEditing() {
      draft = JSON.parse(JSON.stringify(current));
      initialSnapshot = JSON.stringify(draft);
      editing = true;
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
      render();
    }

    function cancelEditing() {
      editing = false;
      draft = null;
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
      render();
    }

    async function saveEditing() {
      if (saving) return;
      let normalized;
      try {
        normalized = normalizeGuidedRoleCards(readEditorDraft());
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      component.classList.add('guided-role-cards--saving');
      try {
        const saved = await settings.onSave({ roles: normalized.roles }, current.id);
        current = normalizeGuidedRoleCards(saved || normalized);
        editing = false;
        draft = null;
        if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
        render();
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message || 'Не удалось сохранить role cards.');
      } finally {
        saving = false;
        component.classList.remove('guided-role-cards--saving');
      }
    }

    function render() {
      editors.clear();
      component.classList.toggle('guided-role-cards--editing', editing);
      const cards = doc.createElement('div');
      cards.className = 'guided-role-cards__grid';
      const source = editing ? draft : current;
      renderedRoles.forEach(roleKey => cards.append(roleCard(roleKey, source.roles[roleKey], editing)));
      const children = [];
      if (editing) children.push(toolbar());
      children.push(cards);
      if (editing) {
        const actions = doc.createElement('div');
        actions.className = 'guided-role-cards__editor-actions';
        const cancel = doc.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Отмена';
        cancel.addEventListener('click', cancelEditing);
        const save = doc.createElement('button');
        save.type = 'button';
        save.className = 'guided-role-cards__save';
        save.textContent = 'Сохранить';
        save.addEventListener('click', saveEditing);
        actions.append(cancel, save);
        children.push(actions);
      } else if (canEdit) {
        const edit = doc.createElement('button');
        edit.type = 'button';
        edit.className = 'guided-role-cards__edit';
        edit.textContent = '✎';
        edit.setAttribute('aria-label', 'Редактировать role cards');
        edit.addEventListener('click', beginEditing);
        children.push(edit);
      }
      component.replaceChildren(...children);
    }

    render();
    return component;
  }

  const api = { ROLE_KEYS, SECTIONS, normalizeGuidedRoleCards, visibleRoleKeys, renderGuidedRoleCards };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GuidedRoleCardsComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
