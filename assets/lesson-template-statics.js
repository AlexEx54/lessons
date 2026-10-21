(function initLessonTemplateStatics(root) {
  'use strict';

  // Components a static template block may hold, each with the normalizer of its
  // component module. The server checks static blocks of a template with them, and the
  // template editor checks the edits of one. In the browser the component modules are
  // loaded by the page; in node they are required here.

  const STATIC_COMPONENTS = {
    teacherNote: ['TeacherNoteComponent', 'normalizeTeacherNote', './components/teacher-note.js'],
    taskPrompt: ['TaskPromptComponent', 'normalizeTaskPrompt', './components/task-prompt.js'],
    markdownCard: ['MarkdownCardComponent', 'normalizeMarkdownCard', './components/markdown-card.js'],
    textPanel: ['TextPanelComponent', 'normalizeTextPanel', './components/text-panel.js'],
    illustratedTextPanel: ['IllustratedTextPanelComponent', 'normalizeIllustratedTextPanel', './components/text-panel.js'],
    multipleChoice: ['MultipleChoiceComponent', 'normalizeMultipleChoice', './components/multiple-choice.js'],
    videoPlayer: ['VideoPlayerComponent', 'normalizeVideoPlayer', './components/video-player.js'],
    howToPlay: ['HowToPlayComponent', 'normalizeHowToPlay', './components/how-to-play.js'],
    selfAssessment: ['SelfAssessmentComponent', 'normalizeSelfAssessment', './components/self-assessment.js'],
  };

  const isStaticType = type => Object.hasOwn(STATIC_COMPONENTS, type);

  // How the block catalog of the template editor shows each static block, and the
  // component a new one starts with: its text is edited in place afterwards. Groups are
  // the control groups (CONTROL_GROUPS in lib/lesson-templates/control-catalog.js).
  const STATIC_BLOCKS = Object.freeze({
    teacherNote: {
      label: 'Заметки учителю',
      group: 'notes',
      description: 'Заметка учителю, которая одинакова в каждом уроке.',
      sample: {
        type: 'teacherNote',
        text: 'Скажите: «Let’s start!» и объясните, что ученик будет делать на этом этапе.',
      },
    },
    taskPrompt: {
      label: 'Задание',
      group: 'notes',
      description: 'Заголовок и короткая формулировка задания для ученика.',
      sample: { type: 'taskPrompt', variant: 'followUp', title: 'Your task', text: 'Read the task and answer the questions.' },
    },
    markdownCard: {
      label: 'Карточка',
      group: 'notes',
      description: 'Карточка с заголовком, иконкой и текстом.',
      sample: {
        type: 'markdownCard',
        title: 'Your turn!',
        text: 'Read the text and discuss it together.',
        icon: 'chat',
        accentColor: '#1EAD58',
        studentVisibility: 'always',
      },
    },
    textPanel: {
      label: 'Текстовая панель',
      group: 'notes',
      description: 'Строка или абзац текста без рамки карточки.',
      sample: { type: 'textPanel', text: '**Read the instructions.**', backgroundColor: '#FFFFFF', accentColor: '#20243B', showBorder: false },
    },
    illustratedTextPanel: {
      label: 'Панель с картинками',
      group: 'notes',
      description: 'Текст на цветном фоне с картинкой до него и после.',
      sample: {
        type: 'illustratedTextPanel',
        text: '**@SkyRider:** I want to fly a plane one day!',
        backgroundColor: '#252A38',
        leadingPicture: { imagePrompt: 'Circular avatar of a smiling teenager in a pilot cap, educational illustration, no text.' },
        trailingPicture: { imagePrompt: 'Small paper plane symbol, educational illustration, no text.' },
      },
    },
    howToPlay: {
      label: 'Как играть',
      group: 'notes',
      description: 'Правила игры или задания по шагам.',
      sample: {
        type: 'howToPlay',
        title: 'How to Play',
        steps: ['Read your card.', 'Talk to your partner.', 'Decide together.'],
      },
    },
    selfAssessment: {
      label: 'Самооценка',
      group: 'notes',
      description: 'Ученик оценивает, как прошёл урок.',
      sample: { type: 'selfAssessment', title: 'How do you feel about today’s lesson?' },
    },
    multipleChoice: {
      label: 'Выбор ответа',
      group: 'comprehension',
      description: 'Вопрос с вариантами ответа, одинаковый в каждом уроке.',
      sample: {
        type: 'multipleChoice',
        mode: 'guess',
        title: 'Before watching',
        instruction: 'Choose your guess.',
        items: [{ id: 'guess', question: 'What do you think the video is about?', options: ['A trip', 'A school day', 'A new friend'], answer: null }],
      },
    },
    videoPlayer: {
      label: 'Видео',
      group: 'comprehension',
      description: 'Видеоплеер. Само видео учитель добавляет в уроке.',
      sample: { type: 'videoPlayer', title: 'Watch the video' },
    },
  });

  // Throws the normalizer's error when the component is broken.
  function checkStaticComponent(component) {
    const [global, normalizer, path] = STATIC_COMPONENTS[component.type];
    const source = root[global] || require(path);
    source[normalizer](component);
  }

  const api = { STATIC_BLOCKS, isStaticType, checkStaticComponent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LessonTemplateStatics = api;
})(typeof window !== 'undefined' ? window : globalThis);
