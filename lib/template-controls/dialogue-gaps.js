'use strict';

const { normalizeGapFill } = require('../../assets/components/gap-fill.js');
const {
  blockName, countWord, cycle, exactList, fail, integer, listSchema, pick, requiredText,
} = require('./helpers.js');

// A short dialogue with typed gaps: the model marks them {{gap}} and gives answers with cues.

const EXAMPLE_TURNS = Object.freeze([
  { speaker: 'Mia', text: 'Where {{gap}} you last summer?', answer: 'were', example: 'be' },
  { speaker: 'Leo', text: 'I {{gap}} to the sea with my family.', answer: 'went', example: 'go' },
  { speaker: 'Mia', text: '{{gap}} you swim every day?', answer: 'Did', example: 'do' },
  { speaker: 'Leo', text: 'Yes, and I {{gap}} a big fish!', answer: 'saw', example: 'see' },
]);

module.exports = {
  type: 'dialogueGaps',
  label: 'Диалог с пропусками',
  params: {
    gaps: integer(3, 12, 9),
    minTurns: integer(2, 12, 6),
    maxTurns: integer(2, 12, 8),
  },
  chrome: ['title', 'instruction', 'accentColor'],
  fields: ['dialogue', 'gaps'],
  schema: ({ params }) => ({
    dialogue: { type: 'string', minLength: 1 },
    gaps: listSchema(params.gaps, {
      type: 'object',
      additionalProperties: false,
      required: ['answer', 'example'],
      properties: {
        answer: { type: 'string', minLength: 1 },
        example: { type: 'string' },
      },
    }),
  }),
  rules: ({ params, f }) => [
    `Create one connected dialogue of ${countWord(params.minTurns)} to ${countWord(params.maxTurns)} turns. Put every turn on a separate line in ${f.dialogue}, so the parsed string contains a newline (\\n) between consecutive turns. Start every line with a speaker label formatted as **Name:** and place exactly ${countWord(params.gaps)} literal {{gap}} markers in reading order.`,
    `Create exactly ${countWord(params.gaps)} ${f.gaps} in the same order as the markers. Each answer must complete its marker accurately. Set example to a useful base-form cue or an empty string when no cue is appropriate.`,
  ],
  defaultInstructions: '',
  build({ dialogue, gaps }, context) {
    const { id, params, chrome } = context;
    const text = requiredText(dialogue, 'диалог', context);
    if (text.includes('[[') || text.includes(']]')) fail(`${blockName(context)}: диалог не должен содержать готовые [[пропуски]].`);
    const turns = text.split(/\r?\n/).filter(line => line.trim());
    if (turns.length < params.minTurns || turns.length > params.maxTurns
      || turns.some(line => !/^\*\*[^*\n]+:\*\*/.test(line.trim()))) {
      console.warn(`${blockName(context)}: нужно ${params.minTurns}–${params.maxTurns} реплик на отдельных строках с жирными именами.`);
    }
    if ((text.match(/\{\{gap\}\}/g) || []).length !== params.gaps) {
      fail(`${blockName(context)}: в диалоге должно быть ровно ${params.gaps} маркеров {{gap}}.`);
    }
    const answers = exactList(gaps, params.gaps, 'ответов', context).map((gap, index) => {
      const answer = requiredText(gap?.answer, `ответ ${index + 1}`, context);
      const example = typeof gap?.example === 'string' ? gap.example.trim() : '';
      return example ? { id: `gap-${index + 1}`, answer, example } : { id: `gap-${index + 1}`, answer };
    });
    let gapNumber = 0;
    const task = {
      type: 'gapFill',
      id,
      title: chrome.title ?? 'Complete the dialogue.',
      instruction: chrome.instruction ?? 'Read the dialogue and type the correct form of the verbs.',
      text: text.replace(/\{\{gap\}\}/g, () => {
        gapNumber += 1;
        return `[[gap-${gapNumber}]]`;
      }),
      ...pick(chrome, ['accentColor']),
      gaps: answers,
    };
    // Validation only: the stored task keeps its authored shape.
    normalizeGapFill(task);
    return task;
  },
  answerKey: ({ component }) => ({
    list: false,
    lines: component.gaps.map((gap, index) => `**${index + 1}.** ${gap.answer}`),
  }),
  example: ({ params }) => {
    const turns = cycle(EXAMPLE_TURNS, Math.max(params.gaps, params.minTurns));
    return {
      dialogue: turns.map((turn, index) => `**${turn.speaker}:** ${index < params.gaps ? turn.text : turn.text.replace('{{gap}}', turn.answer)}`).join('\n'),
      gaps: turns.slice(0, params.gaps).map(({ answer, example }) => ({ answer, example })),
    };
  },
};
