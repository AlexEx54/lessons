(() => {
  'use strict';

  const AVATAR_SIZE = 256;
  const form = document.getElementById('settings-form');
  const preview = document.getElementById('settings-avatar-preview');
  const uploadButton = document.getElementById('settings-avatar-upload');
  const removeButton = document.getElementById('settings-avatar-remove');
  const fileInput = document.getElementById('settings-avatar-input');
  const errorMessage = document.getElementById('settings-error');
  let user = null;

  async function request(url, options) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Не удалось связаться с сервером.');
    return payload;
  }

  function showError(message = '') {
    errorMessage.textContent = message;
    errorMessage.hidden = !message;
  }

  function setBusy(busy) {
    form.inert = busy;
    form.setAttribute('aria-busy', String(busy));
  }

  function selectedDefaultAvatarSrc() {
    return form.querySelector('[name="defaultAvatar"]:checked')?.parentElement.querySelector('img').getAttribute('src');
  }

  // Updates every avatar on the page, including the header, without touching unsaved form fields.
  function applyAvatar(nextUser) {
    user = nextUser;
    removeButton.hidden = !user.customAvatarUrl;
    document.querySelectorAll('[data-user-avatar]').forEach(image => { image.src = user.avatarUrl; });
  }

  function applyProfile(nextUser) {
    form.elements.displayName.value = nextUser.displayName;
    form.elements.defaultAvatar.value = nextUser.defaultAvatar;
    document.querySelectorAll('[data-user-name]').forEach(element => { element.textContent = nextUser.displayName; });
    applyAvatar(nextUser);
  }

  // Crops the central square and scales it down, so the server only receives a small ready-made avatar.
  async function squareAvatar(file) {
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('Не удалось прочитать изображение. Выберите JPG, PNG или WebP.');
    }
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext('2d');
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    bitmap.close();
    // Browsers without WebP encoding return PNG, which the server accepts as well.
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Не удалось обработать изображение.'))), 'image/webp', 0.9);
    });
  }

  async function uploadAvatar(file) {
    showError();
    setBusy(true);
    try {
      const blob = await squareAvatar(file);
      const payload = await request('/api/profile/avatar', {
        method: 'PUT',
        headers: { 'Content-Type': blob.type },
        body: blob,
      });
      applyAvatar(payload.user);
      window.AppShell.showToast('Фото обновлено.');
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    showError();
    setBusy(true);
    try {
      const payload = await request('/api/profile/avatar', { method: 'DELETE' });
      applyAvatar(payload.user);
      // The default avatar may already be changed in the form but not saved yet.
      preview.src = selectedDefaultAvatarSrc();
      window.AppShell.showToast('Фото удалено.');
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    showError();
    setBusy(true);
    try {
      const payload = await request('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.elements.displayName.value,
          defaultAvatar: form.elements.defaultAvatar.value,
        }),
      });
      applyProfile(payload.user);
      window.AppShell.showToast('Настройки сохранены.');
    } catch (error) {
      showError(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    try {
      const payload = await request('/api/auth/me');
      applyProfile(payload.user);
      form.inert = false;
    } catch (error) {
      window.AppShell.showToast(error.message);
    }
  }

  uploadButton.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    if (file) uploadAvatar(file);
  });
  removeButton.addEventListener('click', removeAvatar);
  form.addEventListener('change', event => {
    if (event.target.name === 'defaultAvatar' && !user.customAvatarUrl) preview.src = selectedDefaultAvatarSrc();
  });
  form.addEventListener('submit', saveProfile);
  load();
})();
