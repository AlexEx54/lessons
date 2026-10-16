'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createControlCatalog } = require('../lib/lesson-templates/control-catalog.js');
const { flag, integer } = require('../lib/template-controls/helpers.js');
const { compileTemplate } = require('../lib/lesson-templates/template-engine.js');
const { TemplateValidationError, validateTemplate } = require('../lib/lesson-templates/validate-template.js');

const stringArray = count => ({ type: 'array', minItems: count, maxItems: count, items: { type: 'string', minLength: 1 } });

// Small stand-ins for real controls: enough behaviour to exercise every engine path.
const CONTROLS = [
  {
    type: 'guessGame',
    fields: ['checks', 'guesses'],
    params: { checks: integer('Проверок', 1, 4, 2), guesses: integer('Догадок', 1, 3, 1) },
    chrome: ['title'],
    outputs: { guesses: { type: 'statements', field: 'guesses' } },
    schema: ({ params }) => ({ checks: stringArray(params.checks), guesses: stringArray(params.guesses) }),
    rules: ({ params, f }) => [`${f.checks}: exactly ${params.checks} statements.`, `${f.guesses}: exactly ${params.guesses} statements.`],
    defaultInstructions: 'Statements must be short.',
    build: (data, { id, chrome }) => ({ type: 'factOrMyth', id, title: chrome.title, items: [...data.checks, ...data.guesses] }),
    exports: (component, { params }) => ({
      guesses: component.items.slice(-params.guesses).map((text, index) => ({ number: params.checks + index + 1, text })),
    }),
    answerKey: component => [{ text: component.items.join(' / ') }],
    example: ({ params }) => ({
      checks: Array.from({ length: params.checks }, (_, index) => `Check ${index + 1}.`),
      guesses: Array.from({ length: params.guesses }, (_, index) => `Guess ${index + 1}.`),
    }),
  },
  {
    type: 'wordList',
    fields: ['words'],
    params: { count: integer('Слов', 2, 10, 3), distractors: flag('Отвлекающие варианты', false) },
    outputs: { vocabulary: { type: 'vocabulary', field: 'words', features: params => (params.distractors ? ['distractor'] : []) } },
    schema: ({ params }) => ({ words: { type: 'array', minItems: params.count, maxItems: params.count, items: { type: 'object' } } }),
    rules: ({ params, f }) => [`${f.words}: exactly ${params.count} items.`],
    defaultInstructions: 'Useful words for the topic.',
    build: (data, { id }) => ({ type: 'markdownCard', id, items: data.words }),
    exports: component => ({ vocabulary: component.items }),
    example: ({ params }) => ({
      words: Array.from({ length: params.count }, (_, index) => ({
        term: `word${index + 1}`, definition: `meaning ${index + 1}`, distractor: `wrong ${index + 1}`,
      })),
    }),
  },
  {
    type: 'stories',
    fields: ['stories'],
    params: { count: integer('Историй', 1, 6, 2) },
    inputs: {
      highlight: {
        type: 'vocabulary',
        required: true,
        sameStageRule: ({ source }) => `Put every item of ${source.field} in bold exactly once.`,
      },
      guesses: {
        type: 'statements',
        producerHint: ({ params }) => `Later the student reads ${params.count} stories that answer the guesses.`,
      },
    },
    schema: ({ params }) => ({ stories: stringArray(params.count) }),
    rules: ({ params, f }) => [`${f.stories}: exactly ${params.count} stories.`],
    build: (data, { id, links }) => {
      const text = data.stories.join(' ');
      for (const item of links.highlight.value) {
        if (!text.includes(`**${item.term}**`)) throw new Error(`Story misses ${item.term}.`);
      }
      return { type: 'storyCards', id, stories: data.stories, guesses: links.guesses?.value.map(guess => guess.number) };
    },
    example: ({ params, links }) => ({
      stories: Array.from({ length: params.count }, (_, index) => (index === 0
        ? links.highlight.value.map(item => `**${item.term}**`).join(' ')
        : `Story ${index + 1}.`)),
    }),
  },
  {
    type: 'meaningsQuiz',
    kind: 'derived',
    inputs: { vocabulary: { type: 'vocabulary', required: true, requires: ['distractor'] } },
    build: (_data, { id, links }) => ({ type: 'multipleChoice', id, items: links.vocabulary.value.map(item => item.term) }),
  },
  {
    type: 'pickWords',
    kind: 'derived',
    inputs: { vocabulary: { type: 'vocabulary', required: true } },
    outputs: { vocabulary: 'vocabulary' },
    build: (_data, { id, links }) => ({ type: 'markdownCard', id, items: links.vocabulary.value.slice(0, 2) }),
    exports: component => ({ vocabulary: component.items }),
  },
  {
    type: 'answerKey',
    kind: 'derived',
    chrome: ['title'],
    acceptsSource: control => (control.answerKey ? null : `у ${control.type} нет ключа ответов.`),
    build: ({ sources }, { id, chrome }) => ({
      type: 'markdownCard',
      id,
      title: chrome.title || 'Answer key',
      text: sources.flatMap(source => source.control.answerKey(source.component)).map(part => part.text).join('\n'),
    }),
  },
  {
    type: 'bullets',
    fields: ['items'],
    params: { count: integer('Строк', 1, 5, 2) },
    schema: ({ params }) => ({ items: stringArray(params.count) }),
    rules: ({ params, f }) => [`${f.items}: exactly ${params.count} items.`, 'Write list items without Markdown.'],
    build: (data, { id }) => ({ type: 'markdownCard', id, text: data.items.join('\n') }),
    example: ({ params }) => ({ items: Array.from({ length: params.count }, (_, index) => `Item ${index + 1}`) }),
  },
];

const catalog = createControlCatalog(CONTROLS);

// Display order differs from data-flow order: Recap is shown second but needs Vocabulary.
function definition() {
  return {
    schemaVersion: 'lesson-template-v1',
    id: 'test-template',
    title: 'Test template',
    inputs: {
      topic: { label: 'Тема урока' },
      warmUpTopic: { label: 'Тема разминки', optional: true, fallback: 'topic' },
    },
    stages: [
      {
        id: 'intro', title: 'Intro', durationMinutes: 2, icon: 'video',
        blocks: [{ id: 'intro-video', kind: 'static', component: { type: 'videoPlayer', title: 'Watch' } }],
      },
      {
        id: 'recap', title: 'Recap', durationMinutes: 3,
        context: { 'Target Vocabulary': '$var.lessonWords' },
        blocks: [
          { id: 'recap-quiz', kind: 'derived', control: 'meaningsQuiz', inputs: { vocabulary: 'lessonWords' } },
        ],
      },
      {
        id: 'guess', title: 'Guess', durationMinutes: 5,
        context: { 'Lesson topic': '$input.warmUpTopic' },
        instructions: 'Generate a Fact or Myth warm-up.',
        blocks: [
          { id: 'guess-note', kind: 'static', component: { type: 'teacherNote', text: 'Say "{{firstCheck}}" first. Success: {{success}}' },
            slots: { firstCheck: { from: 'guess-game.items[0]' }, success: { rule: 'One measurable sentence.' } } },
          { id: 'guess-game', kind: 'generated', control: 'guessGame', params: { checks: 2 }, chrome: { title: 'Fact or Myth?' },
            exports: { guesses: 'guesses' } },
          { id: 'guess-key', kind: 'derived', control: 'answerKey', from: ['guess-game'] },
        ],
      },
      {
        id: 'vocabulary', title: 'Vocabulary', durationMinutes: 8,
        context: { 'Lesson topic': '$input.topic', 'Guess statements': '$var.guesses' },
        blocks: [
          { id: 'vocabulary-stories', kind: 'generated', control: 'stories', inputs: { highlight: 'lessonWords', guesses: 'guesses' } },
          { id: 'vocabulary-list', kind: 'generated', control: 'wordList', params: { distractors: true },
            fields: { words: 'vocabularyItems' }, exports: { vocabulary: 'lessonWords' }, instructions: 'Words about the topic.' },
          { id: 'vocabulary-support', kind: 'row', blocks: [
            { id: 'vocabulary-starters', kind: 'generated', control: 'bullets', fields: { items: 'sentenceStarters' } },
            { id: 'vocabulary-challenge', kind: 'generated', control: 'bullets', fields: { items: 'challengeItems' } },
          ] },
        ],
      },
    ],
  };
}

const GUESS_ANSWER = {
  checks: ['Cats can swim.', 'Dogs fly.'],
  guesses: ['Somebody in our stories has a red hat.'],
  success: 'The student explains two answers.',
};
const VOCABULARY_ANSWER = {
  stories: ['I have a **hat** and a **scarf**.', 'My **boots** are new.'],
  vocabularyItems: [
    { term: 'hat', definition: 'You wear it on your head.', distractor: 'You wear it on your feet.' },
    { term: 'scarf', definition: 'You wear it round your neck.', distractor: 'You eat it.' },
    { term: 'boots', definition: 'Strong shoes.', distractor: 'A kind of bread.' },
  ],
  sentenceStarters: ['I like…', 'My favourite…'],
  challengeItems: ['Use a negative.', 'Ask a question.'],
};

function runAll(plan, answers) {
  const inputs = plan.resolveInputs({ topic: 'Clothes' });
  let state = { lesson: plan.createSkeleton({ topic: 'Clothes', title: 'Clothes' }), variables: {} };
  for (const step of plan.steps) {
    const request = step.needsModel ? plan.request(step.key, { inputs, variables: state.variables, preamble: 'Target learner: A2' }) : null;
    state = plan.apply(step.key, state, answers[step.key]);
    if (request) state.requests = { ...state.requests, [step.key]: request };
  }
  return state;
}

test('steps follow data flow while the skeleton keeps display order', () => {
  const plan = compileTemplate(definition(), catalog);
  assert.deepEqual(plan.steps.map(step => [step.key, step.needsModel]), [
    ['guess', true], ['vocabulary', true], ['recap', false],
  ]);

  const skeleton = plan.createSkeleton({ topic: 'Clothes' });
  assert.equal(skeleton.schemaVersion, 'lesson-draft-v1');
  assert.deepEqual(skeleton.meta, { lessonNumber: 1, durationMinutes: 18, topic: 'Clothes' });
  assert.deepEqual(skeleton.stages.map(stage => [stage.id, stage.number, stage.content.length]), [
    ['intro', 1, 1], ['recap', 2, 0], ['guess', 3, 0], ['vocabulary', 4, 0],
  ]);
  assert.deepEqual(skeleton.stages[0], {
    id: 'intro', title: 'Intro', durationMinutes: 2, icon: 'video', number: 1,
    content: [{ type: 'videoPlayer', title: 'Watch', id: 'intro-video' }],
  });
});

test('stage request assembles the prompt, the flat schema and the context', () => {
  const plan = compileTemplate(definition(), catalog);
  const guess = plan.request('guess', { inputs: plan.resolveInputs({ topic: 'Clothes' }), preamble: 'Target learner: A2' });
  assert.equal(guess.messages[0].content, [
    'Target learner: A2',
    'You design one-to-one English lessons.',
    'Generate a Fact or Myth warm-up.',
    'Later the student reads 2 stories that answer the guesses.',
    'checks: exactly 2 statements.',
    'guesses: exactly 1 statements.',
    'Statements must be short.',
    'success: One measurable sentence.',
    'Return JSON matching the supplied schema and nothing else.',
  ].join('\n'));
  // warmUpTopic falls back to topic.
  assert.equal(guess.messages[1].content, 'Lesson topic: Clothes');
  // Answer fields follow display order: the note with the slot comes before the game.
  assert.deepEqual(guess.schema.required, ['success', 'checks', 'guesses']);
  assert.equal(guess.schema.additionalProperties, false);
  assert.equal(guess.schemaName, 'easyclass_guess');

  const vocabulary = plan.request('vocabulary', {
    inputs: plan.resolveInputs({ topic: 'Clothes' }),
    variables: { guesses: [{ number: 3, text: 'Somebody has a hat.' }, { number: 4, text: 'Somebody is cold.' }] },
  });
  assert.equal(vocabulary.messages[0].content, [
    'You design one-to-one English lessons.',
    'stories: exactly 2 stories.',
    'Put every item of vocabularyItems in bold exactly once.',
    'vocabularyItems: exactly 3 items.',
    'Words about the topic.',
    'sentenceStarters: exactly 2 items.',
    // Both lists share this rule; the prompt keeps it once.
    'Write list items without Markdown.',
    'challengeItems: exactly 2 items.',
    'Return JSON matching the supplied schema and nothing else.',
  ].join('\n'));
  assert.equal(vocabulary.messages[1].content, [
    'Lesson topic: Clothes',
    'Guess statements:',
    '1. Somebody has a hat.',
    '2. Somebody is cold.',
  ].join('\n'));
  assert.deepEqual(vocabulary.schema.required, ['stories', 'vocabularyItems', 'sentenceStarters', 'challengeItems']);
});

test('apply builds stages in display order, fills slots and passes variables on', () => {
  const plan = compileTemplate(definition(), catalog);
  const state = runAll(plan, { guess: GUESS_ANSWER, vocabulary: VOCABULARY_ANSWER });
  const [, recap, guess, vocabulary] = state.lesson.stages;

  assert.deepEqual(guess.content.map(component => component.id), ['guess-note', 'guess-game', 'guess-key']);
  assert.equal(guess.content[0].text, 'Say "Cats can swim." first. Success: The student explains two answers.');
  assert.equal(guess.content[2].text, 'Cats can swim. / Dogs fly. / Somebody in our stories has a red hat.');

  assert.deepEqual(vocabulary.content.map(component => component.id), ['vocabulary-stories', 'vocabulary-list', 'vocabulary-support']);
  assert.deepEqual(vocabulary.content[0].guesses, [3]);
  assert.deepEqual(vocabulary.content[2], {
    type: 'cardRow',
    id: 'vocabulary-support',
    items: [
      { type: 'markdownCard', id: 'vocabulary-starters', text: 'I like…\nMy favourite…' },
      { type: 'markdownCard', id: 'vocabulary-challenge', text: 'Use a negative.\nAsk a question.' },
    ],
  });
  assert.deepEqual(recap.content, [{ type: 'multipleChoice', id: 'recap-quiz', items: ['hat', 'scarf', 'boots'] }]);
  assert.deepEqual(Object.keys(state.variables), ['guesses', 'lessonWords']);
  assert.deepEqual(state.variables.guesses, [{ number: 3, text: 'Somebody in our stories has a red hat.' }]);
});

test('apply rejects an answer without a required field and control validation errors', () => {
  const plan = compileTemplate(definition(), catalog);
  const state = { lesson: plan.createSkeleton(), variables: {} };
  assert.throws(() => plan.apply('guess', state, { checks: ['A.', 'B.'], guesses: ['C.'] }), /нет поля success/);

  const guessed = plan.apply('guess', state, GUESS_ANSWER);
  assert.throws(
    () => plan.apply('vocabulary', guessed, { ...VOCABULARY_ANSWER, stories: ['No bold words.', 'None here.'] }),
    /Story misses hat/,
  );
  assert.throws(() => plan.apply('recap', state), /lessonWords ещё не готова/);
});

test('example run builds every stage without the model', () => {
  const plan = compileTemplate(definition(), catalog);
  let state = { lesson: plan.createSkeleton(), variables: {} };
  for (const step of plan.steps) state = plan.applyExample(step.key, state, { random: () => 0 });
  const guess = state.lesson.stages.find(stage => stage.id === 'guess');
  assert.equal(guess.content[0].text, 'Say "Check 1." first. Success: One measurable sentence.');
  assert.deepEqual(state.lesson.stages[1].content[0].items, ['word1', 'word2', 'word3']);
});

test('inputs are trimmed, fall back, and required ones must be filled', () => {
  const plan = compileTemplate(definition(), catalog);
  assert.deepEqual(plan.resolveInputs({ topic: ' Clothes ', warmUpTopic: ' Hats ' }), { topic: 'Clothes', warmUpTopic: 'Hats' });
  assert.deepEqual(plan.resolveInputs({ topic: 'Clothes', warmUpTopic: '  ' }), { topic: 'Clothes', warmUpTopic: 'Clothes' });
  assert.throws(() => plan.resolveInputs({}), error => error.statusCode === 400 && /«Тема урока»/.test(error.message));
});

function errorsAfter(change) {
  const broken = definition();
  change(broken);
  return validateTemplate(broken, catalog).errors.map(error => error.message);
}

const stage = (template, id) => template.stages.find(candidate => candidate.id === id);
const block = (template, stageId, blockId) => stage(template, stageId).blocks.find(candidate => candidate.id === blockId);

test('validation reports broken links between blocks', () => {
  assert.match(
    errorsAfter(template => { block(template, 'recap', 'recap-quiz').inputs.vocabulary = 'missingWords'; }).join('\n'),
    /читает переменную missingWords, которую никто не отдаёт/,
  );
  assert.match(
    errorsAfter(template => { block(template, 'recap', 'recap-quiz').inputs.vocabulary = 'guesses'; }).join('\n'),
    /ждёт словарь, а guesses — утверждения/,
  );
  assert.match(
    errorsAfter(template => { block(template, 'vocabulary', 'vocabulary-list').params.distractors = false; }).join('\n'),
    /требует у lessonWords: distractor/,
  );
  assert.match(
    errorsAfter(template => { delete stage(template, 'vocabulary').context['Guess statements']; }).join('\n'),
    /читает guesses из этапа guess: добавьте её в context этапа vocabulary/,
  );
  assert.match(
    errorsAfter(template => { block(template, 'guess', 'guess-game').exports.guesses = 'lessonWords'; }).join('\n'),
    /lessonWords отдают два блока/,
  );
  assert.match(
    errorsAfter(template => { delete block(template, 'vocabulary', 'vocabulary-stories').inputs.highlight; }).join('\n'),
    /нужен вход highlight \(словарь\)/,
  );
});

test('validation reports cycles, same-stage limits and answer field collisions', () => {
  assert.match(
    errorsAfter(template => {
      stage(template, 'guess').context.Words = '$var.lessonWords';
    }).join('\n'),
    /Этапы зависят друг от друга по кругу: guess, vocabulary/,
  );
  assert.match(
    errorsAfter(template => {
      const vocabulary = stage(template, 'vocabulary');
      vocabulary.blocks.push({ id: 'vocabulary-picked', kind: 'derived', control: 'pickWords', inputs: { vocabulary: 'lessonWords' }, exports: { vocabulary: 'pickedWords' } });
      vocabulary.blocks.push({ id: 'vocabulary-more', kind: 'generated', control: 'stories', inputs: { highlight: 'pickedWords' } });
    }).join('\n'),
    /vocabulary-more генерируется до того, как собран vocabulary-picked/,
  );
  assert.match(
    errorsAfter(template => { block(template, 'vocabulary', 'vocabulary-list').fields = { words: 'stories' }; }).join('\n'),
    /поле ответа stories занято дважды/,
  );
  assert.match(
    errorsAfter(template => { stage(template, 'vocabulary').blocks[2].blocks[1].fields = {}; stage(template, 'vocabulary').blocks[2].blocks[0].fields = {}; }).join('\n'),
    /поле ответа items занято дважды/,
  );
});

test('validation reports block-level mistakes', () => {
  const messages = errorsAfter(template => {
    const guess = stage(template, 'guess');
    block(template, 'guess', 'guess-game').params.checks = 9;
    block(template, 'guess', 'guess-game').params.colour = 'red';
    block(template, 'guess', 'guess-game').chrome.accentColor = '#fff';
    block(template, 'guess', 'guess-note').component.text += ' {{unknown}}';
    block(template, 'guess', 'guess-note').slots.unused = { rule: 'Never used.' };
    guess.blocks.push({ id: 'guess-key-2', kind: 'derived', control: 'answerKey', from: ['vocabulary-list'] });
    guess.blocks.push({ id: 'guess-starters', kind: 'generated', control: 'bullets' });
    guess.blocks.push({ id: 'guess-starters-key', kind: 'derived', control: 'answerKey', from: ['guess-starters'] });
    guess.blocks.push({ id: 'guess-mystery', kind: 'generated', control: 'mystery' });
    guess.blocks.push({ id: 'guess-game', kind: 'static', component: { type: 'teacherNote' } });
  }).join('\n');
  assert.match(messages, /Блок guess-game, «Проверок»: не больше 4/);
  assert.match(messages, /нет параметра colour/);
  assert.match(messages, /не поддерживает оформление accentColor/);
  assert.match(messages, /слот \{\{unknown\}\} не описан/);
  assert.match(messages, /Слот unused блока guess-note не используется/);
  assert.match(messages, /собирается из vocabulary-list, а такого блока нет в этапе guess/);
  assert.match(messages, /у bullets нет ключа ответов/);
  assert.match(messages, /неизвестный контрол mystery/);
  assert.match(messages, /Блок guess-game повторяется/);
});

test('compileTemplate throws all validation errors at once', () => {
  const broken = definition();
  broken.schemaVersion = 'lesson-template-v0';
  broken.stages[0].id = 'Intro';
  assert.throws(() => compileTemplate(broken, catalog), error => (
    error instanceof TemplateValidationError
      && error.statusCode === 400
      && error.errors.length === 2
  ));
});

test('the catalog rejects incomplete controls', () => {
  assert.throws(() => createControlCatalog([{ type: 'broken', build() {} }]), /нужен список fields/);
  assert.throws(() => createControlCatalog([CONTROLS[0], CONTROLS[0]]), /уже зарегистрирован/);
  assert.throws(
    () => createControlCatalog([{ ...CONTROLS[1], exports: undefined }]),
    /контрол с выходами должен реализовать exports/,
  );
  const withParams = params => () => createControlCatalog([{ ...CONTROLS[1], params }]);
  assert.throws(withParams({ count: { min: 2, max: 10, default: 3 } }), /у параметра count неизвестный тип/);
  assert.throws(withParams({ count: integer('', 2, 10, 3) }), /у параметра count нет подписи/);
  assert.throws(withParams({ count: integer('Слов', 2, 10, 12) }), /должен лежать между min и max/);
  assert.throws(
    withParams({ count: integer('Слов', 2, 10, 3, { atMost: 'distractors' }), distractors: flag('Ещё', false) }),
    /должен связывать два целых/,
  );
  assert.throws(() => createControlCatalog([{ ...CONTROLS[0], chrome: ['sparkle'] }]), /неизвестный ключ оформления sparkle/);
});

test('a parameter may not exceed the one its atMost names', () => {
  const params = {
    ...CONTROLS[1].params,
    minWords: integer('Слов: от', 1, 10, 2, { atMost: 'maxWords' }),
    maxWords: integer('Слов: до', 1, 10, 4),
  };
  const catalog = createControlCatalog([{ ...CONTROLS[1], params }]);
  const template = {
    schemaVersion: 'lesson-template-v1',
    id: 'order',
    title: 'Order',
    inputs: { topic: { label: 'Тема' } },
    stages: [{
      id: 'words',
      title: 'Words',
      blocks: [{ id: 'word-list', kind: 'generated', control: 'wordList', params: { minWords: 5, maxWords: 3 } }],
    }],
  };
  assert.deepEqual(validateTemplate(template, catalog).errors, [{
    stage: 'words', block: 'word-list', param: 'minWords', message: 'Блок word-list: «Слов: от» больше, чем «Слов: до».',
  }]);
  template.stages[0].blocks[0].params.maxWords = 30;
  assert.deepEqual(validateTemplate(template, catalog).errors.map(error => error.message), ['Блок word-list, «Слов: до»: не больше 10.']);
});
