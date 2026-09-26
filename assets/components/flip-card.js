(function initFlipCard(root) {
  'use strict';
  // Shared controller: callers own the faces and their visual styling.
  function bindFlipCard({ shell, flipper, cover, content, trigger = flipper, closeButton,
    label, expanded = false, editing = false, openClass = 'flip-card--open', onExpandedChange }) {
    let open = expanded || editing;
    function update() {
      shell.classList.toggle(openClass, open);
      if (!editing) {
        trigger.setAttribute('aria-expanded', String(open));
        trigger.setAttribute('aria-label', `${open ? 'Скрыть' : 'Открыть'} карточку ${label}`);
      }
      cover.setAttribute('aria-hidden', String(open));
      content.setAttribute('aria-hidden', String(!open));
      (open ? cover : content).setAttribute('inert', '');
      (open ? content : cover).removeAttribute('inert');
    }
    function setExpanded(value) {
      if (editing) return;
      open = Boolean(value); update(); onExpandedChange?.(open);
      if (closeButton) (open ? closeButton : trigger).focus?.();
    }
    if (!editing) {
      trigger.tabIndex = 0;
      trigger.setAttribute('role', 'button');
      trigger.addEventListener('click', () => setExpanded(!open));
      // Native buttons already synthesize click for Enter/Space.
      if (trigger.tagName !== 'BUTTON') trigger.addEventListener('keydown', event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault(); setExpanded(!open);
      });
      closeButton?.addEventListener('click', () => setExpanded(false));
    }
    update();
    return { setExpanded };
  }
  const api = { bindFlipCard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.FlipCardComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
