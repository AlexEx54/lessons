(() => {
  'use strict';

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitButton = document.getElementById('login-button');
  const errorBox = document.getElementById('login-error');

  function safeNextPath() {
    const next = new URLSearchParams(window.location.search).get('next') || '/app';
    return next.startsWith('/') && !next.startsWith('//') ? next : '/app';
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    errorBox.textContent = '';
    submitButton.disabled = true;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось войти.');
      window.location.assign(safeNextPath());
    } catch (error) {
      errorBox.textContent = error.message || 'Не удалось войти.';
      passwordInput.select();
      submitButton.disabled = false;
    }
  });
})();
