(() => {
  'use strict';
  const covers = ['superhero', 'animals', 'weekend', 'music', 'travel', 'careers', 'work-tech', 'global', 'communication', 'discussion'];
  const coverTitles = ['Супергерои', 'Животные', 'Выходные', 'Музыка', 'Путешествия', 'Профессии', 'Технологии', 'Мир', 'Общение', 'Дискуссия'];
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
      <label>Обложка<select name="cover">${covers.map((cover, i) => `<option value="/assets/images/lesson-${cover}.png">${coverTitles[i]}</option>`).join('')}</select></label>
      <img class="publication-cover" alt="Обложка урока" data-cover>
      <label class="publication-check" data-incomplete hidden><input type="checkbox" name="allowIncompleteImages">Опубликовать без всех иллюстраций</label>
    </div>
    <div class="publication-actions"><button type="button" data-unpublish hidden>Снять с публикации</button><button type="submit" data-submit>Опубликовать</button></div>
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
  form.elements.cover.addEventListener('change', () => { find('[data-cover]').src = form.elements.cover.value; });

  async function save(method) {
    if (busy || !draft) return;
    if (options.isDirty?.()) { error('Сохраните изменения в упражнениях перед публикацией.'); return; }
    if (method === 'POST' && !form.reportValidity()) return;
    lock(true); error('');
    try {
      const body = { expectedRevision: draft.publication?.revision || 0 };
      if (method === 'POST') Object.assign(body, {
        expectedUpdatedAt: draft.updatedAt,
        title: form.elements.title.value, description: form.elements.description.value,
        category: form.elements.category.value, duration: form.elements.duration.value,
        cover: form.elements.cover.value,
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
      form.reset(); error(''); find('[data-fields]').hidden = true;
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
        form.elements.cover.value = pub?.cover || '/assets/images/lesson-communication.png';
        find('[data-cover]').src = form.elements.cover.value;
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
