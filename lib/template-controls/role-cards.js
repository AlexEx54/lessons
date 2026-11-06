'use strict';

const { normalizeGuidedRoleCards } = require('../../assets/components/guided-role-cards.js');
const { blockName, exactList, fail, listSchema, oneLine, requiredText } = require('./helpers.js');

// A role-play for the student and the teacher: secret role cards with one shared goal.
// Which lesson words the roles use is in the instructions; an example dialogue, when the
// template has one, is a card of its own with a model-filled slot.

const CYRILLIC = /[Ѐ-ӿ]/u;
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
  group: 'speaking',
  description: 'Карточки ролей с тайной задачей. Какие слова урока в них нужны, говорят указания.',
  fields: ['roles'],
  schema: () => ({
    roles: {
      type: 'object',
      additionalProperties: false,
      required: ['student', 'teacher'],
      properties: { student: ROLE_SCHEMA, teacher: ROLE_SCHEMA },
    },
  }),
  rules: () => [
    'Create complementary Student and Teacher role cards. For each role provide exactly two wants, one thing to avoid, two private constraints or facts, two short secret-mission actions, and one shared goal.',
  ],
  defaultInstructions: 'A practical situation in which the student and the teacher negotiate one shared decision.',
  build({ roles }, context) {
    const { id } = context;
    if (CYRILLIC.test(JSON.stringify(roles))) {
      fail(`${blockName(context)}: роли должны быть полностью на английском языке.`);
    }

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
  example: () => ({ roles: EXAMPLE_ROLES }),
};
