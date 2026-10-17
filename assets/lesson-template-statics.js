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
    multipleChoice: ['MultipleChoiceComponent', 'normalizeMultipleChoice', './components/multiple-choice.js'],
    videoPlayer: ['VideoPlayerComponent', 'normalizeVideoPlayer', './components/video-player.js'],
    howToPlay: ['HowToPlayComponent', 'normalizeHowToPlay', './components/how-to-play.js'],
    selfAssessment: ['SelfAssessmentComponent', 'normalizeSelfAssessment', './components/self-assessment.js'],
  };

  const isStaticType = type => Object.hasOwn(STATIC_COMPONENTS, type);

  // Throws the normalizer's error when the component is broken.
  function checkStaticComponent(component) {
    const [global, normalizer, path] = STATIC_COMPONENTS[component.type];
    const source = root[global] || require(path);
    source[normalizer](component);
  }

  const api = { isStaticType, checkStaticComponent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LessonTemplateStatics = api;
})(typeof window !== 'undefined' ? window : globalThis);
