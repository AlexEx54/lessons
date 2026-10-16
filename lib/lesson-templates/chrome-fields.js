'use strict';

// Presentation keys a control may take from a template block (its `chrome`), with the
// label and kind of value the template editor shows. Every control lists its keys in
// `chrome`; the catalog rejects keys missing here.

const VISIBILITY = Object.freeze({ always: 'Всегда', controlled: 'По кнопке учителя', teacherOnly: 'Только учителю' });

const CHROME_FIELDS = Object.freeze({
  title: { label: 'Заголовок', type: 'text' },
  heading: { label: 'Заголовок', type: 'text' },
  subheading: { label: 'Подзаголовок', type: 'text' },
  instruction: { label: 'Инструкция', type: 'text' },
  question: { label: 'Вопрос', type: 'text' },
  guessNote: { label: 'Пояснение к догадкам', type: 'text' },
  supportTitle: { label: 'Заголовок подсказок', type: 'text' },
  oneLabel: { label: 'Подпись шага «1»', type: 'text' },
  icon: { label: 'Иконка', type: 'icon' },
  accentColor: { label: 'Цвет акцента', type: 'color' },
  backgroundColor: { label: 'Цвет фона', type: 'color' },
  showBorder: { label: 'Рамка', type: 'flag' },
  studentVisibility: { label: 'Видно ученику', type: 'choice', options: VISIBILITY },
  layout: { label: 'Расположение', type: 'choice', options: { columns: 'Колонками', stacked: 'Друг под другом' } },
  fieldSize: { label: 'Поле ответа', type: 'choice', options: { wide: 'Широкое' } },
  colors: { label: 'Цвета карточек', type: 'custom' },
  covers: { label: 'Обложки карточек', type: 'custom' },
  howToPlay: { label: 'Как играть', type: 'custom' },
});

module.exports = { CHROME_FIELDS };
