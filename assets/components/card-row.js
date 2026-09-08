(function initCardRowComponent(root) {
  'use strict';

  const markdown = root.MarkdownCardComponent
    || (typeof require === 'function' ? require('./markdown-card.js') : null);
  if (!markdown || typeof markdown.normalizeMarkdownCard !== 'function') {
    throw new Error('CardRow requires MarkdownCard.');
  }

  // Составной компонент сам сообщает обходчику о своих детях.
  const componentTree = root.ComponentTree
    || (typeof require === 'function' ? require('./component-tree.js') : null);
  if (componentTree && typeof componentTree.registerChildSlots === 'function') {
    componentTree.registerChildSlots('cardRow', component => (component && Array.isArray(component.presentation?.items || component.items)
      ? (component.presentation?.items || component.items)
      : []));
  }

  const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
  const COMPONENT_KEYS = ['type', 'id', 'items'];
  const MIN_ITEMS = 2;
  const MAX_ITEMS = 3;

  function normalizeRow(data, minimum) {
    if (!data || data.type !== 'cardRow' || !KEBAB_CASE.test(String(data.id || ''))) {
      throw new Error('CardRow requires type "cardRow" and a kebab-case id.');
    }
    if (Object.keys(data).some(key => !COMPONENT_KEYS.includes(key))) {
      throw new Error('CardRow contains unsupported fields.');
    }
    if (!Array.isArray(data.items) || data.items.length < minimum || data.items.length > MAX_ITEMS) {
      throw new Error(`CardRow requires between ${minimum} and ${MAX_ITEMS} items.`);
    }
    const items = data.items.map((item) => {
      if (!item || item.type !== 'markdownCard') {
        throw new Error('CardRow supports only markdownCard items.');
      }
      return markdown.normalizeMarkdownCard(item);
    });
    const ids = new Set(items.map(item => item.id));
    if (ids.size !== items.length) {
      throw new Error('CardRow item ids must be unique within the row.');
    }
    return { type: 'cardRow', id: data.id, items };
  }

  function normalizeCardRow(data) { return normalizeRow(data, MIN_ITEMS); }

  function renderCardRow(data, options, documentRef) {
    let settings = options || {};
    let doc = documentRef || root.document;
    if (options && typeof options.createElement === 'function') {
      doc = options;
      settings = {};
    }
    if (!doc) throw new Error('CardRow requires a document.');

    const current = settings.presentation ? normalizeRow(settings.presentation, 0) : normalizeCardRow(data);

    const section = doc.createElement('section');
    section.className = 'card-row';
    section.dataset.componentId = current.id;

    section.componentNodes = new Map();
    current.items.forEach((item) => {
      const node = markdown.renderMarkdownCard(item, {
        viewerRole: settings.viewerRole || 'teacher',
        studentVisible: Boolean(settings.studentVisible),
        onSave: settings.onSave,
        onDirtyChange: settings.onDirtyChange,
        onError: settings.onError,
        ...settings.componentOptions?.(item),
      }, doc);
      if (node) { section.append(node); section.componentNodes.set(item.id, node); }
    });

    section.dispose = () => section.componentNodes.forEach(node => node.dispose?.());

    // Если не видна ни одна карточка (например все teacherOnly в student view),
    // ряд целиком не отображается.
    if (section.componentNodes.size === 0) return null;
    return section;
  }

  const api = {
    MAX_ITEMS,
    MIN_ITEMS,
    normalizeCardRow,
    renderCardRow,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.CardRowComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
