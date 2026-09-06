(() => {
  'use strict';
  const skills = ['Vocabulary', 'Speaking', 'Listening', 'Writing', 'Grammar'];
  const dialog = document.createElement('dialog');
  dialog.className = 'publication-dialog';
  dialog.innerHTML = `<form class="publication-form">
    <div class="publication-heading"><h2 id="publication-title">Добавить в библиотеку</h2><button type="button" data-close aria-label="Закрыть">×</button></div>
    <p data-intro>В библиотеке будет сохранена отдельная версия урока. Черновик останется доступен для правок.</p>
    <p data-error role="alert" hidden></p>
    <div data-fields>
      <label>Название<input name="title" required maxlength="120"></label>
      <label>Краткое описание<textarea name="description" required maxlength="500" rows="3"></textarea></label>
      <p data-profile></p>
      <div class="publication-row"><label>Категория<select name="category"><option>General English</option><option>Speaking</option><option>Grammar</option><option>ОГЭ / ЕГЭ</option></select></label>
      <label>Длительность<input name="duration" required maxlength="40" placeholder="45 мин"></label></div>
      <fieldset><legend>Навыки</legend>${skills.map(skill => `<label class="publication-check"><input type="checkbox" name="skills" value="${skill}">${skill}</label>`).join('')}</fieldset>
      <section class="publication-artwork">
        <h3>Обложка урока</h3>
        <p>Создайте картинку в удобном генераторе и загрузите её сюда.</p>
        <div data-prompt-block class="publication-prompt">
          <div class="publication-prompt-heading"><strong>Промпт для генерации</strong><button type="button" data-copy>Скопировать промпт</button></div>
          <textarea data-prompt readonly rows="4" aria-label="Промпт для генерации обложки"></textarea>
          <span data-copy-status role="status"></span>
        </div>
        <div class="publication-drop" data-drop>
          <img class="publication-cover" alt="Предпросмотр обложки урока" data-cover hidden>
          <p data-upload-hint>Перетащите изображение сюда</p>
          <button type="button" data-choose>Выбрать изображение</button>
          <input type="file" name="coverFile" accept="image/png,image/jpeg,image/webp" hidden>
          <small>PNG, JPEG или WebP · до 5 МБ · рекомендуем 16:10</small>
        </div>
      </section>
      <label class="publication-check" data-incomplete hidden><input type="checkbox" name="allowIncompleteImages">Опубликовать без всех иллюстраций</label>
    </div>
    <div class="publication-actions"><button type="button" data-unpublish hidden>Снять с публикации</button><button type="submit" data-submit>Опубликовать</button></div>
    <section data-success class="publication-success" hidden>
      <div class="publication-success-symbol" aria-hidden="true">✦</div>
      <p class="publication-eyebrow">ЕЩЁ ОДИН УРОК — БОЛЬШЕ ВОЗМОЖНОСТЕЙ</p>
      <h2 data-success-title tabindex="-1">Ваш урок теперь в библиотеке!</h2>
      <p>Всё готово к новым занятиям. Пусть этот урок станет началом интересного разговора!</p>
      <article class="publication-success-card"><img data-success-cover alt="Обложка опубликованного урока"><div><h3 data-success-name></h3><p data-success-profile></p></div></article>
      <a data-success-open class="publication-primary">Открыть урок →</a>
      <button type="button" data-return>Вернуться к редактированию</button>
    </section>
    <a data-open hidden>Открыть урок в библиотеке →</a>
  </form>`;
  dialog.setAttribute('aria-labelledby', 'publication-title');
  document.body.append(dialog);
  const form = dialog.querySelector('form');
  const find = selector => dialog.querySelector(selector);
  let draft = null;
  let options = {};
  let trigger = null;
  let busy = false;
  let coverUpload = null;
  let currentCover = null;
  function error(message) { find('[data-error]').textContent = message; find('[data-error]').hidden = !message; }
  function lock(value) {
    busy = value;
    form.querySelectorAll('button, input, select, textarea').forEach(element => { element.disabled = value; });
  }
  function sync() {
    const publication = draft.publication;
    find('#publication-title').textContent = publication ? 'Публикация урока' : 'Добавить в библиотеку';
    find('[data-submit]').textContent = publication?.is_published ? 'Обновить опубликованную версию' : 'Опубликовать';
    find('[data-unpublish]').hidden = !publication?.is_published;
    find('[data-open]').hidden = !publication?.is_published;
    if (publication) find('[data-open]').href = `/library/${encodeURIComponent(publication.id)}`;
  }
  function hasMissingImages(value) {
    if (!value || typeof value !== 'object') return false;
    if (typeof value.imagePrompt === 'string' && value.imagePrompt.trim() && !value.imageSrc?.trim()) return true;
    return Object.values(value).some(hasMissingImages);
  }
  function close() { if (!busy) dialog.close(); }
  find('[data-close]').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => trigger?.focus());
  find('[data-return]').addEventListener('click', close);
  find('[data-choose]').addEventListener('click', () => form.elements.coverFile.click());
  find('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(find('[data-prompt]').value);
      find('[data-copy-status]').textContent = 'Скопировано!';
    } catch {
      find('[data-prompt]').focus(); find('[data-prompt]').select();
      find('[data-copy-status]').textContent = 'Нажмите Ctrl+C или ⌘C, чтобы скопировать выделенный промпт.';
    }
  });
  async function selectCover(file) {
    if (!file || busy) return;
    error('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { error('Выберите PNG, JPEG или WebP.'); return; }
    if (!file.size || file.size > 5 * 1024 * 1024) { error('Изображение должно быть не больше 5 МБ.'); return; }
    lock(true);
    try {
      const url = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
      });
      const preview = new Image(); preview.src = url; await preview.decode();
      coverUpload = { type: file.type, data: url.split(',')[1] };
      find('[data-cover]').src = url; find('[data-cover]').hidden = false;
      find('[data-choose]').textContent = 'Заменить изображение';
      find('[data-upload-hint]').textContent = 'Так обложка будет выглядеть в библиотеке';
    } catch { error('Не удалось прочитать изображение. Выберите другой файл.'); }
    finally { lock(false); form.elements.coverFile.value = ''; }
  }
  form.elements.coverFile.addEventListener('change', () => selectCover(form.elements.coverFile.files[0]));
  const drop = find('[data-drop]');
  drop.addEventListener('dragover', event => { event.preventDefault(); if (!busy) drop.classList.add('is-dragging'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
  drop.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('is-dragging'); selectCover(event.dataTransfer.files[0]); });
  function showSuccess(wasPublished) {
    find('[data-fields]').hidden = true;
    find('[data-intro]').hidden = true;
    find('.publication-actions').hidden = true;
    find('[data-open]').hidden = true;
    find('#publication-title').textContent = 'Готово!';
    find('[data-success-title]').textContent = wasPublished ? 'Урок обновлён!' : 'Ваш урок теперь в библиотеке!';
    find('[data-success-cover]').src = draft.publication.cover;
    find('[data-success-name]').textContent = draft.publication.title;
    find('[data-success-profile]').textContent = find('[data-profile]').textContent;
    find('[data-success-open]').href = `/library/${encodeURIComponent(draft.publication.id)}`;
    find('[data-success]').hidden = false;
    dialog.scrollTop = 0;
    find('[data-success-title]').focus();
  }

  async function save(method) {
    if (busy || !draft) return;
    if (options.isDirty?.()) { error('Сохраните изменения в упражнениях перед публикацией.'); return; }
    if (method === 'POST' && !form.reportValidity()) return;
    if (method === 'POST' && !coverUpload && !currentCover) { error('Загрузите обложку урока перед публикацией.'); find('[data-choose]').focus(); return; }
    const wasPublished = draft.publication?.is_published;
    lock(true); error('');
    try {
      const body = { expectedRevision: draft.publication?.revision || 0 };
      if (method === 'POST') Object.assign(body, {
        expectedUpdatedAt: draft.updatedAt,
        title: form.elements.title.value, description: form.elements.description.value,
        category: form.elements.category.value, duration: form.elements.duration.value,
        cover: currentCover, ...(coverUpload ? { coverUpload } : {}),
        skills: [...form.querySelectorAll('[name="skills"]:checked')].map(input => input.value),
        allowIncompleteImages: form.elements.allowIncompleteImages.checked,
      });
      const response = await fetch(`/api/lesson-drafts/${encodeURIComponent(draft.id)}/publication`, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить публикацию.');
      draft.publication = payload.publication;
      sync();
      find('[data-intro]').textContent = method === 'POST'
        ? 'Версия сохранена в библиотеке. Следующие изменения черновика попадут туда только после обновления публикации.'
        : 'Урок скрыт из библиотеки. Вы можете опубликовать его снова.';
      if (method === 'POST') showSuccess(wasPublished);
      options.onChange?.(payload.publication);
    } catch (err) { error(err.message); }
    finally { lock(false); }
  }
  form.addEventListener('submit', event => { event.preventDefault(); save('POST'); });
  find('[data-unpublish]').addEventListener('click', () => save('DELETE'));
  window.LessonPublication = {
    async open(draftId, config = {}) {
      if (dialog.open) return;
      options = config; trigger = document.activeElement; draft = null;
      form.reset(); error(''); coverUpload = null; currentCover = null;
      find('[data-success]').hidden = true; find('[data-intro]').hidden = false;
      find('.publication-actions').hidden = false; find('[data-copy-status]').textContent = '';
      find('[data-cover]').hidden = true; find('[data-cover]').removeAttribute('src');
      find('[data-choose]').textContent = 'Выбрать изображение';
      find('[data-upload-hint]').textContent = 'Перетащите изображение сюда'; find('[data-fields]').hidden = true;
      find('[data-open]').hidden = true; find('[data-unpublish]').hidden = true;
      find('[data-intro]').textContent = 'Загружаем данные урока…';
      dialog.showModal(); lock(true);
      try {
        if (options.isDirty?.()) throw new Error('Сохраните изменения в упражнениях перед публикацией.');
        const response = await fetch(`/api/lesson-drafts/${encodeURIComponent(draftId)}`, { cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Не удалось загрузить черновик.');
        draft = payload.draft;
        if (draft.status !== 'review') throw new Error('Дождитесь завершения генерации урока.');
        const pub = draft.publication;
        const meta = draft.content?.meta || {};
        form.elements.title.value = pub?.title || meta.title || draft.topic;
        form.elements.description.value = pub?.description || meta.description || '';
        form.elements.category.value = pub?.category || 'General English';
        form.elements.duration.value = pub?.duration || `${meta.durationMinutes || 45} мин`;
        currentCover = pub?.cover || null;
        if (currentCover) { find('[data-cover]').src = currentCover; find('[data-cover]').hidden = false; find('[data-choose]').textContent = 'Заменить изображение'; }
        find('[data-prompt]').value = meta.coverImagePrompt || '';
        find('[data-prompt-block]').hidden = !meta.coverImagePrompt;
        form.querySelectorAll('[name="skills"]').forEach(input => { input.checked = (pub?.skills || ['Vocabulary', 'Speaking']).includes(input.value); });
        find('[data-profile]').textContent = `${draft.ageGroup.replace('-', '–')} лет · ${draft.level}`;
        find('[data-incomplete]').hidden = !hasMissingImages(draft.content);
        find('[data-fields]').hidden = false;
        find('[data-intro]').textContent = 'В библиотеке будет сохранена отдельная версия урока. Черновик останется доступен для правок.';
        sync();
      } catch (err) { error(err.message); find('[data-intro]').textContent = ''; }
      finally {
        lock(false);
        if (!draft || draft.status !== 'review') find('[data-submit]').disabled = true;
        if (draft?.status === 'review') form.elements.title.focus();
        else find('[data-close]').focus();
      }
    },
  };
})();
