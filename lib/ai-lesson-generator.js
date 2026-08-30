'use strict';

const {
  GRAMMAR_PRESENTATION_TEACHER_NOTE_TEXT,
  LISTENING_TEACHER_NOTE_TEXT,
  STAGE_BLUEPRINTS,
} = require('./synthetic-lesson.js');
const { normalizeAudioPlayer } = require('../assets/components/audio-player.js');
const { normalizeCheckboxChoice } = require('../assets/components/checkbox-choice.js');
const { normalizeMarkdownCard } = require('../assets/components/markdown-card.js');
const { normalizeTaskPrompt } = require('../assets/components/task-prompt.js');
const { normalizeTeacherNote } = require('../assets/components/teacher-note.js');
const { normalizeThisOrThat } = require('../assets/components/this-or-that.js');
const { normalizeMatchWords } = require('../assets/components/match-words.js');
const { normalizeDropdownChoice } = require('../assets/components/dropdown-choice.js');
const { normalizeDragWordsInText } = require('../assets/components/drag-words-in-text.js');
const { normalizeGapFill } = require('../assets/components/gap-fill.js');
const { normalizeFillInBlanks } = require('../assets/components/fill-in-blanks.js');
const { normalizePersonalizedQuestions } = require('../assets/components/personalized-questions.js');
const { normalizeDescribeAndGuess } = require('../assets/components/describe-and-guess.js');
const { normalizeMultipleChoice } = require('../assets/components/multiple-choice.js');
const { normalizeTextReading } = require('../assets/components/text-reading.js');
const { normalizeMiniSituation } = require('../assets/components/mini-situation.js');
const { normalizeCardRow } = require('../assets/components/card-row.js');
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

const GRAMMAR_RULE_ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['before', 'answer', 'after'],
  properties: {
    before: { type: 'string' },
    answer: { type: 'string', minLength: 1 },
    after: { type: 'string' },
  },
});

const GRAMMAR_CHECK_ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['before', 'after', 'options', 'answer', 'explanation'],
  properties: {
    before: { type: 'string' },
    after: { type: 'string' },
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

const GRAMMAR_PRESENTATION_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'examples', 'conceptCheckingQuestions', 'ruleItems', 'ruleDistractors',
    'quickRuleSections', 'checkItems',
  ],
  properties: {
    examples: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: { type: 'string', minLength: 1 },
    },
    conceptCheckingQuestions: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: { type: 'string', minLength: 1 },
    },
    ruleItems: {
      type: 'array',
      minItems: 4,
      maxItems: 4,
      items: GRAMMAR_RULE_ITEM_SCHEMA,
    },
    ruleDistractors: {
      type: 'array',
      minItems: 2,
      maxItems: 2,
      items: { type: 'string', minLength: 1 },
    },
    quickRuleSections: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'text'],
        properties: {
          title: { type: 'string', minLength: 1 },
          text: { type: 'string', minLength: 1 },
        },
      },
    },
    checkItems: {
      type: 'array',
      minItems: 5,
      maxItems: 5,
      items: GRAMMAR_CHECK_ITEM_SCHEMA,
    },
  },
});

const GRAMMAR_FOCUS_INLINE_ITEM_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: ['before', 'answer', 'after', 'options', 'explanation'],
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
    explanation: { type: 'string', minLength: 1 },
  },
});

const GRAMMAR_FOCUS_RESPONSE_SCHEMA = Object.freeze({
  type: 'object',
  additionalProperties: false,
  required: [
    'teacherNotes', 'task1Items', 'task2Dialogue', 'task2Gaps', 'miniSituation',
    'writingSupport', 'supportWordBank', 'modelSentence', 'challengeItems',
  ],
  properties: {
    teacherNotes: {
      type: 'object',
      additionalProperties: false,
      required: ['transitionPhrases', 'struggleTips', 'correctionTiming', 'successCriteria'],
      properties: {
        transitionPhrases: { type: 'string', minLength: 1 },
        struggleTips: { type: 'string', minLength: 1 },
        correctionTiming: { type: 'string', minLength: 1 },
        successCriteria: { type: 'string', minLength: 1 },
      },
    },
    task1Items: {
      type: 'array',
      minItems: 8,
      maxItems: 8,
      items: GRAMMAR_FOCUS_INLINE_ITEM_SCHEMA,
    },
    task2Dialogue: { type: 'string', minLength: 1 },
    task2Gaps: {
      type: 'array',
      minItems: 9,
      maxItems: 9,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['answer', 'example'],
        properties: {
          answer: { type: 'string', minLength: 1 },
          example: { type: 'string' },
        },
      },
    },
    miniSituation: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt', 'imagePrompt'],
      properties: {
        prompt: { type: 'string', minLength: 1 },
        imagePrompt: { type: 'string', minLength: 1 },
      },
    },
    writingSupport: {
      type: 'array', minItems: 5, maxItems: 5,
      items: { type: 'string', minLength: 1 },
    },
    supportWordBank: {
      type: 'array', minItems: 8, maxItems: 8,
      items: { type: 'string', minLength: 1 },
    },
    modelSentence: { type: 'string', minLength: 1 },
    challengeItems: {
      type: 'array', minItems: 5, maxItems: 5,
      items: { type: 'string', minLength: 1 },
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

function englishTeacherNotes(value, sectionName) {
  const normalized = String(value || '').trim();
  if (/[\u0400-\u04FF]/u.test(normalized)) {
    throw new Error(`${sectionName} Teacher’s Notes должны быть полностью на английском языке.`);
  }
  return normalized;
}

function buildWarmUpContent(generated) {
  if (!generated || typeof generated !== 'object') throw new Error('Gemini вернул пустой Warm-Up.');
  if (!Array.isArray(generated.choices) || generated.choices.length !== 4) {
    throw new Error('Warm-Up должен содержать четыре пары This or That.');
  }

  const teacherNote = {
    type: 'teacherNote',
    id: 'warm-up-teacher-note',
    text: englishTeacherNotes(generated.teacherNotes, 'Warm-Up'),
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
    text: englishTeacherNotes(generated.teacherNotes, 'Lead-In'),
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

function grammarText(value, label, allowEmpty = false) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!allowEmpty && !normalized) throw new Error(`Grammar Presentation требует ${label}.`);
  return normalized;
}

function grammarSegment(value) {
  return typeof value === 'string' ? value : '';
}

function grammarArray(value, count, label) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new Error(`Grammar Presentation требует ровно ${count} ${label}.`);
  }
  return value;
}

function grammarInlineItem(item, label) {
  const before = grammarSegment(item?.before);
  const answer = grammarText(item?.answer, `${label}: ответ`);
  const after = grammarSegment(item?.after);
  if (!before.trim() && !after.trim()) {
    throw new Error(`Grammar Presentation требует непустой текст вокруг ответа в ${label}.`);
  }
  return { before, answer, after };
}

function uniqueGrammarValues(values, label) {
  const normalized = values.map((value, index) => grammarText(value, `${label} ${index + 1}`));
  if (new Set(normalized.map(value => value.toLocaleLowerCase())).size !== normalized.length) {
    throw new Error(`Grammar Presentation содержит повторяющиеся ${label}.`);
  }
  return normalized;
}

function buildGrammarPresentationContent(generated, random = Math.random) {
  if (!generated || typeof generated !== 'object') {
    throw new Error('Gemini вернул пустой Grammar Presentation.');
  }

  const examples = grammarArray(generated.examples, 5, 'примеров').map((value, index) => {
    const example = grammarText(value, `пример ${index + 1}`);
    if ((example.match(/\*\*[^*\n]+\*\*/g) || []).length !== 1) {
      throw new Error('Каждый пример Grammar Presentation должен один раз выделять целевую грамматику жирным Markdown.');
    }
    return example;
  });
  const questions = grammarArray(
    generated.conceptCheckingQuestions, 4, 'concept-checking questions',
  ).map((value, index) => grammarText(value, `concept-checking question ${index + 1}`));
  const ruleItems = grammarArray(generated.ruleItems, 4, 'частей правила')
    .map((item, index) => grammarInlineItem(item, `части правила ${index + 1}`));
  const ruleAnswers = uniqueGrammarValues(ruleItems.map(item => item.answer), 'ответы правила');
  const distractors = uniqueGrammarValues(
    grammarArray(generated.ruleDistractors, 2, 'дистракторов'), 'дистракторы правила',
  );
  const wordBankValues = [...ruleAnswers, ...distractors];
  if (new Set(wordBankValues.map(value => value.toLocaleLowerCase())).size !== wordBankValues.length) {
    throw new Error('Ответы и дистракторы Grammar Presentation не должны пересекаться.');
  }
  const wordBank = shuffleOptions(wordBankValues, random);
  if (!Array.isArray(generated.quickRuleSections)
    || generated.quickRuleSections.length < 1
    || generated.quickRuleSections.length > 3) {
    throw new Error('Grammar Presentation требует от одной до трёх секций Quick Rule.');
  }
  const quickRuleSections = generated.quickRuleSections.map((section, index) => ({
    id: `grammar-quick-rule-${index + 1}`,
    title: grammarText(section?.title, `заголовок Quick Rule ${index + 1}`),
    text: grammarText(section?.text, `текст Quick Rule ${index + 1}`),
  }));
  const checkItems = grammarArray(generated.checkItems, 5, 'проверочных предложений')
    .map((item, index) => {
      const inline = grammarInlineItem(item, `проверочного предложения ${index + 1}`);
      const options = uniqueGrammarValues(
        grammarArray(item?.options, 3, `вариантов в проверочном предложении ${index + 1}`),
        `варианты проверочного предложения ${index + 1}`,
      );
      const answer = grammarText(item?.answer, `ответ проверочного предложения ${index + 1}`);
      if (!options.includes(answer)) {
        throw new Error('Ответ Grammar Presentation должен точно совпадать с одним из вариантов.');
      }
      return {
        ...inline,
        options,
        answer,
        explanation: grammarText(item?.explanation, `объяснение ответа ${index + 1}`),
      };
    });

  const teacherNote = {
    type: 'teacherNote',
    id: 'grammar-presentation-teacher-note',
    text: GRAMMAR_PRESENTATION_TEACHER_NOTE_TEXT,
  };
  const noticeRule = {
    type: 'textPanel',
    id: 'grammar-presentation-notice-rule',
    text: [
      '{l}**Notice the Rule**{/l}',
      '{muted}{s}Look at the examples. What grammar structure is used here?{/s}{/muted}',
      examples.map((example, index) => `${index + 1}. ${example}`).join('\n'),
    ].join('\n\n'),
    backgroundColor: '#FFFFFF',
    accentColor: '#6545F5',
    showBorder: false,
  };
  const conceptChecking = {
    type: 'textPanel',
    id: 'grammar-presentation-concept-checking',
    text: [
      '{l}**Concept-checking questions:**{/l}',
      questions.map((question, index) => `${index + 1}. ${question}`).join('\n'),
    ].join('\n\n'),
    backgroundColor: '#FFFFFF',
    accentColor: '#20A85B',
    showBorder: true,
  };
  const completeRule = {
    type: 'dragWordsInText',
    id: 'grammar-presentation-complete-the-rule',
    title: 'Complete the Rule',
    instruction: 'Drag the correct words into the gaps.',
    words: wordBank,
    text: ruleItems.map(item => `${item.before}[[${item.answer}]]${item.after}`).join('\n\n'),
  };
  const quickRule = {
    type: 'markdownCard',
    id: 'grammar-presentation-quick-rule',
    title: 'Quick Rule',
    layout: 'columns',
    sections: quickRuleSections,
    icon: 'bulb',
    accentColor: '#6545F5',
    studentVisibility: 'always',
  };
  const checkRule = {
    type: 'dropdownChoice',
    id: 'grammar-presentation-check-the-rule',
    title: 'Task 2. Check the Rule',
    instruction: 'Choose the correct option from each drop-down list.',
    text: checkItems.map((item, index) => (
      `${index + 1}. ${item.before}[[grammar-check-${index + 1}]]${item.after}`
    )).join('\n'),
    choices: checkItems.map((item, index) => ({
      id: `grammar-check-${index + 1}`,
      options: item.options,
      answer: item.answer,
    })),
  };
  const answerKey = {
    type: 'markdownCard',
    id: 'grammar-presentation-answer-key',
    title: 'Answer key',
    layout: 'columns',
    sections: [{
      id: 'answers',
      title: '',
      text: [
        `- **Task 1 Rule:** ${ruleAnswers.map((answer, index) => `${index + 1} ${answer}`).join(', ')}.`,
        `- **Task 2:** ${checkItems.map((item, index) => `${index + 1} ${item.answer}`).join(', ')}.`,
      ].join('\n'),
    }, {
      id: 'short-explanations',
      title: 'Short explanations:',
      text: checkItems.map((item, index) => `${index + 1}. ${item.explanation}`).join('\n'),
    }],
    icon: 'check',
    headingSize: 'large',
    accentColor: '#20A85B',
    studentVisibility: 'teacherOnly',
  };

  normalizeTeacherNote(teacherNote);
  normalizeTextPanel(noticeRule);
  normalizeTextPanel(conceptChecking);
  normalizeDragWordsInText(completeRule);
  normalizeMarkdownCard(quickRule);
  normalizeDropdownChoice(checkRule);
  normalizeMarkdownCard(answerKey);
  return [teacherNote, noticeRule, conceptChecking, completeRule, quickRule, checkRule, answerKey];
}

function applyGrammarPresentationToSkeleton(skeleton, generated, random = Math.random) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const stage = lesson.stages.find(candidate => candidate.id === 'grammar-presentation');
  if (!stage) throw new Error('В шаблоне отсутствует стадия Grammar Presentation.');
  stage.content = buildGrammarPresentationContent(generated, random);
  return lesson;
}

function grammarFocusText(value, label, allowEmpty = false) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized && !allowEmpty) throw new Error(`Grammar Focus требует ${label}.`);
  return normalized;
}

function grammarFocusArray(value, count, label) {
  if (!Array.isArray(value) || value.length !== count) {
    throw new Error(`Grammar Focus требует ровно ${count} ${label}.`);
  }
  return value;
}

function assertGrammarFocusEnglish(value) {
  if (typeof value === 'string' && /[\u0400-\u04FF]/u.test(value)) {
    throw new Error('Grammar Focus должен быть полностью на английском языке.');
  }
  if (Array.isArray(value)) value.forEach(assertGrammarFocusEnglish);
  else if (value && typeof value === 'object') Object.values(value).forEach(assertGrammarFocusEnglish);
}

function buildGrammarFocusContent(generated, vocabularyItems, random = Math.random) {
  if (!generated || typeof generated !== 'object') {
    throw new Error('Gemini вернул пустой Grammar Focus.');
  }
  assertGrammarFocusEnglish(generated);

  const { terms } = readingVocabularyTerms(vocabularyItems);
  const termLookup = new Map(terms.map(term => [term.toLocaleLowerCase(), term]));
  const notes = generated.teacherNotes || {};
  const noteTexts = {
    transitionPhrases: grammarFocusText(notes.transitionPhrases, 'transition phrases'),
    struggleTips: grammarFocusText(notes.struggleTips, 'tips if the student struggles'),
    correctionTiming: grammarFocusText(notes.correctionTiming, 'correction timing'),
    successCriteria: grammarFocusText(notes.successCriteria, 'success criteria'),
  };

  const task1Items = grammarFocusArray(generated.task1Items, 8, 'заданий Task 1')
    .map((item, index) => {
      const before = typeof item?.before === 'string' ? item.before : '';
      const after = typeof item?.after === 'string' ? item.after : '';
      if (!before.trim() && !after.trim()) {
        throw new Error(`Grammar Focus требует текст вокруг ответа Task 1 №${index + 1}.`);
      }
      const answer = grammarFocusText(item?.answer, `ответ Task 1 №${index + 1}`);
      const options = grammarFocusArray(item?.options, 3, `варианта Task 1 №${index + 1}`)
        .map(option => grammarFocusText(option, `вариант Task 1 №${index + 1}`));
      if (new Set(options.map(option => option.toLocaleLowerCase())).size !== options.length) {
        throw new Error(`Grammar Focus содержит повторяющиеся варианты Task 1 №${index + 1}.`);
      }
      if (!options.includes(answer)) {
        throw new Error(`Ответ Grammar Focus Task 1 №${index + 1} должен точно совпадать с вариантом.`);
      }
      return {
        before,
        after,
        answer,
        options: shuffleOptions(options, random),
        explanation: grammarFocusText(item?.explanation, `объяснение Task 1 №${index + 1}`),
      };
    });

  const task2Dialogue = grammarFocusText(generated.task2Dialogue, 'диалог Task 2');
  if (task2Dialogue.includes('[[') || task2Dialogue.includes(']]')) {
    throw new Error('Grammar Focus Task 2 не должен содержать готовые gap-маркеры.');
  }
  const dialogueTurns = task2Dialogue.split(/\r?\n/).filter(line => line.trim());
  if (dialogueTurns.length < 6 || dialogueTurns.length > 8
    || dialogueTurns.some(line => !/^\*\*[^*\n]+:\*\*/.test(line.trim()))) {
    throw new Error('Grammar Focus Task 2 должен содержать 6–8 реплик с жирными speaker labels.');
  }
  const placeholders = task2Dialogue.match(/\{\{gap\}\}/g) || [];
  if (placeholders.length !== 9) {
    throw new Error('Grammar Focus Task 2 должен содержать ровно 9 маркеров {{gap}}.');
  }
  const task2Gaps = grammarFocusArray(generated.task2Gaps, 9, 'ответов Task 2')
    .map((gap, index) => ({
      id: `grammar-focus-gap-${index + 1}`,
      answer: grammarFocusText(gap?.answer, `ответ Task 2 №${index + 1}`),
      example: grammarFocusText(gap?.example, `подсказку Task 2 №${index + 1}`, true),
    }));
  let gapIndex = 0;
  const renderedDialogue = task2Dialogue.replace(/\{\{gap\}\}/g, () => {
    gapIndex += 1;
    return `[[grammar-focus-gap-${gapIndex}]]`;
  });

  const supportWordBank = grammarFocusArray(generated.supportWordBank, 8, 'слов Support Word Bank')
    .map((value, index) => {
      const requested = grammarFocusText(value, `слово Support Word Bank №${index + 1}`);
      const matched = termLookup.get(requested.toLocaleLowerCase());
      if (!matched) {
        throw new Error('Grammar Focus Support Word Bank должен использовать точные элементы Target Vocabulary.');
      }
      return matched;
    });
  if (new Set(supportWordBank.map(term => term.toLocaleLowerCase())).size !== supportWordBank.length) {
    throw new Error('Grammar Focus Support Word Bank содержит повторяющиеся элементы.');
  }

  const writingSupport = grammarFocusArray(generated.writingSupport, 5, 'sentence starters')
    .map((value, index) => grammarFocusText(value, `sentence starter №${index + 1}`));
  const challengeItems = grammarFocusArray(generated.challengeItems, 5, 'условий Challenge')
    .map((value, index) => grammarFocusText(value, `условие Challenge №${index + 1}`));
  const miniPrompt = grammarFocusText(generated.miniSituation?.prompt, 'Mini Situation prompt');
  const imagePrompt = grammarFocusText(generated.miniSituation?.imagePrompt, 'Mini Situation image prompt');
  if (!/\b(?:no|without)\s+(?:visible\s+)?text\b/i.test(imagePrompt)) {
    throw new Error('Grammar Focus image prompt должен явно требовать иллюстрацию без текста.');
  }
  const modelSentence = grammarFocusText(generated.modelSentence, 'model sentence');

  const teacherNote = {
    type: 'teacherNote',
    id: 'grammar-focus-teacher-note',
    blocks: [{
      type: 'teacherNoteBlock', id: 'grammar-focus-transition-phrases',
      title: 'Transition phrases', titleColor: '#6545F5', icon: 'chatDots',
      text: noteTexts.transitionPhrases,
    }, {
      type: 'teacherNoteBlock', id: 'grammar-focus-struggle-tips',
      title: 'Tips if the student struggles', titleColor: '#2F80ED', icon: 'chat',
      text: noteTexts.struggleTips,
    }, {
      type: 'teacherNoteBlock', id: 'grammar-focus-correction-timing',
      title: 'Correct now / later', titleColor: '#E0812D', icon: 'chat',
      text: noteTexts.correctionTiming,
    }, {
      type: 'teacherNoteBlock', id: 'grammar-focus-free-practice-success',
      title: 'Free Practice success', titleColor: '#20A85B', icon: 'chatDots',
      text: noteTexts.successCriteria,
    }],
  };
  const task1 = {
    type: 'dropdownChoice', id: 'grammar-focus-choose-the-correct-options',
    title: '**Task 1. Choose the correct options.**',
    instruction: 'Read each sentence and choose the correct grammar option.',
    text: task1Items.map((item, index) => (
      `**${index + 1}.** ${item.before}[[grammar-focus-choice-${index + 1}]]${item.after}`
    )).join('\n'),
    accentColor: '#6545F5',
    choices: task1Items.map((item, index) => ({
      id: `grammar-focus-choice-${index + 1}`, options: item.options, answer: item.answer,
    })),
  };
  const task1AnswerKey = {
    type: 'markdownCard', id: 'grammar-focus-answer-key', title: 'Answer Key & Explanations',
    layout: 'columns',
    sections: [{
      id: 'answers', title: 'Answers',
      text: task1Items.map((item, index) => `**${index + 1}.** ${item.answer}`).join('\n\n'),
    }, {
      id: 'short-explanations', title: 'Short explanations',
      text: task1Items.map((item, index) => `${index + 1}. ${item.explanation}`).join('\n'),
    }],
    icon: 'check', headingSize: 'large', accentColor: '#20A85B', studentVisibility: 'teacherOnly',
  };
  const task2 = {
    type: 'gapFill', id: 'grammar-focus-complete-the-gaps',
    title: '**Task 2. Complete the gaps with the correct form of the verbs.**',
    instruction: 'Read the dialogue and type the correct form of the verbs.',
    text: renderedDialogue, accentColor: '#6545F5',
    gaps: task2Gaps.map(gap => (gap.example
      ? { id: gap.id, answer: gap.answer, example: gap.example }
      : { id: gap.id, answer: gap.answer })),
  };
  const task2AnswerKey = {
    type: 'markdownCard', id: 'grammar-focus-complete-the-gaps-answer-key', title: 'Answer key',
    layout: 'columns', sections: [{
      id: 'answers-left', title: '',
      text: task2Gaps.slice(0, 5).map((gap, index) => `**${index + 1}.** ${gap.answer}`).join('\n\n'),
    }, {
      id: 'answers-right', title: '',
      text: task2Gaps.slice(5).map((gap, index) => `**${index + 6}.** ${gap.answer}`).join('\n\n'),
    }],
    icon: 'check', headingSize: 'large', accentColor: '#20A85B', studentVisibility: 'teacherOnly',
  };
  const miniSituation = {
    type: 'miniSituation', id: 'grammar-focus-mini-situation',
    title: 'Task 3. Free Practice — Mini Situation',
    instruction: 'Read the situation and write 3–5 sentences. Your answer will be checked by the teacher.',
    sentenceCount: 5,
    situation: {
      type: 'illustratedTextPanel', id: 'grammar-focus-mini-situation-prompt',
      text: miniPrompt, backgroundColor: '#F4F0FF', leadingPicture: { imagePrompt },
    },
  };
  const supportRow = {
    type: 'cardRow', id: 'grammar-focus-practice-support-row', items: [{
      type: 'markdownCard', id: 'grammar-focus-writing-support', title: 'Writing Support',
      icon: 'pencil', accentColor: '#20A85B', studentVisibility: 'always',
      text: writingSupport.map((item, index) => `${index + 1}. ${item}`).join('\n'),
    }, {
      type: 'markdownCard', id: 'grammar-focus-support', title: 'Support',
      icon: 'lifeRing', accentColor: '#20A85B', studentVisibility: 'always',
      text: [
        `- **Word bank:** ${supportWordBank.join(', ')}`,
        `- **Model sentence:** “${modelSentence}”`,
        '- **Minimum task:** Write 3 sentences if you need extra support.',
      ].join('\n'),
    }, {
      type: 'markdownCard', id: 'grammar-focus-challenge', title: 'Challenge',
      icon: 'trophy', accentColor: '#6545F5', studentVisibility: 'always',
      text: challengeItems.map(item => `- ${item}`).join('\n'),
    }],
  };

  normalizeTeacherNote(teacherNote);
  normalizeDropdownChoice(task1);
  normalizeMarkdownCard(task1AnswerKey);
  normalizeGapFill(task2);
  normalizeMarkdownCard(task2AnswerKey);
  normalizeMiniSituation(miniSituation);
  normalizeCardRow(supportRow);
  return [teacherNote, task1, task1AnswerKey, task2, task2AnswerKey, miniSituation, supportRow];
}

function applyGrammarFocusToSkeleton(skeleton, generated, vocabularyItems, random = Math.random) {
  const lesson = JSON.parse(JSON.stringify(skeleton));
  const stage = lesson.stages.find(candidate => candidate.id === 'grammar-focus');
  if (!stage) throw new Error('В шаблоне отсутствует стадия Grammar Focus.');
  stage.content = buildGrammarFocusContent(generated, vocabularyItems, random);
  return lesson;
}

function warmUpMessages(topic) {
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable content for a five-minute Warm-Up in the existing This or That template.',
      'Write every part of teacherNotes in English, including instructions and direct address to the teacher. Do not use Russian or any other language in teacherNotes.',
      'Write teacherNotes as exactly three Markdown bullet points followed by a separate Say paragraph, in this order:',
      '1. In English, briefly explain the purpose of the lead-in question, then provide the exact question for the learner in natural A2 English; it must summarize the main Warm-Up topic and guide the learner toward the task.',
      '2. In English, explain whether the learner should answer with one word or short phrases.',
      '3. In English, state what kind of answer the teacher should accept.',
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
      'Write every part of teacherNotes in English, including instructions and direct address to the teacher. Do not use Russian or any other language in teacherNotes.',
      'Write teacherNotes as one Markdown string, following this exact content order:',
      '1. Start with this exact instruction: Read the text together with the learner and invite them to answer the questions.',
      '2. List the one or two modern English phrases, idioms, or slang expressions from the message that the teacher should explain, and briefly explain their meaning in English.',
      '3. Tell the teacher in English that if the learner gives a one-word or very short answer to question 3, they must encourage the learner to develop their point of view; include a ready-to-say natural English follow-up question such as “Why do you think so?”.',
      '4. Tell the teacher in English to ask after all three answers whether the learner can guess the lesson topic; include a ready-to-say natural A2 English question.',
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
      'All generated copy, including teacherNotes, student-facing copy, and image prompts, must be in English.',
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

function grammarPresentationMessages(topic, grammarTopic) {
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate only the variable student-facing content for a five-minute Grammar Presentation in the existing Guided Discovery template.',
      'The supplied Grammar topic is authoritative: explain and practise exactly that grammar without replacing it with a different structure.',
      'Use the Lesson topic as the natural context for examples and check sentences while keeping every grammar example accurate.',
      'All generated copy must be in natural A2 English.',
      'Do not generate Teacher’s Notes, component titles, instructions, IDs, colors, visibility settings, or Answer Key formatting; the application adds them statically.',
      'Create exactly five short example sentences. In every example, wrap the target grammar form in exactly one pair of **bold** Markdown markers.',
      'Create exactly four concept-checking questions. Keep them concise and guide the learner to discover meaning, use, and form from the examples.',
      'Create exactly four ruleItems. Each item must form a clear rule statement when before + answer + after are joined.',
      'The four ruleItem answers must be distinct. Provide exactly two plausible but incorrect ruleDistractors, distinct from each other and from every answer.',
      'Do not use Markdown, HTML, or [[gap]] markers in ruleItems, ruleDistractors, checkItems, options, answers, or explanations.',
      'Create one to three Quick Rule sections. Use concise Markdown bullet points to cover meaning, affirmative form, and relevant negative/question forms, with an A2 example where useful.',
      'Create exactly five checkItems. Each item must form one natural sentence when before + answer + after are joined.',
      'Give every checkItem exactly three distinct options, copy answer exactly from its options, and add one short explanation for the teacher.',
      'Use varied, plausible distractors and vary the correct-answer position across the five option lists.',
      'Return JSON matching the supplied schema and nothing else.',
    ].join('\n'),
  }, {
    role: 'user',
    content: [
      `Lesson topic: ${String(topic || '').trim()}`,
      `Grammar topic: ${String(grammarTopic || '').trim()}`,
    ].join('\n'),
  }];
}

function grammarFocusMessages(topic, grammarTopic, vocabularyItems) {
  const { terms } = readingVocabularyTerms(vocabularyItems);
  return [{
    role: 'system',
    content: [
      'You design one-to-one English lessons for A2 learners.',
      'Generate all variable content for an eight-minute Grammar Focus section in the existing template.',
      'The supplied Grammar topic is authoritative. Every controlled and free-practice task must accurately practise exactly that grammar.',
      'Use the Lesson topic as one coherent natural context and reuse some supplied Target Vocabulary where it fits.',
      'All generated copy, including Teacher’s Notes and the image prompt, must be in English suitable for A2 learners.',
      'Do not generate component titles, instructions, IDs, colors, icons, visibility settings, answer-key formatting, or sentence counts; the application adds them.',
      'Teacher’s Notes must provide four concise Markdown texts: transition phrases, grammar-specific struggle tips, correction timing, and measurable free-practice success criteria.',
      'Create exactly eight task1Items. Each must form one natural sentence from before + answer + after, have exactly three distinct plain-text options, copy answer exactly from its options, and include a short explanation.',
      'Vary the position of correct options and include affirmative, negative, and question forms whenever the grammar topic supports them.',
      'Create one connected dialogue of six to eight turns for Task 2. Write speaker labels as **Name:** and place exactly nine literal {{gap}} markers in reading order.',
      'Create exactly nine task2Gaps in the same order as the markers. Each answer must complete its marker accurately. Set example to a useful base-form cue or an empty string when no cue is appropriate.',
      'Except for bold speaker labels, do not use Markdown or HTML in Task 1 or Task 2 content. Never generate [[gap IDs]].',
      'Create a topic-related miniSituation prompt that elicits three to five uses of the target grammar and an English child-friendly educational imagePrompt that explicitly requires no text.',
      'Create exactly five short writingSupport sentence starters that help the learner use the target grammar.',
      'Select exactly eight distinct entries from Target Vocabulary for supportWordBank, copying each entry exactly.',
      'Create one natural modelSentence using the target grammar and lesson context.',
      'Create exactly five concise challengeItems, including a negative, a question, a reason, target vocabulary, and linked ideas when compatible with the grammar.',
      'Return JSON matching the supplied schema and nothing else.',
    ].join('\n'),
  }, {
    role: 'user',
    content: [
      `Lesson topic: ${String(topic || '').trim()}`,
      `Grammar topic: ${String(grammarTopic || '').trim()}`,
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

async function generateGrammarPresentation({
  topic,
  grammarTopic,
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
    messages: grammarPresentationMessages(topic, grammarTopic),
    schemaName: 'easyclass_grammar_presentation',
    schema: GRAMMAR_PRESENTATION_RESPONSE_SCHEMA,
    validate: buildGrammarPresentationContent,
    sectionName: 'Grammar Presentation',
  });
}

async function generateGrammarFocus({
  topic,
  grammarTopic,
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
    messages: grammarFocusMessages(topic, grammarTopic, vocabularyItems),
    schemaName: 'easyclass_grammar_focus',
    schema: GRAMMAR_FOCUS_RESPONSE_SCHEMA,
    validate: generated => buildGrammarFocusContent(generated, vocabularyItems),
    sectionName: 'Grammar Focus',
  });
}

module.exports = {
  GENERATION_TIMEOUT_MS,
  GRAMMAR_FOCUS_RESPONSE_SCHEMA,
  GRAMMAR_PRESENTATION_RESPONSE_SCHEMA,
  LEAD_IN_RESPONSE_SCHEMA,
  LISTENING_RESPONSE_SCHEMA,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
  READING_RESPONSE_SCHEMA,
  TARGET_VOCABULARY_RESPONSE_SCHEMA,
  WARM_UP_RESPONSE_SCHEMA,
  applyGrammarFocusToSkeleton,
  applyGrammarPresentationToSkeleton,
  applyLeadInToSkeleton,
  applyListeningToSkeleton,
  applyReadingToSkeleton,
  applyTargetVocabularyToSkeleton,
  applyWarmUpToSkeleton,
  buildGrammarFocusContent,
  buildLeadInContent,
  buildGrammarPresentationContent,
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
  normalizeUsage,
  parseOpenRouterStream,
  readingMessages,
  shuffleOptions,
  targetVocabularyMessages,
  warmUpMessages,
};
