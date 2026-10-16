'use strict';

const { normalizeGuidedRoleCards } = require('../../assets/components/guided-role-cards.js');
const {
  assertUnique, blockName, exactList, fail, integer, listSchema, oneLine, requiredText, vocabularyTerm,
} = require('./helpers.js');

// A role-play for the student and the teacher: secret role cards with one shared goal and
// an example dialogue, which `roleDialogue` shows as a separate card.

const CYRILLIC = /[Ѐ-ӿ]/u;
const SPEAKERS = Object.freeze(['Teacher', 'Student']);
// Every role card has the same parts; the component shows them in this order.
const ROLE_PARTS = Object.freeze({ want: 2, avoid: 1, secret: 2, mission: 2 });

const ROLE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [...Object.keys(ROLE_PARTS), 'goal'],
  properties: {
    ...Object.fromEntries(Object.entries(ROLE_PARTS).map(([part, count]) => [part, listSchema(count)])),
    goal: { type: 'string', minLength: 1 },
  },
});

const EXAMPLE_ROLES = Object.freeze({
  student: {
    want: ['Go to the cinema', 'Eat pizza'],
    avoid: ['Staying at home'],
    secret: ['You have £10', 'You must be home by 8 p.m.'],
    mission: ['Ask one follow-up question', 'Suggest one compromise'],
    goal: 'Choose one plan for Saturday together.',
  },
  teacher: {
    want: ['Go to the park', 'Have a picnic'],
    avoid: ['Expensive places'],
    secret: ['It may rain in the afternoon', 'You have a free ticket for the museum'],
    mission: ['Give one reason for your choice', 'Ask whether your partner agrees'],
    goal: 'Choose one plan for Saturday together.',
  },
});

const markdownList = items => items.map(item => `- ${item}`).join('\n');

module.exports = {
  type: 'roleCards',
  label: 'Ролевая игра',
  params: {
    minTurns: integer('Реплик в примере диалога: от', 4, 12, 6, { atMost: 'maxTurns' }),
    maxTurns: integer('Реплик в примере диалога: до', 4, 12, 10),
    minTerms: integer('Слов урока: от', 1, 6, 2, { atMost: 'maxTerms' }),
    maxTerms: integer('Слов урока: до', 1, 6, 4),
  },
  fields: ['usedVocabularyTerms', 'roles', 'dialogue'],
  inputs: { vocabulary: { type: 'vocabulary', required: true } },
  schema: ({ params }) => ({
    usedVocabularyTerms: { ...listSchema(params.minTerms), maxItems: params.maxTerms },
    roles: {
      type: 'object',
      additionalProperties: false,
      required: ['student', 'teacher'],
      properties: { student: ROLE_SCHEMA, teacher: ROLE_SCHEMA },
    },
    dialogue: {
      type: 'array',
      minItems: params.minTurns,
      maxItems: params.maxTurns,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['speaker', 'text'],
        properties: {
          speaker: { type: 'string', enum: [...SPEAKERS] },
          text: { type: 'string', minLength: 1 },
        },
      },
    },
  }),
  rules: ({ params, links, f }) => [
    `Select ${params.minTerms} to ${params.maxTerms} distinct entries from ${links.vocabulary.label}. Copy each selected entry exactly into ${f.usedVocabularyTerms} and use every selected entry naturally in the role cards or dialogue.`,
    'Create complementary Student and Teacher role cards. For each role provide exactly two wants, one thing to avoid, two private constraints or facts, two short secret-mission actions, and one shared goal.',
    `${f.dialogue}: an Example Dialogue of ${params.minTurns} to ${params.maxTurns} alternating Teacher and Student turns.`,
  ],
  defaultInstructions: '',
  build({ usedVocabularyTerms, roles, dialogue }, context) {
    const { id, params, links } = context;
    if (CYRILLIC.test(JSON.stringify({ usedVocabularyTerms, roles, dialogue }))) {
      fail(`${blockName(context)}: роли и диалог должны быть полностью на английском языке.`);
    }
    const requested = Array.isArray(usedVocabularyTerms) ? usedVocabularyTerms : [];
    if (requested.length < params.minTerms || requested.length > params.maxTerms) {
      fail(`${blockName(context)}: нужно от ${params.minTerms} до ${params.maxTerms} слов из словаря.`);
    }
    const terms = assertUnique(
      requested.map(term => vocabularyTerm(term, links.vocabulary.value, 'слово из словаря', context)),
      'слова из словаря', context,
    );

    const role = (value, label) => {
      if (!value || typeof value !== 'object') fail(`${blockName(context)}: нет роли ${label}.`);
      return {
        ...Object.fromEntries(Object.entries(ROLE_PARTS).map(([part, count]) => [
          part,
          exactList(value[part], count, `пунктов ${part} роли ${label}`, context)
            .map(item => requiredText(oneLine(item), `пункт ${part} роли ${label}`, context)),
        ])),
        goal: requiredText(oneLine(value.goal), `goal роли ${label}`, context),
      };
    };
    const student = role(roles?.student, 'Student');
    const teacher = role(roles?.teacher, 'Teacher');
    if (student.goal !== teacher.goal) fail(`${blockName(context)}: у ролей должна быть одна общая цель.`);

    const turns = Array.isArray(dialogue) ? dialogue : [];
    if (turns.length < params.minTurns || turns.length > params.maxTurns) {
      fail(`${blockName(context)}: в примере диалога должно быть от ${params.minTurns} до ${params.maxTurns} реплик.`);
    }
    turns.forEach((turn, index) => {
      if (!SPEAKERS.includes(turn?.speaker)) fail(`${blockName(context)}: в диалоге говорят только Teacher и Student.`);
      if (index > 0 && turns[index - 1].speaker === turn.speaker) fail(`${blockName(context)}: реплики диалога должны чередоваться.`);
      requiredText(oneLine(turn.text), `реплика ${index + 1}`, context);
    });
    if (new Set(turns.map(turn => turn.speaker)).size !== SPEAKERS.length) {
      fail(`${blockName(context)}: в диалоге должны говорить и Teacher, и Student.`);
    }

    const used = JSON.stringify({ roles, dialogue }).toLocaleLowerCase();
    const missing = terms.filter(term => !used.includes(term.toLocaleLowerCase().replace(/^to\s+/u, '')));
    if (missing.length > 0) console.warn(`${blockName(context)}: в ролях и диалоге нет слов из словаря: ${missing.join(', ')}.`);

    const sections = value => ({
      ...Object.fromEntries(Object.keys(ROLE_PARTS).map(part => [part, markdownList(value[part])])),
      goal: `- ${value.goal}`,
    });
    const cards = {
      type: 'guidedRoleCards',
      id,
      roles: {
        student: { title: 'Student', sections: sections(student) },
        teacher: { title: 'Teacher', sections: sections(teacher) },
      },
    };
    // Validation only: the stored cards keep their authored shape.
    normalizeGuidedRoleCards(cards);
    return cards;
  },
  example: ({ params, links }) => {
    const terms = links.vocabulary.value.slice(0, params.minTerms).map(item => item.term);
    const line = index => (index % 2 === 0 ? 'How about going to the park?' : 'I see your point, but it may rain.');
    return {
      usedVocabularyTerms: terms,
      roles: EXAMPLE_ROLES,
      dialogue: Array.from({ length: params.minTurns }, (_, index) => ({
        speaker: SPEAKERS[index % 2],
        text: index < terms.length ? `${line(index)} Remember the word "${terms[index]}".` : line(index),
      })),
    };
  },
};
