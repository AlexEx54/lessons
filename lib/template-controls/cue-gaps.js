'use strict';

const { normalizeGapFill } = require('../../assets/components/gap-fill.js');
const {
  blockName, countWord, exactList, fail, flag, integer, listSchema, pick, requiredText, stripMarkdown, warnCyrillic,
} = require('./helpers.js');

// A text with typed gaps, each optionally with a cue shown in the empty gap. What the text
// is and how it looks — numbered separate sentences, a dialogue, chat messages — and what
// the cues are is in the instructions.

const EXAMPLE_ITEMS = Object.freeze([
  { before: 'Flash Kid ', answer: 'has got', after: ' curly hair.', cue: 'have got' },
  { before: 'We ', answer: 'haven’t got', after: ' capes.', cue: 'not have got' },
  { before: 'Moon Girl ', answer: 'has got', after: ' a silver mask.', cue: 'have got' },
  { before: 'They ', answer: 'have got', after: ' red boots.', cue: 'have got' },
  { before: '', answer: 'Has', after: ' your hero got a belt?', cue: 'have' },
  { before: 'Star Boy ', answer: 'hasn’t got', after: ' a sidekick.', cue: 'not have got' },
  { before: 'I ', answer: 'have got', after: ' a secret base.', cue: 'have got' },
  { before: '', answer: 'Have', after: ' they got super speed?', cue: 'have' },
  { before: 'The twins ', answer: 'have got', after: ' green gloves.', cue: 'have got' },
  { before: 'My hero ', answer: 'hasn’t got', after: ' wings.', cue: 'not have got' },
  { before: '', answer: 'Has', after: ' she got a cape?', cue: 'have' },
  { before: 'You ', answer: 'have got', after: ' a cool costume.', cue: 'have got' },
]);

const where = index => `пропуске ${index + 1}`;

module.exports = {
  type: 'cueGaps',
  label: 'Вписать форму в пропуски',
  group: 'grammar',
  description: 'Вписать форму в пропуски, можно с подсказкой. Как оформлен текст, говорят указания.',
  params: {
    gaps: integer('Пропусков', 3, 12, 8),
    cues: flag('Подсказки в пропусках', true),
  },
  chrome: ['title', 'instruction', 'accentColor'],
  fields: ['text', 'gaps'],
  schema: ({ params }) => ({
    text: { type: 'string', minLength: 1 },
    gaps: listSchema(params.gaps, {
      type: 'object',
      additionalProperties: false,
      required: ['answer', ...(params.cues ? ['cue'] : [])],
      properties: {
        answer: { type: 'string', minLength: 1 },
        ...(params.cues && { cue: { type: 'string' } }),
      },
    }),
  }),
  rules: ({ params, f }) => [
    `${f.text}: a text with ${countWord(params.gaps)} gaps written [[1]] to [[${params.gaps}]] in reading order. No HTML; the only Markdown allowed is **bold**.`,
    `${f.gaps}: one gap per marker, in the same order. answer is exactly what the learner types into the gap.${params.cues ? ' cue is a short hint shown in the empty gap, for example the base form the learner must change, or an empty string when no hint fits.' : ''}`,
  ],
  defaultInstructions: [
    'The text is a numbered list of separate short sentences, one per line, each starting with its number in bold (**1.**) and with exactly one gap.',
    'Each gap tests a form of the grammar of the lesson; each cue is the base form the learner must change.',
  ].join('\n'),
  build({ text, gaps }, context) {
    const { id, params, chrome } = context;
    warnCyrillic({ text, gaps }, context);
    const source = requiredText(text, 'текст', context);
    const markers = [...source.matchAll(/\[\[(.*?)\]\]/g)].map(match => match[1]);
    if (markers.length !== params.gaps || markers.some((marker, index) => marker !== String(index + 1))) {
      fail(`${blockName(context)}: в тексте должны быть пропуски [[1]]–[[${params.gaps}]] по порядку.`);
    }
    // Hard errors only where the task becomes unsolvable; the rest is logged.
    const answers = exactList(gaps, params.gaps, 'ответов', context).map((gap, index) => {
      const answer = requiredText(stripMarkdown(gap?.answer, where(index), context), `ответ в ${where(index)}`, context);
      const cue = params.cues ? stripMarkdown(gap?.cue, where(index), context).trim() : '';
      return cue ? { id: `gap-${index + 1}`, answer, example: cue } : { id: `gap-${index + 1}`, answer };
    });
    return normalizeGapFill({
      type: 'gapFill',
      id,
      title: chrome.title ?? 'Complete the gaps with the correct form of the words.',
      instruction: chrome.instruction ?? 'Read each sentence and type the correct form.',
      ...pick(chrome, ['accentColor']),
      text: source.replace(/\[\[(\d+)\]\]/g, '[[gap-$1]]'),
      gaps: answers,
    });
  },
  answerKey: ({ component }) => ({
    list: false,
    lines: component.gaps.map((gap, index) => `**${index + 1}.** ${gap.answer}`),
  }),
  example: ({ params }) => {
    const items = EXAMPLE_ITEMS.slice(0, params.gaps);
    return {
      text: items.map((item, index) => `**${index + 1}.** ${item.before}[[${index + 1}]]${item.after}`).join('\n'),
      gaps: items.map(({ answer, cue }) => (params.cues ? { answer, cue } : { answer })),
    };
  },
};
