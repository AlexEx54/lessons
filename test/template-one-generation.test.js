'use strict';

// Template 1 runs from lib/templates/template-1.json. These checks build every stage from
// saved model answers: the lesson structure, what each prompt receives, and the checks
// that stop a broken answer or only log it.

const assert = require('node:assert/strict');
const test = require('node:test');
const { learnerProfileInstructions } = require('../lib/ai-lesson-generator.js');
const { createGenerationSkeleton } = require('../lib/lesson-generation-plan.js');
const { compileTemplate } = require('../lib/lesson-templates/template-engine.js');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');
const {
  GENERATED_LEAD_IN, GENERATED_WARM_UP, GENERATED_WRAP_UP, TEMPLATE_ONE_READING, TEMPLATE_ONE_TARGET_VOCABULARY,
} = require('./fixtures/generated-template-one.js');
const { GENERATED_GRAMMAR_FOCUS } = require('./fixtures/generated-grammar-focus.js');
const { GENERATED_GRAMMAR_PRESENTATION } = require('./fixtures/generated-grammar-presentation.js');
const { GENERATED_GUIDED_SPEAKING } = require('./fixtures/generated-guided-speaking.js');
const { GENERATED_LISTENING } = require('./fixtures/generated-listening.js');

const TEMPLATE_ONE_DEFINITION = require('../lib/templates/template-1.json');
const TEMPLATE_ONE = compileTemplate(TEMPLATE_ONE_DEFINITION, CONTROL_CATALOG);

const ANSWERS = Object.freeze({
  'warm-up': GENERATED_WARM_UP,
  'lead-in': GENERATED_LEAD_IN,
  'target-vocabulary': TEMPLATE_ONE_TARGET_VOCABULARY,
  reading: TEMPLATE_ONE_READING,
  listening: GENERATED_LISTENING,
  'grammar-presentation': GENERATED_GRAMMAR_PRESENTATION,
  'grammar-focus': GENERATED_GRAMMAR_FOCUS,
  'guided-speaking': GENERATED_GUIDED_SPEAKING,
  'wrap-up': GENERATED_WRAP_UP,
});
const TERMS = TEMPLATE_ONE_TARGET_VOCABULARY.vocabularyItems.map(item => item.term);

const emptyState = () => ({ lesson: createGenerationSkeleton(TEMPLATE_ONE_DEFINITION, 'Space travel'), variables: {} });

// Builds one stage after Target Vocabulary, so stages that use the words get them.
function buildStage(key, answer) {
  const state = TEMPLATE_ONE.apply('target-vocabulary', emptyState(), structuredClone(TEMPLATE_ONE_TARGET_VOCABULARY));
  return TEMPLATE_ONE.apply(key, state, answer, { random: () => 0 });
}

function damaged(key, mutate) {
  const answer = structuredClone(ANSWERS[key]);
  mutate(answer);
  return () => buildStage(key, answer);
}

test('Template 1 builds every stage from model answers without warnings', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  let state = emptyState();
  for (const step of TEMPLATE_ONE.steps) {
    state = TEMPLATE_ONE.apply(step.key, state, structuredClone(ANSWERS[step.key]), { random: () => 0 });
  }
  assert.equal(warn.mock.callCount(), 0);
  assert.deepEqual(state.variables.targetVocabulary.map(item => item.term), TERMS);
  assert.deepEqual(Object.fromEntries(state.lesson.stages.map(stage => [stage.id, stage.content.map(item => item.id)])), {
    'warm-up': ['warm-up-teacher-note', 'warm-up-your-turn-card', 'warm-up-this-or-that', 'warm-up-follow-up-prompt'],
    'lead-in': [
      'lead-in-teacher-note', 'lead-in-your-turn-card', 'lead-in-gamer-message', 'lead-in-discussion-questions',
      'lead-in-suggested-answers-card',
    ],
    'target-vocabulary': [
      'target-vocabulary-teacher-note', 'target-vocabulary-card', 'target-vocabulary-match-words',
      'target-vocabulary-extra-explanation-card', 'target-vocabulary-context-dropdown',
      'target-vocabulary-context-dropdown-answer-key', 'target-vocabulary-fill-in-blanks',
      'target-vocabulary-personalized-questions', 'target-vocabulary-sentence-starters-card',
      'target-vocabulary-describe-and-guess',
    ],
    reading: [
      'reading-teacher-note', 'reading-text', 'reading-gist-quiz', 'reading-gist-quiz-answer-key',
      'reading-detail-quiz', 'reading-detail-quiz-answer-key',
    ],
    listening: [
      'listening-teacher-note', 'listening-audio', 'listening-gist-quiz', 'listening-gist-quiz-answer-key',
      'listening-audio-again', 'listening-detail-quiz', 'listening-detail-quiz-answer-key',
    ],
    'grammar-presentation': [
      'grammar-presentation-teacher-note', 'grammar-presentation-notice-rule', 'grammar-presentation-concept-checking',
      'grammar-presentation-complete-the-rule', 'grammar-presentation-complete-the-rule-answer-key',
      'grammar-presentation-quick-rule', 'grammar-presentation-check-the-rule', 'grammar-presentation-check-the-rule-answer-key',
    ],
    'grammar-focus': [
      'grammar-focus-teacher-note', 'grammar-focus-choose-the-correct-options',
      'grammar-focus-choose-the-correct-options-answer-key',
      'grammar-focus-complete-the-gaps', 'grammar-focus-complete-the-gaps-answer-key', 'grammar-focus-mini-situation',
      'grammar-focus-practice-support-row',
    ],
    'guided-speaking': [
      'guided-speaking-teacher-note', 'guided-speaking-read-instructions', 'guided-speaking-how-to-play',
      'guided-speaking-role-cards', 'guided-speaking-support', 'guided-speaking-example-dialogue',
    ],
    'wrap-up': ['wrap-up-teacher-note', 'wrap-up-three-two-one', 'wrap-up-self-assessment', 'wrap-up-possible-language'],
  });
});

test('Template 1 Lead-In message fills its text and both picture prompts from slots', () => {
  const { lesson } = buildStage('lead-in', structuredClone(GENERATED_LEAD_IN));
  const panel = lesson.stages.find(stage => stage.id === 'lead-in').content.find(item => item.id === 'lead-in-gamer-message');
  assert.deepEqual(panel, {
    type: 'illustratedTextPanel',
    id: 'lead-in-gamer-message',
    text: GENERATED_LEAD_IN.message,
    backgroundColor: '#252A38',
    leadingPicture: { imagePrompt: GENERATED_LEAD_IN.senderImagePrompt },
    trailingPicture: { imagePrompt: GENERATED_LEAD_IN.symbolImagePrompt },
  });
});

test('each Template 1 prompt starts with the learner profile and receives only its inputs', () => {
  const preamble = learnerProfileInstructions({ ageGroup: '9-11', level: 'B1' });
  const inputs = TEMPLATE_ONE.resolveInputs({ topic: 'Space travel', warmUpTopic: 'Holidays in space', grammarTopic: 'Past Simple' });
  const variables = buildStage('reading', structuredClone(TEMPLATE_ONE_READING)).variables;
  const lesson = 'Lesson topic: Space travel';
  const grammar = 'Grammar topic: Past Simple';
  const vocabulary = `Target Vocabulary: ${JSON.stringify(TERMS)}`;
  const expected = {
    'warm-up': ['Lesson topic: Holidays in space'],
    'lead-in': [lesson],
    'target-vocabulary': [lesson],
    reading: [lesson, grammar, vocabulary],
    listening: [lesson, grammar, vocabulary],
    'grammar-presentation': [lesson, grammar],
    'grammar-focus': [lesson, grammar, vocabulary],
    'guided-speaking': [lesson, vocabulary],
    'wrap-up': [lesson, grammar, vocabulary],
  };
  assert.deepEqual(TEMPLATE_ONE.steps.map(step => step.key), Object.keys(expected));
  for (const step of TEMPLATE_ONE.steps) {
    const { messages, schemaName } = TEMPLATE_ONE.request(step.key, { inputs, variables, preamble });
    assert.equal(schemaName, `easyclass_${step.key.replaceAll('-', '_')}`);
    assert.ok(messages[0].content.startsWith(preamble), step.key);
    assert.equal(messages[1].content, expected[step.key].join('\n'), step.key);
  }
});

test('Template 1 rejects model answers that would break a task', () => {
  for (const [key, mutate, error] of [
    ['warm-up', answer => { answer.choices = []; }, /нужно ровно 4 \(пар\), получено 0/],
    ['warm-up', answer => { answer.choices[0].options.pop(); }, /exactly two options/],
    ['target-vocabulary', answer => { answer.vocabularyItems.pop(); }, /«Vocabulary»: нужно ровно 10 \(слов\)/],
    ['target-vocabulary', answer => { answer.describeAndGuessTerms[5] = answer.describeAndGuessTerms[0]; }, /не должны повторяться/],
    ['target-vocabulary', answer => { answer.vocabularyItems[0].imagePrompt = 'A traveler buying a ticket.'; }, /квадратными иллюстрациями без текста/],
    ['reading', answer => { answer.detailQuestions.pop(); }, /Reading for Detail»: нужно ровно 5/],
    ['reading', answer => { answer.gistQuestions[0].options[1] = answer.gistQuestions[0].options[0]; }, /варианты в вопросе 1 не должны повторяться/],
    ['reading', answer => { answer.detailQuestions[0].answer = 'An answer outside the options.'; }, /должен точно совпадать с вариантом/],
    ['reading', answer => { answer.usedVocabularyTerms[4] = 'rent a car'; }, /получено «rent a car»/],
    ['reading', answer => { answer.usedVocabularyTerms.splice(3); }, /от 5 до 6 слов из словаря/],
    ['reading', answer => { answer.usedVocabularyTerms = TERMS.slice(0, 7); }, /от 5 до 6 слов из словаря/],
    ['reading', answer => { answer.text = 'A very short reading text.'; }, /от 180 до 230 слов, получено 5/],
    ['reading', answer => { answer.textImagePrompt = 'Students arrive at an airport.'; }, /иллюстрацию без текста/],
    ['listening', answer => { answer.gistQuestions.pop(); }, /Listening for Gist»: нужно ровно 2/],
    ['listening', answer => { answer.detailQuestions.pop(); }, /Listening for Detail»: нужно ровно 5/],
    ['grammar-presentation', answer => { answer.ruleItems[1].answer = answer.ruleItems[0].answer; }, /ответы не должны повторяться/],
    ['grammar-presentation', answer => { answer.ruleDistractors[0] = answer.ruleItems[0].answer; }, /ответы и дистракторы не должны повторяться/],
    ['grammar-presentation', answer => { answer.checkItems[0].answer = 'flew'; }, /Check the Rule»: ответ в предложении 1 должен точно совпадать/],
    ['grammar-focus', answer => { answer.task1Items.pop(); }, /нужно ровно 8 \(предложений\)/],
    ['grammar-focus', answer => { answer.task1Items[0].answer = 'flew'; }, /ответ в предложении 1 должен точно совпадать/],
    ['grammar-focus', answer => { answer.task1Items[0].options[1] = answer.task1Items[0].options[0]; }, /варианты в предложении 1 не должны повторяться/],
    ['grammar-focus', answer => { answer.task2Dialogue = answer.task2Dialogue.replace('{{gap}}', 'went'); }, /ровно 9 маркеров \{\{gap\}\}/],
    ['guided-speaking', answer => { answer.roles.teacher.goal = 'Choose a different plan.'; }, /одна общая цель/],
    ['guided-speaking', answer => { answer.dialogue[1].speaker = 'Teacher'; }, /должны чередоваться/],
    ['guided-speaking', answer => { answer.usedVocabularyTerms = ['book a ticket', 'unknown phrase']; }, /получено «unknown phrase»/],
    ['guided-speaking', answer => { answer.usedVocabularyTerms = ['book a ticket', 'book a ticket']; }, /не должны повторяться/],
    ['wrap-up', answer => { answer.onePrompt = 'Расскажи о своей последней поездке.'; }, /только на английском/],
    ['wrap-up', answer => { answer.twoCues.pop(); }, /нужно ровно 2 \(подсказок для шага two\)/],
  ]) {
    assert.throws(damaged(key, mutate), error, `${key}: ${error}`);
  }
});

test('Template 1 only logs answers that stay usable', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const warnings = () => warn.mock.calls.splice(0).map(call => call.arguments[0]).join('\n');

  damaged('reading', answer => { answer.usedVocabularyTerms[4] = 'pick up luggage'; })();
  assert.match(warnings(), /в тексте нет слов из словаря: pick up luggage/);

  const { lesson } = damaged('grammar-presentation', answer => {
    answer.checkItems[0].before = '';
    answer.checkItems[0].after = '';
  })();
  assert.match(warnings(), /Check the Rule»: в предложении 1 нет текста вокруг ответа/);
  const check = lesson.stages.find(stage => stage.id === 'grammar-presentation').content
    .find(item => item.id === 'grammar-presentation-check-the-rule');
  assert.match(check.text, /^\*\*1\.\*\* \[\[choice-1\]\]\n/);

  damaged('grammar-focus', answer => {
    answer.task1Items[0].before = 'Last month, *I* ';
    answer.task2Dialogue = answer.task2Dialogue.replace('**Mia:**', 'Mia:');
    answer.modelSentence = 'Вчера я летал в Лондон.';
    answer.supportWordBank = [...answer.supportWordBank.slice(0, 6), 'unknown phrase', 'Book a ticket'];
    answer.miniSituation.imagePrompt = 'A traveler at an airport.';
  })();
  const focus = warnings();
  for (const pattern of [/убрана Markdown-разметка в предложении 1/, /с жирными именами/, /кириллицу в английском тексте: Вчера/,
    /не из словаря в банке слов: unknown phrase/, /повтор в банке слов: Book a ticket/, /иллюстрацию без текста/]) {
    assert.match(focus, pattern);
  }
});
