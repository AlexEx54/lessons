'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  GRAMMAR_FOCUS_RESPONSE_SCHEMA,
  GRAMMAR_PRESENTATION_RESPONSE_SCHEMA,
  LEAD_IN_RESPONSE_SCHEMA,
  LISTENING_RESPONSE_SCHEMA,
  OPENROUTER_MODEL,
  READING_RESPONSE_SCHEMA,
  TARGET_VOCABULARY_RESPONSE_SCHEMA,
  applyGrammarFocusToSkeleton,
  applyGrammarPresentationToSkeleton,
  applyLeadInToSkeleton,
  applyListeningToSkeleton,
  applyReadingToSkeleton,
  applyTargetVocabularyToSkeleton,
  applyWarmUpToSkeleton,
  buildGrammarFocusContent,
  buildGrammarPresentationContent,
  buildLeadInContent,
  buildListeningContent,
  buildReadingContent,
  buildTargetVocabularyContent,
  buildWarmUpContent,
  createLessonSkeleton,
  generateGrammarFocus,
  generateGrammarPresentation,
  generateLeadIn,
  generateListening,
  generateReading,
  generateTargetVocabulary,
  generateWarmUp,
  grammarFocusMessages,
  grammarPresentationMessages,
  leadInMessages,
  listeningMessages,
  parseOpenRouterStream,
  readingMessages,
  shuffleOptions,
  targetVocabularyMessages,
  warmUpMessages,
} = require('../lib/ai-lesson-generator.js');
const {
  GENERATED_TARGET_VOCABULARY,
  TERMS,
} = require('./fixtures/generated-target-vocabulary.js');
const { GENERATED_READING } = require('./fixtures/generated-reading.js');
const { GENERATED_LISTENING } = require('./fixtures/generated-listening.js');
const {
  GENERATED_GRAMMAR_PRESENTATION,
} = require('./fixtures/generated-grammar-presentation.js');
const { GENERATED_GRAMMAR_FOCUS } = require('./fixtures/generated-grammar-focus.js');
const { READING_TEACHER_NOTE_TEXT } = require('../lib/reading-static.js');
const { parseMarkdown } = require('../assets/components/safe-markdown.js');
const {
  GRAMMAR_PRESENTATION_TEACHER_NOTE_TEXT,
  LISTENING_TEACHER_NOTE_TEXT,
} = require('../lib/synthetic-lesson.js');

const GENERATED_WARM_UP = Object.freeze({
  teacherNotes: '- Show the options and ask the learner to briefly explain their choice.\n\n**Say:** “Which space trip would you choose?”',
  yourTurnInstruction: 'Choose one option in each pair and explain your choice.',
  choices: Array.from({ length: 4 }, (_value, index) => ({
    options: [{
      caption: `Space option ${index + 1}A`,
      imagePrompt: `Square child-friendly educational illustration of space option ${index + 1}A, no text.`,
    }, {
      caption: `Space option ${index + 1}B`,
      imagePrompt: `Square child-friendly educational illustration of space option ${index + 1}B, no text.`,
    }],
  })),
  followUpQuestions: 'Which option was the most exciting? Why?',
  possibleLanguage: 'I would choose… because…',
});

const GENERATED_LEAD_IN = Object.freeze({
  teacherNotes: [
    'Read the text together with the learner and invite them to answer the questions.',
    '- Explain that **low-key** means slightly or to some extent.',
    '- If the third answer is short, encourage the learner to explain: *Why do you think so?*',
    '- After the answers, ask: *Can you guess what our lesson is about?*',
    '',
    '**Say:** *We are going to talk about space travel.*',
  ].join('\n'),
  message: '**@SpaceMax:** I low-key want to visit Mars. The trip is long, but seeing a new planet sounds amazing!',
  leadingImagePrompt: 'Child-friendly circular astronaut avatar, educational illustration, no text.',
  trailingImagePrompt: 'Child-friendly small planet symbol, educational illustration, no text.',
  questions: [
    'Which planet does Max want to visit?',
    'Why does the trip sound exciting to Max?',
    'Would you like to travel to another planet? Why or why not?',
  ],
  suggestedAnswers: [
    'Max wants to visit Mars.',
    'He thinks seeing a new planet sounds amazing.',
    'Yes, I would, because I want to see space.',
  ],
});

function streamingResponse(events) {
  const encoded = new TextEncoder().encode(events.join('\n\n') + '\n\n');
  const chunks = [encoded.slice(0, 17), encoded.slice(17, 53), encoded.slice(53)];
  return new Response(new ReadableStream({
    start(controller) {
      chunks.forEach(chunk => controller.enqueue(chunk));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

test('AI lesson skeleton gives generated stages purpose-specific subtitles', () => {
  const lesson = createLessonSkeleton('  Space travel  ');
  assert.equal(lesson.meta.topic, 'Space travel');
  assert.equal(lesson.meta.generatedBy, `openrouter:${OPENROUTER_MODEL}`);
  assert.equal(lesson.stages.length, 9);
  assert.ok(lesson.stages.every(stage => Array.isArray(stage.content) && stage.content.length === 0));
  assert.deepEqual(lesson.stages.slice(0, 3).map(stage => stage.subtitle), [
    'This or That?',
    'Explore the Topic',
    'Learn New Words',
  ]);
  assert.ok(lesson.stages.slice(3).every(stage => stage.subtitle === undefined));
});

test('generated Warm-Up is mapped onto fixed compatible components', () => {
  const content = buildWarmUpContent(GENERATED_WARM_UP);
  assert.deepEqual(content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'thisOrThat', 'taskPrompt',
  ]);
  assert.equal(content[2].items.length, 4);
  assert.ok(content[2].items.every(item => item.options.length === 2));
  assert.equal(content[2].items[0].id, 'warm-up-choice-1');
  assert.equal(content[2].items[0].options[1].id, 'warm-up-choice-1-b');
  const lesson = applyWarmUpToSkeleton(createLessonSkeleton('Space travel'), GENERATED_WARM_UP);
  assert.equal(lesson.stages[0].content.length, 4);
  assert.ok(lesson.stages.slice(1).every(stage => stage.content.length === 0));
});

test('generated Warm-Up rejects a damaged This or That shape', () => {
  assert.throws(() => buildWarmUpContent({ ...GENERATED_WARM_UP, choices: [] }), /четыре пары/);
  const damaged = JSON.parse(JSON.stringify(GENERATED_WARM_UP));
  damaged.choices[0].options.pop();
  assert.throws(() => buildWarmUpContent(damaged), /exactly two options/);
});

test('generated Lead-In is mapped onto the fixed synthetic component structure', () => {
  const content = buildLeadInContent(GENERATED_LEAD_IN);
  assert.deepEqual(content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'illustratedTextPanel', 'textPanel', 'markdownCard',
  ]);
  assert.equal(content[0].text, GENERATED_LEAD_IN.teacherNotes);
  assert.equal(content[1].text, 'Read the message and discuss it together.');
  assert.equal(content[2].leadingPicture.imagePrompt, GENERATED_LEAD_IN.leadingImagePrompt);
  assert.equal(content[2].trailingPicture.imagePrompt, GENERATED_LEAD_IN.trailingImagePrompt);
  assert.match(content[3].text, /^1\. Which planet/m);
  assert.match(content[3].text, /^3\. Would you like/m);
  assert.match(content[4].text, /^3\. Yes, I would/m);
  assert.equal(content[4].studentVisibility, 'controlled');

  const lesson = applyLeadInToSkeleton(createLessonSkeleton('Space travel'), GENERATED_LEAD_IN);
  assert.equal(lesson.stages[1].content.length, 5);
  assert.ok(lesson.stages.filter(stage => stage.id !== 'lead-in').every(stage => stage.content.length === 0));
});

test('generated Lead-In rejects damaged question and answer counts', () => {
  assert.throws(() => buildLeadInContent({
    ...GENERATED_LEAD_IN,
    questions: GENERATED_LEAD_IN.questions.slice(0, 2),
  }), /ровно три вопроса/);
  assert.throws(() => buildLeadInContent({
    ...GENERATED_LEAD_IN,
    suggestedAnswers: GENERATED_LEAD_IN.suggestedAnswers.slice(0, 2),
  }), /ровно три suggested answers/);
});

test('generated Target Vocabulary is mapped onto the fixed synthetic component structure', () => {
  const content = buildTargetVocabularyContent(GENERATED_TARGET_VOCABULARY);
  assert.deepEqual(content.map(component => component.type), [
    'teacherNote', 'markdownCard', 'matchWords', 'markdownCard', 'dropdownChoice',
    'markdownCard', 'fillInBlanks', 'personalizedQuestions', 'markdownCard', 'describeAndGuess',
  ]);
  assert.equal(content[1].text.split('\n').length, 10);
  assert.deepEqual(content[2].items.map(item => item.term), TERMS);
  assert.equal(content[4].choices.length, 8);
  content[4].choices.forEach((choice, index) => {
    assert.deepEqual(
      [...choice.options].sort(),
      [...GENERATED_TARGET_VOCABULARY.contextItems[index].options].sort(),
    );
  });
  assert.deepEqual(
    content[5].text.split('\n').map(line => line.replace(/^\d+\. \*\*(.*)\*\*$/, '$1')),
    GENERATED_TARGET_VOCABULARY.contextItems.map(item => item.answer),
  );
  assert.equal(content[6].items.length, 6);
  assert.equal(content[7].items.length, 4);
  assert.equal(content[9].items.length, 6);
  assert.deepEqual(content[9].howToPlay, {
    title: 'How to Play',
    steps: [
      'Choose a word from the list.',
      'Describe it without saying the word or any part of it.',
      'Your partner guesses the word.',
      'Click the word when it’s guessed. It will be crossed out.',
      'Take turns and keep playing!',
    ],
    tip: 'You can use examples, actions, feelings and details, but don’t say the word!',
  });

  const lesson = applyTargetVocabularyToSkeleton(
    createLessonSkeleton('Air travel'), GENERATED_TARGET_VOCABULARY,
  );
  assert.equal(lesson.stages[2].content.length, 10);
  assert.equal(lesson.stages[2].subtitle, 'Learn New Words');
  assert.ok(lesson.stages.filter(stage => stage.id !== 'target-vocabulary')
    .every(stage => stage.content.length === 0));
});

test('Target Vocabulary shuffles dropdown options without mutating the model response', () => {
  const options = ['correct', 'distractor one', 'distractor two'];
  const randomValues = [0, 0];
  assert.deepEqual(shuffleOptions(options, () => randomValues.shift()), [
    'distractor one', 'distractor two', 'correct',
  ]);
  assert.deepEqual(options, ['correct', 'distractor one', 'distractor two']);
});

test('Target Vocabulary keeps teacher notes static, Russian, and topic-neutral', () => {
  const first = buildTargetVocabularyContent(GENERATED_TARGET_VOCABULARY);
  const changed = JSON.parse(JSON.stringify(GENERATED_TARGET_VOCABULARY));
  changed.vocabularyItems[0].definition = 'reserve a seat for a journey';
  const second = buildTargetVocabularyContent(changed);
  assert.deepEqual(first[0], second[0]);
  assert.match(first[0].blocks[0].text, /Используйте эти онлайн-словари/);
  assert.match(first[0].blocks[0].tip.text, /Обратите внимание на ударение/);
  assert.match(first[0].blocks[1].text, /\*\*Task 1:\*\* say "We are going to do some matching/);
  assert.match(first[0].blocks[1].text, /Words That Need Extra Explanation/);
  assert.match(first[0].blocks[1].text, /\*\*Extra Task:\*\* "To finish our lesson, let's play a guessing game!/);
  assert.doesNotMatch(JSON.stringify(first[0]), /of-FLINE|lev-EL up|out-DOORS/);
});

test('generated Target Vocabulary rejects damaged counts and cross-references', () => {
  assert.throws(() => buildTargetVocabularyContent({
    ...GENERATED_TARGET_VOCABULARY,
    vocabularyItems: GENERATED_TARGET_VOCABULARY.vocabularyItems.slice(0, 9),
  }), /10 слов или фраз/);

  const unknownContextTerm = JSON.parse(JSON.stringify(GENERATED_TARGET_VOCABULARY));
  unknownContextTerm.contextItems[0].answer = 'rent a car';
  assert.throws(() => buildTargetVocabularyContent(unknownContextTerm), /Vocabulary/);

  const repeatedDescribeTerm = JSON.parse(JSON.stringify(GENERATED_TARGET_VOCABULARY));
  repeatedDescribeTerm.describeAndGuessTerms[5] = repeatedDescribeTerm.describeAndGuessTerms[0];
  assert.throws(() => buildTargetVocabularyContent(repeatedDescribeTerm), /повторяющиеся слова Describe and Guess/);

  const invalidImagePrompt = JSON.parse(JSON.stringify(GENERATED_TARGET_VOCABULARY));
  invalidImagePrompt.vocabularyItems[0].imagePrompt = 'A traveler buying a ticket.';
  assert.throws(() => buildTargetVocabularyContent(invalidImagePrompt), /квадратные иллюстрации без текста/);
});

test('generated Reading is mapped onto the fixed synthetic component structure', () => {
  const content = buildReadingContent(
    GENERATED_READING,
    GENERATED_TARGET_VOCABULARY.vocabularyItems,
    () => 0,
  );
  assert.deepEqual(content.map(component => component.type), [
    'teacherNote', 'textReading', 'multipleChoice', 'multipleChoice', 'markdownCard',
  ]);
  assert.equal(content[0].text, READING_TEACHER_NOTE_TEXT);
  assert.equal(content[1].title, GENERATED_READING.title);
  assert.equal(content[1].headerImage.imagePrompt, GENERATED_READING.headerImagePrompt);
  assert.equal(content[1].textImage.imagePrompt, GENERATED_READING.textImagePrompt);
  assert.equal(content[2].id, 'reading-gist-quiz');
  assert.equal(content[2].items.length, 1);
  assert.equal(content[3].id, 'reading-detail-quiz');
  assert.equal(content[3].items.length, 5);
  assert.match(content[4].text, /^\*\*Task 1:\*\*\n\nC —/);
  assert.match(content[4].text, /\*\*Task 2:\*\*\n\n1C —/);

  const lesson = applyReadingToSkeleton(
    createLessonSkeleton('Air travel'),
    GENERATED_READING,
    GENERATED_TARGET_VOCABULARY.vocabularyItems,
    () => 0,
  );
  assert.equal(lesson.stages[3].content.length, 5);
  assert.ok(lesson.stages.filter(stage => stage.id !== 'reading')
    .every(stage => stage.content.length === 0));
});

test('Reading keeps the teacher-provided notes fixed and complete', () => {
  assert.doesNotMatch(READING_TEACHER_NOTE_TEXT, /^- In this part/m);
  assert.doesNotMatch(READING_TEACHER_NOTE_TEXT, /^- \*\*Task 1:\*\*/m);
  assert.match(READING_TEACHER_NOTE_TEXT, /\*\*reading for gist\*\* \(skimming\)/);
  assert.match(READING_TEACHER_NOTE_TEXT, /\*\*reading for detail\*\* \(scanning\)/);
  assert.match(READING_TEACHER_NOTE_TEXT, /\*\*For weaker students:\*\*/);
  assert.match(READING_TEACHER_NOTE_TEXT, /\*\*For stronger students:\*\*/);
  assert.match(READING_TEACHER_NOTE_TEXT, /There are 6 questions in total/);
  assert.match(READING_TEACHER_NOTE_TEXT, /\*\*Post-Reading Discussion:\*\*/);
  assert.doesNotMatch(READING_TEACHER_NOTE_TEXT, /&#x20;/);
});

test('generated Reading rejects damaged questions, vocabulary references, and article length', () => {
  const vocabularyItems = GENERATED_TARGET_VOCABULARY.vocabularyItems;
  const tooFewQuestions = { ...GENERATED_READING, detailQuestions: GENERATED_READING.detailQuestions.slice(0, 4) };
  assert.throws(() => buildReadingContent(tooFewQuestions, vocabularyItems), /ровно пять/);

  const duplicateOptions = JSON.parse(JSON.stringify(GENERATED_READING));
  duplicateOptions.gistQuestion.options[1] = duplicateOptions.gistQuestion.options[0];
  assert.throws(() => buildReadingContent(duplicateOptions, vocabularyItems), /повторяющиеся варианты/);

  const missingAnswer = JSON.parse(JSON.stringify(GENERATED_READING));
  missingAnswer.detailQuestions[0].answer = 'An answer outside the options.';
  assert.throws(() => buildReadingContent(missingAnswer, vocabularyItems), /совпадать с одним из вариантов/);

  const unknownTerm = { ...GENERATED_READING, usedVocabularyTerms: [
    ...GENERATED_READING.usedVocabularyTerms.slice(0, 4), 'rent a car',
  ] };
  assert.throws(() => buildReadingContent(unknownTerm, vocabularyItems), /неизвестный элемент/);

  const tooFewTerms = { ...GENERATED_READING, usedVocabularyTerms: GENERATED_READING.usedVocabularyTerms.slice(0, 3) };
  assert.throws(() => buildReadingContent(tooFewTerms, vocabularyItems), /от 4 до 6/);

  const tooManyTerms = { ...GENERATED_READING, usedVocabularyTerms: TERMS.slice(0, 7) };
  assert.throws(() => buildReadingContent(tooManyTerms, vocabularyItems), /от 4 до 6/);

  const absentTerm = { ...GENERATED_READING, usedVocabularyTerms: [
    ...GENERATED_READING.usedVocabularyTerms.slice(0, 4), 'pick up luggage',
  ] };
  assert.throws(() => buildReadingContent(absentTerm, vocabularyItems), /отсутствует в тексте/);

  const shortText = { ...GENERATED_READING, text: 'A very short reading text.' };
  assert.throws(() => buildReadingContent(shortText, vocabularyItems), /от 180 до 230 слов/);

  const unsafeImagePrompt = { ...GENERATED_READING, textImagePrompt: 'Students arrive at an airport.' };
  assert.throws(() => buildReadingContent(unsafeImagePrompt, vocabularyItems), /без текста/);
});

test('generated Listening is mapped onto the fixed synthetic component structure', () => {
  const content = buildListeningContent(GENERATED_LISTENING, () => 0);
  assert.deepEqual(content.map(component => component.type), [
    'teacherNote', 'audioPlayer', 'checkboxChoice', 'audioPlayer', 'multipleChoice', 'markdownCard',
  ]);
  assert.equal(content[0].text, LISTENING_TEACHER_NOTE_TEXT);
  assert.equal(content[1].id, 'listening-audio');
  assert.equal(content[1].script, GENERATED_LISTENING.script);
  assert.equal(content[2].items.length, 2);
  assert.equal(content[3].id, 'listening-audio-again');
  assert.equal(content[3].script, content[1].script);
  assert.equal(content[4].items.length, 5);
  assert.match(content[5].text, /^\*\*Task 1:\*\*\n\n1C —/);
  assert.match(content[5].text, /2A, C —/);
  assert.match(content[5].text, /\*\*Task 2:\*\*\n\n1A —/);
  assert.equal(content[5].studentVisibility, 'teacherOnly');

  const lesson = applyListeningToSkeleton(
    createLessonSkeleton('Air travel'), GENERATED_LISTENING, () => 0,
  );
  assert.equal(lesson.stages[4].content.length, 6);
  assert.ok(lesson.stages.filter(stage => stage.id !== 'listening')
    .every(stage => stage.content.length === 0));
});

test('generated Listening keeps teacher notes static and rejects damaged question counts', () => {
  const changed = { ...GENERATED_LISTENING, script: 'Mia: A different valid script.' };
  assert.deepEqual(buildListeningContent(GENERATED_LISTENING)[0], buildListeningContent(changed)[0]);
  assert.throws(() => buildListeningContent({
    ...GENERATED_LISTENING,
    gistQuestions: GENERATED_LISTENING.gistQuestions.slice(0, 1),
  }), /ровно два gist-вопроса/);
  assert.throws(() => buildListeningContent({
    ...GENERATED_LISTENING,
    detailQuestions: GENERATED_LISTENING.detailQuestions.slice(0, 4),
  }), /ровно пять detail-вопросов/);
});

test('generated Grammar Presentation is mapped onto the fixed synthetic component structure', () => {
  const content = buildGrammarPresentationContent(GENERATED_GRAMMAR_PRESENTATION, () => 0);
  assert.deepEqual(content.map(component => component.type), [
    'teacherNote', 'textPanel', 'textPanel', 'dragWordsInText', 'markdownCard',
    'dropdownChoice', 'markdownCard',
  ]);
  assert.equal(content[0].text, GRAMMAR_PRESENTATION_TEACHER_NOTE_TEXT);
  assert.match(content[1].text, /^\{l\}\*\*Notice the Rule\*\*/);
  assert.match(content[1].text, /1\. I \*\*visited\*\* London/);
  assert.match(content[2].text, /4\. Do we use the past form after did\?/);
  assert.deepEqual(content[3].words, ['-ed', 'base verb', 'Did', 'future', '-ing form', 'past']);
  assert.equal((content[3].text.match(/\[\[/g) || []).length, 4);
  assert.match(content[3].text, /in the \[\[past\]\]/);
  assert.equal(content[4].sections.length, 2);
  assert.equal(content[5].choices.length, 5);
  assert.match(content[5].text, /I \[\[grammar-check-1\]\] to Spain/);
  assert.match(content[6].sections[0].text, /\*\*Task 1 Rule:\*\*/);
  assert.match(content[6].sections[1].text, /5\. Bought is the Past Simple form/);
  assert.equal(content[6].studentVisibility, 'teacherOnly');

  const noticeBlocks = parseMarkdown(content[1].text);
  assert.equal(noticeBlocks.filter(block => block.type === 'list').length, 1);
  assert.equal(noticeBlocks.find(block => block.type === 'list').items.length, 5);
  const questionBlocks = parseMarkdown(content[2].text);
  assert.equal(questionBlocks.filter(block => block.type === 'list').length, 1);
  assert.equal(questionBlocks.find(block => block.type === 'list').items.length, 4);

  const lesson = applyGrammarPresentationToSkeleton(
    createLessonSkeleton('Air travel'), GENERATED_GRAMMAR_PRESENTATION, () => 0,
  );
  assert.equal(lesson.stages[5].content.length, 7);
  assert.ok(lesson.stages.filter(stage => stage.id !== 'grammar-presentation')
    .every(stage => stage.content.length === 0));
});

test('generated Grammar Presentation rejects invalid counts, words, and answers', () => {
  assert.throws(() => buildGrammarPresentationContent({
    ...GENERATED_GRAMMAR_PRESENTATION,
    examples: GENERATED_GRAMMAR_PRESENTATION.examples.slice(0, 4),
  }), /ровно 5 примеров/);
  assert.throws(() => buildGrammarPresentationContent({
    ...GENERATED_GRAMMAR_PRESENTATION,
    conceptCheckingQuestions: GENERATED_GRAMMAR_PRESENTATION.conceptCheckingQuestions.slice(0, 3),
  }), /ровно 4 concept-checking questions/);

  const repeatedRuleAnswer = JSON.parse(JSON.stringify(GENERATED_GRAMMAR_PRESENTATION));
  repeatedRuleAnswer.ruleItems[1].answer = repeatedRuleAnswer.ruleItems[0].answer;
  assert.throws(() => buildGrammarPresentationContent(repeatedRuleAnswer), /повторяющиеся ответы правила/);

  const overlappingDistractor = JSON.parse(JSON.stringify(GENERATED_GRAMMAR_PRESENTATION));
  overlappingDistractor.ruleDistractors[0] = overlappingDistractor.ruleItems[0].answer;
  assert.throws(() => buildGrammarPresentationContent(overlappingDistractor), /не должны пересекаться/);

  const emptySentence = JSON.parse(JSON.stringify(GENERATED_GRAMMAR_PRESENTATION));
  emptySentence.checkItems[0].before = '';
  emptySentence.checkItems[0].after = '';
  assert.throws(() => buildGrammarPresentationContent(emptySentence), /непустой текст вокруг ответа/);

  const unknownAnswer = JSON.parse(JSON.stringify(GENERATED_GRAMMAR_PRESENTATION));
  unknownAnswer.checkItems[0].answer = 'flew';
  assert.throws(() => buildGrammarPresentationContent(unknownAnswer), /точно совпадать/);
});

test('Grammar Presentation prompt receives separate lesson and grammar topics', () => {
  const messages = grammarPresentationMessages('Air travel', 'Past Simple');
  const systemPrompt = messages[0].content;
  assert.equal(messages[1].content, 'Lesson topic: Air travel\nGrammar topic: Past Simple');
  assert.match(systemPrompt, /Grammar topic is authoritative/);
  assert.match(systemPrompt, /Use the Lesson topic as the natural context/);
  assert.match(systemPrompt, /exactly five short example sentences/);
  assert.match(systemPrompt, /exactly four concept-checking questions/);
  assert.match(systemPrompt, /exactly four ruleItems/);
  assert.match(systemPrompt, /exactly two plausible but incorrect ruleDistractors/);
  assert.match(systemPrompt, /exactly five checkItems/);
  assert.match(systemPrompt, /Do not generate Teacher’s Notes/);
  assert.equal(GRAMMAR_PRESENTATION_RESPONSE_SCHEMA.properties.examples.minItems, 5);
  assert.equal(GRAMMAR_PRESENTATION_RESPONSE_SCHEMA.properties.ruleItems.maxItems, 4);
  assert.equal(GRAMMAR_PRESENTATION_RESPONSE_SCHEMA.properties.quickRuleSections.maxItems, 3);
  assert.equal(GRAMMAR_PRESENTATION_RESPONSE_SCHEMA.properties.checkItems.minItems, 5);
  assert.equal(GRAMMAR_PRESENTATION_RESPONSE_SCHEMA.properties.teacherNotes, undefined);
});

test('generated Grammar Focus is mapped onto the fixed synthetic component structure', () => {
  const content = buildGrammarFocusContent(
    GENERATED_GRAMMAR_FOCUS, GENERATED_TARGET_VOCABULARY.vocabularyItems, () => 0,
  );
  assert.deepEqual(content.map(component => component.type), [
    'teacherNote', 'dropdownChoice', 'markdownCard', 'gapFill', 'markdownCard',
    'miniSituation', 'cardRow',
  ]);
  assert.deepEqual(content[0].blocks.map(block => block.id), [
    'grammar-focus-transition-phrases', 'grammar-focus-struggle-tips',
    'grammar-focus-correction-timing', 'grammar-focus-free-practice-success',
  ]);
  assert.equal(content[1].choices.length, 8);
  assert.equal((content[1].text.match(/\[\[/g) || []).length, 8);
  assert.match(content[2].sections[1].text, /After did not, use the base verb/);
  assert.equal(content[2].studentVisibility, 'teacherOnly');
  assert.equal(content[3].gaps.length, 9);
  assert.equal((content[3].text.match(/\[\[/g) || []).length, 9);
  assert.match(content[4].sections[1].text, /\*\*9\.\*\* took off/);
  assert.equal(content[5].situation.leadingPicture.imagePrompt, GENERATED_GRAMMAR_FOCUS.miniSituation.imagePrompt);
  assert.deepEqual(content[6].items.map(item => item.id), [
    'grammar-focus-writing-support', 'grammar-focus-support', 'grammar-focus-challenge',
  ]);
  TERMS.slice(0, 8).forEach(term => assert.match(content[6].items[1].text, new RegExp(term)));

  const lesson = applyGrammarFocusToSkeleton(
    createLessonSkeleton('Air travel'), GENERATED_GRAMMAR_FOCUS,
    GENERATED_TARGET_VOCABULARY.vocabularyItems, () => 0,
  );
  assert.equal(lesson.stages[6].content.length, 7);
  assert.ok(lesson.stages.filter(stage => stage.id !== 'grammar-focus')
    .every(stage => stage.content.length === 0));
});

test('generated Grammar Focus rejects damaged tasks, language, markers, and vocabulary references', () => {
  const vocabulary = GENERATED_TARGET_VOCABULARY.vocabularyItems;
  assert.throws(() => buildGrammarFocusContent({
    ...GENERATED_GRAMMAR_FOCUS,
    task1Items: GENERATED_GRAMMAR_FOCUS.task1Items.slice(0, 7),
  }, vocabulary), /ровно 8 заданий Task 1/);

  const unknownAnswer = JSON.parse(JSON.stringify(GENERATED_GRAMMAR_FOCUS));
  unknownAnswer.task1Items[0].answer = 'flew';
  assert.throws(() => buildGrammarFocusContent(unknownAnswer, vocabulary), /точно совпадать с вариантом/);

  const repeatedOption = JSON.parse(JSON.stringify(GENERATED_GRAMMAR_FOCUS));
  repeatedOption.task1Items[0].options[1] = repeatedOption.task1Items[0].options[0];
  assert.throws(() => buildGrammarFocusContent(repeatedOption, vocabulary), /повторяющиеся варианты/);

  assert.throws(() => buildGrammarFocusContent({
    ...GENERATED_GRAMMAR_FOCUS,
    task2Dialogue: GENERATED_GRAMMAR_FOCUS.task2Dialogue.replace('{{gap}}', 'went'),
  }, vocabulary), /ровно 9 маркеров/);
  assert.throws(() => buildGrammarFocusContent({
    ...GENERATED_GRAMMAR_FOCUS,
    task2Dialogue: GENERATED_GRAMMAR_FOCUS.task2Dialogue.replace('**Mia:**', 'Mia:'),
  }, vocabulary), /speaker labels/);
  assert.throws(() => buildGrammarFocusContent({
    ...GENERATED_GRAMMAR_FOCUS,
    modelSentence: 'Вчера я летал в Лондон.',
  }, vocabulary), /полностью на английском/);
  assert.throws(() => buildGrammarFocusContent({
    ...GENERATED_GRAMMAR_FOCUS,
    supportWordBank: [...GENERATED_GRAMMAR_FOCUS.supportWordBank.slice(0, 7), 'unknown phrase'],
  }, vocabulary), /точные элементы Target Vocabulary/);
});

test('Grammar Focus prompt receives lesson, grammar, and Target Vocabulary context', () => {
  const messages = grammarFocusMessages(
    'Air travel', 'Past Simple', GENERATED_TARGET_VOCABULARY.vocabularyItems,
  );
  assert.match(messages[0].content, /Grammar topic is authoritative/);
  assert.match(messages[0].content, /exactly eight task1Items/);
  assert.match(messages[0].content, /exactly nine literal \{\{gap\}\} markers/);
  assert.match(messages[0].content, /exactly eight distinct entries from Target Vocabulary/);
  assert.match(messages[1].content, /^Lesson topic: Air travel\nGrammar topic: Past Simple/m);
  assert.match(messages[1].content, /Target Vocabulary: \["book a ticket"/);
  assert.equal(GRAMMAR_FOCUS_RESPONSE_SCHEMA.properties.task1Items.minItems, 8);
  assert.equal(GRAMMAR_FOCUS_RESPONSE_SCHEMA.properties.task2Gaps.maxItems, 9);
  assert.equal(GRAMMAR_FOCUS_RESPONSE_SCHEMA.properties.supportWordBank.minItems, 8);
});

test('Warm-Up prompt requires three teacher-note bullets and a separate Say paragraph', () => {
  const messages = warmUpMessages('Space travel');
  const systemPrompt = messages.find(message => message.role === 'system').content;
  assert.match(systemPrompt, /exactly three Markdown bullet points followed by a separate Say paragraph/);
  assert.match(systemPrompt, /every part of teacherNotes in English/);
  assert.match(systemPrompt, /including instructions and direct address to the teacher/);
  assert.doesNotMatch(systemPrompt, /In Russian/);
  assert.match(systemPrompt, /briefly explain the purpose of the lead-in question/);
  assert.match(systemPrompt, /exact question for the learner in natural A2 English/);
  assert.match(systemPrompt, /summarize the main Warm-Up topic/);
  assert.match(systemPrompt, /one word or short phrases/);
  assert.match(systemPrompt, /what kind of answer the teacher should accept/);
  assert.match(systemPrompt, /ready-to-say opening phrase in natural A2 English/);
  assert.match(systemPrompt, /\*\*Say:\*\* \*English opening phrase\*/);
  assert.match(systemPrompt, /Say paragraph must not be a bullet point/);
  assert.match(systemPrompt, /only the English opening phrase after \*\*Say:\*\* must be italic/);
  assert.match(systemPrompt, /without presenting its topic as the topic of the whole lesson/);
  assert.match(systemPrompt, /Today we will talk about/);
  assert.doesNotMatch(systemPrompt, /summer\/gaming/);
});

test('Lead-In prompt keeps Teacher’s Notes in one field and defines all content requirements', () => {
  const messages = leadInMessages('Space travel and Past Simple');
  const systemPrompt = messages.find(message => message.role === 'system').content;
  assert.match(systemPrompt, /teacherNotes as one Markdown string/);
  assert.match(systemPrompt, /Read the text together with the learner and invite them to answer the questions/);
  assert.match(systemPrompt, /every part of teacherNotes in English/);
  assert.match(systemPrompt, /including instructions and direct address to the teacher/);
  assert.doesNotMatch(systemPrompt, /In Russian|Russian is allowed/);
  assert.match(systemPrompt, /one-word or very short answer to question 3/);
  assert.match(systemPrompt, /Why do you think so/);
  assert.match(systemPrompt, /whether the learner can guess the lesson topic/);
  assert.match(systemPrompt, /\*\*Say:\*\* \*English lesson preview\*/);
  assert.match(systemPrompt, /Never invent a grammar or vocabulary goal/);
  assert.match(systemPrompt, /Questions 1 and 2 must check comprehension/);
  assert.match(systemPrompt, /Question 3 must be personalized/);
  assert.equal(messages[1].content, 'Lesson topic: Space travel and Past Simple');
  assert.deepEqual(LEAD_IN_RESPONSE_SCHEMA.required, [
    'teacherNotes', 'message', 'leadingImagePrompt', 'trailingImagePrompt',
    'questions', 'suggestedAnswers',
  ]);
  assert.equal(LEAD_IN_RESPONSE_SCHEMA.properties.questions.minItems, 3);
  assert.equal(LEAD_IN_RESPONSE_SCHEMA.properties.questions.maxItems, 3);
});

test('generated Teacher’s Notes reject Cyrillic text', () => {
  assert.throws(() => buildWarmUpContent({
    ...GENERATED_WARM_UP,
    teacherNotes: '- Попросите ученика объяснить выбор.',
  }), /полностью на английском языке/);
  assert.throws(() => buildLeadInContent({
    ...GENERATED_LEAD_IN,
    teacherNotes: 'Обратитесь к учителю напрямую.',
  }), /полностью на английском языке/);
});

test('Target Vocabulary prompt and schema keep static copy out of the model response', () => {
  const messages = targetVocabularyMessages('Air travel');
  const systemPrompt = messages[0].content;
  assert.equal(messages[1].content, 'Lesson topic: Air travel');
  assert.match(systemPrompt, /exactly 10 distinct/);
  assert.match(systemPrompt, /exactly 8 connected context items/);
  assert.match(systemPrompt, /Vary the answer position/);
  assert.match(systemPrompt, /Do not generate Teacher’s Notes/);
  assert.match(systemPrompt, /How to Play rules/);
  assert.match(systemPrompt, /square educational illustration with no text/);
  assert.equal(TARGET_VOCABULARY_RESPONSE_SCHEMA.properties.vocabularyItems.minItems, 10);
  assert.equal(TARGET_VOCABULARY_RESPONSE_SCHEMA.properties.contextItems.maxItems, 8);
  assert.equal(TARGET_VOCABULARY_RESPONSE_SCHEMA.properties.describeAndGuessTerms.minItems, 6);
  assert.ok(!TARGET_VOCABULARY_RESPONSE_SCHEMA.required.includes('teacherNotes'));
  assert.ok(!TARGET_VOCABULARY_RESPONSE_SCHEMA.required.includes('howToPlay'));
});

test('Reading prompt receives the topic and exact Target Vocabulary contract', () => {
  const messages = readingMessages('Air travel', GENERATED_TARGET_VOCABULARY.vocabularyItems);
  const systemPrompt = messages[0].content;
  assert.match(systemPrompt, /180 to 230 words/);
  assert.match(systemPrompt, /4 to 6 distinct entries/);
  assert.match(systemPrompt, /review, social media post, short article, influencer story, or advice-column message/);
  assert.match(systemPrompt, /Do not use any other genre or text format/);
  assert.match(systemPrompt, /exactly five detailQuestions/);
  assert.match(systemPrompt, /Do not generate Teacher’s Notes/);
  assert.match(systemPrompt, /component titles, instructions, IDs/);
  assert.match(messages[1].content, /Lesson topic: Air travel/);
  assert.match(messages[1].content, /"book a ticket"/);
  assert.equal(READING_RESPONSE_SCHEMA.properties.usedVocabularyTerms.minItems, 4);
  assert.equal(READING_RESPONSE_SCHEMA.properties.usedVocabularyTerms.maxItems, 6);
  assert.equal(READING_RESPONSE_SCHEMA.properties.detailQuestions.minItems, 5);
  assert.deepEqual(READING_RESPONSE_SCHEMA.required, [
    'title', 'subtitle', 'text', 'headerImagePrompt', 'textImagePrompt',
    'usedVocabularyTerms', 'gistQuestion', 'detailQuestions',
  ]);
  assert.equal(READING_RESPONSE_SCHEMA.properties.teacherNotes, undefined);
});

test('Listening prompt defines the audio formats and receives Target Vocabulary', () => {
  const messages = listeningMessages('Air travel', GENERATED_TARGET_VOCABULARY.vocabularyItems);
  const systemPrompt = messages[0].content;
  assert.match(systemPrompt, /60 to 90 seconds/);
  assert.match(systemPrompt, /voice-message exchange/);
  assert.match(systemPrompt, /school announcement/);
  assert.match(systemPrompt, /two or three speakers/);
  assert.match(systemPrompt, /4 to 6 distinct entries/);
  assert.match(systemPrompt, /exactly two gistQuestions/);
  assert.match(systemPrompt, /exactly five detailQuestions/);
  assert.match(systemPrompt, /Do not generate Teacher’s Notes/);
  assert.match(messages[1].content, /Lesson topic: Air travel/);
  assert.match(messages[1].content, /"book a ticket"/);
  assert.equal(LISTENING_RESPONSE_SCHEMA.properties.gistQuestions.minItems, 2);
  assert.equal(LISTENING_RESPONSE_SCHEMA.properties.detailQuestions.maxItems, 5);
  assert.equal(LISTENING_RESPONSE_SCHEMA.properties.teacherNotes, undefined);
});

test('OpenRouter SSE parser joins split reasoning, output, id, and usage chunks', async () => {
  const response = streamingResponse([
    'data: {"id":"gen-1","choices":[{"delta":{"reasoning":"Plan "}}]}',
    'data: {"id":"gen-1","choices":[{"delta":{"reasoning_details":[{"type":"reasoning.summary","summary":"carefully"}]}}]}',
    'data: {"id":"gen-1","choices":[{"delta":{"content":"{\\"ok\\":"}}]}',
    'data: {"id":"gen-1","choices":[{"delta":{"content":"true}"}}],"usage":{"prompt_tokens":100,"completion_tokens":50,"completion_tokens_details":{"reasoning_tokens":20},"cost":0.01234}}',
    'data: [DONE]',
  ]);
  const deltas = [];
  const result = await parseOpenRouterStream(response, delta => deltas.push(delta));
  assert.equal(result.reasoning, 'Plan carefully');
  assert.equal(result.output, '{"ok":true}');
  assert.equal(result.providerGenerationId, 'gen-1');
  assert.deepEqual(result.usage, {
    cost: 0.01234, promptTokens: 100, completionTokens: 50, reasoningTokens: 20,
  });
  assert.ok(deltas.length >= 4);
});

test('generateWarmUp sends the selected model, high reasoning, and strict schema', async () => {
  let requestBody;
  const response = streamingResponse([
    `data: ${JSON.stringify({ id: 'gen-2', choices: [{ delta: { reasoning: 'Ready.' } }] })}`,
    `data: ${JSON.stringify({ id: 'gen-2', choices: [{ delta: { content: JSON.stringify(GENERATED_WARM_UP) } }] })}`,
    'data: {"id":"gen-2","choices":[{"delta":{}}],"usage":{"cost":0.01}}',
    'data: [DONE]',
  ]);
  const result = await generateWarmUp({
    topic: 'Space travel',
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.test/api/v1/chat/completions');
      assert.equal(options.headers.Authorization, 'Bearer test-key');
      requestBody = JSON.parse(options.body);
      return response;
    },
  });
  assert.equal(requestBody.model, OPENROUTER_MODEL);
  assert.deepEqual(requestBody.reasoning, { effort: 'high', exclude: false });
  assert.equal(requestBody.response_format.type, 'json_schema');
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(requestBody.stream, true);
  assert.equal(result.generated.choices.length, 4);
});

test('generateLeadIn sends its own strict schema and validates the result', async () => {
  let requestBody;
  const response = streamingResponse([
    `data: ${JSON.stringify({ id: 'gen-lead-in', choices: [{ delta: { reasoning: 'Ready.' } }] })}`,
    `data: ${JSON.stringify({ id: 'gen-lead-in', choices: [{ delta: { content: JSON.stringify(GENERATED_LEAD_IN) } }] })}`,
    'data: {"id":"gen-lead-in","choices":[{"delta":{}}],"usage":{"cost":0.02}}',
    'data: [DONE]',
  ]);
  const result = await generateLeadIn({
    topic: 'Space travel',
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.test/api/v1/chat/completions');
      requestBody = JSON.parse(options.body);
      return response;
    },
  });
  assert.equal(requestBody.model, OPENROUTER_MODEL);
  assert.equal(requestBody.messages[1].content, 'Lesson topic: Space travel');
  assert.equal(requestBody.response_format.json_schema.name, 'easyclass_lead_in');
  assert.deepEqual(requestBody.response_format.json_schema.schema, LEAD_IN_RESPONSE_SCHEMA);
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(result.generated.questions.length, 3);
  assert.equal(result.generated.suggestedAnswers.length, 3);
});

test('generateTargetVocabulary sends its own strict schema and validates the result', async () => {
  let requestBody;
  const response = streamingResponse([
    `data: ${JSON.stringify({ id: 'gen-target-vocabulary', choices: [{ delta: { reasoning: 'Ready.' } }] })}`,
    `data: ${JSON.stringify({ id: 'gen-target-vocabulary', choices: [{ delta: { content: JSON.stringify(GENERATED_TARGET_VOCABULARY) } }] })}`,
    'data: {"id":"gen-target-vocabulary","choices":[{"delta":{}}],"usage":{"cost":0.03}}',
    'data: [DONE]',
  ]);
  const result = await generateTargetVocabulary({
    topic: 'Air travel',
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.test/api/v1/chat/completions');
      requestBody = JSON.parse(options.body);
      return response;
    },
  });
  assert.equal(requestBody.messages[1].content, 'Lesson topic: Air travel');
  assert.equal(requestBody.response_format.json_schema.name, 'easyclass_target_vocabulary');
  assert.deepEqual(
    requestBody.response_format.json_schema.schema,
    TARGET_VOCABULARY_RESPONSE_SCHEMA,
  );
  assert.equal(result.generated.vocabularyItems.length, 10);
});

test('generateReading sends its strict schema with Target Vocabulary and validates the result', async () => {
  let requestBody;
  const response = streamingResponse([
    `data: ${JSON.stringify({ id: 'gen-reading', choices: [{ delta: { reasoning: 'Ready.' } }] })}`,
    `data: ${JSON.stringify({ id: 'gen-reading', choices: [{ delta: { content: JSON.stringify(GENERATED_READING) } }] })}`,
    'data: {"id":"gen-reading","choices":[{"delta":{}}],"usage":{"cost":0.04}}',
    'data: [DONE]',
  ]);
  const result = await generateReading({
    topic: 'Air travel',
    vocabularyItems: GENERATED_TARGET_VOCABULARY.vocabularyItems,
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.test/api/v1/chat/completions');
      requestBody = JSON.parse(options.body);
      return response;
    },
  });
  assert.match(requestBody.messages[1].content, /Lesson topic: Air travel/);
  assert.match(requestBody.messages[1].content, /"board a plane"/);
  assert.equal(requestBody.response_format.json_schema.name, 'easyclass_reading');
  assert.deepEqual(requestBody.response_format.json_schema.schema, READING_RESPONSE_SCHEMA);
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(result.generated.detailQuestions.length, 5);
});

test('generateListening sends its strict schema with Target Vocabulary and validates the result', async () => {
  let requestBody;
  const response = streamingResponse([
    `data: ${JSON.stringify({ id: 'gen-listening', choices: [{ delta: { reasoning: 'Ready.' } }] })}`,
    `data: ${JSON.stringify({ id: 'gen-listening', choices: [{ delta: { content: JSON.stringify(GENERATED_LISTENING) } }] })}`,
    'data: {"id":"gen-listening","choices":[{"delta":{}}],"usage":{"cost":0.05}}',
    'data: [DONE]',
  ]);
  const result = await generateListening({
    topic: 'Air travel',
    vocabularyItems: GENERATED_TARGET_VOCABULARY.vocabularyItems,
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.test/api/v1/chat/completions');
      requestBody = JSON.parse(options.body);
      return response;
    },
  });
  assert.match(requestBody.messages[1].content, /Lesson topic: Air travel/);
  assert.match(requestBody.messages[1].content, /"board a plane"/);
  assert.equal(requestBody.response_format.json_schema.name, 'easyclass_listening');
  assert.deepEqual(requestBody.response_format.json_schema.schema, LISTENING_RESPONSE_SCHEMA);
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(result.generated.gistQuestions.length, 2);
  assert.equal(result.generated.detailQuestions.length, 5);
});

test('generateGrammarPresentation sends both topics with its strict schema and validates the result', async () => {
  let requestBody;
  const response = streamingResponse([
    `data: ${JSON.stringify({ id: 'gen-grammar-presentation', choices: [{ delta: { reasoning: 'Ready.' } }] })}`,
    `data: ${JSON.stringify({ id: 'gen-grammar-presentation', choices: [{ delta: { content: JSON.stringify(GENERATED_GRAMMAR_PRESENTATION) } }] })}`,
    'data: {"id":"gen-grammar-presentation","choices":[{"delta":{}}],"usage":{"cost":0.06}}',
    'data: [DONE]',
  ]);
  const result = await generateGrammarPresentation({
    topic: 'Air travel',
    grammarTopic: 'Past Simple',
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.test/api/v1/chat/completions');
      requestBody = JSON.parse(options.body);
      return response;
    },
  });
  assert.equal(requestBody.messages[1].content, 'Lesson topic: Air travel\nGrammar topic: Past Simple');
  assert.equal(requestBody.response_format.json_schema.name, 'easyclass_grammar_presentation');
  assert.deepEqual(
    requestBody.response_format.json_schema.schema,
    GRAMMAR_PRESENTATION_RESPONSE_SCHEMA,
  );
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(result.generated.examples.length, 5);
  assert.equal(result.generated.checkItems.length, 5);
});

test('generateGrammarFocus sends all context with its strict schema and validates the result', async () => {
  let requestBody;
  const response = streamingResponse([
    `data: ${JSON.stringify({ id: 'gen-grammar-focus', choices: [{ delta: { reasoning: 'Ready.' } }] })}`,
    `data: ${JSON.stringify({ id: 'gen-grammar-focus', choices: [{ delta: { content: JSON.stringify(GENERATED_GRAMMAR_FOCUS) } }] })}`,
    'data: {"id":"gen-grammar-focus","choices":[{"delta":{}}],"usage":{"cost":0.07}}',
    'data: [DONE]',
  ]);
  const result = await generateGrammarFocus({
    topic: 'Air travel',
    grammarTopic: 'Past Simple',
    vocabularyItems: GENERATED_TARGET_VOCABULARY.vocabularyItems,
    apiKey: 'test-key',
    baseUrl: 'https://openrouter.test/api/v1/',
    fetchImpl: async (url, options) => {
      assert.equal(url, 'https://openrouter.test/api/v1/chat/completions');
      requestBody = JSON.parse(options.body);
      return response;
    },
  });
  assert.match(requestBody.messages[1].content, /^Lesson topic: Air travel\nGrammar topic: Past Simple/m);
  assert.match(requestBody.messages[1].content, /Target Vocabulary: \["book a ticket"/);
  assert.equal(requestBody.response_format.json_schema.name, 'easyclass_grammar_focus');
  assert.deepEqual(requestBody.response_format.json_schema.schema, GRAMMAR_FOCUS_RESPONSE_SCHEMA);
  assert.equal(requestBody.response_format.json_schema.strict, true);
  assert.equal(result.generated.task1Items.length, 8);
  assert.equal(result.generated.task2Gaps.length, 9);
});
