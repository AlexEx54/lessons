'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTROL_CATALOG } = require('../lib/template-controls/index.js');
const { compileTemplate } = require('../lib/lesson-templates/template-engine.js');
const { validateTemplate } = require('../lib/lesson-templates/validate-template.js');
const { TEMPLATE_TWO, templateTwoSkeleton } = require('./helpers/template-two.js');

// A two-stage template around one generated block: the first stage provides a vocabulary
// and guesses, the second binds every input of the block to them. A task gets its key.
function singleBlockTemplate(control, params) {
  const sources = { vocabulary: 'words', statements: 'guesses' };
  return {
    schemaVersion: 'lesson-template-v1',
    id: 'catalog-check',
    title: 'Catalog check',
    inputs: { topic: { label: 'Тема' } },
    stages: [
      {
        id: 'sources',
        title: 'Sources',
        blocks: [
          { id: 'source-words', kind: 'generated', control: 'vocabularyList', params: { items: 12 }, exports: { vocabulary: 'words' } },
          { id: 'source-guesses', kind: 'generated', control: 'factOrMyth', exports: { guessStatements: 'guesses' } },
        ],
      },
      {
        id: 'checked',
        title: 'Checked',
        context: { 'Target Vocabulary': '$var.words', Guesses: '$var.guesses' },
        blocks: [{
          id: 'checked-block',
          kind: 'generated',
          control: control.type,
          params,
          inputs: Object.fromEntries(Object.entries(control.inputs).map(([port, spec]) => [port, sources[spec.type]])),
          ...(typeof control.answerKey === 'function' ? { answerKey: {} } : {}),
        }],
      },
    ],
  };
}

function exampleRun(template) {
  let state = { lesson: template.createSkeleton(), variables: {} };
  for (const step of template.steps) state = template.applyExample(step.key, state, { random: () => 0.5 });
  return state;
}

const extremes = (control, side) => Object.fromEntries(Object.entries(control.params)
  .filter(([, spec]) => spec[side] !== undefined)
  .map(([name, spec]) => [name, spec[side]]));

test('every generated control builds its example with default, smallest and largest parameters', t => {
  t.mock.method(console, 'warn', () => {});
  const generated = [...CONTROL_CATALOG.values()].filter(control => control.kind === 'generated');
  assert.ok(generated.length > 20);
  for (const control of generated) {
    for (const params of [{}, extremes(control, 'min'), extremes(control, 'max')]) {
      const template = compileTemplate(singleBlockTemplate(control, params), CONTROL_CATALOG);
      assert.doesNotThrow(() => exampleRun(template), `${control.type} ${JSON.stringify(params)}`);
      const { schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
      assert.ok(Object.keys(schema.properties).length > 0, control.type);
    }
  }
});

// Synthetic lessons are made of these examples, so they must pass the controls' own checks.
const silentWarnings = t => t.mock.method(console, 'warn', () => {});
const warnings = mock => mock.mock.calls.map(call => call.arguments[0]);

test('Template 2 builds a whole lesson from control examples without warnings', t => {
  const warn = silentWarnings(t);
  const state = exampleRun(TEMPLATE_TWO);
  assert.deepEqual(warnings(warn), []);
  const skeleton = templateTwoSkeleton('Topic');
  assert.deepEqual(state.lesson.stages.map(stage => stage.id), skeleton.stages.map(stage => stage.id));
  assert.ok(state.lesson.stages.every(stage => stage.content.length > 0));
  assert.deepEqual(Object.keys(state.variables).sort(), ['leadInGuesses', 'targetVocabulary']);
});

test('Template 1 builds a whole lesson from control examples without warnings', t => {
  const warn = silentWarnings(t);
  const definition = require('../lib/templates/template-1.json');
  const state = exampleRun(compileTemplate(definition, CONTROL_CATALOG));
  assert.deepEqual(warnings(warn), []);
  assert.deepEqual(state.lesson.stages.map(stage => stage.id), definition.stages.map(stage => stage.id));
  assert.ok(state.lesson.stages.every(stage => stage.content.length > 0));
  assert.deepEqual(Object.keys(state.variables), ['targetVocabulary']);
});

// The key of the block in a single-block template, built from the control's example.
function exampleKey(type, answerKey) {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get(type), {});
  definition.stages[1].blocks[0].answerKey = answerKey;
  const [, checked] = exampleRun(compileTemplate(definition, CONTROL_CATALOG)).lesson.stages;
  assert.deepEqual(checked.content.map(component => component.id), ['checked-block', 'checked-block-answer-key']);
  return checked.content[1];
}

test('an answer key follows its task: a list, two columns, or a section per part', () => {
  const list = exampleKey('oddOneOut', {});
  assert.deepEqual([list.title, list.studentVisibility, list.sections], ['Answer key', 'teacherOnly', undefined]);
  assert.match(list.text, /^1\. \*\*/);
  const columns = exampleKey('choiceQuestions', { title: 'Answer Key' });
  assert.deepEqual([columns.title, columns.layout, columns.sections.map(section => section.id)], ['Answer Key', 'columns', ['answers-left', 'answers-right']]);

  const parts = exampleKey('correctSentences', { layout: 'stacked', partTitles: { answers: 'Task 2' } });
  assert.equal(parts.layout, 'stacked');
  assert.deepEqual(parts.sections.map(section => [section.id, section.title]), [['answers', 'Task 2'], ['explanations', 'Short explanations']]);
  assert.match(parts.sections[0].text, /^Correct sentences: /);
  const text = exampleKey('correctSentences', { format: 'paragraphs' });
  assert.match(text.text, /^\*\*Answers\*\*\n\nCorrect sentences: .+\n\n\*\*Short explanations\*\*\n\n- /);
});


test('a key in several parts takes titles only for its own parts', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('correctSentences'), {});
  definition.stages[1].blocks[0].answerKey = { partTitles: { hints: 'Hints', explanations: ' ' } };
  const problems = validateTemplate(definition, CONTROL_CATALOG).errors.map(({ answerKey, part, detail }) => [answerKey, part, detail]);
  assert.deepEqual(problems, [
    ['partTitles', 'hints', 'у ключа нет части hints'],
    ['partTitles', 'explanations', 'Пояснения: нужен непустой текст'],
  ]);
});

// The rules carry only the shape of the answer; what the pairs are about is in the
// instructions, so the same block serves a topic warm-up and a vocabulary drill.
test('two This or That blocks in one stage keep their own rules and instructions', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('thisOrThat'), { pairs: 3 });
  definition.stages[1].blocks.push({
    id: 'checked-words', kind: 'generated', control: 'thisOrThat', fields: { choices: 'wordChoices' },
    instructions: 'Make each pair from two words of the Target Vocabulary.',
  });
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages, schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const topicPairs = lines.indexOf('Create exactly three This or That pairs in choices: in each pair the learner picks one of exactly two options.');
  const wordPairs = lines.indexOf('Create exactly four This or That pairs in wordChoices: in each pair the learner picks one of exactly two options.');
  assert.ok(topicPairs >= 0 && wordPairs > topicPairs);
  assert.equal(lines[topicPairs + 2], 'Make the two options in each pair clearly contrasting and engaging: things the learner can easily have an opinion about.');
  assert.equal(lines[wordPairs + 1], 'Make each pair from two words of the Target Vocabulary.');
  assert.deepEqual(Object.keys(schema.properties), ['choices', 'wordChoices']);
});

// Where the words of a matching task come from is up to its instructions: the lesson
// vocabulary or a list the teacher typed in.
test('two Match the Words blocks in one stage take their words from their own instructions', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('matchPictures'), { items: 4 });
  definition.stages[1].blocks[0].instructions = 'Use four terms of the Target Vocabulary, copied exactly.';
  definition.stages[1].blocks.push({
    id: 'own-words', kind: 'generated', control: 'matchPictures', params: { items: 5 }, fields: { items: 'ownWords' },
    instructions: 'Use these words: kite, tent, compass, ladder, camera.',
  });
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages, schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const vocabularyPictures = lines.indexOf('items: exactly four items for a word-to-picture matching task. term is the word or short phrase the learner sees; imagePrompt describes the picture that shows it.');
  const ownPictures = lines.indexOf('ownWords: exactly five items for a word-to-picture matching task. term is the word or short phrase the learner sees; imagePrompt describes the picture that shows it.');
  assert.ok(vocabularyPictures >= 0 && ownPictures > vocabularyPictures);
  assert.equal(lines[vocabularyPictures + 2], 'Use four terms of the Target Vocabulary, copied exactly.');
  assert.equal(lines[ownPictures + 1], 'Use these words: kite, tent, compass, ladder, camera.');
  assert.deepEqual(Object.keys(schema.properties), ['items', 'ownWords']);
});

// The words of the gaps come from the instructions too: the lesson vocabulary or any
// other words the teacher names.
test('a Vocabulary in Context block takes the words of its gaps from its instructions', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('contextDropdown'), { gaps: 4, options: 3 });
  definition.stages[1].blocks[0].instructions = 'Every answer and every option is a term of the Target Vocabulary.';
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const gaps = lines.indexOf('choices: one choice per gap, in the same order. options are three different words or short phrases, each in the form that fits the gap; answer is one of them, copied exactly.');
  assert.ok(gaps >= 0);
  assert.equal(lines[gaps + 1], 'Every answer and every option is a term of the Target Vocabulary.');
});

// Numbered sentences with explanations, as in the grammar stages, are the same control: the
// look of the text is in the instructions, the explanations are a flag.
test('a dropdown block with explanations asks for them and keys them in a second part', () => {
  const control = CONTROL_CATALOG.get('contextDropdown');
  const run = params => {
    const template = compileTemplate(singleBlockTemplate(control, { gaps: 3, options: 2, ...params }), CONTROL_CATALOG);
    const { schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
    const key = exampleRun(template).lesson.stages[1].content.find(item => item.id === 'checked-block-answer-key');
    return { schema, key };
  };
  const explained = run({ explanations: true });
  assert.deepEqual(explained.schema.properties.choices.items.required, ['options', 'answer', 'explanation']);
  assert.deepEqual(explained.key.sections.map(section => section.title), ['Answers', 'Short explanations']);
  assert.match(explained.key.sections[1].text, /^1\. Star Kid needs a umbrella\.\n2\. /);

  const plain = run({});
  assert.deepEqual(plain.schema.properties.choices.items.required, ['options', 'answer']);
  assert.equal(plain.key.sections, undefined);
  assert.match(plain.key.text, /^1\. \*\*umbrella\*\*\n/);

  const context = { id: 'check', params: { gaps: 1, options: 2, explanations: true }, chrome: {}, random: () => 0 };
  const choice = { options: ['has got', 'have got'], answer: 'has got', explanation: ' ' };
  assert.throws(() => control.build({ text: '**1.** He [[1]] a cape.', choices: [choice] }, context), /не заполнено: пояснение в пропуске 1/);
});

// A dialogue and numbered sentences are the same control: the look of the text is in the
// instructions, the cues are a flag.
test('a typed-gaps block numbers its gaps in the text and shows cues only when they are on', () => {
  const control = CONTROL_CATALOG.get('cueGaps');
  const context = cues => ({ id: 'gaps', params: { gaps: 2, cues }, chrome: {} });
  const text = '**Mia:** Where [[1]] you?\n**Leo:** I [[2]] to the sea.';
  const task = control.build({ text, gaps: [{ answer: 'were', cue: 'be' }, { answer: 'went', cue: '' }] }, context(true));
  assert.equal(task.text, '**Mia:** Where [[gap-1]] you?\n**Leo:** I [[gap-2]] to the sea.');
  assert.deepEqual(task.gaps, [{ id: 'gap-1', answer: 'were', example: 'be' }, { id: 'gap-2', answer: 'went' }]);
  assert.deepEqual(control.answerKey({ component: task }).lines, ['**1.** were', '**2.** went']);

  const plain = control.build({ text, gaps: [{ answer: 'were', cue: 'be' }, { answer: 'went' }] }, context(false));
  assert.deepEqual(plain.gaps, [{ id: 'gap-1', answer: 'were' }, { id: 'gap-2', answer: 'went' }]);
  assert.deepEqual(control.schema({ params: { gaps: 2, cues: false } }).gaps.items.required, ['answer']);

  for (const broken of ['Where [[2]] you? I [[1]] to the sea.', 'Where [[1]] you?', 'Where [[1]] you? I [[x]] to the sea.']) {
    assert.throws(() => control.build({ text: broken, gaps: [{ answer: 'were' }, { answer: 'went' }] }, context(false)),
      /в тексте должны быть пропуски \[\[1\]\]–\[\[2\]\] по порядку/);
  }
});

test('a Fill in the Blanks block takes its answers from its instructions and needs no vocabulary', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('fillInBlanks'), { items: 4 });
  definition.stages[1].blocks[0].instructions = 'Every answer is a term of the Target Vocabulary.';
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const run = exampleRun(template);
  const { messages } = template.request('checked', { inputs: { topic: 'Topic' }, variables: run.variables });
  const lines = messages[0].content.split('\n');
  const items = lines.indexOf('Create exactly four sentences in items, each with one gap: before + answer + after form the sentence; answer is the word or short phrase the learner types into the gap, in the form that fits the sentence. Use four different answers.');
  assert.ok(items >= 0);
  assert.equal(lines[items + 1], 'Every answer is a term of the Target Vocabulary.');
  assert.deepEqual(CONTROL_CATALOG.get('fillInBlanks').inputs, {});
});

test('a Personalised Questions block takes the lesson words from its instructions and needs no vocabulary', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('personalizedQuestions'), { items: 3 });
  definition.stages[1].blocks[0].instructions = 'Each question contains a term of the Target Vocabulary in **bold**.';
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const questions = lines.indexOf('questions: exactly three questions. followUp is a short extra question.');
  assert.ok(questions >= 0);
  assert.equal(lines[questions + 1], 'Each question contains a term of the Target Vocabulary in **bold**.');
  assert.deepEqual(CONTROL_CATALOG.get('personalizedQuestions').inputs, {});
});

test('a Describe and Guess block takes its words from its instructions and needs no vocabulary', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('describeAndGuess'), { items: 5 });
  definition.stages[1].blocks[0].instructions = 'Every item is a term of the Target Vocabulary.';
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const terms = lines.indexOf('terms: exactly five different words or short phrases for the learner to describe.');
  assert.ok(terms >= 0);
  assert.equal(lines[terms + 1], 'Every item is a term of the Target Vocabulary.');
  assert.deepEqual(CONTROL_CATALOG.get('describeAndGuess').inputs, {});
});

test('a reading text takes its lesson words from its instructions and needs no vocabulary', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('readingText'), { minWords: 60, maxWords: 80 });
  definition.stages[1].blocks[0].instructions = 'Use 3 to 4 terms of the Target Vocabulary.';
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages, schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const images = lines.findIndex(line => line.startsWith('Both image prompts must be in English'));
  assert.ok(images >= 0);
  assert.equal(lines[images + 1], 'Use 3 to 4 terms of the Target Vocabulary.');
  assert.equal(schema.properties.usedVocabularyTerms, undefined);
  assert.deepEqual(CONTROL_CATALOG.get('readingText').inputs, {});
});

test('Drag Sentences and Type the Words blocks take their words from their instructions and need no vocabulary', () => {
  const definition = singleBlockTemplate(CONTROL_CATALOG.get('dragSentences'), { sentences: 4 });
  definition.stages[1].blocks[0].instructions = 'Every gap is a term of the Target Vocabulary.';
  definition.stages[1].blocks.push({
    id: 'typed-words', kind: 'generated', control: 'translationHints', params: { items: 5 }, fields: { sentences: 'typedSentences' },
    instructions: 'One sentence for each term of the Target Vocabulary.',
  });
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages, schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  const lines = messages[0].content.split('\n');
  const dragged = lines.indexOf('sentences: exactly four short sentences, each with exactly one gap written as the missing word or short phrase in double square brackets, for example "I put on my [[sunglasses]]." Use four different answers, each in the form that fits the sentence. No Markdown or HTML.');
  const typed = lines.indexOf('typedSentences: exactly five sentences. The missing word or short phrase is always the last words of the sentence. before is the English text before it; hint is its Russian translation; answer is the English word or phrase exactly as the learner should type it. Use five different answers.');
  assert.ok(dragged >= 0 && typed > dragged);
  assert.equal(lines[dragged + 1], 'Every gap is a term of the Target Vocabulary.');
  assert.equal(lines[typed + 1], 'One sentence for each term of the Target Vocabulary.');
  assert.deepEqual([schema.properties.sentences.maxItems, schema.properties.typedSentences.maxItems], [4, 5]);
  assert.deepEqual([CONTROL_CATALOG.get('dragSentences').inputs, CONTROL_CATALOG.get('translationHints').inputs], [{}, {}]);
});

test('a Drag Sentences block with distractors asks for them, adds them to the word bank and keys only the gaps', () => {
  const control = CONTROL_CATALOG.get('dragSentences');
  const definition = singleBlockTemplate(control, { sentences: 2, distractors: 1 });
  Object.assign(definition.stages[1].blocks[0], { fields: { sentences: 'ruleSentences', distractors: 'ruleDistractors' }, answerKey: {} });
  const template = compileTemplate(definition, CONTROL_CATALOG);
  const { messages, schema } = template.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(template).variables });
  assert.ok(messages[0].content.includes('ruleDistractors: exactly one plausible but wrong words or short phrases for the word bank, different from each other and from every answer.'));
  assert.equal(schema.properties.ruleDistractors.maxItems, 1);
  const context = { id: 'rule', params: { sentences: 2, distractors: 1 }, chrome: {} };
  const sentences = ['We use [[has]] with he.', 'We use [[have]] with they.'];
  const task = control.build({ sentences, distractors: ['had'] }, context);
  assert.deepEqual(task.words, ['had', 'has', 'have']);
  assert.equal(task.text, 'We use [[has]] with he.\n\nWe use [[have]] with they.');
  assert.deepEqual(control.answerKey({ component: task }).lines, ['1 has, 2 have.']);
  assert.throws(() => control.build({ sentences, distractors: ['has'] }, context), /слова в пропусках и лишние варианты не должны повторяться/);

  const plain = compileTemplate(singleBlockTemplate(control, { sentences: 2 }), CONTROL_CATALOG);
  assert.equal(plain.request('checked', { inputs: { topic: 'Topic' }, variables: exampleRun(plain).variables }).schema.properties.distractors, undefined);
});

test('a Sentence Builder block keeps bracketed phrases on one card and drops orders made of other cards', t => {
  const warn = silentWarnings(t);
  const control = CONTROL_CATALOG.get('sentenceBuilder');
  const params = { sentences: 2, hints: false, completionText: 'Well done!' };
  const context = { id: 'builder', params, chrome: {} };
  const component = control.build({ items: [
    {
      sentence: 'You should take [your phone] and [your keys] with you.',
      otherOrders: ['You should take [your keys] and [your phone] with you.', 'You should take your keys and your phone with you.'],
    },
    { sentence: 'Phones are bad.', otherOrders: ['Phones are bad.'] },
  ] }, context);
  assert.deepEqual(component.items[0].tokens.map(token => token.text),
    ['You', 'should', 'take', 'your phone', 'and', 'your keys', 'with', 'you.']);
  assert.equal(component.items[0].acceptedOrders.length, 2);
  assert.equal(component.items[1].acceptedOrders.length, 1);
  assert.deepEqual([component.hintsEnabled, component.completionText], [false, 'Well done!']);
  assert.deepEqual(warnings(warn), [
    'builder: в предложении 1 другой порядок не из тех же карточек, убран: You should take your keys and your phone with you.',
  ]);
  const items = [{ sentence: 'Phones are bad.', otherOrders: [] }, { sentence: 'Phones are bad.', otherOrders: [] }];
  assert.throws(() => control.build({ items }, context), /не должны повторяться/);
  assert.throws(() => control.build({ items: [items[0], { sentence: 'Phones [are bad.', otherOrders: [] }] }, context),
    /builder: предложении 2: Проверьте квадратные скобки/);
});
