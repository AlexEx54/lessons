'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_ITEMS,
  MIN_ITEMS,
  normalizeCardRow,
  renderCardRow,
} = require('../assets/components/card-row.js');

function textNode(value) {
  return { nodeType: 3, textContent: String(value), childNodes: [] };
}

function element(tag, namespace) {
  const el = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    namespaceURI: namespace || '',
    childNodes: [],
    attributes: {},
    dataset: {},
    listeners: {},
    style: { setProperty() {} },
    _className: '',
    _text: '',
    hidden: false,
    disabled: false,
    get className() { return this._className; },
    set className(value) { this._className = String(value || ''); },
    classList: {
      add(name) {
        const tokens = new Set(el._className.split(/\s+/).filter(Boolean));
        tokens.add(name);
        el._className = [...tokens].join(' ');
      },
      toggle(name, on) {
        const tokens = new Set(el._className.split(/\s+/).filter(Boolean));
        if (on === undefined) on = !tokens.has(name);
        if (on) tokens.add(name);
        else tokens.delete(name);
        el._className = [...tokens].join(' ');
      },
      contains(name) { return el._className.split(/\s+/).includes(name); },
    },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; },
    removeAttribute(name) { delete this.attributes[name]; },
    append(...nodes) {
      nodes.forEach((node) => {
        if (node == null) return;
        const child = typeof node === 'string' ? textNode(node) : node;
        child.parentNode = el;
        this.childNodes.push(child);
      });
    },
    replaceChildren(...nodes) {
      this.childNodes.forEach((child) => { delete child.parentNode; });
      this.childNodes = [];
      this.append(...nodes);
    },
    addEventListener() {},
    focus() {},
    querySelectorAll(selector) {
      const className = selector.startsWith('.') ? selector.slice(1) : '';
      const found = [];
      function walk(node) {
        (node.childNodes || []).forEach((child) => {
          if (className && child.classList && child.classList.contains(className)) found.push(child);
          walk(child);
        });
      }
      walk(el);
      return found;
    },
    get textContent() {
      if (this.childNodes.length === 0) return this._text;
      return this.childNodes.map(node => node.textContent || '').join('');
    },
    set textContent(value) {
      this.childNodes = [];
      this._text = String(value);
    },
  };
  return el;
}

function createFakeDocument() {
  return {
    createElement: tag => element(tag),
    createElementNS: (namespace, tag) => element(tag, namespace),
    createTextNode: value => textNode(value),
  };
}

function card(id, overrides = {}) {
  return {
    type: 'markdownCard',
    id,
    title: id,
    icon: 'book',
    accentColor: '#20A85B',
    studentVisibility: 'always',
    text: '- point',
    ...overrides,
  };
}

function row(overrides = {}, items) {
  return {
    type: 'cardRow',
    id: 'grammar-focus-practice-support-row',
    items: items || [card('support-a'), card('support-b'), card('support-c')],
    ...overrides,
  };
}

test('normalizes card row and its markdown cards', () => {
  const dirtyRow = row({
    id: 'practice-support',
  }, [
    card('support-a', { title: ' Support A ', text: ' - point ' }),
    card('support-b'),
    card('support-c'),
  ]);
  const normalized = normalizeCardRow(dirtyRow);
  assert.equal(normalized.type, 'cardRow');
  assert.equal(normalized.id, 'practice-support');
  assert.deepEqual(normalized.items.map(item => item.id), ['support-a', 'support-b', 'support-c']);
  assert.deepEqual(normalized.items.map(item => item.title), ['Support A', 'support-b', 'support-c']);
  assert.equal(MIN_ITEMS, 2);
  assert.equal(MAX_ITEMS, 3);
});

test('rejects invalid card rows', () => {
  assert.throws(() => normalizeCardRow(row({ type: 'cardGrid' })), /type "cardRow" and a kebab-case id/);
  assert.throws(() => normalizeCardRow(row({ id: 'Wrong Id' })), /kebab-case/);
  assert.throws(() => normalizeCardRow(row({ extra: true })), /unsupported fields/);
  assert.throws(() => normalizeCardRow(row({}, [card('only-one')])), /between 2 and 3 items/);
  assert.throws(() => normalizeCardRow(row({}, [
    card('a'), card('b'), card('c'), card('d'),
  ])), /between 2 and 3 items/);
  assert.throws(() => normalizeCardRow({
    type: 'cardRow',
    id: 'nested-attempt',
    items: [row({}, undefined), card('b')],
  }), /only markdownCard items/);
  assert.throws(() => normalizeCardRow(row({}, [card('same-id'), card('same-id')])), /unique within the row/);
});

test('renders every markdown card inside a single card-row section', () => {
  const tree = renderCardRow(row(), {}, createFakeDocument());
  assert.equal(tree.className, 'card-row');
  assert.equal(tree.dataset.componentId, 'grammar-focus-practice-support-row');
  assert.equal(tree.querySelectorAll('.markdown-card').length, 3);
  const editButtons = tree.querySelectorAll('.markdown-card__edit');
  assert.equal(editButtons.length, 0);
});

test('forwards teacher settings to every nested card renderer', () => {
  const recorded = [];
  const realMarkdownCard = require('../assets/components/markdown-card.js');
  globalThis.MarkdownCardComponent = {
    normalizeMarkdownCard: realMarkdownCard.normalizeMarkdownCard,
    renderMarkdownCard(item, settings, doc) {
      recorded.push({ id: item.id, settings, doc });
      if (settings.viewerRole === 'student' && item.studentVisibility === 'teacherOnly') return null;
      return doc.createElement('aside');
    },
  };
  try {
    delete require.cache[require.resolve('../assets/components/card-row.js')];
    const { renderCardRow: renderWithSpy } = require('../assets/components/card-row.js');
    const doc = createFakeDocument();
    function onDirtyChange() {}
    function onError() {}
    function onSave() {}
    const tree = renderWithSpy(row(), {
      viewerRole: 'teacher',
      studentVisible: false,
      onSave,
      onDirtyChange,
      onError,
    }, doc);
    assert.equal(tree.className, 'card-row');
    assert.deepEqual(recorded.map(entry => entry.id), ['support-a', 'support-b', 'support-c']);
    for (const entry of recorded) {
      assert.equal(entry.settings.viewerRole, 'teacher');
      assert.equal(entry.settings.studentVisible, false);
      assert.equal(entry.settings.onSave, onSave);
      assert.equal(entry.settings.onDirtyChange, onDirtyChange);
      assert.equal(entry.settings.onError, onError);
      assert.equal(entry.doc, doc);
    }
  } finally {
    delete globalThis.MarkdownCardComponent;
    delete require.cache[require.resolve('../assets/components/card-row.js')];
    // Восстанавливаем обычный модуль с реальным рендерером для остальных тестов.
    require('../assets/components/card-row.js');
  }
});

test('hides hidden cards and drops the whole row when nothing is visible', () => {
  const mixed = renderCardRow(row({}, [
    card('visible-a'),
    card('teacher-only', { studentVisibility: 'teacherOnly' }),
    card('visible-c'),
  ]), { viewerRole: 'student' }, createFakeDocument());
  assert.equal(mixed.querySelectorAll('.markdown-card').length, 2);

  const empty = renderCardRow(row({}, [
    card('hidden-a', { studentVisibility: 'teacherOnly' }),
    card('hidden-b', { studentVisibility: 'teacherOnly' }),
  ]), { viewerRole: 'student' }, createFakeDocument());
  assert.equal(empty, null);
});
