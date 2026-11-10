'use strict';

const { normalizeLineOrder } = require('../../assets/components/line-order.js');
const {
  assertUnique, blockName, choice, countWord, exactList, fail, integer, listSchema, oneLine, requiredText, stripMarkdown,
  warnCyrillic,
} = require('./helpers.js');

// Lines of a dialogue or events of a story that the student puts back in order. The model
// writes them in the right order; the exercise shuffles them itself.

const MAX_LINE = 160;
const MAX_NAME = 24;

// Each count picks lines that still make one coherent sequence with a single order.
const EXAMPLES = Object.freeze({
  dialogue: {
    lines: [
      { speaker: 'Waiter', text: 'Good evening! Are you ready to order?' },
      { speaker: 'Customer', text: 'Yes, I’d like the chicken soup, please.' },
      { speaker: 'Waiter', text: 'Would you like anything to drink with it?' },
      { speaker: 'Customer', text: 'Just a glass of water, please.' },
      { speaker: 'Waiter', text: 'And would you like a dessert?' },
      { speaker: 'Customer', text: 'No, thank you. That’s all.' },
      { speaker: 'Waiter', text: 'Great. Your soup will be ready in ten minutes.' },
      { speaker: 'Customer', text: 'Thank you very much!' },
    ],
    picks: { 3: [0, 1, 6], 4: [0, 1, 6, 7], 5: [0, 1, 2, 3, 6], 6: [0, 1, 2, 3, 6, 7], 7: [0, 1, 2, 3, 4, 5, 6], 8: [0, 1, 2, 3, 4, 5, 6, 7] },
  },
  story: {
    lines: [
      { text: 'Tom’s alarm didn’t go off, and he woke up late.' },
      { text: 'He packed his suitcase in a hurry.' },
      { text: 'Then he couldn’t find his passport anywhere.' },
      { text: 'Finally, he found it under the bed.' },
      { text: 'He took a taxi, but there was a lot of traffic.' },
      { text: 'When he got to the airport, his plane had already left.' },
      { text: 'He bought a ticket for the next flight.' },
      { text: 'He arrived in Rome late in the evening, tired but happy.' },
    ],
    picks: { 3: [0, 4, 5], 4: [0, 1, 4, 5], 5: [0, 2, 3, 4, 5], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6], 8: [0, 1, 2, 3, 4, 5, 6, 7] },
  },
});

function shortText(value, max, what, where, context) {
  const text = requiredText(oneLine(stripMarkdown(value, where, context)), what, context);
  if (text.length > max) fail(`${blockName(context)}: ${what} длиннее ${max} символов: «${text}».`);
  return text;
}

module.exports = {
  type: 'lineOrder',
  label: 'Расставь по порядку',
  group: 'comprehension',
  description: 'Расставить перемешанные реплики диалога или события истории в правильном порядке.',
  params: {
    lines: integer('Строк', 3, 8, 6),
    look: choice('Вид', { dialogue: 'Диалог', story: 'История' }, 'dialogue'),
  },
  chrome: ['title', 'instruction'],
  fields: ['lines'],
  schema: ({ params }) => {
    const dialogue = params.look === 'dialogue';
    return {
      lines: listSchema(params.lines, {
        type: 'object',
        additionalProperties: false,
        required: [...(dialogue ? ['speaker'] : []), 'text'],
        properties: {
          ...(dialogue && { speaker: { type: 'string', minLength: 1 } }),
          text: { type: 'string', minLength: 1 },
        },
      }),
    };
  },
  rules: ({ params, f }) => {
    const dialogue = params.look === 'dialogue';
    return [
      `${f.lines}: exactly ${countWord(params.lines)} ${dialogue ? 'lines of one dialogue' : 'events of one short story'}, written in the right order. The learner gets them shuffled and puts them back in order.`,
      ...(dialogue ? [`speaker is who says the line. There are exactly two speakers, named by their role in the situation (for example, Customer and Waiter); each name has at most ${MAX_NAME} characters and is spelled the same in every line. Either speaker may start, and the turns do not have to alternate strictly.`] : []),
      `The order must follow from the content alone and be the only possible one: each line clearly follows from the one before it, no two lines could swap places, the first line clearly opens the ${dialogue ? 'conversation' : 'story'} and the last one clearly ends it.`,
      `All lines are different; each is one or two sentences of at most ${MAX_LINE} characters. Do not number the lines or add order hints such as "First," or "Second,"${dialogue ? '' : ' (ordinary linking words such as "then" or "after that" are fine)'}. Use plain text only: no Markdown or HTML.`,
    ];
  },
  defaultInstructions: 'Choose a situation or a short story connected to the topic of the stage.',
  build({ lines }, context) {
    const { id, params, chrome } = context;
    const dialogue = params.look === 'dialogue';
    warnCyrillic(lines, context);
    const written = exactList(lines, params.lines, 'строк', context).map((line, index) => {
      const where = `строке ${index + 1}`;
      return {
        text: shortText(line?.text, MAX_LINE, `строка ${index + 1}`, where, context),
        ...(dialogue && { speaker: shortText(line?.speaker, MAX_NAME, `говорящий в строке ${index + 1}`, where, context) }),
      };
    });
    assertUnique(written.map(line => line.text), 'строки', context);
    // Speakers in the order they first speak; a name differing only in case is the same speaker.
    const names = [];
    for (const { speaker } of dialogue ? written : []) {
      if (!names.some(name => name.toLocaleLowerCase() === speaker.toLocaleLowerCase())) names.push(speaker);
    }
    if (dialogue && names.length !== 2) {
      fail(`${blockName(context)}: в диалоге нужно ровно два собеседника, получено ${names.length}: ${names.join(', ')}.`);
    }
    const speakerId = name => `speaker-${names.findIndex(other => other.toLocaleLowerCase() === name.toLocaleLowerCase()) + 1}`;
    return normalizeLineOrder({
      type: 'lineOrder',
      id,
      title: chrome.title ?? (dialogue ? 'Put the dialogue in order.' : 'Put the story in order.'),
      instruction: chrome.instruction ?? 'Drag a line by the handle or use the arrows, then press Check.',
      look: params.look,
      ...(dialogue && { speakers: names.map((name, index) => ({ id: `speaker-${index + 1}`, name })) }),
      lines: written.map((line, index) => ({ id: `line-${index + 1}`, text: line.text, ...(dialogue && { speakerId: speakerId(line.speaker) }) })),
    });
  },
  answerKey: ({ component }) => ({
    list: false,
    lines: component.lines.map((line, index) => {
      const speaker = component.speakers?.find(candidate => candidate.id === line.speakerId);
      return `**${index + 1}.** ${speaker ? `${speaker.name}: ` : ''}${line.text}`;
    }),
  }),
  example: ({ params }) => {
    const { lines, picks } = EXAMPLES[params.look];
    return { lines: picks[params.lines].map(index => lines[index]) };
  },
};
