'use strict';

// Replays the model answers saved in a generation log. The log has one
// "=== <step name> ===" header per model call, in plan order; recovery stops at the
// first answer that is cut off or no longer applies, and keeps the log up to there.
function recoverLessonGeneration(output, skeleton, plan) {
  const source = typeof output === 'string' ? output : '';
  const modelSteps = plan.steps.filter(step => step.needsModel);
  const recoveredSections = {};
  let state = plan.start(skeleton);
  let validOutput = '';
  let offset = 0;
  let modelIndex = 0;

  try {
    for (const step of plan.steps) {
      if (!step.needsModel) {
        state = plan.apply(step.key, state, {});
        continue;
      }
      const header = `${modelIndex === 0 ? '' : '\n\n'}=== ${step.name} ===\n`;
      if (!source.startsWith(header, offset)) break;

      const contentStart = offset + header.length;
      const nextStep = modelSteps[modelIndex + 1];
      const nextOffset = nextStep ? source.indexOf(`\n\n=== ${nextStep.name} ===\n`, contentStart) : source.length;
      const contentEnd = nextOffset === -1 ? source.length : nextOffset;
      const generated = JSON.parse(source.slice(contentStart, contentEnd).trim());
      state = plan.apply(step.key, state, generated);
      recoveredSections[step.key] = generated;
      offset = contentEnd;
      validOutput = source.slice(0, contentEnd);
      modelIndex += 1;
    }
  } catch (_error) {
    // The answer is cut off or no longer valid: generation continues from this step.
  }

  return {
    recoveredSections,
    validOutput,
    complete: Object.keys(recoveredSections).length === modelSteps.length,
  };
}

module.exports = { recoverLessonGeneration };
