'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { syntheticLesson } = require('./helpers/synthetic-lessons.js');
const { recoverLessonGeneration } = require('../lib/lesson-generation-recovery.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS, TRAVEL_TERMS } = require('./fixtures/generated-template-two-grammar-focus.js');
const { GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION } = require('./fixtures/generated-template-two-grammar-presentation.js');
const { TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR } = require('./fixtures/generated-template-two.js');
const { applyStage, byId, stageContent, stageRequest, templateTwoPlan, templateTwoSkeleton } = require('./helpers/template-two.js');

const vocabularyItems = TRAVEL_TERMS.map(term => ({ term, definition: 'meaning' }));
const variables = { targetVocabulary: vocabularyItems };
const generated = () => structuredClone(GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS);
const build = (answer, random) => stageContent('grammar-focus', answer, { variables, random });

test('Template 2 Grammar Focus fills the synthetic structure and keeps other stages', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const skeleton = templateTwoSkeleton('Travel');
  const synthetic = syntheticLesson('template-2');
  const { lesson } = applyStage('grammar-focus', GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS, { variables, random: () => 0 });
  for (const id of ['watch-and-interact', 'guided-speaking', 'wrap-up']) {
    assert.deepEqual(byId(lesson.stages, id), byId(skeleton.stages, id));
  }
  const content = byId(lesson.stages, 'grammar-focus').content;
  const syntheticContent = byId(synthetic.stages, 'grammar-focus').content;
  assert.deepEqual(content.map(component => component.id), syntheticContent.map(component => component.id));
  assert.deepEqual(content.map(component => component.type), syntheticContent.map(component => component.type));

  const note = byId(content, 'grammar-focus-teacher-note');
  assert.deepEqual(note.blocks, byId(syntheticContent, 'grammar-focus-teacher-note').blocks.map((block, index) => ({
    ...block, text: Object.values(GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS.teacherNotes)[index],
  })));
  const choices = byId(content, 'grammar-focus-choose-the-correct-options');
  assert.match(choices.text, /^\*\*1\.\*\* Last summer, we \[\[choice-1\]\] a long journey by train\./);
  // The application shuffles the options instead of trusting the model's order.
  assert.deepEqual(choices.choices[0].options, ['make', 'making', 'made']);
  assert.match(byId(content, 'grammar-focus-answer-key').sections[1].text, /^1\. Last summer shows/);
  const gaps = byId(content, 'grammar-focus-complete-the-gaps');
  assert.deepEqual(gaps.gaps[2], { id: 'gap-3', answer: 'did not find', example: 'not find' });
  assert.match(byId(content, 'grammar-focus-complete-the-gaps-answer-key').sections[1].text, /^\*\*5\.\*\* missed/);
  const correction = byId(content, 'grammar-focus-correct-the-mistakes');
  assert.deepEqual(correction.items[3].answers, ['I didn’t find my seat.', 'I did not find my seat.']);
  assert.match(byId(content, 'grammar-focus-correct-the-mistakes-answer-key').sections[0].text, /I didn’t find my seat\. \/ I did not find my seat\./);
  assert.equal(byId(content, 'grammar-focus-match-sentence-halves').items.length, 6);
  const translation = byId(content, 'grammar-focus-translate-sentences');
  assert.equal(translation.studentVisibility, 'controlled');
  assert.match(translation.text, /^\*\*1\.\*\* Вчера я купил билет\. \[\[translation-1\]\]/);
  assert.equal(translation.gaps[3].answer, 'Did you find your seat?');
  const support = byId(byId(content, 'grammar-focus-practice-support-row').items, 'grammar-focus-support');
  assert.match(support.text, /\*\*Word bank:\*\* ticket, platform, luggage, delay, journey, passport, seat, timetable\n/);
  assert.equal(warn.mock.callCount(), 0);
});

test('Template 2 Grammar Focus fails only on unsolvable tasks', t => {
  t.mock.method(console, 'warn', () => {});
  for (const mutate of [
    g => g.task1Items.pop(),
    g => { g.task1Items[0].answer = 'went'; },
    g => { g.task1Items[0].options[1] = g.task1Items[0].options[0]; },
    g => { g.correctionItems[0].corrections = ['**']; },
    g => { g.matchingItems[1].right = g.matchingItems[0].right; },
    g => { g.task2Items[0].before = 'Yesterday, I [[x]] '; },
    g => { g.teacherNotes.struggleTips = ' '; },
  ]) {
    const invalid = generated();
    mutate(invalid);
    assert.throws(() => build(invalid));
  }
});

test('Template 2 Grammar Focus logs content-quality problems instead of failing', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const soft = generated();
  soft.task1Items[0].before = 'Last summer, *we* ';
  soft.task2Items[1] = { before: '', after: '', cue: 'leave', answer: 'left' };
  soft.correctionItems[0].corrections = ['We buyed tickets at the station.', 'We bought tickets at the station.', 'we bought tickets at the station'];
  soft.translations[0] = { ru: 'Yesterday I bought a ticket.', en: 'Вчера я купил билет' };
  soft.modelSentence = 'Вчера я купил билет.';
  soft.supportWordBank = [...TRAVEL_TERMS.slice(0, 6), 'suitcase', 'Ticket'];
  const content = build(soft);
  assert.match(byId(content, 'grammar-focus-choose-the-correct-options').text, /^\*\*1\.\*\* Last summer, we \[\[/);
  assert.deepEqual(byId(content, 'grammar-focus-correct-the-mistakes').items[0].answers,
    ['We buyed tickets at the station.', 'We bought tickets at the station.']);
  const support = byId(byId(content, 'grammar-focus-practice-support-row').items, 'grammar-focus-support');
  assert.match(support.text, /\*\*Word bank:\*\* ticket, platform, luggage, delay, journey, passport, suitcase\n/);
  const warnings = warn.mock.calls.map(call => call.arguments[0]).join('\n');
  for (const pattern of [
    /Task 1\. Choose the correct options\.»: убрана Markdown-разметка в предложении 1/,
    /Task 2\. Complete the gaps with the correct form of the verbs\.»: в предложении 2 нет текста вокруг ответа/,
    /«Task 3\. Correct the mistakes\.»: исправление в предложении 1 совпадает/,
    /в переводе 1 русское предложение без кириллицы/, /в переводе 1 английский ответ содержит кириллицу/,
    /«Support» содержит кириллицу в английском тексте: Вчера я купил билет\./,
    /слово не из словаря в банке слов: suitcase/, /повтор в банке слов: Ticket/,
  ]) {
    assert.match(warnings, pattern);
  }
});

test('Template 2 Grammar Focus prompt receives grammar and vocabulary', () => {
  const { messages, schema } = stageRequest('grammar-focus', { variables, profile: { ageGroup: '15-17', level: 'B1' } });
  assert.match(messages[0].content, /exactly eight task1Items/);
  assert.match(messages[0].content, /task2Items are separate sentences, not a dialogue/);
  assert.match(messages[0].content, /exactly one mistake in the target grammar/);
  assert.match(messages[0].content, /exactly six matchingItems/);
  assert.match(messages[0].content, /exactly ten translations/);
  assert.match(messages[0].content, /Select exactly eight distinct entries from Target Vocabulary for supportWordBank/);
  assert.match(messages[0].content, /measurable success criteria for Tasks 1–4/);
  assert.doesNotMatch(messages[0].content, /miniSituation|\{\{gap\}\} markers in reading order/);
  assert.equal(messages[1].content, `Lesson topic: Travel\nGrammar topic: Past Simple\nTarget Vocabulary: ${JSON.stringify(TRAVEL_TERMS)}`);
  assert.deepEqual(schema.properties.teacherNotes.required, ['transitionPhrases', 'struggleTips', 'correctionTiming', 'successCriteria']);
});

test('Template 2 recovery keeps Grammar Focus and drops an interrupted one', t => {
  // The shared recovery fixture has summer vocabulary, so the travel word bank only warns.
  t.mock.method(console, 'warn', () => {});
  const skeleton = templateTwoSkeleton('Summer time');
  const beforeFocus = `${TEMPLATE_TWO_OUTPUT_BEFORE_GRAMMAR}\n\n=== Grammar Presentation ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GRAMMAR_PRESENTATION)}`;
  const output = `${beforeFocus}\n\n=== Grammar Focus ===\n${JSON.stringify(GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS)}`;
  const recovered = recoverLessonGeneration(output, skeleton, templateTwoPlan());
  assert.equal(recovered.validOutput, output);
  assert.deepEqual(recovered.recoveredSections['grammar-focus'], GENERATED_TEMPLATE_TWO_GRAMMAR_FOCUS);
  const interrupted = recoverLessonGeneration(`${beforeFocus}\n\n=== Grammar Focus ===\n{"teacherNotes":`, skeleton, templateTwoPlan());
  assert.equal(interrupted.complete, false);
  assert.equal(interrupted.validOutput, beforeFocus);
});
