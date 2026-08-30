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
  applyWarmUpToSkeleton,
  applyWrapUpToSkeleton,
} = require('./ai-lesson-generator.js');

const SECTIONS = Object.freeze([
  { key: 'lessonMetadata', name: 'Lesson Metadata' },
  { key: 'warmUp', name: 'Warm-Up' },
  { key: 'leadIn', name: 'Lead-In' },
  { key: 'targetVocabulary', name: 'Target Vocabulary' },
  { key: 'reading', name: 'Reading' },
  { key: 'listening', name: 'Listening' },
  { key: 'grammarPresentation', name: 'Grammar Presentation' },
  { key: 'grammarFocus', name: 'Grammar Focus' },
  { key: 'guidedSpeaking', name: 'Guided Speaking' },
  { key: 'wrapUp', name: 'Wrap-Up' },
]);

function applyRecoveredSection(lesson, key, generated, recovered) {
  switch (key) {
    case 'lessonMetadata': return applyLessonMetadataToSkeleton(lesson, generated);
    case 'warmUp': return applyWarmUpToSkeleton(lesson, generated);
    case 'leadIn': return applyLeadInToSkeleton(lesson, generated);
    case 'targetVocabulary': return applyTargetVocabularyToSkeleton(lesson, generated);
    case 'reading':
      return applyReadingToSkeleton(
        lesson,
        generated,
        recovered.targetVocabulary.vocabularyItems,
      );
    case 'listening': return applyListeningToSkeleton(lesson, generated);
    case 'grammarPresentation': return applyGrammarPresentationToSkeleton(lesson, generated);
    case 'grammarFocus':
      return applyGrammarFocusToSkeleton(
        lesson,
        generated,
        recovered.targetVocabulary.vocabularyItems,
      );
    case 'guidedSpeaking':
      return applyGuidedSpeakingToSkeleton(
        lesson,
        generated,
        recovered.targetVocabulary.vocabularyItems,
      );
    case 'wrapUp': return applyWrapUpToSkeleton(lesson, generated);
    default: throw new Error(`Неизвестная секция генерации: ${key}.`);
  }
}

function recoverLessonGeneration(output, skeleton) {
  const source = typeof output === 'string' ? output : '';
  const recoveredSections = {};
  let lesson = skeleton;
  let validOutput = '';
  let offset = 0;

  for (let index = 0; index < SECTIONS.length; index += 1) {
    const section = SECTIONS[index];
    const header = `${index === 0 ? '' : '\n\n'}=== ${section.name} ===\n`;
    if (!source.startsWith(header, offset)) break;

    const contentStart = offset + header.length;
    const nextSection = SECTIONS[index + 1];
    const nextHeader = nextSection ? `\n\n=== ${nextSection.name} ===\n` : '';
    const nextOffset = nextHeader ? source.indexOf(nextHeader, contentStart) : source.length;
    const contentEnd = nextOffset === -1 ? source.length : nextOffset;
    const rawJson = source.slice(contentStart, contentEnd).trim();

    try {
      const generated = JSON.parse(rawJson);
      lesson = applyRecoveredSection(lesson, section.key, generated, recoveredSections);
      recoveredSections[section.key] = generated;
      offset = contentEnd;
      validOutput = source.slice(0, contentEnd);
    } catch (_error) {
      break;
    }
  }

  return { recoveredSections, validOutput };
}

module.exports = { recoverLessonGeneration };
