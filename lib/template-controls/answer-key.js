'use strict';

const { normalizeMarkdownCard } = require('../../assets/components/markdown-card.js');
const { fail } = require('./helpers.js');

// Collects answer keys of tasks in the same stage into one teacher-only card.
//
// A source control implements `answerKey({ component, data, params, part })` and returns
// { lines, list }: list lines are Markdown list items joined by single newlines, other
// lines are paragraphs. Controls with several kinds of keys name them in `answerKeyParts`.
//
// One untitled source gives a plain card: a list, or answers split into two columns.
// Several sources, or titled ones, give one section per source.

const KEY_STYLE = Object.freeze({
  icon: 'check', accentColor: '#20A85B', studentVisibility: 'teacherOnly',
});

function sourceLines(source) {
  const part = source.part ?? source.control.answerKeyParts?.[0];
  return source.control.answerKey({ component: source.component, data: source.data, params: source.params, part });
}

const joinLines = ({ lines, list }) => lines.join(list ? '\n' : '\n\n');

function columns(lines) {
  const middle = Math.ceil(lines.length / 2);
  return [
    { id: 'answers-left', title: '', text: lines.slice(0, middle).join('\n\n') },
    ...(lines.length > 1 ? [{ id: 'answers-right', title: '', text: lines.slice(middle).join('\n\n') }] : []),
  ];
}

module.exports = {
  type: 'answerKey',
  kind: 'derived',
  label: 'Answer key',
  chrome: ['title', 'layout'],
  acceptsSource(control, source) {
    if (typeof control.answerKey !== 'function') return `${control.label} не даёт ключ ответов.`;
    if (source.part !== undefined && !(control.answerKeyParts || []).includes(source.part)) {
      return `у ${control.label} нет части ключа ${source.part}.`;
    }
    return null;
  },
  build({ sources }, { id, chrome }) {
    if (sources.length === 0) fail(`Ключ ${id} не собран ни из одного задания.`);
    let card;
    if (sources.length === 1 && sources[0].title === undefined) {
      const key = sourceLines(sources[0]);
      card = key.list
        ? { type: 'markdownCard', id, title: chrome.title ?? 'Answer key', text: joinLines(key), ...KEY_STYLE }
        : {
          type: 'markdownCard', id, title: chrome.title ?? 'Answer key', layout: 'columns',
          sections: columns(key.lines), headingSize: 'large', ...KEY_STYLE,
        };
    } else {
      card = {
        type: 'markdownCard', id, title: chrome.title ?? 'Answer key', layout: chrome.layout ?? 'columns',
        sections: sources.map((source, index) => ({
          id: source.id ?? `answers-${index + 1}`, title: source.title ?? '', text: joinLines(sourceLines(source)),
        })),
        headingSize: 'large', ...KEY_STYLE,
      };
    }
    // Validation only: the stored card keeps its authored shape.
    normalizeMarkdownCard(card);
    return card;
  },
};
