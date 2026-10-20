'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const { CHROME_FIELDS, chromeProblem } = require('./chrome-fields.js');

// An exercise's answer key: a teacher-only card right after the exercise, built from its
// data without the model. A generated block turns it on with `answerKey`, {} for the
// defaults; only a control that implements `answerKey` can have one.
//
// The control's `answerKey({ component, data, params, part })` returns { lines, list }:
// list lines are Markdown list items joined by single newlines, other lines are
// paragraphs. A control with a key in several parts names them in `answerKeyParts`
// (part → { label, title }: the editor's label and the default section title), and the
// key shows every part under its title, which the block may change in `partTitles`.
//
// A key in one part is a plain card: a list, or answers split into two columns. Several
// parts give one section each. With the `paragraphs` format everything goes into one
// text and part titles become bold headings.

// The key's settings with their defaults; `layout` places the sections of a key in
// several parts.
const ANSWER_KEY_FIELDS = Object.freeze({
  title: Object.freeze({ ...CHROME_FIELDS.title, default: 'Answer key' }),
  format: Object.freeze({
    label: 'Вид', type: 'choice', options: Object.freeze({ sections: 'По разделам', paragraphs: 'Одним текстом' }), default: 'sections',
  }),
  layout: Object.freeze({ ...CHROME_FIELDS.layout, default: 'columns' }),
});

const KEY_STYLE = Object.freeze({
  icon: 'check', accentColor: '#20A85B', studentVisibility: 'teacherOnly',
});

const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const answerKeyId = blockId => `${blockId}-answer-key`;

// Problems of a block's `answerKey` for `control`, each { field?, part?, message }: the
// key's setting, or `partTitles` and the part, that is wrong.
function answerKeyProblems(key, control) {
  if (typeof control.answerKey !== 'function') return [{ message: `${control.label} не даёт ключ ответов` }];
  if (!isObject(key)) return [{ message: 'ключ ответов должен быть объектом' }];
  const problems = [];
  for (const [name, value] of Object.entries(key)) {
    if (name === 'partTitles') continue;
    const field = ANSWER_KEY_FIELDS[name];
    const problem = field ? chromeProblem(field, value) : 'такой настройки у ключа нет';
    if (problem) problems.push({ field: name, message: `${field?.label ?? name}: ${problem}` });
  }
  if (key.partTitles === undefined) return problems;
  if (!isObject(key.partTitles) || !control.answerKeyParts) {
    return [...problems, { field: 'partTitles', message: 'заголовки частей задаются только у ключа из нескольких частей' }];
  }
  for (const [part, title] of Object.entries(key.partTitles)) {
    const spec = control.answerKeyParts[part];
    if (!spec) problems.push({ field: 'partTitles', part, message: `у ключа нет части ${part}` });
    else if (typeof title !== 'string' || !title.trim()) problems.push({ field: 'partTitles', part, message: `${spec.label}: нужен непустой текст` });
  }
  return problems;
}

const joinLines = ({ lines, list }) => lines.join(list ? '\n' : '\n\n');

function columns(lines) {
  const middle = Math.ceil(lines.length / 2);
  return [
    { id: 'answers-left', title: '', text: lines.slice(0, middle).join('\n\n') },
    ...(lines.length > 1 ? [{ id: 'answers-right', title: '', text: lines.slice(middle).join('\n\n') }] : []),
  ];
}

// The key card of the exercise `block`, built by `control` as `component` from `data`.
function buildAnswerKey({ block, control, component, data }) {
  const key = block.answerKey;
  const setting = name => key[name] ?? ANSWER_KEY_FIELDS[name].default;
  const lines = part => control.answerKey({ component, data, params: block.params, part });
  const parts = control.answerKeyParts
    ? Object.entries(control.answerKeyParts).map(([part, spec]) => ({
      id: part, title: key.partTitles?.[part] ?? spec.title, ...lines(part),
    }))
    : [lines(undefined)];
  const card = { type: 'markdownCard', id: answerKeyId(block.id), title: setting('title') };
  if (setting('format') === 'paragraphs') {
    card.text = parts.map(part => [part.title && `**${part.title}**`, joinLines(part)].filter(Boolean).join('\n\n')).join('\n\n');
  } else if (parts.length === 1 && parts[0].list) {
    card.text = joinLines(parts[0]);
  } else if (parts.length === 1) {
    Object.assign(card, { layout: 'columns', sections: columns(parts[0].lines), headingSize: 'large' });
  } else {
    Object.assign(card, {
      layout: setting('layout'),
      sections: parts.map(part => ({ id: part.id, title: part.title, text: joinLines(part) })),
      headingSize: 'large',
    });
  }
  Object.assign(card, KEY_STYLE);
  // Validation only: the stored card keeps its authored shape.
  normalizeMarkdownCard(card);
  return card;
}

module.exports = { ANSWER_KEY_FIELDS, answerKeyId, answerKeyProblems, buildAnswerKey };
