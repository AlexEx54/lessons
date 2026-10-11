(() => {
  'use strict';

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitButton = document.getElementById('login-button');
  const errorBox = document.getElementById('login-error');
  const yandexLink = document.getElementById('yandex-login');
  const params = new URLSearchParams(window.location.search);

  const YANDEX_ERRORS = {
    yandex_denied: 'Вход через Яндекс отменён.',
    yandex_failed: 'Не удалось войти через Яндекс. Попробуйте ещё раз.',
    yandex_no_email: 'В аккаунте Яндекса не указан email. Добавьте его в Яндекс ID или войдите по почте.',
    yandex_conflict: 'Этот email уже привязан к другому аккаунту Яндекса.',
    account_blocked: 'Аккаунт заблокирован.',
  };

  function safeNextPath() {
    const next = params.get('next') || '/app';
    return next.startsWith('/') && !next.startsWith('//') ? next : '/app';
  }

  errorBox.textContent = YANDEX_ERRORS[params.get('error')] || '';
  yandexLink.href = `/api/auth/yandex?next=${encodeURIComponent(safeNextPath())}`;

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
