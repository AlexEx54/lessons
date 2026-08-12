'use strict';

const STAGE_BLUEPRINTS = Object.freeze([
  Object.freeze({ id: 'warm-up', title: 'Warm Up', durationMinutes: 5, icon: 'sparkles' }),
  Object.freeze({ id: 'lead-in', title: 'Lead In', durationMinutes: 5, icon: 'compass' }),
  Object.freeze({ id: 'target-vocabulary', title: 'Target Vocabulary', durationMinutes: 8, icon: 'cards' }),
  Object.freeze({ id: 'reading-listening', title: 'Reading / Listening', durationMinutes: 8, icon: 'book' }),
  Object.freeze({ id: 'grammar-focus', title: 'Grammar Focus', durationMinutes: 8, icon: 'cap' }),
  Object.freeze({ id: 'guided-speaking', title: 'Guided Speaking', durationMinutes: 8, icon: 'chat' }),
  Object.freeze({ id: 'wrap-up', title: 'Wrap-Up', durationMinutes: 3, icon: 'check' }),
]);

function createSyntheticLesson(topic) {
  const normalizedTopic = String(topic || '').trim();
  return {
    schemaVersion: 'lesson-draft-v1',
    meta: {
      topic: normalizedTopic,
      title: normalizedTopic,
      level: 'A2',
      lessonNumber: 1,
      durationMinutes: 45,
      generatedBy: 'synthetic',
    },
    stages: STAGE_BLUEPRINTS.map((stage, index) => {
      const content = stage.id === 'warm-up'
        ? [{
          type: 'teacherNote',
          id: 'warm-up-teacher-note',
          text: '- Не заставляйте ученика сразу строить длинные ответы.\n- Покажите варианты и спросите, что он делал чаще этим летом.\n- Принимайте ответы словом или короткой фразой.\n\n**Say:** “Welcome back! Let’s see how you spent your summer. Which one did you do more?”',
        }, {
          type: 'taskPrompt',
          id: 'warm-up-your-turn-prompt',
          variant: 'yourTurn',
          title: 'Your turn!',
          text: 'Which one did you do more this summer? Answer with a word or a short sentence.',
        }, {
          type: 'taskPrompt',
          id: 'warm-up-follow-up-prompt',
          variant: 'followUp',
          title: 'Follow-up questions:',
          text: 'What was your favorite game this summer? Did you play every day?',
          support: {
            title: 'Possible language:',
            text: 'I built…, I swam…, I explored…',
          },
        }]
        : null;
      return { ...stage, number: index + 1, content };
    }),
  };
}

module.exports = { STAGE_BLUEPRINTS, createSyntheticLesson };
