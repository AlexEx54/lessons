'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  LEAD_IN_RESPONSE_SCHEMA,
  OPENROUTER_MODEL,
  TARGET_VOCABULARY_RESPONSE_SCHEMA,
  applyLeadInToSkeleton,
  applyTargetVocabularyToSkeleton,
  applyWarmUpToSkeleton,
  buildLeadInContent,
  buildTargetVocabularyContent,
  buildWarmUpContent,
  createLessonSkeleton,
  generateLeadIn,
  generateTargetVocabulary,
  generateWarmUp,
  leadInMessages,
  parseOpenRouterStream,
  shuffleOptions,
  targetVocabularyMessages,
  warmUpMessages,
} = require('../lib/ai-lesson-generator.js');
const {
  GENERATED_TARGET_VOCABULARY,
  TERMS,
} = require('./fixtures/generated-target-vocabulary.js');

const GENERATED_WARM_UP = Object.freeze({
  teacherNotes: '- Покажите варианты и попросите коротко объяснить выбор.\n\n**Say:** “Which space trip would you choose?”',
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
    'Прочитайте текст вместе с учеником и предложите ему ответить на вопросы.',
    '- Объясните фразу **low-key** — немного или в некоторой степени.',
    '- Если третий ответ короткий, попросите развить мысль: *Why do you think so?*',
    '- После ответов спросите: *Can you guess what our lesson is about?*',
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

test('AI lesson skeleton keeps nine stages and hides future topic-specific subtitles', () => {
  const lesson = createLessonSkeleton('  Space travel  ');
  assert.equal(lesson.meta.topic, 'Space travel');
  assert.equal(lesson.meta.generatedBy, `openrouter:${OPENROUTER_MODEL}`);
  assert.equal(lesson.stages.length, 9);
  assert.ok(lesson.stages.every(stage => Array.isArray(stage.content) && stage.content.length === 0));
  assert.equal(lesson.stages[0].subtitle, 'This or That?');
  assert.ok(lesson.stages.slice(1).every(stage => stage.subtitle === undefined));
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
  assert.equal(lesson.stages[2].subtitle, undefined);
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
  assert.match(first[0].blocks[1].text, /Используйте эти фразы/);
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

test('Warm-Up prompt requires three teacher-note bullets and a separate Say paragraph', () => {
  const messages = warmUpMessages('Space travel');
  const systemPrompt = messages.find(message => message.role === 'system').content;
  assert.match(systemPrompt, /exactly three Markdown bullet points followed by a separate Say paragraph/);
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
  assert.match(systemPrompt, /Прочитайте текст вместе с учеником и предложите ему ответить на вопросы/);
  assert.doesNotMatch(systemPrompt, /Read the text together and encourage a student/);
  assert.match(systemPrompt, /In Russian, list the one or two modern English phrases/);
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
