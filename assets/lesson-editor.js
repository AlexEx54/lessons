(() => {
  'use strict';
  if (/^\/classes\//.test(window.location.pathname)) return;

  const state = {
    lesson: null,
    draftId: '',
    draftStatus: '',
    activeIndex: 0,
    elapsedSeconds: 0,
    timer: null,
    dirtyComponents: new Set(),
    imageGeneration: null,
    imagePollTimer: null,
  };
  const byId = id => document.getElementById(id);
  const content = byId('lesson-content');
  const loading = byId('lesson-loading');
  const errorBox = byId('lesson-error');
  const toast = byId('lesson-toast');
  let toastTimer;
  const imageBanner = byId('image-generation-banner');
  const imageGenerationStop = byId('image-generation-stop');
  const imageGenerationStart = byId('image-generation-start');

  function syncImageGenerationBannerHeight() {
    const height = imageBanner.hidden ? 0 : imageBanner.getBoundingClientRect().height;
    document.documentElement.style.setProperty('--image-generation-banner-height', `${height}px`);
  }

  function updateImageGenerationBanner() {
    const generation = state.imageGeneration;
    imageBanner.hidden = !generation;
    if (!generation) {
      syncImageGenerationBannerHeight();
      return;
    }
    const labels = {
      pending: 'Изображения ожидают запуска',
      running: `Готовим изображения: ${generation.completed} из ${generation.total}`,
      completed: generation.total > 0 ? 'Все изображения готовы' : 'В уроке нет изображений для генерации',
      stopped: `Генерация остановлена: ${generation.completed} из ${generation.total}`,
      unavailable: 'Draw Things сейчас недоступен',
      failed: 'Не удалось завершить генерацию изображений',
    };
    byId('image-generation-title').textContent = labels[generation.status] || 'Генерация изображений';
    byId('image-generation-message').textContent = generation.errorMessage
      || (['pending', 'running'].includes(generation.status)
        ? 'Черновик можно просматривать и редактировать во время генерации.'
        : '');
    const progress = byId('image-generation-progress');
    progress.hidden = generation.total <= 0;
    byId('image-generation-progress-value').style.width = generation.total > 0
      ? `${Math.min(100, (generation.completed / generation.total) * 100)}%`
      : '0%';
    imageGenerationStop.hidden = !['pending', 'running'].includes(generation.status);
    imageGenerationStart.hidden = !['stopped', 'unavailable', 'failed'].includes(generation.status);
    syncImageGenerationBannerHeight();
  }

  function mergeGeneratedImages(target, fresh) {
    if (!target || !fresh || typeof target !== 'object' || typeof fresh !== 'object') return;
    if (!Array.isArray(target) && !Array.isArray(fresh)
      && typeof target.imagePrompt === 'string'
      && target.imagePrompt.trim() === String(fresh.imagePrompt || '').trim()
      && typeof fresh.imageSrc === 'string' && fresh.imageSrc.trim()) {
      target.imageSrc = fresh.imageSrc;
    }
    if (Array.isArray(target) && Array.isArray(fresh)) {
      target.forEach((item, index) => mergeGeneratedImages(item, fresh[index]));
      return;
    }
    if (!Array.isArray(target) && !Array.isArray(fresh)) {
      Object.keys(target).forEach(key => mergeGeneratedImages(target[key], fresh[key]));
    }
  }

  function scheduleImageGenerationPoll() {
    window.clearTimeout(state.imagePollTimer);
    state.imagePollTimer = null;
    if (['pending', 'running'].includes(state.imageGeneration?.status)) {
      state.imagePollTimer = window.setTimeout(refreshImageGeneration, 2000);
    }
  }

  async function refreshImageGeneration() {
    try {
      const response = await fetch(`/api/lesson-drafts/${encodeURIComponent(state.draftId)}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.draft) throw new Error(payload.error || 'Не удалось обновить изображения.');
      state.imageGeneration = payload.draft.imageGeneration;
      if (state.lesson && payload.draft.content) {
        mergeGeneratedImages(state.lesson, payload.draft.content);
        if (state.dirtyComponents.size === 0) renderStageContent(state.lesson.stages[state.activeIndex]);
      }
      updateImageGenerationBanner();
    } catch (_error) {
      // The next scheduled refresh or a page reload can recover a transient polling failure.
    } finally {
      scheduleImageGenerationPoll();
    }
  }

  async function changeImageGeneration(action, button) {
    button.disabled = true;
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/image-generation/${action}`,
        { method: 'POST' },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.draft) throw new Error(payload.error || 'Не удалось изменить генерацию изображений.');
      state.imageGeneration = payload.draft.imageGeneration;
      updateImageGenerationBanner();
      scheduleImageGenerationPoll();
    } catch (error) {
      showToast(error.message || 'Не удалось изменить генерацию изображений.');
    } finally {
      button.disabled = false;
    }
  }

  const componentOptions = {
    teacherNote: () => ({
      onSave: state.draftStatus === 'review' ? saveTeacherNote : undefined,
      onDirtyChange: (dirty, noteId) => {
        if (dirty) state.dirtyComponents.add(noteId);
        else state.dirtyComponents.delete(noteId);
      },
      onError: showToast,
    }),
    taskPrompt: () => ({
      onSave: state.draftStatus === 'review' ? saveTaskPrompt : undefined,
      onDirtyChange: (dirty, promptId) => {
        if (dirty) state.dirtyComponents.add(promptId);
        else state.dirtyComponents.delete(promptId);
      },
      onError: showToast,
    }),
    thisOrThat: () => ({
      showImagePrompts: state.draftStatus !== 'readonly',
      onUpload: state.draftStatus === 'review' ? uploadThisOrThatImage : undefined,
      onDelete: state.draftStatus === 'review' ? deleteThisOrThatImage : undefined,
      onMessage: showToast,
    }),
    matchWords: () => ({
      showImagePrompts: state.draftStatus !== 'readonly',
      onUpload: state.draftStatus === 'review' ? uploadMatchWordsImage : undefined,
      onDelete: state.draftStatus === 'review' ? deleteMatchWordsImage : undefined,
      onMessage: showToast,
    }),
    dropdownChoice: () => ({
      onSave: state.draftStatus === 'review' ? saveDropdownChoice : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    gapFill: () => ({
      onSave: state.draftStatus === 'review' ? saveGapFill : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    fillInBlanks: () => ({
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveFillInBlanks : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    dragWordsInText: () => ({
      onSave: state.draftStatus === 'review' ? saveDragWordsInText : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    personalizedQuestions: () => ({
      onSave: state.draftStatus === 'review' ? savePersonalizedQuestions : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    describeAndGuess: () => ({
      onSave: state.draftStatus === 'review' ? saveDescribeAndGuess : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    howToPlay: () => ({
      onSave: state.draftStatus === 'review' ? saveHowToPlay : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    guidedRoleCards: () => ({
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveGuidedRoleCards : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    speakingSupport: () => ({
      onSave: state.draftStatus === 'review' ? saveSpeakingSupport : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    threeTwoOne: () => ({
      onSave: state.draftStatus === 'review' ? saveThreeTwoOne : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    selfAssessment: () => ({
      onSave: state.draftStatus === 'review' ? saveSelfAssessment : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    textPanel: () => ({
      onSave: state.draftStatus === 'review' ? saveTextPanel : undefined,
      onDirtyChange: (dirty, panelId) => {
        if (dirty) state.dirtyComponents.add(panelId);
        else state.dirtyComponents.delete(panelId);
      },
      onMessage: showToast,
    }),
    illustratedTextPanel: () => ({
      onSave: state.draftStatus === 'review' ? saveIllustratedTextPanel : undefined,
      onDirtyChange: (dirty, panelId) => {
        if (dirty) state.dirtyComponents.add(panelId);
        else state.dirtyComponents.delete(panelId);
      },
      onUpload: state.draftStatus === 'review' ? uploadIllustratedTextPanelImage : undefined,
      onDelete: state.draftStatus === 'review' ? deleteIllustratedTextPanelImage : undefined,
      onMessage: showToast,
    }),
    miniSituation: () => ({
      onSave: state.draftStatus === 'review' ? saveMiniSituation : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
      onSituationSave: state.draftStatus === 'review' ? saveIllustratedTextPanel : undefined,
      onSituationUpload: state.draftStatus === 'review' ? uploadIllustratedTextPanelImage : undefined,
      onSituationDelete: state.draftStatus === 'review' ? deleteIllustratedTextPanelImage : undefined,
      onMessage: showToast,
    }),
    multipleChoice: () => ({
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveMultipleChoice : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    oddOneOut: () => ({
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveOddOneOut : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    factOrMyth: () => ({
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveFactOrMyth : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    checkboxChoice: () => ({
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveCheckboxChoice : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    storyCards: () => ({
      onSave: state.draftStatus === 'review' ? saveStoryCards : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onMessage: showToast,
    }),
    textReading: () => ({
      onSave: state.draftStatus === 'review' ? saveTextReading : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onUpload: state.draftStatus === 'review' ? uploadTextReadingImage : undefined,
      onDelete: state.draftStatus === 'review' ? deleteTextReadingImage : undefined,
      onMessage: showToast,
    }),
    audioPlayer: () => ({
      onSave: state.draftStatus === 'review' ? saveAudioPlayer : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onUpload: state.draftStatus === 'review' ? uploadAudioPlayerAudio : undefined,
      onDelete: state.draftStatus === 'review' ? deleteAudioPlayerAudio : undefined,
      onMessage: showToast,
    }),
    markdownCard: () => ({
      viewerRole: 'teacher',
      studentVisible: false,
      onSave: state.draftStatus === 'review' ? saveMarkdownCard : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    cardRow: () => ({
      viewerRole: 'teacher',
      studentVisible: false,
      onSave: state.draftStatus === 'review' ? saveMarkdownCard : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('lesson-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('lesson-toast--visible'), 2600);
  }

  const { render, renderStageContent, formatTime } = window.LessonView.create({
    state,
    componentOptions: component => {
      const options = componentOptions[component.type]?.() || {};
      // Linked answer keys are edited through their exercise to avoid two sources of truth.
      if (component.type === 'markdownCard' && component.id.endsWith('-answer-key')) {
        const exerciseId = component.id.slice(0, -'-answer-key'.length);
        if (findComponent(state.lesson, 'oddOneOut', exerciseId)) options.onSave = undefined;
        if (findComponent(state.lesson, 'factOrMyth', exerciseId)) options.onSave = undefined;
      }
      return options;
    },
    beforeSelect: () => {
      if (state.dirtyComponents.size === 0) return true;
      if (!window.confirm('Есть несохранённые изменения. Отменить их и перейти к другой стадии?')) return false;
      state.dirtyComponents.clear();
      return true;
    },
  });

  // Единая точка поиска компонентов: вложенные дети (например панель внутри
  // miniSituation или карточки внутри cardRow) находит общий обходчик,
  // потому что сами компоненты регистрируют свои слоты в ComponentTree.
  function findComponent(lesson, type, componentId) {
    const [match] = window.ComponentTree.findComponentMatches(lesson?.stages || [], type, componentId);
    return match || null;
  }

  function findTeacherNote(lesson, noteId) {
    return findComponent(lesson, 'teacherNote', noteId);
  }

  function findTaskPrompt(lesson, promptId) {
    return findComponent(lesson, 'taskPrompt', promptId);
  }

  function findThisOrThat(lesson, componentId) {
    return findComponent(lesson, 'thisOrThat', componentId);
  }

  function findMatchWords(lesson, componentId) {
    return findComponent(lesson, 'matchWords', componentId);
  }

  function findTextPanel(lesson, panelId) {
    return findComponent(lesson, 'textPanel', panelId);
  }

  function findIllustratedTextPanel(lesson, panelId) {
    return findComponent(lesson, 'illustratedTextPanel', panelId);
  }

  function findMiniSituation(lesson, componentId) {
    return findComponent(lesson, 'miniSituation', componentId);
  }

  function findTextReading(lesson, componentId) {
    return findComponent(lesson, 'textReading', componentId);
  }

  function findAudioPlayer(lesson, componentId) {
    return findComponent(lesson, 'audioPlayer', componentId);
  }

  function findMarkdownCard(lesson, componentId) {
    return findComponent(lesson, 'markdownCard', componentId);
  }

  function findFillInBlanks(lesson, componentId) {
    return findComponent(lesson, 'fillInBlanks', componentId);
  }

  function findDragWordsInText(lesson, componentId) {
    return findComponent(lesson, 'dragWordsInText', componentId);
  }

  function findDropdownChoice(lesson, componentId) {
    return findComponent(lesson, 'dropdownChoice', componentId);
  }

  function findGapFill(lesson, componentId) {
    return findComponent(lesson, 'gapFill', componentId);
  }

  function findPersonalizedQuestions(lesson, componentId) {
    return findComponent(lesson, 'personalizedQuestions', componentId);
  }

  function findMultipleChoice(lesson, componentId) {
    return findComponent(lesson, 'multipleChoice', componentId);
  }

  function findCheckboxChoice(lesson, componentId) {
    return findComponent(lesson, 'checkboxChoice', componentId);
  }

  function findDescribeAndGuess(lesson, componentId) {
    return findComponent(lesson, 'describeAndGuess', componentId);
  }

  function findHowToPlay(lesson, componentId) {
    return findComponent(lesson, 'howToPlay', componentId);
  }

  function findGuidedRoleCards(lesson, componentId) {
    return findComponent(lesson, 'guidedRoleCards', componentId);
  }

  function findSpeakingSupport(lesson, componentId) {
    return findComponent(lesson, 'speakingSupport', componentId);
  }

  function findThreeTwoOne(lesson, componentId) {
    return findComponent(lesson, 'threeTwoOne', componentId);
  }

  function findSelfAssessment(lesson, componentId) {
    return findComponent(lesson, 'selfAssessment', componentId);
  }

  function thisOrThatImageUrl(componentId, itemId, optionId) {
    return `/api/lesson-drafts/${encodeURIComponent(state.draftId)}`
      + `/this-or-that/${encodeURIComponent(componentId)}`
      + `/items/${encodeURIComponent(itemId)}`
      + `/options/${encodeURIComponent(optionId)}/image`;
  }

  async function updateThisOrThatImage(method, componentId, itemId, optionId, file) {
    try {
      const response = await fetch(thisOrThatImageUrl(componentId, itemId, optionId), {
        method,
        headers: file ? { 'Content-Type': file.type } : undefined,
        body: file || undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить изображение.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findThisOrThat(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый This or That не найден в черновике.');
      showToast(method === 'DELETE' ? 'Изображение удалено.' : 'Изображение сохранено.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить изображение.');
      throw error;
    }
  }

  function uploadThisOrThatImage(file, componentId, itemId, optionId) {
    return updateThisOrThatImage('PUT', componentId, itemId, optionId, file);
  }

  function deleteThisOrThatImage(componentId, itemId, optionId) {
    return updateThisOrThatImage('DELETE', componentId, itemId, optionId);
  }

  function matchWordsImageUrl(componentId, itemId) {
    return `/api/lesson-drafts/${encodeURIComponent(state.draftId)}`
      + `/match-words/${encodeURIComponent(componentId)}`
      + `/items/${encodeURIComponent(itemId)}/image`;
  }

  async function updateMatchWordsImage(method, componentId, itemId, file) {
    try {
      const response = await fetch(matchWordsImageUrl(componentId, itemId), {
        method,
        headers: file ? { 'Content-Type': file.type } : undefined,
        body: file || undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить изображение Match the Words.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findMatchWords(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Match the Words не найден в черновике.');
      showToast(method === 'DELETE' ? 'Изображение удалено.' : 'Изображение сохранено.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить изображение Match the Words.');
      throw error;
    }
  }

  function uploadMatchWordsImage(file, componentId, itemId) {
    return updateMatchWordsImage('PUT', componentId, itemId, file);
  }

  function deleteMatchWordsImage(componentId, itemId) {
    return updateMatchWordsImage('DELETE', componentId, itemId);
  }

  function illustratedTextPanelImageUrl(panelId, side) {
    return `/api/lesson-drafts/${encodeURIComponent(state.draftId)}`
      + `/illustrated-text-panels/${encodeURIComponent(panelId)}`
      + `/pictures/${encodeURIComponent(side)}/image`;
  }

  async function updateIllustratedTextPanelImage(method, panelId, side, file) {
    try {
      const response = await fetch(illustratedTextPanelImageUrl(panelId, side), {
        method,
        headers: file ? { 'Content-Type': file.type } : undefined,
        body: file || undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить изображение иллюстрированной панели.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findIllustratedTextPanel(state.lesson, panelId);
      if (!saved) throw new Error('Сохранённая иллюстрированная текстовая панель не найдена в черновике.');
      showToast(method === 'DELETE' ? 'Изображение удалено.' : 'Изображение сохранено.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить изображение иллюстрированной панели.');
      throw error;
    }
  }

  function uploadIllustratedTextPanelImage(file, panelId, side) {
    return updateIllustratedTextPanelImage('PUT', panelId, side, file);
  }

  function deleteIllustratedTextPanelImage(panelId, side) {
    return updateIllustratedTextPanelImage('DELETE', panelId, side);
  }

  function textReadingImageUrl(componentId, side) {
    return `/api/lesson-drafts/${encodeURIComponent(state.draftId)}`
      + `/text-readings/${encodeURIComponent(componentId)}`
      + `/pictures/${encodeURIComponent(side)}/image`;
  }

  async function updateTextReadingImage(method, componentId, side, file) {
    try {
      const response = await fetch(textReadingImageUrl(componentId, side), {
        method,
        headers: file ? { 'Content-Type': file.type } : undefined,
        body: file || undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить изображение текста для чтения.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findTextReading(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый текст для чтения не найден в черновике.');
      showToast(method === 'DELETE' ? 'Изображение удалено.' : 'Изображение сохранено.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить изображение текста для чтения.');
      throw error;
    }
  }

  function uploadTextReadingImage(file, componentId, side) {
    return updateTextReadingImage('PUT', componentId, side, file);
  }

  function deleteTextReadingImage(componentId, side) {
    return updateTextReadingImage('DELETE', componentId, side);
  }

  function audioPlayerAudioUrl(componentId) {
    return `/api/lesson-drafts/${encodeURIComponent(state.draftId)}`
      + `/audio-player/${encodeURIComponent(componentId)}/audio`;
  }

  async function updateAudioPlayerAudio(method, componentId, file) {
    try {
      const response = await fetch(audioPlayerAudioUrl(componentId), {
        method,
        headers: file ? { 'Content-Type': file.type } : undefined,
        body: file || undefined,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить аудио.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findAudioPlayer(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый аудиоплеер не найден в черновике.');
      showToast(method === 'DELETE' ? 'Аудио удалено.' : 'Аудио сохранено.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить аудио.');
      throw error;
    }
  }

  function uploadAudioPlayerAudio(file, componentId) {
    return updateAudioPlayerAudio('PUT', componentId, file);
  }

  function deleteAudioPlayerAudio(componentId) {
    return updateAudioPlayerAudio('DELETE', componentId);
  }

  async function saveTeacherNote(changes, noteId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/teacher-notes/${encodeURIComponent(noteId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Teacher’s Notes.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const savedNote = findTeacherNote(state.lesson, noteId);
      if (!savedNote) throw new Error('Сохранённая Teacher’s Notes не найдена в черновике.');
      showToast('Teacher’s Notes сохранена.');
      return savedNote;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Teacher’s Notes.');
      throw error;
    }
  }

  async function saveTaskPrompt(changes, promptId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/task-prompts/${encodeURIComponent(promptId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить блок задания.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const savedPrompt = findTaskPrompt(state.lesson, promptId);
      if (!savedPrompt) throw new Error('Сохранённый блок задания не найден в черновике.');
      showToast('Блок задания сохранён.');
      return savedPrompt;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить блок задания.');
      throw error;
    }
  }

  async function saveTextPanel(changes, panelId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/text-panels/${encodeURIComponent(panelId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить текстовую панель.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const savedPanel = findTextPanel(state.lesson, panelId);
      if (!savedPanel) throw new Error('Сохранённая текстовая панель не найдена в черновике.');
      showToast('Текстовая панель сохранена.');
      return savedPanel;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить текстовую панель.');
      throw error;
    }
  }

  async function saveMiniSituation(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/mini-situation/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Mini Situation.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findMiniSituation(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Mini Situation не найден в черновике.');
      showToast('Mini Situation сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Mini Situation.');
      throw error;
    }
  }

  async function saveIllustratedTextPanel(changes, panelId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/illustrated-text-panels/${encodeURIComponent(panelId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить иллюстрированную текстовую панель.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const savedPanel = findIllustratedTextPanel(state.lesson, panelId);
      if (!savedPanel) throw new Error('Сохранённая иллюстрированная текстовая панель не найдена в черновике.');
      showToast('Иллюстрированная текстовая панель сохранена.');
      return savedPanel;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить иллюстрированную текстовую панель.');
      throw error;
    }
  }

  async function saveAudioPlayer(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/audio-player/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить аудиоплеер.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findAudioPlayer(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый аудиоплеер не найден в черновике.');
      showToast('Аудиоплеер сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить аудиоплеер.');
      throw error;
    }
  }

  async function saveStoryCards(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/story-cards/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить карточки историй.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findComponent(state.lesson, 'storyCards', componentId);
      if (!saved) throw new Error('Сохранённые карточки историй не найдены в черновике.');
      showToast('Карточки историй сохранены.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить карточки историй.');
      throw error;
    }
  }

  async function saveTextReading(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/text-readings/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить текст для чтения.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findTextReading(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый текст для чтения не найден в черновике.');
      showToast('Текст для чтения сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить текст для чтения.');
      throw error;
    }
  }

  async function saveMarkdownCard(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/markdown-cards/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить карточку.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findMarkdownCard(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённая карточка не найдена в черновике.');
      showToast('Карточка сохранена.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить карточку.');
      throw error;
    }
  }

  async function saveFillInBlanks(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/fill-in-blanks/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Fill in the Blanks.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findFillInBlanks(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Fill in the Blanks не найден в черновике.');
      showToast('Fill in the Blanks сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Fill in the Blanks.');
      throw error;
    }
  }

  async function saveDragWordsInText(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/drag-words-in-text/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Complete the Rule.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findDragWordsInText(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Complete the Rule не найден в черновике.');
      showToast('Complete the Rule сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Complete the Rule.');
      throw error;
    }
  }

  async function saveDropdownChoice(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/dropdown-choice/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Dropdown Choice.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findDropdownChoice(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Dropdown Choice не найден в черновике.');
      showToast('Dropdown Choice сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Dropdown Choice.');
      throw error;
    }
  }

  async function saveGapFill(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/gap-fill/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Gap Fill.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findGapFill(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Gap Fill не найден в черновике.');
      showToast('Gap Fill сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Gap Fill.');
      throw error;
    }
  }

  async function savePersonalizedQuestions(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/personalized-questions/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Personalised Questions.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findPersonalizedQuestions(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Personalised Questions не найден в черновике.');
      showToast('Personalised Questions сохранены.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Personalised Questions.');
      throw error;
    }
  }

  async function saveMultipleChoice(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/multiple-choice/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Multiple Choice.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findMultipleChoice(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Multiple Choice не найден в черновике.');
      showToast('Multiple Choice сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Multiple Choice.');
      throw error;
    }
  }

  async function saveOddOneOut(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/odd-one-out/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Odd One Out.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findComponent(state.lesson, 'oddOneOut', componentId);
      if (!saved) throw new Error('Сохранённый Odd One Out не найден в черновике.');
      showToast('Задание и ключ ответов сохранены.');
      window.setTimeout(() => renderStageContent(state.lesson.stages[state.activeIndex], true), 0);
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Odd One Out.');
      throw error;
    }
  }

  async function saveFactOrMyth(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/fact-or-myth/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Fact or Myth.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findComponent(state.lesson, 'factOrMyth', componentId);
      if (!saved) throw new Error('Сохранённый Fact or Myth не найден в черновике.');
      showToast('Задание и ключ ответов сохранены.');
      window.setTimeout(() => renderStageContent(state.lesson.stages[state.activeIndex], true), 0);
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Fact or Myth.');
      throw error;
    }
  }

  async function saveCheckboxChoice(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/checkbox-choice/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Checkbox Choice.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findCheckboxChoice(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Checkbox Choice не найден в черновике.');
      showToast('Checkbox Choice сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Checkbox Choice.');
      throw error;
    }
  }

  async function saveDescribeAndGuess(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/describe-and-guess/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Describe and Guess.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findDescribeAndGuess(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Describe and Guess не найден в черновике.');
      showToast('Describe and Guess сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Describe and Guess.');
      throw error;
    }
  }

  async function saveHowToPlay(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/how-to-play/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить How to Play.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findHowToPlay(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый How to Play не найден в черновике.');
      showToast('How to Play сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить How to Play.');
      throw error;
    }
  }

  async function saveGuidedRoleCards(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/guided-role-cards/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить role cards.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findGuidedRoleCards(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённые role cards не найдены в черновике.');
      showToast('Role cards сохранены.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить role cards.');
      throw error;
    }
  }

  async function saveSpeakingSupport(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/speaking-support/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Speaking Support.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findSpeakingSupport(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Speaking Support не найден в черновике.');
      showToast('Speaking Support сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Speaking Support.');
      throw error;
    }
  }

  async function saveThreeTwoOne(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/three-two-one/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить 3–2–1.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findThreeTwoOne(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый 3–2–1 не найден в черновике.');
      showToast('3–2–1 сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить 3–2–1.');
      throw error;
    }
  }

  async function saveSelfAssessment(changes, componentId) {
    try {
      const response = await fetch(
        `/api/lesson-drafts/${encodeURIComponent(state.draftId)}/self-assessment/${encodeURIComponent(componentId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(changes),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Не удалось сохранить Self-assessment.');
      if (!payload.draft?.content) throw new Error('Сервер вернул некорректный черновик.');
      state.lesson = payload.draft.content;
      state.draftStatus = payload.draft.status;
      const saved = findSelfAssessment(state.lesson, componentId);
      if (!saved) throw new Error('Сохранённый Self-assessment не найден в черновике.');
      showToast('Self-assessment сохранён.');
      return saved;
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить Self-assessment.');
      throw error;
    }
  }

  function showError(message) {
    loading.hidden = true;
    content.hidden = true;
    errorBox.hidden = false;
    byId('lesson-error-message').textContent = message;
  }

  async function loadLesson() {
    const libraryMatch = window.location.pathname.match(/^\/library\/([^/]+)\/?$/);
    const match = libraryMatch || window.location.pathname.match(/^\/lesson-drafts\/([^/]+)\/edit\/?$/);
    if (!match) return showError('Некорректная ссылка на урок.');
    try {
      const response = await fetch(`/api/${libraryMatch ? 'library' : 'lesson-drafts'}/${encodeURIComponent(decodeURIComponent(match[1]))}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Черновик урока не найден.');
      if (libraryMatch) {
        state.draftStatus = 'readonly';
        document.querySelector('.end-lesson').href = '/library.html';
        document.querySelector('.end-lesson span').textContent = 'В библиотеку';
        render(payload.lesson.content);
        window.LessonNotes.mount({ mode: 'library', content: payload.lesson.content.notes });
        return;
      }
      if (!payload.draft?.content?.stages?.length) throw new Error('В черновике пока нет структуры урока.');
      state.draftId = payload.draft.id;
      byId('publish-lesson').hidden = payload.draft.status !== 'review';
      byId('publish-lesson').textContent = payload.draft.publication ? 'Публикация урока' : 'Добавить в библиотеку';
      state.draftStatus = payload.draft.status;
      state.imageGeneration = payload.draft.imageGeneration;
      render(payload.draft.content);
      window.LessonNotes.mount({ mode: 'draft', id: state.draftId });
      updateImageGenerationBanner();
      scheduleImageGenerationPoll();
    } catch (error) {
      showError(error.message || 'Не удалось загрузить структуру урока.');
    }
  }

  byId('publish-lesson').addEventListener('click', async () => {
    try { await window.LessonNotes.flush(); } catch (error) { showToast(error.message); return; }
    window.LessonPublication.open(state.draftId, {
      isDirty: () => state.dirtyComponents.size > 0 || window.LessonNotes.isDirty(),
      onChange: () => { byId('publish-lesson').textContent = 'Публикация урока'; },
    });
  });
  byId('teacher-screen').addEventListener('click', () => showToast('Экран преподавателя уже открыт.'));
  imageGenerationStop.addEventListener('click', () => changeImageGeneration('stop', imageGenerationStop));
  imageGenerationStart.addEventListener('click', () => changeImageGeneration('start', imageGenerationStart));
  window.addEventListener('resize', syncImageGenerationBannerHeight);
  byId('lesson-timer').addEventListener('click', () => {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
      byId('timer-icon').textContent = '▶';
      return;
    }
    byId('timer-icon').textContent = 'Ⅱ';
    state.timer = window.setInterval(() => {
      state.elapsedSeconds += 1;
      byId('elapsed-time').textContent = formatTime(state.elapsedSeconds);
    }, 1000);
  });
  window.addEventListener('pagehide', () => {
    window.clearInterval(state.timer);
    window.clearTimeout(state.imagePollTimer);
  });
  window.addEventListener('beforeunload', (event) => {
    if (state.dirtyComponents.size === 0) return;
    event.preventDefault();
    event.returnValue = '';
  });
  loadLesson();
})();
