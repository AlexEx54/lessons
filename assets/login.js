(() => {
  'use strict';

  const form = document.getElementById('login-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const submitButton = document.getElementById('login-button');
  const errorBox = document.getElementById('login-error');
  const yandexLink = document.getElementById('yandex-login');
  const params = new URLSearchParams(window.location.search);
  const REQUEST_TIMEOUT_MS = 20_000;
  const CONNECTION_ERROR = 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.';

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

  // A lost or stalled response becomes a readable error instead of a form that waits forever.
  async function requestLogin() {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    let responseText;
    try {
      response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }),
        signal: controller.signal,
      });
      responseText = await response.text();
    } catch (_error) {
      throw new Error(CONNECTION_ERROR);
    } finally {
      window.clearTimeout(timeout);
    }

    let payload = {};
    try {
      payload = JSON.parse(responseText);
    } catch (_error) {
      // A proxy error page is not JSON; the form falls back to its own message.
    }
    return { response, payload };
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    errorBox.textContent = '';
    submitButton.disabled = true;

    try {
      const { response, payload } = await requestLogin();
      if (!response.ok) throw new Error(payload.error || 'Не удалось войти.');
      window.location.assign(safeNextPath());
    } catch (error) {
      errorBox.textContent = error.message || 'Не удалось войти.';
      passwordInput.select();
      submitButton.disabled = false;
    }
  });
})();
