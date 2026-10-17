'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { controlExample, describeControls, previewLessonTemplate } = require('../lib/lesson-template-editor.js');
const Statics = require('../assets/lesson-template-statics.js');
const MarkdownCard = require('../assets/components/markdown-card.js');
const { CARD_ICONS } = require('../lib/lesson-templates/chrome-fields.js');
const { findSystemTemplate } = require('../lib/lesson-templates/system-templates.js');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');

const templateTwo = () => structuredClone(findSystemTemplate('template-2').definition);
const stage = (definition, id) => definition.stages.find(candidate => candidate.id === id);

test('the preview builds the sample lesson and describes its generated blocks', () => {
  const preview = previewLessonTemplate({ definition: templateTwo(), systemTemplateId: 'template-2' });
  assert.deepEqual(preview.errors, []);
  assert.equal(preview.lesson.stages.length, 8);
  assert.deepEqual(previewLessonTemplate({ definition: templateTwo(), systemTemplateId: 'template-2' }), preview);

  const stories = preview.blocks['target-vocabulary-stories'];
  assert.match(stories.rules[0], /exactly four short first-person stories \(40–60 words each\)/);
  assert.ok(stories.rules.every(rule => !rule.includes('Four different people')), 'rules leave out the instructions');
  assert.equal(Object.hasOwn(preview.blocks, 'target-vocabulary-guess-answers'), false, 'only generated blocks are described');
});

test('the preview tells which stages reach the model and their default instructions', () => {
  const definition = templateTwo();
  const system = templateTwo();
  stage(definition, 'wrap-up').instructions = 'Keep it short.';

  const { stages } = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.deepEqual(Object.keys(stages), definition.stages.map(item => item.id));
  assert.deepEqual(stages['watch-and-interact'], { usesModel: false, defaultInstructions: '' });
  assert.equal(stages['wrap-up'].usesModel, true);
  assert.equal(stages['wrap-up'].defaultInstructions, stage(system, 'wrap-up').instructions);

  const orphan = previewLessonTemplate({ definition, systemTemplateId: null });
  assert.equal(orphan.stages['wrap-up'].defaultInstructions, '');
});

test('a stage icon must be one the lesson page draws; older names stay valid', () => {
  const definition = templateTwo();
  assert.equal(stage(definition, 'lead-in').icon, 'compass');
  stage(definition, 'wrap-up').icon = 'rocket';
  const { errors } = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.deepEqual(errors, [{ message: 'У этапа wrap-up неизвестная иконка rocket.', stage: 'wrap-up' }]);
});

test('chrome values are checked by their field; a left out key takes the default', () => {
  const definition = templateTwo();
  const block = id => stage(definition, id === 'target-vocabulary-card' ? 'target-vocabulary' : 'grammar-presentation')
    .blocks.find(candidate => candidate.id === id);
  block('target-vocabulary-card').chrome = { title: ' ', icon: 'rocket', accentColor: 'green', studentVisibility: 'sometimes' };
  block('grammar-presentation-concept-checking').chrome.showBorder = 'yes';
  const { errors } = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.deepEqual(errors.map(({ block: id, chrome, detail }) => [id, chrome, detail]), [
    ['target-vocabulary-card', 'title', 'нужен непустой текст'],
    ['target-vocabulary-card', 'icon', 'нужно одно из: Книга, Галочка, Диалог, Лампочка, Ключ, Карандаш, Спасательный круг, Кубок'],
    ['target-vocabulary-card', 'accentColor', 'нужен цвет вида #RRGGBB'],
    ['target-vocabulary-card', 'studentVisibility', 'нужно одно из: Всегда, По кнопке учителя, Только учителю'],
    ['grammar-presentation-concept-checking', 'showBorder', 'нужно да или нет'],
  ]);
  assert.equal(errors[0].message, 'Блок target-vocabulary-card, «Заголовок»: нужен непустой текст.');

  block('target-vocabulary-card').chrome = { accentColor: '#3563d4' };
  delete block('grammar-presentation-concept-checking').chrome.showBorder;
  const { errors: none, lesson } = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.deepEqual(none, []);
  const card = lesson.stages.find(item => item.id === 'target-vocabulary').content
    .find(component => component.id === 'target-vocabulary-card');
  assert.deepEqual([card.title, card.icon, card.accentColor], ['Vocabulary', 'book', '#3563d4']);
});

test('card icons are the ones markdownCard draws', () => {
  assert.deepEqual(Object.keys(CARD_ICONS), MarkdownCard.icons);
});

test('default instructions come from the system template, then from the control', () => {
  const definition = templateTwo();
  const original = stage(definition, 'target-vocabulary').blocks.find(block => block.id === 'target-vocabulary-stories');
  original.instructions = 'Only two people.';
  stage(definition, 'wrap-up').blocks.push({ id: 'wrap-up-questions', kind: 'generated', control: 'personalizedQuestions' });

  const { blocks } = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.match(blocks['target-vocabulary-stories'].defaultInstructions, /^Four different people/);
  assert.equal(blocks['wrap-up-questions'].defaultInstructions, CONTROL_CATALOG.get('personalizedQuestions').defaultInstructions);

  const orphan = previewLessonTemplate({ definition, systemTemplateId: null });
  assert.equal(orphan.blocks['target-vocabulary-stories'].defaultInstructions, CONTROL_CATALOG.get('storyCards').defaultInstructions);
});

test('a broken template previews as its problems only', () => {
  const definition = templateTwo();
  stage(definition, 'lead-in').blocks = stage(definition, 'lead-in').blocks.filter(block => block.id !== 'lead-in-fact-or-myth');
  const preview = previewLessonTemplate({ definition, systemTemplateId: 'template-2' });
  assert.equal(preview.lesson, null);
  assert.equal(preview.blocks, null);
  assert.equal(preview.stages, null);
  assert.ok(preview.errors.some(error => error.block === 'target-vocabulary-stories' && /leadInGuesses/.test(error.message)));
  assert.deepEqual(previewLessonTemplate({ definition: 'nope' }).errors, [{ message: 'Определение шаблона должно быть объектом.' }]);
});

test('controls are described for the editor with labelled parameters and chrome', () => {
  const { controls, variableTypes, stageIcons } = describeControls();
  assert.equal(controls.length, CONTROL_CATALOG.size);
  assert.deepEqual(JSON.parse(JSON.stringify(controls)), controls, 'plain data only');
  assert.equal(variableTypes.vocabulary, 'словарь');
  assert.equal(Object.keys(stageIcons.icons).length, 9);
  assert.equal(stageIcons.icons.cap, 'Шапочка');
  assert.deepEqual(stageIcons.aliases, { compass: 'pencil', check: 'question' });

  const stories = controls.find(control => control.type === 'storyCards');
  assert.deepEqual(stories.params.minWords, {
    type: 'integer', label: 'Слов в истории: от', min: 10, max: 150, default: 40, atMost: 'maxWords',
  });
  assert.deepEqual(stories.chrome.map(field => field.label), ['Заголовок', 'Цвета карточек']);
  assert.deepEqual(stories.inputs, {
    highlight: { type: 'vocabulary', required: false, requires: [], sameStage: true },
    guesses: { type: 'statements', required: false, requires: [], sameStage: false },
  });
  // What the catalog needs to link a new block: features a producer turns on with a flag,
  // features an input requires, and the blocks one built from others accepts.
  const byType = type => controls.find(control => control.type === type);
  assert.deepEqual(byType('vocabularyList').outputs.vocabulary.features, { distractor: 'distractors', imagePrompt: 'imagePrompts' });
  assert.deepEqual(byType('matchPictures').inputs.vocabulary.requires, ['imagePrompt']);
  assert.deepEqual(byType('repeatAudio').sources, { accepts: ['audioScript'], single: true });
  assert.equal(byType('answerKey').sources.single, false);
  assert.ok(byType('answerKey').sources.accepts.includes('contextDropdown'));
  assert.equal(byType('contextDropdown').sources, undefined);
  assert.equal(controls.find(control => control.type === 'teacherNoteSections').params.sections.type, 'custom');
  const icon = controls.find(control => control.type === 'listCard').chrome.find(field => field.key === 'icon');
  assert.equal(icon.type, 'choice');
  assert.equal(icon.options.lifeRing, 'Спасательный круг');
});

test('every block of the catalog has a group and a description; static ones come with a sample', () => {
  const { controls, statics, groups } = describeControls();
  assert.equal(controls.length + statics.length, 51);
  for (const block of [...controls, ...statics]) {
    assert.ok(groups.some(group => group.key === block.group), `${block.type}: группа ${block.group}`);
    assert.ok(block.description.trim().length > 0, block.type);
    assert.ok(block.description.length <= 90, `${block.type}: описание длиннее одной строки`);
  }
  assert.deepEqual(groups.map(group => group.label), ['Заметки и карточки', 'Лексика', 'Грамматика', 'Чтение и аудирование', 'Говорение', 'Ответы']);
  for (const { key } of groups) assert.ok([...controls, ...statics].some(block => block.group === key), key);
  assert.deepEqual(statics.map(block => block.type).sort(), Object.keys(Statics.STATIC_BLOCKS).sort());
  for (const { type, sample } of statics) {
    assert.equal(sample.type, type);
    assert.doesNotThrow(() => Statics.checkStaticComponent({ id: 'new-block', ...sample }), type);
  }
});

test('every control has a catalog sample built with its default parameters', () => {
  for (const control of CONTROL_CATALOG.values()) {
    const component = controlExample(control.type);
    assert.equal(component?.id, 'catalog-example', control.type);
  }
  // Inputs read sample variables, and a block built from others gets a source it accepts.
  assert.equal(controlExample('contextDropdown').choices.length, CONTROL_CATALOG.get('contextDropdown').params.gaps.default);
  assert.equal(controlExample('repeatAudio').type, 'audioPlayer');
  assert.equal(controlExample('answerKey').type, 'markdownCard');
  assert.equal(controlExample('contextDropdown'), controlExample('contextDropdown'));
  assert.equal(controlExample('missing'), null);
});
