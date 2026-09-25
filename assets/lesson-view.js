(() => {
  'use strict';
  const componentRenderers = {
    teacherNote: ['TeacherNoteComponent', 'renderTeacherNote'],
    taskPrompt: ['TaskPromptComponent', 'renderTaskPrompt'],
    thisOrThat: ['ThisOrThatComponent', 'renderThisOrThat'],
    matchWords: ['MatchWordsComponent', 'renderMatchWords'],
    dropdownChoice: ['DropdownChoiceComponent', 'renderDropdownChoice'],
    gapFill: ['GapFillComponent', 'renderGapFill'],
    sentenceMatching: ['SentenceMatchingComponent', 'renderSentenceMatching'],
    sentenceCorrection: ['SentenceCorrectionComponent', 'renderSentenceCorrection'],
    fillInBlanks: ['FillInBlanksComponent', 'renderFillInBlanks'],
    dragWordsInText: ['DragWordsInTextComponent', 'renderDragWordsInText'],
    personalizedQuestions: ['PersonalizedQuestionsComponent', 'renderPersonalizedQuestions'],
    describeAndGuess: ['DescribeAndGuessComponent', 'renderDescribeAndGuess'],
    howToPlay: ['HowToPlayComponent', 'renderHowToPlay'],
    guidedRoleCards: ['GuidedRoleCardsComponent', 'renderGuidedRoleCards'],
    speakingSupport: ['SpeakingSupportComponent', 'renderSpeakingSupport'],
    threeTwoOne: ['ThreeTwoOneComponent', 'renderThreeTwoOne'],
    selfAssessment: ['SelfAssessmentComponent', 'renderSelfAssessment'],
    textPanel: ['TextPanelComponent', 'renderTextPanel'],
    illustratedTextPanel: ['IllustratedTextPanelComponent', 'renderIllustratedTextPanel'],
    miniSituation: ['MiniSituationComponent', 'renderMiniSituation'],
    oddOneOut: ['OddOneOutComponent', 'renderOddOneOut'],
    factOrMyth: ['FactOrMythComponent', 'renderFactOrMyth'],
    multipleChoice: ['MultipleChoiceComponent', 'renderMultipleChoice'],
    checkboxChoice: ['CheckboxChoiceComponent', 'renderCheckboxChoice'],
    storyCards: ['StoryCardsComponent', 'renderStoryCards'],
    textReading: ['TextReadingComponent', 'renderTextReading'],
    audioPlayer: ['AudioPlayerComponent', 'renderAudioPlayer'],
    videoPlayer: ['VideoPlayerComponent', 'renderVideoPlayer'],
    markdownCard: ['MarkdownCardComponent', 'renderMarkdownCard'],
    cardRow: ['CardRowComponent', 'renderCardRow'],
  };
  function createLessonView(settings = {}) {
    const state = settings.state || { lesson: null, activeIndex: 0 };
    const byId = id => document.getElementById(id);
    const stages = byId('lesson-stages');
    const plan = byId('lesson-plan');
    const loading = byId('lesson-loading');
    const content = byId('lesson-content');
    const mounted = new Map();
    const mountedContent = new Map();
    const canSelect = index => settings.canSelect ? settings.canSelect(index) : true;
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
      video: [
        ['rect', { x: '3', y: '5', width: '18', height: '14', rx: '3' }],
        ['path', { d: 'm10 9 5 3-5 3z', fill: 'currentColor', stroke: 'none' }],
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
      video: 'video',
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
      // Older saved drafts used the book icon for this stage.
      icon.append(createStageIcon(stage.id === 'watch-and-interact' ? 'video' : stage.icon));
      const title = document.createElement('span');
      title.className = 'lesson-stage__title';
      title.textContent = stage.title;
      const duration = document.createElement('span');
      duration.className = 'lesson-stage__duration';
      duration.textContent = `${stage.durationMinutes} min`;
      button.append(icon, number, title, duration);
      button.disabled = !canSelect(index);
      button.addEventListener('click', () => selectStage(index));
      return button;
    }

    function selectStage(index, force = false) {
      const lesson = state.lesson;
      if (!lesson || index < 0 || index >= lesson.stages.length) return;
      if (!force && (!canSelect(index) || settings.beforeSelect?.(index) === false)) return;
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
      refreshNavigation();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function refreshNavigation() {
      const lesson = state.lesson;
      if (!lesson) return;
      const index = state.activeIndex;
      [...stages.children].forEach((button, i) => { button.disabled = !canSelect(i); });
      byId('previous-stage').disabled = index === 0 || !canSelect(index - 1);
      byId('next-stage').disabled = index === lesson.stages.length - 1 || !canSelect(index + 1);
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

    function renderStageContent(stage, reconcile = false) {
      const container = byId('stage-components');
      const previous = new Map(mounted);
      if (!reconcile) {
        previous.forEach(node => node.dispose?.());
        mounted.clear();
        mountedContent.clear();
      }
      if (!Array.isArray(stage.content) || stage.content.length === 0) {
        if (reconcile) previous.forEach(node => node.dispose?.());
        mounted.clear();
        mountedContent.clear();
        container.replaceChildren(emptyStage(stage));
        return;
      }
      const nextIds = new Set(stage.content.map(component => component.id));
      if (reconcile) for (const [id, node] of previous) {
        if (!nextIds.has(id)) {
          node.dispose?.();
          mounted.delete(id);
          mountedContent.delete(id);
        }
      }
      const rendered = stage.content.map((component) => {
        const fingerprint = JSON.stringify(component);
        if (reconcile && mountedContent.get(component.id) === fingerprint) return mounted.get(component.id);
        if (reconcile) {
          previous.get(component.id)?.dispose?.();
          mounted.delete(component.id);
          mountedContent.delete(component.id);
        }
        const entry = component && componentRenderers[component.type];
        const renderer = entry && window[entry[0]]?.[entry[1]];
        if (!renderer) return unsupportedComponent(component);
        try {
          const node = renderer(component, settings.componentOptions?.(component) || {});
          if (node) {
            mounted.set(component.id, node);
            mountedContent.set(component.id, fingerprint);
          }
          return node;
        } catch (_error) {
          return unsupportedComponent(component);
        }
      }).filter(Boolean);
      if (!reconcile) container.replaceChildren(...rendered);
      else {
        // Leave surviving nodes in place so revealing a sibling keeps focus/IME.
        for (const child of [...container.children]) if (!rendered.includes(child)) container.removeChild(child);
        rendered.forEach((node, index) => {
          if (container.children[index] !== node) container.insertBefore(node, container.children[index] || null);
        });
      }
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
      const initialIndex = lesson.stages.findIndex(stage => stage.id === settings.initialStageId?.());
      selectStage(initialIndex < 0 ? 0 : initialIndex, true);
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
    return { render, renderStageContent, selectStage, refreshNavigation, formatTime, mounted };
  }
  window.LessonView = { create: createLessonView };
})();
