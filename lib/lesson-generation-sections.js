'use strict';

const {
  applyGrammarFocusToSkeleton,
  applyGrammarPresentationToSkeleton,
  applyGuidedSpeakingToSkeleton,
  applyLeadInToSkeleton,
  applyLessonMetadataToSkeleton,
  applyListeningToSkeleton,
  applyReadingToSkeleton,
  applyTargetVocabularyToSkeleton,
  applyTemplateTwoGrammarFocusToSkeleton,
  applyTemplateTwoGrammarPresentationToSkeleton,
  applyTemplateTwoLeadInToSkeleton,
  applyTemplateTwoTargetVocabularyToSkeleton,
  applyTemplateTwoWarmUpToSkeleton,
  applyWarmUpToSkeleton,
  applyWrapUpToSkeleton,
  generateGrammarFocus,
  generateGrammarPresentation,
  generateGuidedSpeaking,
  generateLeadIn,
  generateLessonMetadata,
  generateListening,
  generateReading,
  generateTargetVocabulary,
  generateTemplateTwoGrammarFocus,
  generateTemplateTwoGrammarPresentation,
  generateTemplateTwoLeadIn,
  generateTemplateTwoTargetVocabulary,
  generateTemplateTwoWarmUp,
  generateWarmUp,
  generateWrapUp,
} = require('./ai-lesson-generator.js');

// Some apply functions take an optional third argument (e.g. `random`), so never pass them extra ones.
const withSection = apply => (lesson, generated) => apply(lesson, generated);

const METADATA_SECTION = { key: 'lessonMetadata', generate: generateLessonMetadata, name: 'Lesson Metadata', apply: withSection(applyLessonMetadataToSkeleton) };

// Shared generation order and dependencies. Both generation and recovery use `apply`.
// `options` receives the lesson topics and previously completed section JSON.
const vocabularyOptions = (context, sections) => ({
  grammarTopic: context.grammarTopic,
  vocabularyItems: sections.targetVocabulary.vocabularyItems,
});
const TEMPLATE_SECTIONS = Object.freeze({
  'template-1': Object.freeze([
    METADATA_SECTION,
    { key: 'warmUp', generate: generateWarmUp, name: 'Warm-Up', options: context => ({ topic: context.warmUpTopic }), apply: withSection(applyWarmUpToSkeleton) },
    { key: 'leadIn', generate: generateLeadIn, name: 'Lead-In', apply: withSection(applyLeadInToSkeleton) },
    { key: 'targetVocabulary', generate: generateTargetVocabulary, name: 'Target Vocabulary', apply: withSection(applyTargetVocabularyToSkeleton) },
    {
      key: 'reading',
      generate: generateReading,
      options: vocabularyOptions,
      name: 'Reading',
      apply: (lesson, generated, recovered) => applyReadingToSkeleton(
        lesson, generated, recovered.targetVocabulary.vocabularyItems,
      ),
    },
    { key: 'listening', options: vocabularyOptions, generate: generateListening, name: 'Listening', apply: withSection(applyListeningToSkeleton) },
    { key: 'grammarPresentation', options: context => ({ grammarTopic: context.grammarTopic }), generate: generateGrammarPresentation, name: 'Grammar Presentation', apply: withSection(applyGrammarPresentationToSkeleton) },
    {
      key: 'grammarFocus',
      generate: generateGrammarFocus,
      options: vocabularyOptions,
      name: 'Grammar Focus',
      apply: (lesson, generated, recovered) => applyGrammarFocusToSkeleton(
        lesson, generated, recovered.targetVocabulary.vocabularyItems,
      ),
    },
    {
      key: 'guidedSpeaking',
      generate: generateGuidedSpeaking,
      options: (context, sections) => ({ vocabularyItems: sections.targetVocabulary.vocabularyItems }),
      name: 'Guided Speaking',
      apply: (lesson, generated, recovered) => applyGuidedSpeakingToSkeleton(
        lesson, generated, recovered.targetVocabulary.vocabularyItems,
      ),
    },
    { key: 'wrapUp', options: vocabularyOptions, generate: generateWrapUp, name: 'Wrap-Up', apply: withSection(applyWrapUpToSkeleton) },
  ]),
  'template-2': Object.freeze([
    METADATA_SECTION,
    { key: 'warmUp', generate: generateTemplateTwoWarmUp, name: 'Warm-Up', options: context => ({ topic: context.warmUpTopic }), apply: withSection(applyTemplateTwoWarmUpToSkeleton) },
    { key: 'leadIn', generate: generateTemplateTwoLeadIn, name: 'Lead-In', options: context => ({ grammarTopic: context.grammarTopic }), apply: withSection(applyTemplateTwoLeadInToSkeleton) },
    {
      key: 'targetVocabulary',
      generate: generateTemplateTwoTargetVocabulary,
      name: 'Target Vocabulary',
      options: (context, sections) => ({
        grammarTopic: context.grammarTopic,
        guessStatements: sections.leadIn.guessStatements,
      }),
      apply: (lesson, generated, recovered) => applyTemplateTwoTargetVocabularyToSkeleton(
        lesson, generated, recovered.leadIn.guessStatements,
      ),
    },
    { key: 'grammarPresentation', options: vocabularyOptions, generate: generateTemplateTwoGrammarPresentation, name: 'Grammar Presentation', apply: withSection(applyTemplateTwoGrammarPresentationToSkeleton) },
    {
      key: 'grammarFocus',
      generate: generateTemplateTwoGrammarFocus,
      options: vocabularyOptions,
      name: 'Grammar Focus',
      apply: (lesson, generated, recovered) => applyTemplateTwoGrammarFocusToSkeleton(
        lesson, generated, recovered.targetVocabulary.vocabularyItems,
      ),
    },
  ]),
});

function getLessonGenerationSections(template = 'template-1') {
  if (!Object.hasOwn(TEMPLATE_SECTIONS, template)) {
    throw new Error(`Неизвестный шаблон урока: ${template}.`);
  }
  return TEMPLATE_SECTIONS[template];
}

module.exports = { getLessonGenerationSections };
