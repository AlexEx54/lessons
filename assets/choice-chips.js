(() => {
  'use strict';

  // Chips such as a class's level and age work as radio groups: one tab stop each, arrows move the choice.
  const options = group => [...group.querySelectorAll('[role="radio"]')];
  const value = group => group.querySelector('[aria-checked="true"]')?.dataset.value ?? null;

  function pick(group, chosen, shouldFocus = false) {
    const all = options(group);
    const current = all.find(option => option.dataset.value === chosen);
    group.removeAttribute('aria-invalid');
    all.forEach(option => {
      option.setAttribute('aria-checked', String(option === current));
      option.tabIndex = option === (current ?? all[0]) ? 0 : -1;
    });
    if (shouldFocus) current?.focus();
  }

  // onPick runs after every choice the user makes, by click or by arrow key.
  function bind(group, onPick) {
    group.addEventListener('click', event => {
      const option = event.target.closest('[role="radio"]');
      if (!option) return;
      pick(group, option.dataset.value);
      onPick();
    });
    group.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      const all = options(group);
      const step = ['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1;
      event.preventDefault();
      pick(group, all[(all.indexOf(document.activeElement) + step + all.length) % all.length].dataset.value, true);
      onPick();
    });
  }

  // Marks every group left empty and focuses the first one; returns the empty groups.
  function markMissing(groups) {
    const missing = groups.filter(group => !value(group));
    missing.forEach(group => group.setAttribute('aria-invalid', 'true'));
    missing[0]?.querySelector('[tabindex="0"]').focus();
    return missing;
  }

  window.ChoiceChips = Object.freeze({ value, pick, bind, markMissing });
})();
