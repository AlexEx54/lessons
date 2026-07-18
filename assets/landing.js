(() => {
  'use strict';

  const body = document.body;
  const menuToggle = document.getElementById('menu-toggle');
  const toast = document.getElementById('landing-toast');
  let toastTimer = null;

  function setMenu(open) {
    body.classList.toggle('nav-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  }

  function showToast(label) {
    toast.textContent = `${label}: раздел скоро появится.`;
    toast.classList.add('landing-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('landing-toast--visible'), 2400);
  }

  menuToggle.addEventListener('click', () => setMenu(!body.classList.contains('nav-open')));

  document.querySelectorAll('[data-soon]').forEach(button => {
    button.addEventListener('click', () => {
      setMenu(false);
      showToast(button.dataset.soon);
    });
  });

  document.querySelectorAll('.landing-nav a, .landing-actions a').forEach(link => {
    link.addEventListener('click', () => setMenu(false));
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') setMenu(false);
  });

  window.matchMedia('(min-width: 861px)').addEventListener('change', event => {
    if (event.matches) setMenu(false);
  });
})();
