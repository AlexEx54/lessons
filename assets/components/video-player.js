(function initVideoPlayer(root) {
  'use strict';
  function normalizeVideoQuestions(questions = [], durationMs) {
    const fail = () => { throw new Error('Проверьте вопросы: время, текст, варианты и правильные ответы.'); };
    if (!Array.isArray(questions) || questions.length > 100) fail();
    const ids = new Set();
    return questions.map(q => {
      if (!q || typeof q.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(q.id) || ids.has(q.id)
        || !Number.isSafeInteger(q.atMs) || q.atMs < 0 || q.atMs > 86400000
        || (Number.isFinite(durationMs) && q.atMs >= durationMs)
        || !['vertical', 'horizontal'].includes(q.layout)
        || (q.wrongFeedback !== undefined && (typeof q.wrongFeedback !== 'string' || q.wrongFeedback.length > 1000))
        || !['single', 'multiple'].includes(q.mode) || typeof q.text !== 'string' || !q.text.trim() || q.text.length > 1000
        || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 8) fail();
      ids.add(q.id);
      const optionIds = new Set();
      const options = q.options.map(o => {
        if (!o || typeof o.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(o.id) || optionIds.has(o.id)
          || typeof o.text !== 'string' || !o.text.trim() || o.text.length > 500) fail();
        optionIds.add(o.id);
        return { id: o.id, text: o.text.trim() };
      });
      if (!Array.isArray(q.correctOptionIds) || !q.correctOptionIds.length
        || new Set(q.correctOptionIds).size !== q.correctOptionIds.length
        || q.correctOptionIds.some(id => !optionIds.has(id))
        || (q.mode === 'single' && q.correctOptionIds.length !== 1)) fail();
      return { id: q.id, atMs: q.atMs, mode: q.mode, layout: q.layout, wrongFeedback: (q.wrongFeedback || '').trim(), text: q.text.trim(), options, correctOptionIds: [...q.correctOptionIds] };
    }).sort((a, b) => a.atMs - b.atMs || a.id.localeCompare(b.id));
  }
  function normalizeVideoPlayer(data) {
    if (!data || data.type !== 'videoPlayer' || !/^[a-z][a-z0-9-]*$/.test(data.id) || typeof data.title !== 'string' || !data.title.trim()) throw new Error('Некорректный видеоплеер.');
    if (data.videoSrc && !/^\/api\/(?:lesson-draft-assets|library|classes)\/[a-zA-Z0-9/_-]+\.mp4$/.test(data.videoSrc)) throw new Error('Некорректный источник видео.');
    return { type: data.type, id: data.id, title: data.title.trim(), ...(data.videoSrc ? { videoSrc: data.videoSrc } : {}), ...(Number.isFinite(data.durationMs) ? { durationMs: data.durationMs } : {}), questions: normalizeVideoQuestions(data.questions, data.durationMs) };
  }
  function renderVideoPlayer(data, options = {}, documentRef = root.document) {
    let current = normalizeVideoPlayer(data);
    const doc = documentRef;
    const live = typeof options.sendMedia === 'function';
    let connected = options.connected !== false, peerPresent = Boolean(options.peerPresent), disposed = false;
    let blockedPlayback = false;
    let busy = false, pendingPosition = null, revision = -1, lastStatus = 0, desiredPlaying = false, playAttempt = 0;
    const section = doc.createElement('section');
    section.className = 'video-player'; section.dataset.componentId = current.id;
    const title = doc.createElement('h2'); title.textContent = current.title;
    const video = doc.createElement('video');
    video.preload = 'metadata'; video.playsInline = true;
    video.setAttribute('playsinline', '');
    const controls = doc.createElement('div'); controls.className = 'video-player__controls';
    const transport = doc.createElement('div'); transport.className = 'video-player__transport';
    controls.append(transport);
    const icons = {
      play: '<path d="m9 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
      pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
      align: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
    };
    function setIcon(node, icon, label) {
      if (node.dataset.icon !== icon) {
        node.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[icon]}</svg>`;
        node.dataset.icon = icon;
      }
      node.className = 'video-player__icon-button'; node.title = label; node.setAttribute('aria-label', label);
    }
    function button(label, handler) {
      const node = doc.createElement('button'); node.type = 'button'; node.textContent = label;
      node.addEventListener('click', handler); transport.append(node); return node;
    }
    const status = doc.createElement('p'); status.className = 'video-player__status'; status.setAttribute('aria-live', 'polite');
    const time = doc.createElement('span');
    const seek = doc.createElement('input'); seek.type = 'range'; seek.min = '0'; seek.max = '0'; seek.step = '0.1'; seek.value = '0'; seek.setAttribute('aria-label', 'Позиция видео');
    const peerStatus = doc.createElement('p'); peerStatus.className = 'video-player__peer-status';
    peerStatus.textContent = peerPresent ? 'Позиция ученика недоступна' : 'Ученик не подключён';
    const fmt = value => { const seconds = Math.max(0, Math.floor(value || 0)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
    function send(message) { if (live && connected && !disposed) options.sendMedia({ ...message, componentId: current.id }); }
    function report(force = false, blocked = blockedPlayback) {
      if (options.viewerRole !== 'student' || !live || (!force && Date.now() - lastStatus < 1000)) return;
      lastStatus = Date.now();
      send({ type: 'media-status', position: video.currentTime || 0, paused: video.paused, buffering: video.readyState < 3, blocked });
    }
    async function play() {
      if (activeQuestionId || editorQuestion || checkQuestion()) return;
      desiredPlaying = true;
      const attempt = ++playAttempt;
      try {
        await video.play();
        if (!desiredPlaying || disposed) video.pause();
        if (attempt === playAttempt) { enable.hidden = true; blockedPlayback = false; status.textContent = ''; report(true); }
      } catch {
        if (attempt !== playAttempt || !desiredPlaying || disposed) return;
        blockedPlayback = true; enable.hidden = false; status.textContent = 'Нажмите «Включить просмотр», чтобы разрешить воспроизведение.'; report(true, true);
      }
    }
    function pause() { blockedPlayback = false; desiredPlaying = false; playAttempt++; video.pause(); enable.hidden = true; }
    const toggle = button('', () => {
      const action = video.paused ? 'play' : 'pause';
      // Start directly within the gesture to satisfy browser autoplay policies.
      if (action === 'play') play(); else pause();
      send({ type: 'media-command', action });
    });
    const align = options.viewerRole === 'teacher' && live ? button('', () => send({ type: 'media-align', position: video.currentTime })) : null;
    if (align) { setIcon(align, 'align', 'Перемотать ученика к моей позиции'); controls.append(peerStatus); }
    const timeline = doc.createElement('div'); timeline.className = 'video-player__timeline';
    timeline.append(seek); transport.append(timeline, time); time.className = 'video-player__time';
    const enable = button('Включить просмотр', () => play()); enable.hidden = true;
    const volume = doc.createElement('input'); volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '0.05'; volume.value = '1'; volume.setAttribute('aria-label', 'Громкость');
    volume.addEventListener('input', () => { video.volume = Number(volume.value); }); transport.append(volume);
    button('⛶', () => section.requestFullscreen?.().catch(() => {})).setAttribute('aria-label', 'Полный экран');
    // Do not disable a native range while Safari still owns its drag gesture.
    // Defer question activation until the committed seek has released the mouse.
    let scrubbing = false, seekCommitTimer = null;
    seek.addEventListener('input', () => {
      if (activeQuestionId) return;
      scrubbing = true; video.currentTime = Number(seek.value); paint();
    });
    function finishSeek() {
      if (!scrubbing) return;
      root.clearTimeout(seekCommitTimer);
      seekCommitTimer = root.setTimeout(() => {
        seekCommitTimer = null; scrubbing = false;
        if (!disposed) { checkQuestion(); paint(); }
      }, 0);
    }
    seek.addEventListener('change', finishSeek);
    seek.addEventListener('blur', finishSeek);
    seek.addEventListener('pointercancel', finishSeek);
    const editing = typeof options.onSaveQuestions === 'function';
    let answers = options.questionAnswers || {}, activeQuestionId = null, selectedIds = [], answerPending = false;
    let feedbackTimer = null, feedbackQuestionId = null;
    function clearFeedbackTimer() {
      root.clearTimeout(feedbackTimer);
      feedbackTimer = null; feedbackQuestionId = null;
    }
    function scheduleResume(q) {
      if (feedbackQuestionId === q.id) return;
      clearFeedbackTimer(); feedbackQuestionId = q.id;
      feedbackTimer = root.setTimeout(() => {
        clearFeedbackTimer();
        if (disposed || activeQuestionId !== q.id || editorQuestion || busy || (live && !connected)) return;
        dismissed.add(q.id); activeQuestionId = null; selectedIds = [];
        saveProgress(); renderQuestion();
        if (!checkQuestion()) play();
        paint();
      }, 2000);
    }
    const dismissed = new Set();
    const previewAnswers = {};
    const progressKey = `video-questions:${root.location?.pathname || ''}:${options.viewerRole || ''}:${current.id}:${current.videoSrc}:${options.questionEpoch || 0}`;
    if (live) {
      try {
        const saved = JSON.parse(root.sessionStorage?.getItem(progressKey) || 'null');
        for (const id of saved?.dismissed || []) if (current.questions.some(q => q.id === id)) dismissed.add(id);
        if (current.questions.some(q => q.id === saved?.active)) activeQuestionId = saved.active;
      } catch { /* Storage may be unavailable. The lesson still works. */ }
    }
    function saveProgress() {
      if (live) try { root.sessionStorage?.setItem(progressKey, JSON.stringify({ active: activeQuestionId, dismissed: [...dismissed] })); } catch {}
    }
    const frame = doc.createElement('div'); frame.className = 'video-player__frame';
    const overlay = doc.createElement('div'); overlay.className = 'video-player__question'; overlay.hidden = true;
    overlay.setAttribute('role', 'group'); overlay.setAttribute('aria-label', 'Вопрос к видео');
    frame.append(video, overlay);
    const markers = doc.createElement('div'); markers.className = 'video-player__markers'; markers.setAttribute('aria-label', 'Вопросы на шкале видео');
    timeline.append(markers);
    const markerChoices = doc.createElement('div'); markerChoices.className = 'video-player__marker-choices'; markerChoices.hidden = true;
    controls.append(markerChoices);
    const editor = doc.createElement('form'); editor.className = 'video-player__editor'; editor.hidden = true;
    let editorQuestion = null, editorSaving = false;
    function el(tag, className, text) {
      const node = doc.createElement(tag); if (className) node.className = className;
      if (text !== undefined) node.textContent = text; return node;
    }
    function actionButton(label, handler, className = '') {
      const node = el('button', className, label); node.type = 'button'; node.addEventListener('click', handler); return node;
    }
    function activeQuestion() { return current.questions.find(q => q.id === activeQuestionId); }
    function checkQuestion() {
      if (scrubbing || editorQuestion || !current.videoSrc) return false;
      if (activeQuestionId) return true;
      const next = current.questions.find(q => !dismissed.has(q.id) && q.atMs <= Math.round(video.currentTime * 1000));
      if (!next) return false;
      activeQuestionId = next.id; selectedIds = []; saveProgress();
      pause(); video.currentTime = next.atMs / 1000; renderQuestion(); paint();
      return true;
    }
    function submitAnswer(q, ids) {
      if (disposed || activeQuestionId !== q.id || !ids.length || answerPending
        || (editing ? previewAnswers[q.id] : answers[q.id]) || (live && !connected)) return;
      selectedIds = [...ids];
      if (live && !editing) {
        answerPending = true; renderQuestion();
        options.onQuestionAnswer?.({ type: 'video-question-answer', componentId: current.id, questionId: q.id, selectedOptionIds: [...ids] });
      } else {
        (editing ? previewAnswers : answers)[q.id] = {
          selectedOptionIds: [...ids],
          correct: ids.length === q.correctOptionIds.length && q.correctOptionIds.every(id => ids.includes(id)),
        };
        renderQuestion();
      }
    }
    function renderQuestion() {
      overlay.replaceChildren();
      const q = activeQuestion(); overlay.hidden = !q;
      if (!q) { clearFeedbackTimer(); return; }
      const answer = editing ? previewAnswers[q.id] : answers[q.id];
      if (answer && !busy && (!live || connected)) scheduleResume(q);
      else clearFeedbackTimer();
      const heading = el('h3', 'video-player__question-title', !answer ? q.text
        : answer.correct ? '✓ Correct' : `✕ ${q.wrongFeedback || 'Wrong'}`);
      heading.dataset.result = !answer ? 'pending' : answer.correct ? 'correct' : 'wrong';
      const choices = el('div', 'video-player__choices'); choices.dataset.layout = q.layout;
      for (const option of q.options) {
        const chosen = (answer?.selectedOptionIds || selectedIds).includes(option.id);
        const disabled = Boolean(answer) || answerPending || (live && !connected);
        const choose = () => {
          if (disabled || activeQuestionId !== q.id) return;
          if (q.mode === 'single') { submitAnswer(q, [option.id]); return; }
          selectedIds = selectedIds.includes(option.id)
            ? selectedIds.filter(id => id !== option.id) : [...selectedIds, option.id];
          renderQuestion();
          overlay.querySelector(`[data-option-id="${option.id}"] input`)?.focus();
        };
        const choice = q.mode === 'single' ? actionButton('', choose, 'video-player__choice') : el('label', 'video-player__choice');
        choice.dataset.optionId = option.id;
        choice.dataset.selected = String(chosen);
        choice.dataset.disabled = String(disabled);
        choice.dataset.result = !answer ? 'pending' : !chosen ? 'muted' : answer.correct ? 'correct' : 'wrong';
        if (q.mode === 'multiple') {
          const checkbox = el('input'); checkbox.type = 'checkbox'; checkbox.checked = chosen;
          checkbox.disabled = disabled; checkbox.addEventListener('change', choose);
          choice.append(checkbox);
        } else {
          choice.disabled = disabled;
        }
        choice.append(el('span', '', option.text)); choices.append(choice);
      }
      const footer = el('div', 'video-player__question-footer');
      if (!answer && q.mode === 'multiple') {
        const submit = actionButton(answerPending ? 'Сохраняем…' : 'Проверить', () => submitAnswer(q, selectedIds), 'video-player__primary');
        submit.disabled = !selectedIds.length || answerPending || (live && !connected); footer.append(submit);
      } else if (!answer && answerPending) {
        footer.append(el('span', 'video-player__question-hint', 'Сохраняем…'));
      }
      if (editing) {
        footer.append(actionButton('Редактировать', () => openQuestionEditor(q)));
        footer.append(actionButton('Закрыть', () => {
          dismissed.add(q.id); activeQuestionId = null; selectedIds = [];
          renderQuestion(); paint();
        }));
      }
      overlay.append(heading, choices, footer);
    }
    function markersDisabled() {
      return busy || editorSaving || Boolean(editorQuestion) || (!editing && Boolean(activeQuestionId)) || (live && !connected);
    }
    function openMarkerQuestion(q) {
      if (markersDisabled()) return;
      markerChoices.hidden = true;
      if (editing) {
        delete previewAnswers[q.id]; selectedIds = []; activeQuestionId = q.id;
        pause(); video.currentTime = q.atMs / 1000; renderQuestion(); paint();
      } else {
        video.currentTime = q.atMs / 1000; checkQuestion(); paint();
      }
    }
    function renderMarkers() {
      markers.replaceChildren(); markerChoices.replaceChildren(); markerChoices.hidden = true;
      const duration = Number.isFinite(video.duration) ? video.duration * 1000 : current.durationMs;
      markers.hidden = !current.questions.length || !Number.isFinite(duration) || duration <= 0;
      if (markers.hidden) return;
      const groups = new Map();
      for (const q of current.questions) {
        if (!groups.has(q.atMs)) groups.set(q.atMs, []);
        groups.get(q.atMs).push(q);
      }
      for (const [atMs, questions] of groups) {
        const label = `${fmt(atMs / 1000)}: ${questions.map(q => q.text).join('; ')}`;
        const marker = actionButton(questions.length > 1 ? String(questions.length) : '◆', () => {
          if (markersDisabled()) return;
          if (questions.length === 1) { openMarkerQuestion(questions[0]); return; }
          markerChoices.replaceChildren(); markerChoices.hidden = false;
          for (const q of questions) markerChoices.append(actionButton(`${fmt(atMs / 1000)} · ${q.text}`, () => openMarkerQuestion(q)));
          markerChoices.append(actionButton('Закрыть список', () => { markerChoices.hidden = true; marker.focus?.(); }));
          markerChoices.querySelector('button')?.focus();
        }, 'video-player__marker');
        marker.title = label; marker.setAttribute('aria-label', `Вопросы на ${label}`);
        marker.style.left = `${Math.max(0, Math.min(100, atMs / duration * 100))}%`;
        marker.disabled = markersDisabled();
        markers.append(marker);
      }
    }
    function markDirty(value) { options.onDirtyChange?.(value, current.id); }
    function closeEditor() { editor.hidden = true; editorQuestion = null; markDirty(false); paint(); }
    function openQuestionEditor(question) {
      if (editorSaving || (editorQuestion && !root.confirm('Закрыть форму без сохранения?'))) return;
      activeQuestionId = null; selectedIds = []; renderQuestion(); markerChoices.hidden = true;
      pause();
      const uid = () => root.crypto.randomUUID();
      editorQuestion = question ? JSON.parse(JSON.stringify(question)) : {
        id: uid(), atMs: Math.round(video.currentTime * 1000), mode: 'single', layout: 'vertical', wrongFeedback: '', text: '',
        options: [{ id: uid(), text: '' }, { id: uid(), text: '' }], correctOptionIds: [],
      };
      if (question) video.currentTime = question.atMs / 1000;
      editor.hidden = false; markDirty(true); paintEditor(); paint();
      editor.querySelector('textarea')?.focus();
    }
    function paintEditor() {
      editor.replaceChildren();
      const q = editorQuestion;
      const fieldset = el('fieldset', 'video-player__editor-fields'); fieldset.disabled = editorSaving;
      fieldset.append(el('legend', '', current.questions.some(item => item.id === q.id) ? 'Редактировать вопрос' : 'Новый вопрос'));
      function field(label, input) { const wrap = el('label', 'video-player__field'); wrap.append(el('span', '', label), input); fieldset.append(wrap); }
      const timestamp = el('input'); timestamp.type = 'number'; timestamp.min = '0'; timestamp.step = '0.001'; timestamp.value = String(q.atMs / 1000);
      timestamp.required = true; timestamp.addEventListener('input', () => { q.atMs = Math.round(Number(timestamp.value) * 1000); }); field('Время, секунды', timestamp);
      const text = el('textarea'); text.value = q.text; text.required = true; text.maxLength = 1000; text.rows = 2;
      text.placeholder = 'Что произошло в этом фрагменте?'; text.addEventListener('input', () => { q.text = text.value; }); field('Вопрос', text);
      const mode = el('select');
      for (const [value, label] of [['single', 'Один правильный ответ'], ['multiple', 'Несколько правильных ответов']]) {
        const option = el('option', '', label); option.value = value; mode.append(option);
      }
      mode.value = q.mode; mode.addEventListener('change', () => { q.mode = mode.value; if (q.mode === 'single') q.correctOptionIds = q.correctOptionIds.slice(0, 1); paintEditor(); }); field('Тип вопроса', mode);
      const layout = el('div', 'video-player__layout-toggle');
      layout.setAttribute('role', 'group'); layout.setAttribute('aria-label', 'Расположение ответов');
      for (const [value, label] of [['horizontal', 'Горизонтально'], ['vertical', 'Вертикально']]) {
        const button = actionButton(label, () => {
          q.layout = value;
          for (const item of layout.children) item.setAttribute('aria-pressed', String(item.dataset.layout === value));
        });
        button.dataset.layout = value; button.setAttribute('aria-pressed', String(q.layout === value)); layout.append(button);
      }
      fieldset.append(el('span', 'video-player__editor-hint', 'Расположение ответов'), layout);
      const feedback = el('textarea'); feedback.value = q.wrongFeedback; feedback.maxLength = 1000; feedback.rows = 2;
      feedback.placeholder = 'Wrong'; feedback.addEventListener('input', () => { q.wrongFeedback = feedback.value; });
      field('Пояснение при ошибке (необязательно)', feedback);
      fieldset.append(el('p', 'video-player__editor-hint', 'Отметьте правильные варианты слева.'));
      q.options.forEach((option, index) => {
        const row = el('div', 'video-player__option-editor');
        const correct = el('input'); correct.type = q.mode === 'single' ? 'radio' : 'checkbox'; correct.name = `correct-${q.id}`;
        correct.checked = q.correctOptionIds.includes(option.id); correct.setAttribute('aria-label', `Вариант ${index + 1} правильный`);
        correct.addEventListener('change', () => {
          q.correctOptionIds = q.mode === 'single' ? [option.id] : correct.checked
            ? [...q.correctOptionIds.filter(id => id !== option.id), option.id] : q.correctOptionIds.filter(id => id !== option.id);
        });
        const value = el('input'); value.type = 'text'; value.value = option.text; value.required = true; value.maxLength = 500;
        value.placeholder = `Вариант ${index + 1}`; value.setAttribute('aria-label', value.placeholder); value.addEventListener('input', () => { option.text = value.value; });
        const remove = actionButton('×', () => { q.options = q.options.filter(o => o.id !== option.id); q.correctOptionIds = q.correctOptionIds.filter(id => id !== option.id); paintEditor(); });
        remove.disabled = q.options.length <= 2; remove.setAttribute('aria-label', `Удалить вариант ${index + 1}`);
        row.append(correct, value, remove); fieldset.append(row);
      });
      const add = actionButton('+ Вариант ответа', () => { q.options.push({ id: root.crypto.randomUUID(), text: '' }); paintEditor(); }); add.disabled = q.options.length >= 8; fieldset.append(add);
      const actions = el('div', 'video-player__editor-actions');
      const save = el('button', 'video-player__primary', editorSaving ? 'Сохраняем…' : 'Сохранить вопрос'); save.type = 'submit';
      actions.append(save, actionButton('Отмена', closeEditor));
      if (current.questions.some(item => item.id === q.id)) actions.append(actionButton('Удалить вопрос', () => persistQuestions(current.questions.filter(item => item.id !== q.id))));
      fieldset.append(actions); editor.append(fieldset);
    }
    async function persistQuestions(questions) {
      if (editorSaving) return;
      try {
        const normalized = normalizeVideoQuestions(questions, current.durationMs || (Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined));
        editorSaving = true; paintEditor(); paint();
        current = normalizeVideoPlayer(await options.onSaveQuestions(normalized, current.id, current.videoSrc));
        for (const id of Object.keys(previewAnswers)) delete previewAnswers[id];
        dismissed.clear(); closeEditor(); renderMarkers(); status.textContent = 'Вопросы сохранены.';
      } catch (error) { status.textContent = error.message || 'Не удалось сохранить вопросы.'; }
      finally { editorSaving = false; if (editorQuestion) paintEditor(); paint(); renderMarkers(); }
    }
    editor.addEventListener('submit', event => {
      event.preventDefault(); if (editorQuestion) persistQuestions([...current.questions.filter(q => q.id !== editorQuestion.id), editorQuestion]);
    });
    const addQuestion = editing ? actionButton('+ Добавить вопрос', () => openQuestionEditor(null), 'video-player__add-question') : null;
    if (addQuestion) controls.append(addQuestion);
    section.updateQuestionState = (next, pending = false) => {
      const changed = JSON.stringify(answers) !== JSON.stringify(next) || answerPending !== pending;
      answers = next; answerPending = pending;
      if (changed) renderQuestion();
    };

    function paint() {
      const ready = Boolean(current.videoSrc) && !busy && !editorSaving && !editorQuestion && !activeQuestionId && (!live || connected);
      if (addQuestion) { addQuestion.disabled = !current.videoSrc || busy || editorSaving || Boolean(editorQuestion) || !Number.isFinite(video.duration); addQuestion.textContent = `+ Добавить вопрос · ${fmt(video.currentTime)}`; }
      for (const marker of markers.children) marker.disabled = markersDisabled();
      if (markersDisabled()) markerChoices.hidden = true;
      toggle.disabled = !ready; enable.disabled = !ready; seek.disabled = !ready || !Number.isFinite(video.duration);
      if (align) align.disabled = !ready || !peerPresent || !Number.isFinite(video.duration);
      setIcon(toggle, video.paused ? 'play' : 'pause', video.paused ? 'Смотреть' : 'Пауза');
      seek.max = String(Number.isFinite(video.duration) ? video.duration : 0); seek.value = String(video.currentTime || 0);
      time.textContent = `${fmt(video.currentTime)} / ${fmt(video.duration)}`;
    }
    for (const event of ['play', 'pause', 'timeupdate', 'waiting', 'playing', 'seeked', 'ended']) video.addEventListener(event, () => { if (['timeupdate', 'seeked', 'play'].includes(event)) { if (activeQuestionId) { if (!video.paused) pause(); } else checkQuestion(); } paint(); report(event !== 'timeupdate'); });
    video.addEventListener('loadedmetadata', () => {
      if (pendingPosition !== null) { video.currentTime = Math.min(pendingPosition, video.duration); pendingPosition = null; }
      if (activeQuestion()) { pause(); video.currentTime = activeQuestion().atMs / 1000; renderQuestion(); }
      renderMarkers(); paint(); report(true);
    });
    video.addEventListener('error', () => { status.textContent = 'Не удалось загрузить видео. Попробуйте открыть урок заново.'; });
    const fileControls = doc.createElement('div'); fileControls.className = 'video-player__files';
    if (options.onUpload) {
      const input = doc.createElement('input'); input.type = 'file'; input.accept = 'video/mp4,.mp4'; input.hidden = true;
      const upload = doc.createElement('button'); upload.type = 'button'; upload.textContent = 'Загрузить / заменить видео'; upload.addEventListener('click', () => input.click());
      const remove = doc.createElement('button'); remove.type = 'button'; remove.textContent = 'Удалить видео';
      async function change(file) {
        if (busy || editorSaving) return;
        if ((current.questions.length || editorQuestion) && !root.confirm('При замене или удалении видео вопросы будут удалены. Продолжить?')) return;
        if (file && file.size > 300 * 1024 * 1024) { status.textContent = 'Видео должно быть не больше 300 МБ.'; return; }
        clearFeedbackTimer(); busy = true; upload.disabled = remove.disabled = true; pause(); paint(); status.textContent = file ? 'Загружаем и проверяем видео…' : 'Удаляем видео…';
        try {
          current = normalizeVideoPlayer(await (file ? options.onUpload(file, current.id) : options.onDelete(current.id)));
          closeEditor(); dismissed.clear(); activeQuestionId = null; answers = {}; renderQuestion(); renderMarkers();
          setSource(); status.textContent = file ? 'Видео загружено.' : 'Видео удалено.';
        } catch (error) { status.textContent = error.message || 'Не удалось сохранить видео.'; }
        finally { busy = false; upload.disabled = remove.disabled = false; renderQuestion(); paint(); }
      }
      input.addEventListener('change', () => { if (input.files[0]) change(input.files[0]); input.value = ''; });
      remove.addEventListener('click', () => change(null));
      const hint = doc.createElement('span'); hint.textContent = 'MP4 · H.264/AAC · до 300 МБ';
      fileControls.append(upload, remove, input, hint);
    }
    function setSource() {
      pause(); pendingPosition = null;
      if (current.videoSrc) video.src = current.videoSrc;
      else video.removeAttribute('src');
      video.hidden = controls.hidden = !current.videoSrc;
      video.load(); paint();
    }
    let peerUpdated = 0;
    const timer = live ? root.setInterval(() => {
      report(true);
      if (align && Date.now() - peerUpdated > 3500) { peerStatus.textContent = peerPresent ? 'Позиция ученика недоступна' : 'Ученик не подключён'; }
    }, 1000) : null;
    section.receiveMedia = message => {
      if (message.type === 'media-status') {
        if (!align) return;
        peerUpdated = Date.now();
        peerStatus.textContent = `Позиция ученика: ${fmt(message.position)}${message.blocked ? ' · требуется включить просмотр' : message.buffering ? ' · загружается…' : message.paused ? ' · пауза' : ''}`;
        return;
      }
      if (message.revision <= revision) return;
      revision = message.revision;
      if (message.type === 'media-align') {
        if (activeQuestionId) return;
        if (video.readyState > 0) video.currentTime = Math.min(message.position, video.duration);
        else pendingPosition = message.position;
        checkQuestion();
      } else if (message.action === 'play') play(); else pause();
    };
    section.setMediaConnection = (value, peer) => {
      if (!value) revision = -1;
      const connectionChanged = connected !== value;
      connected = value; peerPresent = peer;
      if (connectionChanged) renderQuestion();
      if (!connected || !peerPresent) { pause(); peerUpdated = 0; if (align) { peerStatus.textContent = 'Ученик не подключён'; } }
      paint();
    };
    section.dispose = () => { disposed = true; root.clearTimeout(seekCommitTimer); clearFeedbackTimer(); if (timer) root.clearInterval(timer); pause(); video.removeAttribute('src'); video.load(); };
    section.append(title, frame, controls, editor, fileControls, status); setSource(); renderMarkers(); renderQuestion();
    if (!current.videoSrc) status.textContent = 'Видео пока не загружено.';
    return section;
  }
  const api = { normalizeVideoQuestions, normalizeVideoPlayer, renderVideoPlayer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.VideoPlayerComponent = api;
})(typeof window !== 'undefined' ? window : globalThis);
