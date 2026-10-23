'use strict';

const { ICONS: CARD_ICONS } = require('../../assets/components/markdown-card.js');
const { paramProblem } = require('./param-types.js');

// Presentation keys a control may take from a template block (its `chrome`), with the
// label and kind of value the template editor shows. Every control lists its keys in
// `chrome`; the catalog rejects keys missing here. A key left out of a block's chrome
// takes the control's default, which lives in its `build`.

const VISIBILITY = Object.freeze({ always: 'Всегда', controlled: 'По кнопке учителя', teacherOnly: 'Только учителю' });

const CHROME_FIELDS = Object.freeze({
  title: { label: 'Заголовок', type: 'text' },
  instruction: { label: 'Инструкция', type: 'text' },
  question: { label: 'Вопрос', type: 'text' },
  guessNote: { label: 'Пояснение к догадкам', type: 'text' },
  supportTitle: { label: 'Заголовок подсказок', type: 'text' },
  oneLabel: { label: 'Подпись шага «1»', type: 'text' },
  icon: { label: 'Иконка', type: 'choice', options: CARD_ICONS },
  accentColor: { label: 'Цвет акцента', type: 'color' },
  backgroundColor: { label: 'Цвет фона', type: 'color' },
  studentVisibility: { label: 'Видно ученику', type: 'choice', options: VISIBILITY },
  layout: { label: 'Расположение', type: 'choice', options: { columns: 'Колонками', stacked: 'Друг под другом' } },
  fieldSize: { label: 'Поле ответа', type: 'choice', options: { wide: 'Широкое' } },
  colors: { label: 'Цвета карточек', type: 'custom' },
  covers: { label: 'Обложки карточек', type: 'custom' },
  howToPlay: { label: 'Как играть', type: 'custom' },
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

// Problem text for a chrome value that does not fit its field, or null. Custom values
// are left to the control's component.
function chromeProblem(field, value) {
  switch (field.type) {
    case 'text': return typeof value === 'string' && value.trim() !== '' ? null : 'нужен непустой текст';
    case 'color': return typeof value === 'string' && HEX_COLOR.test(value) ? null : 'нужен цвет вида #RRGGBB';
    case 'custom': return null;
    default: return paramProblem(field, value);
  }
}

module.exports = { CHROME_FIELDS, chromeProblem };
