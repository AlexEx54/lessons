'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  normalizeGuidedRoleCards,
  renderGuidedRoleCards,
  visibleRoleKeys,
} = require('../assets/components/guided-role-cards.js');

function component(overrides = {}) {
  return {
    type: 'guidedRoleCards',
    id: 'guided-speaking-role-cards',
    roles: {
      student: {
        title: ' Student ',
        sections: {
          want: ' - Swim ', avoid: '- Shopping', secret: '- £15', mission: '- Ask a question', goal: '- Decide',
        },
      },
      teacher: {
        title: ' Teacher ',
        sections: {
          want: '- Cycle', avoid: '- Shopping', secret: '- Home at 5', mission: '- Suggest', goal: '- Decide',
        },
      },
    },
    ...overrides,
  };
}

test('normalizes role titles and fixed markdown sections', () => {
  const normalized = normalizeGuidedRoleCards(component());
  assert.equal(normalized.roles.student.title, 'Student');
  assert.equal(normalized.roles.teacher.title, 'Teacher');
  assert.equal(normalized.roles.student.sections.want, '- Swim');
  assert.deepEqual(Object.keys(normalized.roles.student.sections), ['want', 'avoid', 'secret', 'mission', 'goal']);
});

test('rejects attempts to change the fixed roles or section schema', () => {
  const missingRole = component();
  delete missingRole.roles.teacher;
  assert.throws(() => normalizeGuidedRoleCards(missingRole), /exactly student and teacher/);

  const missingSection = component();
  delete missingSection.roles.student.sections.goal;
  assert.throws(() => normalizeGuidedRoleCards(missingSection), /fixed section set/);

  const extraSection = component();
  extraSection.roles.teacher.sections.notes = '- Hidden';
  assert.throws(() => normalizeGuidedRoleCards(extraSection), /fixed section set/);

  assert.throws(() => normalizeGuidedRoleCards(component({ extra: true })), /unsupported fields/);
  assert.throws(() => normalizeGuidedRoleCards(component({ id: 'Bad id' })), /kebab-case/);
});

test('student visibility exposes only the student role', () => {
  assert.deepEqual(visibleRoleKeys('teacher'), ['student', 'teacher']);
  assert.deepEqual(visibleRoleKeys('student'), ['student']);
  assert.throws(() => visibleRoleKeys('admin'), /supported viewer role/);
});

function fakeDocument() {
  const textNode = value => ({ nodeType: 3, nodeValue: String(value), textContent: String(value), childNodes: [] });
  function element(tag) {
    const node = {
      nodeType: 1,
      tagName: String(tag).toUpperCase(),
      childNodes: [],
      attributes: {},
      dataset: {},
      listeners: {},
      _className: '',
      _text: '',
      get className() { return this._className; },
      set className(value) { this._className = String(value || ''); },
      classList: {
        contains(name) { return node._className.split(/\s+/).includes(name); },
        add(name) {
          const names = new Set(node._className.split(/\s+/).filter(Boolean));
          names.add(name); node._className = [...names].join(' ');
        },
        remove(name) {
          const names = new Set(node._className.split(/\s+/).filter(Boolean));
          names.delete(name); node._className = [...names].join(' ');
        },
        toggle(name, force) {
          const enabled = force === undefined ? !this.contains(name) : force;
          if (enabled) this.add(name); else this.remove(name);
          return enabled;
        },
      },
      setAttribute(name, value) { this.attributes[name] = String(value); },
      getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; },
      append(...children) {
        children.forEach((child) => {
          if (child == null) return;
          this.childNodes.push(typeof child === 'string' ? textNode(child) : child);
        });
      },
      replaceChildren(...children) { this.childNodes = []; this.append(...children); },
      addEventListener(type, handler) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(handler);
      },
      click() { (this.listeners.click || []).forEach(handler => handler({ preventDefault() {} })); },
      focus() {},
      get textContent() {
        return this.childNodes.length ? this.childNodes.map(child => child.textContent || '').join('') : this._text;
      },
      set textContent(value) { this.childNodes = []; this._text = String(value); },
    };
    return node;
  }
  return { createElement: element, createTextNode: textNode };
}

function descendants(node, result = []) {
  (node.childNodes || []).forEach((child) => { result.push(child); descendants(child, result); });
  return result;
}

test('student render never creates teacher content and starts face-down', () => {
  const rendered = renderGuidedRoleCards(component(), { viewerRole: 'student' }, fakeDocument());
  const nodes = descendants(rendered);
  const cards = nodes.filter(node => node.classList?.contains('guided-role-card'));
  assert.equal(cards.length, 1);
  assert.equal(cards[0].dataset.role, 'student');
  assert.doesNotMatch(rendered.textContent, /Teacher|Cycle|Home at 5/);
  const flipper = nodes.find(node => node.classList?.contains('guided-role-card__flipper'));
  assert.equal(flipper.getAttribute('aria-expanded'), 'false');
  assert.equal(cards[0].classList.contains('guided-role-card--open'), false);
  flipper.click();
  const openedCard = descendants(rendered).find(node => node.classList?.contains('guided-role-card'));
  assert.equal(openedCard.classList.contains('guided-role-card--open'), true);
});

test('review render exposes markdown-style edit controls', () => {
  const rendered = renderGuidedRoleCards(component(), { viewerRole: 'teacher', onSave: async () => component() }, fakeDocument());
  const edit = descendants(rendered).find(node => node.classList?.contains('guided-role-cards__edit'));
  assert.ok(edit);
  edit.click();
  assert.equal(rendered.classList.contains('guided-role-cards--editing'), true);
  assert.equal(descendants(rendered).filter(node => node.contentEditable === 'true').length, 12);
  assert.ok(descendants(rendered).some(node => node.classList?.contains('guided-role-cards__toolbar')));
});
