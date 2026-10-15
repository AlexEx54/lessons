'use strict';

const { normalizeTextReading } = require('../../assets/components/text-reading.js');
const { blockName, fail, integer, listSchema, requiredText, vocabularyTerm } = require('./helpers.js');

// A reading text with a small header picture and a wider picture inside, built around
// a few lesson words.

const WITHOUT_TEXT = /\b(?:no|without)\s+(?:readable\s+|visible\s+)?text\b/i;

module.exports = {
  type: 'readingText',
  label: 'Текст для чтения',
  params: {
    minWords: integer(60, 400, 180),
    maxWords: integer(80, 500, 230),
    minTerms: integer(1, 10, 5),
    maxTerms: integer(1, 10, 6),
  },
  fields: ['title', 'subtitle', 'text', 'headerImagePrompt', 'textImagePrompt', 'usedVocabularyTerms'],
  inputs: { vocabulary: { type: 'vocabulary', required: true } },
  schema: ({ params }) => ({
    title: { type: 'string', minLength: 1 },
    subtitle: { type: 'string', minLength: 1 },
    text: { type: 'string', minLength: 1 },
    headerImagePrompt: { type: 'string', minLength: 1 },
    textImagePrompt: { type: 'string', minLength: 1 },
    usedVocabularyTerms: { ...listSchema(params.minTerms), maxItems: params.maxTerms },
  }),
  rules: ({ params, links, f }) => [
    `Write a coherent reading text of ${params.minWords} to ${params.maxWords} words, split into readable paragraphs.`,
    `Select ${params.minTerms} to ${params.maxTerms} distinct entries from the supplied ${links.vocabulary.label}. Copy each selected entry exactly into ${f.usedVocabularyTerms} and include that exact text naturally in the reading text.`,
    `${f.headerImagePrompt} must describe a small compact avatar or thematic icon. ${f.textImagePrompt} must describe a wider scene related to the text.`,
    'Both image prompts must be in English and describe modern educational visuals suitable for teenagers, explicitly requiring no text or readable text and avoiding childish or preschool aesthetics.',
  ],
  defaultInstructions: '',
  build(data, context) {
    const { id, params, links } = context;
    const text = requiredText(data.text, 'текст для чтения', context);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < params.minWords || wordCount > params.maxWords) {
      fail(`${blockName(context)}: в тексте должно быть от ${params.minWords} до ${params.maxWords} слов, получено ${wordCount}.`);
    }
    const requested = Array.isArray(data.usedVocabularyTerms) ? data.usedVocabularyTerms : [];
    if (requested.length < params.minTerms || requested.length > params.maxTerms) {
      fail(`${blockName(context)}: нужно от ${params.minTerms} до ${params.maxTerms} слов из словаря.`);
    }
    const terms = requested.map(term => vocabularyTerm(term, links.vocabulary.value, 'слово из словаря', context));
    if (new Set(terms.map(term => term.toLocaleLowerCase())).size !== terms.length) {
      fail(`${blockName(context)}: слова из словаря повторяются.`);
    }
    const article = text.replace(/\s+/g, ' ').toLocaleLowerCase();
    const missing = terms.filter(term => !article.includes(term.replace(/\s+/g, ' ').toLocaleLowerCase().replace(/^to\s+/u, '')));
    if (missing.length > 0) console.warn(`${blockName(context)}: в тексте нет слов из словаря: ${missing.join(', ')}.`);
    const headerImagePrompt = requiredText(data.headerImagePrompt, 'картинка заголовка', context);
    const textImagePrompt = requiredText(data.textImagePrompt, 'картинка к тексту', context);
    if (![headerImagePrompt, textImagePrompt].every(prompt => WITHOUT_TEXT.test(prompt))) {
      fail(`${blockName(context)}: картинки должны явно требовать иллюстрацию без текста.`);
    }
    const reading = {
      type: 'textReading',
      id,
      title: requiredText(data.title, 'заголовок', context),
      subtitle: requiredText(data.subtitle, 'подзаголовок', context),
      headerImage: { imagePrompt: headerImagePrompt },
      text,
      textImage: { imagePrompt: textImagePrompt },
    };
    // Validation only: the stored text keeps its authored shape.
    normalizeTextReading(reading);
    return reading;
  },
  example({ params, links }) {
    const terms = links.vocabulary.value.slice(0, params.minTerms).map(item => item.term);
    const sentence = `Today I want to tell you about my week. I learned about ${terms.join(', ')} and it was fun.`;
    const words = sentence.split(/\s+/).length;
    return {
      title: 'My Super Week',
      subtitle: 'A short blog post',
      text: Array.from({ length: Math.ceil(params.minWords / words) }, () => sentence).join(' '),
      headerImagePrompt: 'Small round avatar of a smiling teenager, no text.',
      textImagePrompt: 'Wide scene of a busy school yard, no text.',
      usedVocabularyTerms: terms,
    };
  },
};
