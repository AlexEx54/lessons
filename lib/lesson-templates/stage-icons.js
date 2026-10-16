'use strict';

// Icons a stage may show next to its title: the ones the lesson page draws
// (`stageIconShapes` in assets/lesson-view.js), with their names in the template editor.
// Two older names stay valid for the same pictures.

const STAGE_ICONS = Object.freeze({
  sparkles: 'Звёздочки',
  pencil: 'Карандаш',
  cards: 'Карточка',
  book: 'Книга',
  video: 'Видео',
  audio: 'Наушники',
  cap: 'Шапочка',
  chat: 'Диалог',
  question: 'Вопрос',
});

const STAGE_ICON_ALIASES = Object.freeze({ compass: 'pencil', check: 'question' });

const isStageIcon = name => Object.hasOwn(STAGE_ICONS, name) || Object.hasOwn(STAGE_ICON_ALIASES, name);

module.exports = { STAGE_ICONS, STAGE_ICON_ALIASES, isStageIcon };
