'use strict';

const { getLessonGenerationSections } = require('./lesson-generation-sections.js');

function recoverLessonGeneration(output, skeleton, template = 'template-1') {
  const sections = getLessonGenerationSections(template);
  const source = typeof output === 'string' ? output : '';
  const recoveredSections = {};
  let lesson = skeleton;
  let validOutput = '';
  let offset = 0;

  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const header = `${index === 0 ? '' : '\n\n'}=== ${section.name} ===\n`;
    if (!source.startsWith(header, offset)) break;

    const contentStart = offset + header.length;
    const nextSection = sections[index + 1];
    const nextHeader = nextSection ? `\n\n=== ${nextSection.name} ===\n` : '';
    const nextOffset = nextHeader ? source.indexOf(nextHeader, contentStart) : source.length;
    const contentEnd = nextOffset === -1 ? source.length : nextOffset;
    const rawJson = source.slice(contentStart, contentEnd).trim();

    try {
      const generated = JSON.parse(rawJson);
      lesson = section.apply(lesson, generated, recoveredSections);
      recoveredSections[section.key] = generated;
      offset = contentEnd;
      validOutput = source.slice(0, contentEnd);
    } catch (_error) {
      break;
    }
  }

  return {
    recoveredSections,
    validOutput,
    complete: Object.keys(recoveredSections).length === sections.length,
  };
}

module.exports = { recoverLessonGeneration };
