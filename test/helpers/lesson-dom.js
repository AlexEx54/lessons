'use strict';
// Minimal DOM for exercising lesson interaction without launching a browser.
function createDocument() {
  const elements = new Map();
  function element(tag) {
    const node = {
      tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {}, listeners: {}, style: {},
      className: '', textContent: '', hidden: false, disabled: false,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      getAttribute(key) { return this.attributes[key] ?? null; },
      addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); },
      click() { if (!this.disabled) for (const listener of this.listeners.click || []) listener({}); },
      querySelectorAll(selector) {
        const matches = [];
        const visit = child => {
          if (selector.startsWith('.') ? child.classList.contains(selector.slice(1)) : child.tagName === selector.toUpperCase()) matches.push(child);
          child.children.forEach(visit);
        };
        this.children.forEach(visit);
        return matches;
      },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
    };
    node.classList = {
      contains: name => node.className.split(/\s+/).includes(name),
      toggle(name, enabled) {
        const classes = new Set(node.className.split(/\s+/).filter(Boolean));
        if (enabled ?? !classes.has(name)) classes.add(name); else classes.delete(name);
        node.className = [...classes].join(' ');
      },
      add(name) { this.toggle(name, true); },
      remove(name) { this.toggle(name, false); },
    };
    return node;
  }
  return {
    createElement: element,
    createElementNS: (_namespace, tag) => element(tag),
    getElementById: id => {
      if (!elements.has(id)) elements.set(id, element('div'));
      return elements.get(id);
    },
    body: element('body'),
  };
}
module.exports = { createDocument };
