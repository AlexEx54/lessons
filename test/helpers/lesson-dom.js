'use strict';
// Minimal DOM for exercising lesson interaction without launching a browser.
function createDocument() {
  const elements = new Map();
  function element(tag) {
    const node = {
      tagName: tag.toUpperCase(), children: [], dataset: {}, attributes: {}, listeners: {}, style: { setProperty(name, value) { this[name] = value; } },
      className: '', textContent: '', hidden: false, disabled: false, value: '',
      append(...children) { children.forEach(child => { child.parentNode = this; }); this.children.push(...children); },
      replaceChildren(...children) { this.children = []; this.append(...children); },
      removeChild(child) { this.children = this.children.filter(node => node !== child); },
      insertBefore(child, before) {
        this.removeChild(child);
        const index = before ? this.children.indexOf(before) : this.children.length;
        this.children.splice(index, 0, child);
      },
      setAttribute(key, value) { this.attributes[key] = String(value); },
      removeAttribute(key) { delete this.attributes[key]; },
      contains(node) { return node === this || this.children.some(child => child.contains(node)); },
      closest(selector) {
        if (selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tagName === selector.toUpperCase()) return this;
        return this.parentNode?.closest(selector) || null;
      },
      remove() { this.parentNode?.removeChild(this); this.parentNode = null; },
      getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 40 }; },
      cloneNode() { const clone = element(tag); clone.className = this.className; clone.textContent = this.textContent; return clone; },
      getAttribute(key) { return this.attributes[key] ?? null; },
      addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); },
      removeEventListener(name, listener) { this.listeners[name] = (this.listeners[name] || []).filter(item => item !== listener); },
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
  const events = element('document');
  return {
    listeners: events.listeners,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    createTextNode: value => Object.assign(element('#text'), { textContent: value }),
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
