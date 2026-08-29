'use strict';

const { LISTENING_TEACHER_NOTE_TEXT, STAGE_BLUEPRINTS } = require('./synthetic-lesson.js');
const { normalizeAudioPlayer } = require('../assets/components/audio-player.js');
const { normalizeCheckboxChoice } = require('../assets/components/checkbox-choice.js');
const { normalizeMarkdownCard } = require('../assets/components/markdown-card.js');
const { normalizeTaskPrompt } = require('../assets/components/task-prompt.js');
const { normalizeTeacherNote } = require('../assets/components/teacher-note.js');
const { normalizeThisOrThat } = require('../assets/components/this-or-that.js');
const { normalizeMatchWords } = require('../assets/components/match-words.js');
const { normalizeDropdownChoice } = require('../assets/components/dropdown-choice.js');
const { normalizeFillInBlanks } = require('../assets/components/fill-in-blanks.js');
const { normalizePersonalizedQuestions } = require('../assets/components/personalized-questions.js');
const { normalizeDescribeAndGuess } = require('../assets/components/describe-and-guess.js');
const { normalizeMultipleChoice } = require('../assets/components/multiple-choice.js');
const { normalizeTextReading } = require('../assets/components/text-reading.js');
const {
  normalizeIllustratedTextPanel,
  normalizeTextPanel,
} = require('../assets/components/text-panel.js');
const {
  createTargetVocabularyHowToPlay,
  createTargetVocabularyTeacherNote,
} = require('./target-vocabulary-static.js');
const { createReadingTeacherNote } = require('./reading-static.js');

const OPENROUTER_MODEL = 'google/gemini-3.7-flash';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const GENERATION_TIMEOUT_MS = 5 * 60 * 1000;
const GENERATED_STAGE_SUBTITLES = Object.freeze({
  'warm-up': 'This or That?',
  'lead-in': 'Explore the Topic',
  'target-vocabulary': 'Learn New Words',
});

const WARM_UP_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'teacherNotes', 'yourTurnInstruction', 'choices', 'followUpQuestions', 'possibleLanguage',
  ],
  properties: {
    teacherNotes: { type: 'string', minLength: 1 },
    yourTurnInstruction: { type: 'string', minLength: 1 },
    choices: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['options'],
        properties: {
          options: {
            type: 'array',
            minItems: 2,
            maxItems: 2,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['caption', 'imagePrompt'],
              properties: {
                caption: { type: 'string', minLength: 1 },
                imagePrompt: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      },
    },
    followUpQuestions: { type: 'string', minLength: 1 },
    possibleLanguage: { type: 'string', minLength: 1 },
  },
});

const LEAD_IN_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'teacherNotes', 'message', 'leadingImagePrompt', 'trailingImagePrompt',
    'questions', 'suggestedAnswers',
  ],
  properties: {
    teacherNotes: { type: 'string', minLength: 1 },
    message: { type: 'string', minLength: 1 },
    leadingImagePrompt: { type: 'string', minLength: 1 },
    trailingImagePrompt: { type: 'string', minLength: 1 },
    questions: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1 },
    },
    suggestedAnswers: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1 },
    },
  },
});

const TARGET_VOCABULARY_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'vocabularyItems', 'extraExplanations', 'contextItems', 'fillInBlanks',
    'personalizedQuestions', 'sentenceStarters', 'describeAndGuessTerms',
  ],
  properties: {
    vocabularyItems: {
      type: 'array',
      minItems: 10,
      maxItems: 10,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'definition', 'imagePrompt'],
        properties: {
          term: { type: 'string', minLength: 1 },
          definition: { type: 'string', minLength: 1 },
          imagePrompt: { type: 'string', minLength: 1 },
        },
      },
    },
    extraExplanations: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'explanation'],
        properties: {
          term: { type: 'string', minLength: 1 },
          explanation: { type: 'string', minLength: 1 },
        },
      },
    },
    contextItems: {
      type: 'array',
      minItems: 8,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['before', 'answer', 'after', 'options'],
        properties: {
          before: { type: 'string' },
          answer: { type: 'string', minLength: 1 },
          after: { type: 'string' },
          options: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    fillInBlanks: {
      type: 'array',
      minItems: 6,
      maxItems: 6,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['targetTerm', 'before', 'answer', 'after'],
        properties: {
          targetTerm: { type: 'string', minLength: 1 },
          before: { type: 'string' },
          answer: { type: 'string', minLength: 1 },
          after: { type: 'string' },
        },
      },
    },
    personalizedQuestions: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['targetTerm', 'question', 'followUp'],
        properties: {
          targetTerm: { type: 'string', minLength: 1 },
          question: { type: 'string', minLength: 1 },
          followUp: { type: 'string', minLength: 1 },
        },
      },
    },
    sentenceStarters: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1 },
    },
    describeAndGuessTerms: {
      type: 'array',
      minItems: 6,
      maxItems: 6,
      items: { type: 'string', minLength: 1 },
    },
  },
});

const READING_QUESTION_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['question', 'options', 'answer', 'explanation'],
  properties: {
    question: { type: 'string', minLength: 1 },
    options: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1 },
    },
    answer: { type: 'string', minLength: 1 },
    explanation: { type: 'string', minLength: 1 },
  },
});

const READING_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'title', 'subtitle', 'text', 'headerImagePrompt', 'textImagePrompt',
    'usedVocabularyTerms', 'gistQuestion', 'detailQuestions',
  ],
  properties: {
    title: { type: 'string', minLength: 1 },
    subtitle: { type: 'string', minLength: 1 },
    text: { type: 'string', minLength: 1 },
    headerImagePrompt: { type: 'string', minLength: 1 },
    textImagePrompt: { type: 'string', minLength: 1 },
    usedVocabularyTerms: {
      type: 'array',
      minItems: 4,
      maxItems: 6,
      items: { type: 'string', minLength: 1 },
    },
    gistQuestion: READING_QUESTION_SCHEMA,
    detailQuestions: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: READING_QUESTION_SCHEMA,
    },
  },
});

const LISTENING_GIST_QUESTION_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['question', 'options', 'answers', 'explanation'],
  properties: {
    question: { type: 'string', minLength: 1 },
    options: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1 },
    },
    answers: {
      type: 'array',
      minItems: 1,
      maxItems: 2,
      items: { type: 'string', minLength: 1 },
    },
    explanation: { type: 'string', minLength: 1 },
  },
});

const LISTENING_DETAIL_QUESTION_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['question', 'options', 'answer', 'explanation'],
  properties: {
    question: { type: 'string', minLength: 1 },
    options: {
      type: 'array',
      minItems: 3,
      maxItems: 3,
      items: { type: 'string', minLength: 1 },
    },
    answer: { type: 'string', minLength: 1 },
    explanation: { type: 'string', minLength: 1 },
  },
});

const LISTENING_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['script', 'gistQuestions', 'detailQuestions'],
  properties: {
    script: { type: 'string', minLength: 1 },
    gistQuestions: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: LISTENING_GIST_QUESTION_SCHEMA,
    },
    detailQuestions: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: LISTENING_DETAIL_QUESTION_SCHEMA,
    },
  },
});

function createLessonSkeleton(topic) {
  const normalizedTopic = String(topic || '').trim();
  return {
    schemaVersion: 'lesson-draft-v1',
    meta: {
      topic: normalizedTopic,
      title: normalizedTopic,
      level: 'A2',
      lessonNumber: 1,
      durationMinutes: 50,
      generatedBy: `openrouter:${OPENROUTER_MODEL}`,
    },
    stages: STAGE_BLUEPRINTS.map((stage, index) => {
      const skeletonStage = {
        id: stage.id,
        title: stage.title,
        durationMinutes: stage.durationMinutes,
        icon: stage.icon,
        number: index + 1,
        content: [],
      };
      if (GENERATED_STAGE_SUBTITLES[stage.id]) {
        skeletonStage.subtitle = GENERATED_STAGE_SUBTITLES[stage.id];
      }
      return skeletonStage;
    }),
  };
}

function buildWarmUpContent(generated) {
  if (!generated || typeof generated !== 'object') throw new Error('Gemini вернул пустой Warm-Up.');
  if (!Array.isArray(generated.choices) || generated.choices.length !== 4) {
    throw new Error('Warm-Up должен содержать четыре пары This or That.');
  }

  const teacherNote = {
    type: 'teacherNote',
    id: 'warm-up-teacher-note',
    text: String(generated.teacherNotes || '').trim(),
  };
  const yourTurn = {
    type: 'markdownCard',
    id: 'warm-up-your-turn-card',
    title: 'Your turn!',
    text: String(generated.yourTurnInstruction || '').trim(),
    icon: 'chat',
    accentColor: '#1EAD58',
    studentVisibility: 'always',
  };
  const thisOrThat = {
    type: 'thisOrThat',
    id: 'warm-up-this-or-that',
    items: generated.choices.map((item, itemIndex) => ({
      id: `warm-up-choice-${itemIndex + 1}`,
      options: (Array.isArray(item?.options) ? item.options : []).map((option, optionIndex) => ({
        id: `warm-up-choice-${itemIndex + 1}-${optionIndex === 0 ? 'a' : 'b'}`,
        caption: String(option?.caption || '').trim(),
        imagePrompt: String(option?.imagePrompt || '').trim(),
      })),
    })),
  };
  const followUp = {
    type: 'taskPrompt',
    id: 'warm-up-follow-up-prompt',
    variant: 'followUp',
    title: 'Follow-up questions:',
    text: String(generated.followUpQuestions || '').trim(),
    support: {
      title: 'Possible language:',
      text: String(generated.possibleLanguage || '').trim(),
    },
  };

  normalizeTeacherNote(teacherNote);
  normalizeMarkdownCard(yourTurn);
  normalizeThisOrThat(thisOrThat);
  normalizeTaskPrompt(followUp);
  return [teacherNote, yourTurn, thisOrThat, followUp];
}

function applyWarmUpToSkeleton(skeleton, generated) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const stage = lesson.stages.find(candidate => candidate.id === 'warm-up');
  if (!stage) throw new Error('В шаблоне отсутствует стадия Warm-Up.');
  stage.content = buildWarmUpContent(generated);
  return lesson;
}

function buildLeadInContent(generated) {
  if (!generated || typeof generated !== 'object') throw new Error('Gemini вернул пустой Lead-In.');
  if (!Array.isArray(generated.questions) || generated.questions.length !== 3) {
    throw new Error('Lead-In должен содержать ровно три вопроса.');
  }
  if (!Array.isArray(generated.suggestedAnswers) || generated.suggestedAnswers.length !== 3) {
    throw new Error('Lead-In должен содержать ровно три suggested answers.');
  }

  const teacherNote = {
    type: 'teacherNote',
    id: 'lead-in-teacher-note',
    text: String(generated.teacherNotes || '').trim(),
  };
  const yourTurn = {
    type: 'markdownCard',
    id: 'lead-in-your-turn-card',
    title: 'Your turn!',
    text: 'Read the message and discuss it together.',
    icon: 'chat',
    accentColor: '#1EAD58',
    studentVisibility: 'always',
  };
  const message = {
    type: 'illustratedTextPanel',
    id: 'lead-in-gamer-message',
    text: String(generated.message || '').trim(),
    backgroundColor: '#252A38',
    leadingPicture: {
      imagePrompt: String(generated.leadingImagePrompt || '').trim(),
    },
    trailingPicture: {
      imagePrompt: String(generated.trailingImagePrompt || '').trim(),
    },
  };
  const questions = {
    type: 'textPanel',
    id: 'lead-in-discussion-questions',
    text: generated.questions
      .map((question, index) => `${index + 1}. ${String(question || '').trim()}`)
      .join('\n'),
    backgroundColor: '#FFFFFF',
  };
  const suggestedAnswers = {
    type: 'markdownCard',
    id: 'lead-in-suggested-answers-card',
    title: 'Suggested answers',
    text: generated.suggestedAnswers
      .map((answer, index) => `${index + 1}. ${String(answer || '').trim()}`)
      .join('\n'),
    icon: 'check',
    accentColor: '#1EAD58',
    studentVisibility: 'controlled',
  };

  normalizeTeacherNote(teacherNote);
  normalizeMarkdownCard(yourTurn);
  normalizeIllustratedTextPanel(message);
  normalizeTextPanel(questions);
  normalizeMarkdownCard(suggestedAnswers);
  return [teacherNote, yourTurn, message, questions, suggestedAnswers];
}

function applyLeadInToSkeleton(skeleton, generated) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const stage = lesson.stages.find(candidate => candidate.id === 'lead-in');
  if (!stage) throw new Error('В шаблоне отсутствует стадия Lead-In.');
  stage.content = buildLeadInContent(generated);
  return lesson;
}

function exactArray(value, count, label) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new Error(`Target Vocabulary должен содержать ${count} ${label}.`);
  }
  return value;
}

function generatedText(value, label, allowEmpty = false) {
  const normalized = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!normalized && !allowEmpty) throw new Error(`Target Vocabulary требует ${label}.`);
  return normalized;
}

function assertUnique(values, label) {
  const normalized = values.map(value => value.toLocaleLowerCase());
  if (new Set(normalized).size !== normalized.length) {
    throw new Error(`Target Vocabulary содержит повторяющиеся ${label}.`);
  }
}

function shuffleOptions(options, random = Math.random) {
  const shuffled = [...options];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function buildTargetVocabularyContent(generated) {
  if (!generated || typeof generated !== 'object') {
    throw new Error('Gemini вернул пустой Target Vocabulary.');
  }

  const vocabularyItems = exactArray(generated.vocabularyItems, 10, 'слов или фраз')
    .map(item => ({
      term: generatedText(item?.term, 'слово или фразу'),
      definition: generatedText(item?.definition, 'определение'),
      imagePrompt: generatedText(item?.imagePrompt, 'image prompt'),
    }));
  const terms = vocabularyItems.map(item => item.term);
  assertUnique(terms, 'слова или фразы');
  const termLookup = new Map(terms.map(term => [term.toLocaleLowerCase(), term]));

  vocabularyItems.forEach(item => {
    if (!/\bsquare\b/i.test(item.imagePrompt) || !/\b(?:no|without)\s+(?:visible\s+)?text\b/i.test(item.imagePrompt)) {
      throw new Error('Image prompts Target Vocabulary должны описывать квадратные иллюстрации без текста.');
    }
  });

  function referencedTerm(value, label) {
    const requested = generatedText(value, label);
    const matched = termLookup.get(requested.toLocaleLowerCase());
    if (!matched) throw new Error(`${label} должен точно совпадать со словом из Vocabulary.`);
    return matched;
  }

  const extraExplanations = exactArray(generated.extraExplanations, 5, 'дополнительных пояснений')
    .map(item => ({
      term: referencedTerm(item?.term, 'Слово в дополнительном пояснении'),
      explanation: generatedText(item?.explanation, 'дополнительное пояснение'),
    }));
  assertUnique(extraExplanations.map(item => item.term), 'слова в дополнительных пояснениях');

  const contextItems = exactArray(generated.contextItems, 8, 'контекстных заданий')
    .map((item, index) => {
      const answer = referencedTerm(item?.answer, 'Ответ контекстного задания');
      const options = exactArray(item?.options, 3, `варианта ответа для контекстного задания ${index + 1}`)
        .map(option => referencedTerm(option, 'Вариант контекстного задания'));
      assertUnique(options, `варианты контекстного задания ${index + 1}`);
      if (!options.includes(answer)) {
        throw new Error('Правильный ответ контекстного задания должен входить в список вариантов.');
      }
      const before = generatedText(item?.before, 'текст перед контекстным пропуском', true);
      const after = generatedText(item?.after, 'текст после контекстного пропуска', true);
      if (!before && !after) throw new Error('Контекстное задание требует текст вокруг пропуска.');
      return { before, answer, after, options: shuffleOptions(options) };
    });
  assertUnique(contextItems.map(item => item.answer), 'правильные ответы контекстных заданий');

  const fillInBlanks = exactArray(generated.fillInBlanks, 6, 'предложений Fill in the Blanks')
    .map(item => {
      const targetTerm = referencedTerm(item?.targetTerm, 'Target term в Fill in the Blanks');
      const before = generatedText(item?.before, 'текст перед пропуском Fill in the Blanks', true);
      const after = generatedText(item?.after, 'текст после пропуска Fill in the Blanks', true);
      if (!before && !after) throw new Error('Fill in the Blanks требует текст вокруг пропуска.');
      return {
        targetTerm,
        before,
        answer: generatedText(item?.answer, 'ответ Fill in the Blanks'),
        after,
      };
    });
  assertUnique(fillInBlanks.map(item => item.targetTerm), 'target terms в Fill in the Blanks');

  const personalizedQuestions = exactArray(generated.personalizedQuestions, 4, 'персонализированных вопроса')
    .map(item => {
      const targetTerm = referencedTerm(item?.targetTerm, 'Target term в персонализированном вопросе');
      const question = generatedText(item?.question, 'персонализированный вопрос');
      if (!question.replace(/\*/g, '').toLocaleLowerCase().includes(targetTerm.toLocaleLowerCase())) {
        throw new Error('Персонализированный вопрос должен содержать указанный target term.');
      }
      return {
        targetTerm,
        question,
        followUp: generatedText(item?.followUp, 'follow-up персонализированного вопроса'),
      };
    });
  assertUnique(personalizedQuestions.map(item => item.targetTerm), 'target terms в персонализированных вопросах');

  const sentenceStarters = exactArray(generated.sentenceStarters, 3, 'sentence starters')
    .map(starter => generatedText(starter, 'sentence starter'));
  assertUnique(sentenceStarters, 'sentence starters');
  if (sentenceStarters.some(starter => starter.includes('*'))) {
    throw new Error('Sentence starters должны быть обычным текстом без Markdown.');
  }

  const describeAndGuessTerms = exactArray(generated.describeAndGuessTerms, 6, 'слов для Describe and Guess')
    .map(term => referencedTerm(term, 'Слово Describe and Guess'));
  assertUnique(describeAndGuessTerms, 'слова Describe and Guess');

  const teacherNote = createTargetVocabularyTeacherNote();
  const vocabularyCard = {
    type: 'markdownCard',
    id: 'target-vocabulary-card',
    title: 'Vocabulary',
    text: vocabularyItems
      .map((item, index) => `${index + 1}. **${item.term}** — ${item.definition}`)
      .join('\n'),
    icon: 'book',
    accentColor: '#20A85B',
    studentVisibility: 'controlled',
  };
  const matchWords = {
    type: 'matchWords',
    id: 'target-vocabulary-match-words',
    title: 'Task 1 · Match the Words',
    instruction: 'Match the words with the pictures.',
    items: vocabularyItems.map((item, index) => ({
      id: `vocabulary-item-${index + 1}`,
      term: item.term,
      imagePrompt: item.imagePrompt,
    })),
  };
  const extraExplanationCard = {
    type: 'markdownCard',
    id: 'target-vocabulary-extra-explanation-card',
    title: '1. Words That Need Extra Explanation',
    text: extraExplanations.map(item => `- **${item.term}** — ${item.explanation}`).join('\n'),
    icon: 'book',
    accentColor: '#6545F5',
    studentVisibility: 'teacherOnly',
  };
  const contextDropdown = {
    type: 'dropdownChoice',
    id: 'target-vocabulary-context-dropdown',
    title: 'Task 2 · Vocabulary in Context — Dropdown',
    instruction: 'Fill in the blanks with the correct words from the dropdown lists.',
    text: contextItems.map((item, index) => (
      [item.before, `[[context-${index + 1}]]`, item.after].filter(Boolean).join(' ')
    )).join(' '),
    choices: contextItems.map((item, index) => ({
      id: `context-${index + 1}`,
      options: item.options,
      answer: item.answer,
    })),
  };
  const contextAnswerKey = {
    type: 'markdownCard',
    id: 'target-vocabulary-context-answer-key',
    title: 'Answer Key',
    text: contextItems.map((item, index) => `${index + 1}. **${item.answer}**`).join('\n'),
    icon: 'check',
    accentColor: '#20A85B',
    studentVisibility: 'teacherOnly',
  };
  const fillInBlanksComponent = {
    type: 'fillInBlanks',
    id: 'target-vocabulary-fill-in-blanks',
    title: 'Task 3 · Fill in the Blanks',
    instruction: 'Use the words and phrases in the box to complete the sentences.',
    items: fillInBlanks.map((item, index) => ({
      id: `fill-item-${index + 1}`,
      before: item.before,
      answer: item.answer,
      after: item.after,
    })),
  };
  const personalizedQuestionsComponent = {
    type: 'personalizedQuestions',
    id: 'target-vocabulary-personalized-questions',
    title: 'Task 4 · Personalised Questions',
    instruction: 'Answer the questions out loud. There are no right or wrong answers!',
    items: personalizedQuestions.map((item, index) => ({
      id: `personalized-question-${index + 1}`,
      question: item.question,
      followUp: item.followUp,
    })),
  };
  const sentenceStartersCard = {
    type: 'markdownCard',
    id: 'target-vocabulary-sentence-starters-card',
    title: 'Support: Sentence Starters',
    text: `Use these starters if you need help answering.\n\n${sentenceStarters.map(starter => `- **${starter}**`).join('\n')}`,
    icon: 'chat',
    accentColor: '#20A85B',
    studentVisibility: 'always',
  };
  const describeAndGuess = {
    type: 'describeAndGuess',
    id: 'target-vocabulary-describe-and-guess',
    title: 'Extra Task · Describe and Guess',
    instruction: 'Take turns with your teacher. Describe the word without saying it. Can your partner guess it?',
    items: describeAndGuessTerms.map((term, index) => ({
      id: `describe-item-${index + 1}`,
      text: term,
    })),
    howToPlay: createTargetVocabularyHowToPlay(),
  };

  normalizeTeacherNote(teacherNote);
  normalizeMarkdownCard(vocabularyCard);
  normalizeMatchWords(matchWords);
  normalizeMarkdownCard(extraExplanationCard);
  normalizeDropdownChoice(contextDropdown);
  normalizeMarkdownCard(contextAnswerKey);
  normalizeFillInBlanks(fillInBlanksComponent);
  normalizePersonalizedQuestions(personalizedQuestionsComponent);
  normalizeMarkdownCard(sentenceStartersCard);
  normalizeDescribeAndGuess(describeAndGuess);

  return [
    teacherNote,
    vocabularyCard,
    matchWords,
    extraExplanationCard,
    contextDropdown,
    contextAnswerKey,
    fillInBlanksComponent,
    personalizedQuestionsComponent,
    sentenceStartersCard,
    describeAndGuess,
  ];
}

function applyTargetVocabularyToSkeleton(skeleton, generated) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const stage = lesson.stages.find(candidate => candidate.id === 'target-vocabulary');
  if (!stage) throw new Error('В шаблоне отсутствует стадия Target Vocabulary.');
  stage.content = buildTargetVocabularyContent(generated);
  return lesson;
}

function readingText(value, label) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`Reading требует ${label}.`);
  return normalized;
}

function readingVocabularyTerms(vocabularyItems) {
  if (!Array.isArray(vocabularyItems) || vocabularyItems.length !== 10) {
    throw new Error('Reading требует ровно 10 элементов Target Vocabulary.');
  }
  const terms = vocabularyItems.map(item => readingText(item?.term, 'слово из Target Vocabulary'));
  const lookup = new Map(terms.map(term => [term.toLocaleLowerCase(), term]));
  if (lookup.size !== terms.length) {
    throw new Error('Reading получил повторяющиеся элементы Target Vocabulary.');
  }
  return { terms, lookup };
}

function buildReadingQuestion(item, id, random) {
  const question = readingText(item?.question, 'текст вопроса');
  if (!Array.isArray(item?.options) || item.options.length !== 3) {
    throw new Error('Каждый вопрос Reading должен содержать ровно три варианта ответа.');
  }
  const options = item.options.map(option => readingText(option, 'вариант ответа'));
  if (new Set(options.map(option => option.toLocaleLowerCase())).size !== options.length) {
    throw new Error('Вопрос Reading содержит повторяющиеся варианты ответа.');
  }
  const answer = readingText(item?.answer, 'правильный ответ');
  if (!options.includes(answer)) {
    throw new Error('Правильный ответ Reading должен точно совпадать с одним из вариантов.');
  }
  const explanation = readingText(item?.explanation, 'объяснение ответа');
  return {
    id,
    question,
    options: shuffleOptions(options, random),
    answer,
    explanation,
  };
}

function answerKeyLine(item, prefix = '') {
  const letter = String.fromCharCode(65 + item.options.indexOf(item.answer));
  return `${prefix}${letter} — ${item.explanation}`;
}

function buildReadingContent(generated, vocabularyItems, random = Math.random) {
  if (!generated || typeof generated !== 'object') throw new Error('Gemini вернул пустой Reading.');
  const { lookup } = readingVocabularyTerms(vocabularyItems);
  const text = readingText(generated.text, 'текст для чтения');
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount < 180 || wordCount > 230) {
    throw new Error('Текст Reading должен содержать от 180 до 230 слов.');
  }
  if (!Array.isArray(generated.usedVocabularyTerms)
    || generated.usedVocabularyTerms.length < 4
    || generated.usedVocabularyTerms.length > 6) {
    throw new Error('Reading должен использовать от 4 до 6 элементов Target Vocabulary.');
  }
  const usedVocabularyTerms = generated.usedVocabularyTerms.map(value => {
    const requested = readingText(value, 'использованный элемент Target Vocabulary');
    const matched = lookup.get(requested.toLocaleLowerCase());
    if (!matched) throw new Error('Reading использует неизвестный элемент Target Vocabulary.');
    return matched;
  });
  if (new Set(usedVocabularyTerms.map(term => term.toLocaleLowerCase())).size !== usedVocabularyTerms.length) {
    throw new Error('Reading содержит повторяющиеся ссылки на Target Vocabulary.');
  }
  const normalizedArticle = text.replace(/\s+/g, ' ').toLocaleLowerCase();
  usedVocabularyTerms.forEach(term => {
    if (!normalizedArticle.includes(term.replace(/\s+/g, ' ').toLocaleLowerCase())) {
      throw new Error(`Элемент Target Vocabulary “${term}” отсутствует в тексте Reading.`);
    }
  });
  if (!Array.isArray(generated.detailQuestions) || generated.detailQuestions.length !== 5) {
    throw new Error('Reading должен содержать ровно пять detail-вопросов.');
  }
  const headerImagePrompt = readingText(generated.headerImagePrompt, 'header image prompt');
  const textImagePrompt = readingText(generated.textImagePrompt, 'text image prompt');
  [headerImagePrompt, textImagePrompt].forEach(imagePrompt => {
    if (!/\b(?:no|without)\s+(?:readable\s+|visible\s+)?text\b/i.test(imagePrompt)) {
      throw new Error('Image prompts Reading должны явно требовать иллюстрации без текста.');
    }
  });

  const gistItem = buildReadingQuestion(generated.gistQuestion, 'main-idea', random);
  const detailItems = generated.detailQuestions.map((item, index) => (
    buildReadingQuestion(item, `reading-detail-${index + 1}`, random)
  ));
  const teacherNote = createReadingTeacherNote();
  const reading = {
    type: 'textReading',
    id: 'reading-text',
    title: readingText(generated.title, 'заголовок'),
    subtitle: readingText(generated.subtitle, 'подзаголовок'),
    headerImage: { imagePrompt: headerImagePrompt },
    text,
    textImage: { imagePrompt: textImagePrompt },
  };
  const gistQuiz = {
    type: 'multipleChoice',
    id: 'reading-gist-quiz',
    title: 'Task 1. Reading for Gist',
    instruction: 'Choose the best answer.',
    items: [gistItem],
  };
  const detailQuiz = {
    type: 'multipleChoice',
    id: 'reading-detail-quiz',
    title: 'Task 2. Reading for Detail',
    instruction: 'Read the questions and choose A, B or C.',
    items: detailItems,
  };
  const answerKey = {
    type: 'markdownCard',
    id: 'reading-answer-key',
    title: 'Answer Key',
    text: [
      '**Task 1:**',
      answerKeyLine(gistItem),
      '**Task 2:**',
      ...detailItems.map((item, index) => answerKeyLine(item, `${index + 1}`)),
    ].join('\n\n'),
    icon: 'check',
    accentColor: '#20A85B',
    studentVisibility: 'teacherOnly',
  };

  normalizeTeacherNote(teacherNote);
  normalizeTextReading(reading);
  normalizeMultipleChoice(gistQuiz);
  normalizeMultipleChoice(detailQuiz);
  normalizeMarkdownCard(answerKey);
  return [teacherNote, reading, gistQuiz, detailQuiz, answerKey];
}

function applyReadingToSkeleton(skeleton, generated, vocabularyItems, random = Math.random) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const stage = lesson.stages.find(candidate => candidate.id === 'reading');
  if (!stage) throw new Error('В шаблоне отсутствует стадия Reading.');
  stage.content = buildReadingContent(generated, vocabularyItems, random);
  return lesson;
}

function listeningAnswerKeyLine(options, answers, explanation, prefix = '') {
  const letters = answers
    .map(answer => options.indexOf(answer))
    .sort((first, second) => first - second)
    .map(index => String.fromCharCode(65 + index))
    .join(', ');
  return `${prefix}${letters} — ${String(explanation || '').trim()}`;
}

function buildListeningContent(generated, random = Math.random) {
  if (!generated || typeof generated !== 'object') throw new Error('Gemini вернул пустой Listening.');
  if (!Array.isArray(generated.gistQuestions) || generated.gistQuestions.length !== 2) {
    throw new Error('Listening должен содержать ровно два gist-вопроса.');
  }
  if (!Array.isArray(generated.detailQuestions) || generated.detailQuestions.length !== 5) {
    throw new Error('Listening должен содержать ровно пять detail-вопросов.');
  }

  const script = typeof generated.script === 'string' ? generated.script.trim() : '';
  const gistExplanations = generated.gistQuestions.map(item => String(item?.explanation || '').trim());
  const gistItems = generated.gistQuestions.map((item, index) => ({
    id: `listening-gist-${index + 1}`,
    question: item?.question,
    options: shuffleOptions(Array.isArray(item?.options) ? item.options : [], random),
    answers: item?.answers,
  }));
  const detailItems = generated.detailQuestions.map((item, index) => ({
    id: `listening-detail-${index + 1}`,
    question: item?.question,
    options: shuffleOptions(Array.isArray(item?.options) ? item.options : [], random),
    answer: item?.answer,
    explanation: item?.explanation,
  }));
  const teacherNote = {
    type: 'teacherNote',
    id: 'listening-teacher-note',
    text: LISTENING_TEACHER_NOTE_TEXT,
  };
  const firstAudio = {
    type: 'audioPlayer',
    id: 'listening-audio',
    title: 'Listen to the audio',
    script,
  };
  const gistQuiz = {
    type: 'checkboxChoice',
    id: 'listening-gist-quiz',
    title: 'Task 1. Listening for Gist',
    instruction: 'Choose the correct options.',
    items: gistItems,
  };
  const secondAudio = {
    type: 'audioPlayer',
    id: 'listening-audio-again',
    title: 'Listen to the audio one more time',
    script,
  };
  const detailQuiz = {
    type: 'multipleChoice',
    id: 'listening-detail-quiz',
    title: 'Task 2. Listening for Detail',
    instruction: 'Choose the correct options.',
    items: detailItems,
  };

  normalizeTeacherNote(teacherNote);
  normalizeAudioPlayer(firstAudio);
  normalizeCheckboxChoice(gistQuiz);
  normalizeAudioPlayer(secondAudio);
  normalizeMultipleChoice(detailQuiz);

  const answerKey = {
    type: 'markdownCard',
    id: 'listening-answer-key',
    title: 'Answer Key',
    text: [
      '**Task 1:**',
      ...gistQuiz.items.map((item, index) => listeningAnswerKeyLine(
        item.options, item.answers, gistExplanations[index], `${index + 1}`,
      )),
      '**Task 2:**',
      ...detailQuiz.items.map((item, index) => listeningAnswerKeyLine(
        item.options, [item.answer], item.explanation, `${index + 1}`,
      )),
    ].join('\n\n'),
    icon: 'check',
    accentColor: '#20A85B',
    studentVisibility: 'teacherOnly',
  };
  normalizeMarkdownCard(answerKey);

  return [teacherNote, firstAudio, gistQuiz, secondAudio, detailQuiz, answerKey];
}

function applyListeningToSkeleton(skeleton, generated, random = Math.random) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const stage = lesson.stages.find(candidate => candidate.id === 'listening');
  if (!stage) throw new Error('В шаблоне отсутствует стадия Listening.');
  stage.content = buildListeningContent(generated, random);
  return lesson;
}

function warmUpMessages(topic) {
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable content for a five-minute Warm-Up in the existing This or That template.',
      'Write teacherNotes as exactly three Markdown bullet points followed by a separate Say paragraph, in this order:',
      '1. In Russian, briefly explain the purpose of the lead-in question, then provide the exact question for the learner in natural A2 English; it must summarize the main Warm-Up topic and guide the learner toward the task.',
      '2. In Russian, explain whether the learner should answer with one word or short phrases.',
      '3. In Russian, state what kind of answer the teacher should accept.',
      'After the three bullet points, add a blank line and then give the teacher a ready-to-say opening phrase in natural A2 English using exactly this Markdown format: **Say:** *English opening phrase*.',
      'The Say paragraph must not be a bullet point; only the English opening phrase after **Say:** must be italic.',
      'The opening phrase must start the Warm-Up without presenting its topic as the topic of the whole lesson. Do not use phrases such as “Today we will talk about...”.',
      'All student-facing copy, captions, questions, possible language, and image prompts must be in natural A2 English.',
      'Create exactly four engaging This or That pairs with exactly two clearly contrasting options in each pair.',
      'Every imagePrompt must describe a child-friendly square educational illustration with no text.',
      'Keep every activity directly connected to the provided topic.',
      'Return JSON matching the supplied schema and nothing else.',
    ].join('\n'),
  }, {
    role: 'user',
    content: `Lesson topic: ${String(topic || '').trim()}`,
  }];
}

function leadInMessages(topic) {
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable content for a five-minute Lead-In in the existing template.',
      'Write teacherNotes as one Markdown string, following this exact content order:',
      '1. Start with this exact instruction in Russian: Прочитайте текст вместе с учеником и предложите ему ответить на вопросы.',
      '2. In Russian, list the one or two modern English phrases, idioms, or slang expressions from the message that the teacher should explain, and briefly explain their meaning.',
      '3. In Russian, tell the teacher that if the learner gives a one-word or very short answer to question 3, they must encourage the learner to develop their point of view; include a ready-to-say natural English follow-up question such as “Why do you think so?”.',
      '4. In Russian, tell the teacher to ask after all three answers whether the learner can guess the lesson topic; include a ready-to-say natural A2 English question.',
      '5. Finish with a ready-to-say natural A2 English lesson preview in the exact Markdown format **Say:** *English lesson preview*.',
      'The lesson preview must start with “We are going to...” and may mention only topic, vocabulary, or grammar goals explicitly present in the supplied Lesson topic. Never invent a grammar or vocabulary goal.',
      'The main message must be short, engaging, directly connected to the lesson topic, and lead naturally into it.',
      'Use mostly simple natural A2 English in the message, but include exactly one or two contemporary English phrases, idioms, or slang expressions. Those expressions must be the ones explained in teacherNotes.',
      'The message may start with a short sender name or social-media handle and may use light Markdown, but it must remain easy to read.',
      'Create exactly three student-facing questions in natural A2 English.',
      'Questions 1 and 2 must check comprehension of facts or meaning in the message and be answerable from the message itself.',
      'Question 3 must be personalized: connect the message to the learner’s own experience or opinion.',
      'Create exactly three suggestedAnswers in the same order. Answers 1 and 2 must answer from the message; answer 3 must be a plausible example personal answer, not “Personal answer”.',
      'Both image prompts must describe child-friendly educational illustrations with no text. The leading image should work as a sender/avatar image and the trailing image as a small thematic symbol related to the message.',
      'All student-facing copy and image prompts must be in English. Russian is allowed only in teacherNotes.',
      'Return JSON matching the supplied schema and nothing else.',
    ].join('\n'),
  }, {
    role: 'user',
    content: `Lesson topic: ${String(topic || '').trim()}`,
  }];
}

function targetVocabularyMessages(topic) {
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable student-facing content for an eight-minute Target Vocabulary section in the existing template.',
      'All content must be in natural A2 English and directly connected to the supplied lesson topic.',
      'Do not generate Teacher’s Notes, component titles, instructions, answer keys, IDs, or How to Play rules; the application adds them statically.',
      'Create exactly 10 distinct, useful target words or short phrases. Prefer common lexical chunks that an A2 learner can use when speaking about the topic.',
      'Give every term a short, simple English definition and an English imagePrompt.',
      'Every imagePrompt must explicitly describe a child-friendly square educational illustration with no text.',
      'Select exactly 5 of those terms that genuinely need extra explanation and explain each briefly for the teacher in simple English.',
      'Create exactly 8 connected context items that form one coherent topic-related paragraph when joined in order.',
      'Each context item must have text before and/or after the gap, use one exact vocabulary term as the answer, and provide exactly 3 distinct options from the 10 exact vocabulary terms including the answer.',
      'Vary the answer position across context-item option lists; do not consistently put the correct answer first.',
      'Use 8 different correct vocabulary terms across the context items.',
      'Create exactly 6 Fill in the Blanks sentences. Each targetTerm must exactly match a vocabulary term; answer may be its grammatically correct inflected form. Use 6 different target terms.',
      'Create exactly 4 personalized question and follow-up pairs using 4 different vocabulary terms.',
      'In every personalized question, include the exact targetTerm and wrap only that occurrence in **bold** Markdown.',
      'Create exactly 3 short, topic-relevant sentence starters as plain text without Markdown.',
      'Select exactly 6 distinct exact vocabulary terms for Describe and Guess.',
      'Whenever a field refers to a vocabulary term, copy it exactly, including spelling, capitalization, articles, and “to”.',
      'Return JSON matching the supplied schema and nothing else.',
    ].join('\n'),
  }, {
    role: 'user',
    content: `Lesson topic: ${String(topic || '').trim()}`,
  }];
}

function readingMessages(topic, vocabularyItems) {
  const { terms } = readingVocabularyTerms(vocabularyItems);
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable content for a five-minute Reading section in the existing template.',
      'All student-facing content must be natural A2 English and directly connected to the supplied lesson topic.',
      'Choose exactly one of these text formats, whichever best suits the lesson topic: review, social media post, short article, influencer story, or advice-column message.',
      'Do not use any other genre or text format.',
      'Write a coherent reading text of 180 to 230 words, split into readable paragraphs.',
      'Select 4 to 6 distinct entries from the supplied Target Vocabulary. Copy each selected entry exactly into usedVocabularyTerms and include that exact text naturally in the reading text.',
      'Create one gistQuestion about the main idea and exactly five detailQuestions whose answers are stated or clearly supported by the text.',
      'Every question must have exactly three distinct plain-text options, one answer copied exactly from its options, and a short useful explanation.',
      'Make distractors plausible but unambiguously incorrect. Vary the position of correct answers.',
      'Provide a concise title and a useful subtitle appropriate to the chosen genre.',
      'headerImagePrompt must describe a small compact avatar or thematic icon. textImagePrompt must describe a wider scene related to the text.',
      'Both image prompts must be in English, child-friendly, educational, and explicitly require no text or readable text.',
      'Do not generate Teacher’s Notes, component titles, instructions, IDs, option letters, or an Answer Key; the application adds them.',
      'Return JSON matching the supplied schema and nothing else.',
    ].join('\n'),
  }, {
    role: 'user',
    content: [
      `Lesson topic: ${String(topic || '').trim()}`,
      `Target Vocabulary: ${JSON.stringify(terms)}`,
    ].join('\n'),
  }];
}

function listeningMessages(topic, vocabularyItems) {
  const { terms } = readingVocabularyTerms(vocabularyItems);
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable content for a three-minute Listening section in the existing template.',
      'All student-facing content must be natural A2 English and directly connected to the supplied lesson topic.',
      'Write an audio script designed to last approximately 60 to 90 seconds.',
      'Choose the format that best suits the topic: voice-message exchange, conversation between friends, podcast fragment, school announcement, video commentary, or short interview.',
      'Use two or three speakers. Write every spoken turn on a separate line in the plain-text format Speaker: words.',
      'Naturally include 4 to 6 distinct entries from the supplied Target Vocabulary, copying their wording exactly.',
      'Create exactly two gistQuestions with exactly three options each.',
      'The first gist question must have exactly one correct answer. The second gist question must have exactly two correct answers.',
      'Create exactly five detailQuestions with exactly three options and one correct answer each.',
      'Every answer must be copied exactly from its question options. Give every question a short useful explanation for the teacher Answer Key.',
      'Questions and answers must be fully supported by the script. Make distractors plausible but unambiguously incorrect.',
      'Do not generate Teacher’s Notes, component titles, instructions, IDs, option letters, or an Answer Key; the application adds them.',
      'Do not use HTML or Markdown in the script, questions, options, answers, or explanations.',
      'Return JSON matching the supplied schema and nothing else.',
    ].join('\n'),
  }, {
    role: 'user',
    content: [
      `Lesson topic: ${String(topic || '').trim()}`,
      `Target Vocabulary: ${JSON.stringify(terms)}`,
    ].join('\n'),
  }];
}

function reasoningText(delta) {
  if (typeof delta?.reasoning === 'string' && delta.reasoning) return delta.reasoning;
  if (!Array.isArray(delta?.reasoning_details)) return '';
  return delta.reasoning_details.map(detail => {
    if (detail?.type === 'reasoning.text') return detail.text || '';
    if (detail?.type === 'reasoning.summary') return detail.summary || '';
    return '';
  }).join('');
}

function normalizeUsage(usage) {
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
  return {
    cost: typeof usage?.cost === 'number' ? usage.cost : null,
    promptTokens: Number.isInteger(usage?.prompt_tokens) ? usage.prompt_tokens : null,
    completionTokens: Number.isInteger(usage?.completion_tokens) ? usage.completion_tokens : null,
    reasoningTokens: Number.isInteger(reasoningTokens) ? reasoningTokens : null,
  };
}

async function parseOpenRouterStream(response, onDelta = () => {}) {
  if (!response.body) throw new Error('OpenRouter не вернул поток данных.');
  const decoder = new TextDecoder();
  let buffer = '';
  let reasoning = '';
  let output = '';
  let usage = normalizeUsage(null);
  let providerGenerationId = '';

  function consumeEvent(rawEvent) {
    const data = rawEvent.split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n');
    if (!data || data === '[DONE]') return;
    let chunk;
    try {
      chunk = JSON.parse(data);
    } catch (cause) {
      throw new Error(`OpenRouter вернул некорректное SSE-событие: ${cause.message}`);
    }
    if (chunk.error) throw new Error(chunk.error.message || 'OpenRouter завершил поток с ошибкой.');
    if (typeof chunk.id === 'string' && chunk.id) providerGenerationId = chunk.id;
    if (chunk.usage) usage = normalizeUsage(chunk.usage);
    const delta = chunk.choices?.[0]?.delta || {};
    const nextReasoning = reasoningText(delta);
    const nextOutput = typeof delta.content === 'string' ? delta.content : '';
    reasoning += nextReasoning;
    output += nextOutput;
    if (nextReasoning || nextOutput || chunk.usage) {
      onDelta({
        reasoningDelta: nextReasoning,
        outputDelta: nextOutput,
        reasoning,
        output,
        usage,
        providerGenerationId,
      });
    }
  }

  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() || '';
    events.forEach(consumeEvent);
  }
  buffer += decoder.decode();
  if (buffer.trim()) consumeEvent(buffer);
  return { reasoning, output, usage, providerGenerationId };
}

async function generateStructuredSection({
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  signal,
  onDelta,
  fetchImpl = fetch,
  messages,
  schemaName,
  schema,
  validate,
  sectionName,
}) {
  if (!apiKey) throw Object.assign(new Error('OPENROUTER_API_KEY не настроен.'), { statusCode: 503 });
  const timeoutSignal = AbortSignal.timeout(GENERATION_TIMEOUT_MS);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://easyclass.app',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'EasyClass',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages,
      reasoning: { effort: 'high', exclude: false },
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: schemaName,
          strict: true,
          schema,
        },
      },
      max_completion_tokens: 16000,
      stream: true,
    }),
    signal: combinedSignal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload?.error?.message || payload?.error || `OpenRouter вернул HTTP ${response.status}.`;
    throw new Error(String(message));
  }
  const streamed = await parseOpenRouterStream(response, onDelta);
  let generated;
  try {
    generated = JSON.parse(streamed.output);
  } catch (cause) {
    throw Object.assign(new Error(`Gemini вернул некорректный JSON для ${sectionName}: ${cause.message}`), { streamed });
  }
  validate(generated);
  return { ...streamed, generated };
}

async function generateWarmUp({
  topic,
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  signal,
  onDelta,
  fetchImpl = fetch,
}) {
  return generateStructuredSection({
    apiKey,
    baseUrl,
    signal,
    onDelta,
    fetchImpl,
    messages: warmUpMessages(topic),
    schemaName: 'easyclass_warm_up',
    schema: WARM_UP_RESPONSE_SCHEMA,
    validate: buildWarmUpContent,
    sectionName: 'Warm-Up',
  });
}

async function generateLeadIn({
  topic,
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  signal,
  onDelta,
  fetchImpl = fetch,
}) {
  return generateStructuredSection({
    apiKey,
    baseUrl,
    signal,
    onDelta,
    fetchImpl,
    messages: leadInMessages(topic),
    schemaName: 'easyclass_lead_in',
    schema: LEAD_IN_RESPONSE_SCHEMA,
    validate: buildLeadInContent,
    sectionName: 'Lead-In',
  });
}

async function generateTargetVocabulary({
  topic,
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  signal,
  onDelta,
  fetchImpl = fetch,
}) {
  return generateStructuredSection({
    apiKey,
    baseUrl,
    signal,
    onDelta,
    fetchImpl,
    messages: targetVocabularyMessages(topic),
    schemaName: 'easyclass_target_vocabulary',
    schema: TARGET_VOCABULARY_RESPONSE_SCHEMA,
    validate: buildTargetVocabularyContent,
    sectionName: 'Target Vocabulary',
  });
}

async function generateReading({
  topic,
  vocabularyItems,
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  signal,
  onDelta,
  fetchImpl = fetch,
}) {
  return generateStructuredSection({
    apiKey,
    baseUrl,
    signal,
    onDelta,
    fetchImpl,
    messages: readingMessages(topic, vocabularyItems),
    schemaName: 'easyclass_reading',
    schema: READING_RESPONSE_SCHEMA,
    validate: generated => buildReadingContent(generated, vocabularyItems),
    sectionName: 'Reading',
  });
}

async function generateListening({
  topic,
  vocabularyItems,
  apiKey,
  baseUrl = OPENROUTER_BASE_URL,
  signal,
  onDelta,
  fetchImpl = fetch,
}) {
  return generateStructuredSection({
    apiKey,
    baseUrl,
    signal,
    onDelta,
    fetchImpl,
    messages: listeningMessages(topic, vocabularyItems),
    schemaName: 'easyclass_listening',
    schema: LISTENING_RESPONSE_SCHEMA,
    validate: buildListeningContent,
    sectionName: 'Listening',
  });
}

module.exports = {
  GENERATION_TIMEOUT_MS,
  LEAD_IN_RESPONSE_SCHEMA,
  LISTENING_RESPONSE_SCHEMA,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
  READING_RESPONSE_SCHEMA,
  TARGET_VOCABULARY_RESPONSE_SCHEMA,
  WARM_UP_RESPONSE_SCHEMA,
  applyLeadInToSkeleton,
  applyListeningToSkeleton,
  applyReadingToSkeleton,
  applyTargetVocabularyToSkeleton,
  applyWarmUpToSkeleton,
  buildLeadInContent,
  buildListeningContent,
  buildReadingContent,
  buildTargetVocabularyContent,
  buildWarmUpContent,
  createLessonSkeleton,
  generateLeadIn,
  generateListening,
  generateReading,
  generateTargetVocabulary,
  generateWarmUp,
  leadInMessages,
  listeningMessages,
  normalizeUsage,
  parseOpenRouterStream,
  readingMessages,
  shuffleOptions,
  targetVocabularyMessages,
  warmUpMessages,
};
