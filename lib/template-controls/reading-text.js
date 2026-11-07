'use strict';

const { normalizeTextReading } = require('../../assets/components/text-reading.js');
const { blockName, fail, integer, requiredText } = require('./helpers.js');

// A reading text with a small header picture and a wider picture inside. Which lesson
// words it uses is in the instructions. Later stages can read the text itself through
// the `text` output.

const WITHOUT_TEXT = /\b(?:no|without)\s+(?:readable\s+|visible\s+)?text\b/i;

module.exports = {
  type: 'readingText',
  label: 'Текст для чтения',
  group: 'comprehension',
  description: 'Текст для чтения. Какие слова урока в нём нужны, говорят указания.',
  params: {
    minWords: integer('Слов в тексте: от', 60, 400, 180, { atMost: 'maxWords' }),
    maxWords: integer('Слов в тексте: до', 80, 500, 230),
  },
  fields: ['title', 'subtitle', 'text', 'headerImagePrompt', 'textImagePrompt'],
  outputs: { text: 'text' },
  schema: () => ({
    title: { type: 'string', minLength: 1 },
    subtitle: { type: 'string', minLength: 1 },
    text: { type: 'string', minLength: 1 },
    headerImagePrompt: { type: 'string', minLength: 1 },
    textImagePrompt: { type: 'string', minLength: 1 },
  }),
  rules: ({ params, f }) => [
    `Write a coherent reading text of ${params.minWords} to ${params.maxWords} words, split into readable paragraphs.`,
    `${f.headerImagePrompt} must describe a small compact avatar or thematic icon. ${f.textImagePrompt} must describe a wider scene related to the text.`,
    'Both image prompts must be in English and describe modern educational visuals suitable for teenagers, explicitly requiring no text or readable text and avoiding childish or preschool aesthetics.',
  ],
  defaultInstructions: '',
  build(data, context) {
    const { id, params } = context;
    const text = requiredText(data.text, 'текст для чтения', context);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    if (wordCount < params.minWords || wordCount > params.maxWords) {
      fail(`${blockName(context)}: в тексте должно быть от ${params.minWords} до ${params.maxWords} слов, получено ${wordCount}.`);
    }
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
  exports: (component, { data }) => ({ text: data.text }),
  example({ params }) {
    const sentence = 'Today I want to tell you about my week. I learned a lot of new things and it was fun.';
    const words = sentence.split(/\s+/).length;
    return {
      title: 'My Super Week',
      subtitle: 'A short blog post',
      text: Array.from({ length: Math.ceil(params.minWords / words) }, () => sentence).join(' '),
      headerImagePrompt: 'Small round avatar of a smiling teenager, no text.',
      textImagePrompt: 'Wide scene of a busy school yard, no text.',
    };
  },
};
