(() => {
  'use strict';

  const state = {
    lesson: null,
    draftId: '',
    draftStatus: '',
    activeIndex: 0,
    elapsedSeconds: 0,
    timer: null,
    dirtyComponents: new Set(),
  };
  const byId = id => document.getElementById(id);
  const plan = byId('lesson-plan');
  const stages = byId('lesson-stages');
  const content = byId('lesson-content');
  const loading = byId('lesson-loading');
  const errorBox = byId('lesson-error');
  const toast = byId('lesson-toast');
  let toastTimer;

  const componentRenderers = {
    teacherNote: component => window.TeacherNoteComponent.renderTeacherNote(component, {
      onSave: state.draftStatus === 'review' ? saveTeacherNote : undefined,
      onDirtyChange: (dirty, noteId) => {
        if (dirty) state.dirtyComponents.add(noteId);
        else state.dirtyComponents.delete(noteId);
      },
      onError: showToast,
    }),
    taskPrompt: component => window.TaskPromptComponent.renderTaskPrompt(component, {
      onSave: state.draftStatus === 'review' ? saveTaskPrompt : undefined,
      onDirtyChange: (dirty, promptId) => {
        if (dirty) state.dirtyComponents.add(promptId);
        else state.dirtyComponents.delete(promptId);
      },
      onError: showToast,
    }),
    thisOrThat: component => window.ThisOrThatComponent.renderThisOrThat(component, {
      onUpload: state.draftStatus === 'review' ? uploadThisOrThatImage : undefined,
      onDelete: state.draftStatus === 'review' ? deleteThisOrThatImage : undefined,
      onMessage: showToast,
    }),
    matchWords: component => window.MatchWordsComponent.renderMatchWords(component, {
      onUpload: state.draftStatus === 'review' ? uploadMatchWordsImage : undefined,
      onDelete: state.draftStatus === 'review' ? deleteMatchWordsImage : undefined,
      onMessage: showToast,
    }),
    dropdownChoice: component => window.DropdownChoiceComponent.renderDropdownChoice(component, {
      onSave: state.draftStatus === 'review' ? saveDropdownChoice : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    gapFill: component => window.GapFillComponent.renderGapFill(component, {
      onSave: state.draftStatus === 'review' ? saveGapFill : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    fillInBlanks: component => window.FillInBlanksComponent.renderFillInBlanks(component, {
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveFillInBlanks : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    dragWordsInText: component => window.DragWordsInTextComponent.renderDragWordsInText(component, {
      onSave: state.draftStatus === 'review' ? saveDragWordsInText : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    personalizedQuestions: component => window.PersonalizedQuestionsComponent.renderPersonalizedQuestions(component, {
      onSave: state.draftStatus === 'review' ? savePersonalizedQuestions : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    describeAndGuess: component => window.DescribeAndGuessComponent.renderDescribeAndGuess(component, {
      onSave: state.draftStatus === 'review' ? saveDescribeAndGuess : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    howToPlay: component => window.HowToPlayComponent.renderHowToPlay(component, {
      onSave: state.draftStatus === 'review' ? saveHowToPlay : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    guidedRoleCards: component => window.GuidedRoleCardsComponent.renderGuidedRoleCards(component, {
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveGuidedRoleCards : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    speakingSupport: component => window.SpeakingSupportComponent.renderSpeakingSupport(component, {
      onSave: state.draftStatus === 'review' ? saveSpeakingSupport : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    textPanel: component => window.TextPanelComponent.renderTextPanel(component, {
      onSave: state.draftStatus === 'review' ? saveTextPanel : undefined,
      onDirtyChange: (dirty, panelId) => {
        if (dirty) state.dirtyComponents.add(panelId);
        else state.dirtyComponents.delete(panelId);
      },
      onMessage: showToast,
    }),
    illustratedTextPanel: component => window.IllustratedTextPanelComponent.renderIllustratedTextPanel(component, {
      onSave: state.draftStatus === 'review' ? saveIllustratedTextPanel : undefined,
      onDirtyChange: (dirty, panelId) => {
        if (dirty) state.dirtyComponents.add(panelId);
        else state.dirtyComponents.delete(panelId);
      },
      onUpload: state.draftStatus === 'review' ? uploadIllustratedTextPanelImage : undefined,
      onDelete: state.draftStatus === 'review' ? deleteIllustratedTextPanelImage : undefined,
      onMessage: showToast,
    }),
    miniSituation: component => window.MiniSituationComponent.renderMiniSituation(component, {
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
    multipleChoice: component => window.MultipleChoiceComponent.renderMultipleChoice(component, {
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveMultipleChoice : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    checkboxChoice: component => window.CheckboxChoiceComponent.renderCheckboxChoice(component, {
      viewerRole: 'teacher',
      onSave: state.draftStatus === 'review' ? saveCheckboxChoice : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    textReading: component => window.TextReadingComponent.renderTextReading(component, {
      onSave: state.draftStatus === 'review' ? saveTextReading : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onUpload: state.draftStatus === 'review' ? uploadTextReadingImage : undefined,
      onDelete: state.draftStatus === 'review' ? deleteTextReadingImage : undefined,
      onMessage: showToast,
    }),
    audioPlayer: component => window.AudioPlayerComponent.renderAudioPlayer(component, {
      onSave: state.draftStatus === 'review' ? saveAudioPlayer : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onUpload: state.draftStatus === 'review' ? uploadAudioPlayerAudio : undefined,
      onDelete: state.draftStatus === 'review' ? deleteAudioPlayerAudio : undefined,
      onMessage: showToast,
    }),
    markdownCard: component => window.MarkdownCardComponent.renderMarkdownCard(component, {
      viewerRole: 'teacher',
      studentVisible: false,
      onSave: state.draftStatus === 'review' ? saveMarkdownCard : undefined,
      onDirtyChange: (dirty, componentId) => {
        if (dirty) state.dirtyComponents.add(componentId);
        else state.dirtyComponents.delete(componentId);
      },
      onError: showToast,
    }),
    cardRow: component => window.CardRowComponent.renderCardRow(component, {
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

  const svgNS = 'http://www.w3.org/2000/svg';
  const stageIconShapes = {
    sparkles: [
      ['path', { d: 'M10 3.2 11.3 8l4.8 1.3-4.8 1.3L10 15.4 8.7 10.6 3.9 9.3 8.7 8z' }],
      ['path', { d: 'm18.2 13.2.8 3 3 .8-3 .8-.8 3-.8-3-3-.8 3-.8z' }],
    ],
    pencil: [
      ['path', { d: 'm13.2 5.2 5.6 5.6' }],
      ['path', { d: 'M4 20.1 5.7 14.4 16.2 3.9a2 2 0 0 1 2.8 0l1.1 1.1a2 2 0 0 1 0 2.8L9.6 18.3z' }],
      ['path', { d: 'M4 20.1 8.4 18.8' }],
    ],
    cards: [
      ['rect', { x: '5', y: '3.5', width: '14', height: '17', rx: '2.2' }],
      ['path', { d: 'M8.4 9.2h7.2' }],
      ['path', { d: 'M8.4 13.4h5' }],
    ],
    book: [
      ['path', { d: 'M12 6.2c-1.8-1.2-4.6-1.8-7.5-1.8v13.8c2.9 0 5.7.6 7.5 1.8 1.8-1.2 4.6-1.8 7.5-1.8V4.4c-2.9 0-5.7.6-7.5 1.8z' }],
      ['path', { d: 'M12 6.2v13.8' }],
    ],
    audio: [
      ['path', { d: 'M4 13v-1a8 8 0 0 1 16 0v1' }],
      ['path', { d: 'M4 13v3.5A2.5 2.5 0 0 0 6.5 19H8v-6H4z' }],
      ['path', { d: 'M20 13v3.5A2.5 2.5 0 0 1 17.5 19H16v-6h4z' }],
    ],
    cap: [
      ['path', { d: 'm3.2 10.4 8.8-4.8 8.8 4.8-8.8 4.8z' }],
      ['path', { d: 'M7.2 12.6v3.6c1.8 1.6 7.8 1.6 9.6 0v-3.6' }],
      ['path', { d: 'M20.8 10.4v5.4' }],
    ],
    chat: [
      ['path', { d: 'M14.6 10.8h3.8a2 2 0 0 1 2 2v3.6a2 2 0 0 1-2 2H17v2.2l-3.2-2.2h-1.2a2 2 0 0 1-2-2v-3.6a2 2 0 0 1 2-2z', fill: '#fff' }],
      ['path', { d: 'M6.4 5.6h7a2.2 2.2 0 0 1 2.2 2.2v4.1a2.2 2.2 0 0 1-2.2 2.2H8.1L4.2 16.8V7.8A2.2 2.2 0 0 1 6.4 5.6z', fill: '#fff' }],
    ],
    question: [
      ['circle', { cx: '12', cy: '12', r: '8.2' }],
      ['path', { d: 'M9.4 9.5a2.6 2.6 0 1 1 4.4 1.9c-.8.6-1.5 1.1-1.5 2.4' }],
      ['circle', { cx: '12.3', cy: '16.6', r: '.85', fill: 'currentColor', stroke: 'none' }],
    ],
  };
  const stageIconAliases = {
    sparkles: 'sparkles',
    compass: 'pencil',
    pencil: 'pencil',
    cards: 'cards',
    book: 'book',
    audio: 'audio',
    cap: 'cap',
    chat: 'chat',
    check: 'question',
    question: 'question',
  };

  function createStageIcon(name) {
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const shapes = stageIconShapes[stageIconAliases[name] || 'sparkles'];
    for (const [tag, attrs] of shapes) {
      const node = document.createElementNS(svgNS, tag);
      for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
      svg.append(node);
    }
    return svg;
  }

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const remainder = (seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainder}`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('lesson-toast--visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('lesson-toast--visible'), 2600);
  }

  function stageButton(stage, index) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'lesson-stage';
    button.dataset.stageIndex = String(index);

    const number = document.createElement('span');
    number.className = 'lesson-stage__number';
    number.textContent = String(stage.number);
    const icon = document.createElement('span');
    icon.className = 'lesson-stage__icon';
    icon.append(createStageIcon(stage.icon));
    const title = document.createElement('span');
    title.className = 'lesson-stage__title';
    title.textContent = stage.title;
    const duration = document.createElement('span');
    duration.className = 'lesson-stage__duration';
    duration.textContent = `${stage.durationMinutes} min`;
    button.append(icon, number, title, duration);
    button.addEventListener('click', () => selectStage(index));
    return button;
  }

  function selectStage(index) {
    const lesson = state.lesson;
    if (!lesson || index < 0 || index >= lesson.stages.length) return;
    if (state.dirtyComponents.size > 0) {
      const discard = window.confirm('Есть несохранённые изменения. Отменить их и перейти к другой стадии?');
      if (!discard) return;
      state.dirtyComponents.clear();
    }
    state.activeIndex = index;
    const stage = lesson.stages[index];
    [...stages.children].forEach((button, buttonIndex) => {
      const active = buttonIndex === index;
      button.classList.toggle('lesson-stage--active', active);
      button.setAttribute('aria-current', active ? 'step' : 'false');
    });
    byId('stage-number').textContent = `${stage.number}.`;
    byId('stage-title').textContent = stage.title;
    const subtitle = typeof stage.subtitle === 'string' ? stage.subtitle.trim() : '';
    const kicker = byId('stage-kicker');
    kicker.textContent = subtitle;
    kicker.hidden = !subtitle;
    renderStageContent(stage);
    byId('stage-progress').textContent = `${index + 1} из ${lesson.stages.length}`;
    byId('previous-stage').disabled = index === 0;
    byId('next-stage').disabled = index === lesson.stages.length - 1;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function emptyStage(stage) {
    const section = document.createElement('section');
    section.className = 'empty-stage';
    const titleId = `empty-stage-title-${stage.id}`;
    section.setAttribute('aria-labelledby', titleId);
    const icon = document.createElement('span');
    icon.className = 'empty-stage__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '✦';
    const title = document.createElement('h2');
    title.id = titleId;
    title.textContent = 'Стадия готова к наполнению';
    const description = document.createElement('p');
    description.textContent = 'Структура урока уже создана из JSON. Контент для этой стадии будет сгенерирован на следующем этапе.';
    section.append(icon, title, description);
    const meta = document.createElement('div');
    meta.className = 'empty-stage__meta';
    const duration = document.createElement('span');
    duration.textContent = `${stage.durationMinutes} min`;
    const status = document.createElement('span');
    status.textContent = 'Контент пока не добавлен';
    meta.append(duration, status);
    section.append(meta);
    return section;
  }

  function unsupportedComponent(component) {
    const element = document.createElement('div');
    element.className = 'unsupported-component';
    element.textContent = `Компонент «${component?.type || 'unknown'}» пока не поддерживается.`;
    return element;
  }

  function renderStageContent(stage) {
    const container = byId('stage-components');
    if (!Array.isArray(stage.content) || stage.content.length === 0) {
      container.replaceChildren(emptyStage(stage));
      return;
    }
    const rendered = stage.content.map((component) => {
      const renderer = component && componentRenderers[component.type];
      if (!renderer) return unsupportedComponent(component);
      try {
        return renderer(component);
      } catch (_error) {
        return unsupportedComponent(component);
      }
    }).filter(Boolean);
    container.replaceChildren(...rendered);
  }

  function render(lesson) {
    state.lesson = lesson;
    const meta = lesson.meta || {};
    document.title = `${meta.title || meta.topic || 'Урок'} — EasyClass`;
    byId('lesson-title').textContent = `${meta.title || meta.topic || 'Новый урок'} (${meta.level || 'A2'})`;
    byId('lesson-number').textContent = `Lesson ${meta.lessonNumber || 1} of 1`;
    byId('total-time').textContent = formatTime((meta.durationMinutes || 45) * 60);
    stages.replaceChildren(...lesson.stages.map(stageButton));
    loading.hidden = true;
    content.hidden = false;
    selectStage(0);
  }

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

  function showError(message) {
    loading.hidden = true;
    content.hidden = true;
    errorBox.hidden = false;
    byId('lesson-error-message').textContent = message;
  }

  async function loadLesson() {
    const match = window.location.pathname.match(/^\/lesson-drafts\/([^/]+)\/edit\/?$/);
    if (!match) return showError('Некорректная ссылка на урок.');
    try {
      const response = await fetch(`/api/lesson-drafts/${encodeURIComponent(decodeURIComponent(match[1]))}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Черновик урока не найден.');
      if (!payload.draft?.content?.stages?.length) throw new Error('В черновике пока нет структуры урока.');
      state.draftId = payload.draft.id;
      state.draftStatus = payload.draft.status;
      render(payload.draft.content);
    } catch (error) {
      showError(error.message || 'Не удалось загрузить структуру урока.');
    }
  }

  function setPlanVisible(visible) {
    plan.hidden = !visible;
    byId('show-plan').hidden = visible;
    document.body.classList.toggle('lesson-plan-hidden', !visible);
  }

  byId('hide-plan').addEventListener('click', () => setPlanVisible(false));
  byId('close-plan').addEventListener('click', () => setPlanVisible(false));
  byId('show-plan').addEventListener('click', () => setPlanVisible(true));
  byId('previous-stage').addEventListener('click', () => selectStage(state.activeIndex - 1));
  byId('next-stage').addEventListener('click', () => selectStage(state.activeIndex + 1));
  byId('teacher-screen').addEventListener('click', () => showToast('Экран преподавателя уже открыт.'));
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
  window.addEventListener('pagehide', () => window.clearInterval(state.timer));
  window.addEventListener('beforeunload', (event) => {
    if (state.dirtyComponents.size === 0) return;
    event.preventDefault();
    event.returnValue = '';
  });
  loadLesson();
})();
