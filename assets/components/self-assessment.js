(function initSelfAssessmentComponent(root) {
  'use strict';

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const OPTIONS = Object.freeze([
    Object.freeze({ id: 'independent', text: 'I can do it independently.' }),
    Object.freeze({ id: 'withHelp', text: 'I can do it with some help.' }),
    Object.freeze({ id: 'needPractice', text: 'I need more practice.' }),
  ]);

  function normalizeTitle(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function exactKeys(value, expected) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const expectedKeys = [...expected].sort();
    const keys = Object.keys(value).sort();
    return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
  }

  function normalizeSelfAssessment(data) {
    if (!data || data.type !== 'selfAssessment' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('SelfAssessment requires type "selfAssessment" and a kebab-case id.');
    }
    if (!exactKeys(data, ['type', 'id', 'title'])) {
      throw new Error('SelfAssessment contains unsupported fields.');
    }
    const title = normalizeTitle(data.title);
    if (!title) throw new Error('SelfAssessment requires a title.');
    return { type: 'selfAssessment', id: data.id, title };
  }

  function svgElement(documentRef, tag, attributes) {
    const node = documentRef.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function personIcon(doc) {
    const svg = svgElement(doc, 'svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    svg.classList.add('self-assessment__icon');
    svg.append(
      svgElement(doc, 'circle', { cx: '12', cy: '8', r: '3.4' }),
      svgElement(doc, 'path', { d: 'M5.6 19.2c.7-3.2 3.2-5 6.4-5s5.7 1.8 6.4 5' }),
    );
    return svg;
  }

  function faceIcon(doc, optionId) {
    const svg = svgElement(doc, 'svg', { viewBox: '0 0 48 48', 'aria-hidden': 'true' });
    svg.classList.add('self-assessment__face');
    svg.dataset.face = optionId;
    const fill = optionId === 'independent' ? '#3DDC84' : optionId === 'withHelp' ? '#F5C44C' : '#F07870';
    svg.append(svgElement(doc, 'circle', { cx: '24', cy: '24', r: '22', fill }));
    svg.append(svgElement(doc, 'circle', { cx: '17', cy: '20', r: '2.4', fill: '#2a2d3a' }));
    svg.append(svgElement(doc, 'circle', { cx: '31', cy: '20', r: '2.4', fill: '#2a2d3a' }));
    const mouth = svgElement(doc, 'path', {
      fill: 'none',
      stroke: '#2a2d3a',
      'stroke-width': '2.6',
      'stroke-linecap': 'round',
    });
    if (optionId === 'independent') mouth.setAttribute('d', 'M16 27.5c2.6 6.2 13.4 6.2 16 0');
    else if (optionId === 'withHelp') mouth.setAttribute('d', 'M17 29h14');
    else mouth.setAttribute('d', 'M16 32c2.6-5.4 13.4-5.4 16 0');
    svg.append(mouth);
    return svg;
  }

  function checkIcon(doc) {
    const svg = svgElement(doc, 'svg', { viewBox: '0 0 20 20', 'aria-hidden': 'true' });
    svg.classList.add('self-assessment__check');
    svg.append(svgElement(doc, 'path', {
      d: 'M4.6 10.4 8.2 14.2 15.5 6.2',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '2.2',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    }));
    return svg;
  }

  function renderSelfAssessment(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('SelfAssessment requires a document.');

    let current = normalizeSelfAssessment(data);
    const canEdit = typeof settings.onSave === 'function';
    let editing = false;
    let saving = false;
    let selectedId = '';
    let initialSnapshot = '';
    let titleEditor = null;

    const component = doc.createElement('section');
    component.className = 'self-assessment';
    component.dataset.componentId = current.id;

    function notifyDirty() {
      if (!editing || typeof settings.onDirtyChange !== 'function') return;
      const title = normalizeTitle(titleEditor ? titleEditor.textContent : current.title);
      settings.onDirtyChange(JSON.stringify({ title }) !== initialSnapshot, current.id);
    }

    function beginEditing() {
      editing = true;
      initialSnapshot = JSON.stringify({ title: current.title });
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
      render();
    }

    function cancelEditing() {
      editing = false;
      if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
      render();
    }

    async function saveEditing() {
      if (saving) return;
      let normalized;
      try {
        normalized = normalizeSelfAssessment({
          type: 'selfAssessment',
          id: current.id,
          title: titleEditor ? titleEditor.textContent : current.title,
        });
      } catch (error) {
        if (typeof settings.onError === 'function') settings.onError(error.message);
        return;
      }
      saving = true;
      component.classList.add('self-assessment--saving');
      try {
        const saved = await settings.onSave({ title: normalized.title }, current.id);
        current = normalizeSelfAssessment(saved || normalized);
        editing = false;
        if (typeof settings.onDirtyChange === 'function') settings.onDirtyChange(false, current.id);
        render();
      } catch (error) {
        if (typeof settings.onError === 'function') {
          settings.onError(error.message || 'Не удалось сохранить Self-assessment.');
        }
      } finally {
        saving = false;
        component.classList.remove('self-assessment--saving');
      }
    }

    function render() {
      titleEditor = null;
      component.classList.toggle('self-assessment--editing', editing);
      const headingId = `self-assessment-title-${String(current.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;

      const header = doc.createElement('header');
      header.className = 'self-assessment__header';
      header.append(personIcon(doc));
      const heading = doc.createElement('h3');
      heading.id = headingId;
      heading.textContent = current.title;
      header.append(heading);
      titleEditor = heading;
      if (editing) {
        heading.contentEditable = 'true';
        heading.setAttribute('role', 'textbox');
        heading.setAttribute('aria-label', 'Заголовок Self-assessment');
        heading.dataset.placeholder = 'Заголовок';
        heading.addEventListener('input', notifyDirty);
        heading.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') event.preventDefault();
        });
        heading.addEventListener('paste', (event) => {
          event.preventDefault();
          const plainText = event.clipboardData?.getData('text/plain') || '';
          if (typeof doc.execCommand === 'function') doc.execCommand('insertText', false, plainText);
        });
      }

      const group = doc.createElement('div');
      group.className = 'self-assessment__options';
      group.setAttribute('role', 'radiogroup');
      group.setAttribute('aria-labelledby', headingId);
      OPTIONS.forEach((option) => {
        const selected = selectedId === option.id;
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'self-assessment__option';
        button.dataset.option = option.id;
        button.setAttribute('role', 'radio');
        button.setAttribute('aria-checked', selected ? 'true' : 'false');
        if (selected) button.classList.add('self-assessment__option--selected');
        button.disabled = editing;
        const caption = doc.createElement('span');
        caption.className = 'self-assessment__caption';
        caption.textContent = option.text;
        button.append(faceIcon(doc, option.id), caption);
        if (selected) button.append(checkIcon(doc));
        button.addEventListener('click', () => {
          if (editing) return;
          selectedId = selectedId === option.id ? '' : option.id;
          render();
        });
        group.append(button);
      });

      const children = [header, group];
      if (editing) {
        const actions = doc.createElement('div');
        actions.className = 'self-assessment__editor-actions';
        const cancel = doc.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Отмена';
        cancel.addEventListener('click', cancelEditing);
        const save = doc.createElement('button');
        save.type = 'button';
        save.className = 'self-assessment__save';
        save.textContent = 'Сохранить';
        save.addEventListener('click', saveEditing);
        actions.append(cancel, save);
        children.push(actions);
      } else if (canEdit) {
        const edit = doc.createElement('button');
        edit.type = 'button';
        edit.className = 'self-assessment__edit';
        edit.textContent = '✎';
        edit.setAttribute('aria-label', 'Редактировать Self-assessment');
        edit.addEventListener('click', beginEditing);
        children.push(edit);
      }
      component.replaceChildren(...children);
    }

    render();
    return component;
  }

  const api = { OPTIONS, normalizeSelfAssessment, renderSelfAssessment };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SelfAssessmentComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
