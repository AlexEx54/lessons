'use strict';

const ALLOWED_CONTROLS = new Set([
  'wordAssociationStrikeList',
  'opinionSort',
  'discussionQuestions',
  'definitionMatch',
  'gapFillBank',
  'phrasalVerbPractice',
  'taskList',
  'readingText',
  'readingQuizRadio',
  'grammarRuleCards',
  'completeRule',
  'chooseCorrect',
  'controlledInputPractice',
  'dropdownChoicePractice',
  'speakingQuestions',
  'translationSelfCheck',
  'resourceNotes',
]);

const REQUIRED_SECTIONS = [
  'warmup',
  'lead-in',
  'target-vocabulary',
  'reading',
  'grammar',
  'grammar-practice',
  'speaking',
  'resources',
];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isKebabCase(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);
}

function pushError(errors, field, message) {
  errors.push({ field, message, severity: 'error' });
}

function pushWarning(warnings, field, message) {
  warnings.push({ field, message, severity: 'warning' });
}

function requireString(errors, field, value, label) {
  if (!isNonEmptyString(value)) {
    pushError(errors, field, `${label} must be a non-empty string.`);
  }
}

function requireKebab(errors, field, value, label) {
  if (!isKebabCase(value)) {
    pushError(errors, field, `${label} must be a stable lowercase kebab-case id.`);
  }
}

function checkControlBasics(errors, control, label) {
  if (!control || typeof control !== 'object') {
    pushError(errors, 'control', `${label} is not an object.`);
    return false;
  }
  const type = control.type;
  if (!ALLOWED_CONTROLS.has(type)) {
    pushError(errors, 'control.type', `${label} has unsupported control type "${type}".`);
  }
  if (!isKebabCase(control.id)) {
    pushError(errors, 'control.id', `${label} must have a lowercase kebab-case id.`);
  }
  return true;
}

function ensureControlType(errors, controls, expectedType, sectionId, minCount = 1) {
  const matches = controls.filter((c) => c && c.type === expectedType);
  if (matches.length < minCount) {
    pushError(
      errors,
      `section[${sectionId}].controls`,
      `Section "${sectionId}" must include at least ${minCount} control(s) of type "${expectedType}". Found ${matches.length}.`
    );
  }
  return matches;
}

function validateLesson(data) {
  const errors = [];
  const warnings = [];

  if (!data || typeof data !== 'object') {
    pushError(errors, 'root', 'Lesson payload must be a JSON object.');
    return { errors, warnings };
  }

  if (data.schemaVersion !== 'lesson-spec-v1') {
    pushError(errors, 'schemaVersion', `Expected "lesson-spec-v1", got "${data.schemaVersion}".`);
  }

  const meta = data.meta;
  if (!meta || typeof meta !== 'object') {
    pushError(errors, 'meta', 'meta is required.');
  } else {
    requireString(errors, 'meta.topic', meta.topic, 'meta.topic');
    requireString(errors, 'meta.level', meta.level, 'meta.level');
  }

  const hero = data.hero;
  if (!hero || typeof hero !== 'object') {
    pushError(errors, 'hero', 'hero is required.');
  } else {
    requireString(errors, 'hero.title', hero.title, 'hero.title');
    requireString(errors, 'hero.subtitle', hero.subtitle, 'hero.subtitle');
    if (!Array.isArray(hero.pills) || hero.pills.length === 0) {
      pushError(errors, 'hero.pills', 'hero.pills must be a non-empty array.');
    }
  }

  const sections = data.sections;
  if (!Array.isArray(sections)) {
    pushError(errors, 'sections', 'sections must be an array.');
    return { errors, warnings };
  }

  if (sections.length !== REQUIRED_SECTIONS.length) {
    pushError(
      errors,
      'sections',
      `Expected exactly ${REQUIRED_SECTIONS.length} sections, got ${sections.length}.`
    );
  }

  const sectionById = new Map();
  sections.forEach((section, index) => {
    const expected = REQUIRED_SECTIONS[index];
    const field = `sections[${index}]`;
    if (!section || typeof section !== 'object') {
      pushError(errors, field, 'Section must be an object.');
      return;
    }
    if (section.id !== expected) {
      pushError(
        errors,
        `${field}.id`,
        `Section at position ${index} must have id "${expected}", got "${section.id}".`
      );
    }
    if (sectionById.has(section.id)) {
      pushError(errors, `${field}.id`, `Duplicate section id "${section.id}".`);
    }
    sectionById.set(section.id, section);

    if (!isNonEmptyString(section.title)) {
      pushError(errors, `${field}.title`, 'Section title is required.');
    }

    if (!Array.isArray(section.controls)) {
      pushError(errors, `${field}.controls`, 'Section must have a controls array.');
      return;
    }

    section.controls.forEach((control, ci) => {
      const cLabel = `section "${section.id}" control #${ci}`;
      checkControlBasics(errors, control, cLabel);
      if (!control) return;
      switch (control.type) {
        case 'wordAssociationStrikeList':
          if (!Array.isArray(control.items) || control.items.length !== 9) {
            pushError(
              errors,
              `${field}.controls[${ci}].items`,
              `wordAssociationStrikeList must have exactly 9 items. Got ${Array.isArray(control.items) ? control.items.length : 'none'}.`
            );
          }
          break;
        case 'opinionSort':
          if (!Array.isArray(control.items) || control.items.length < 6 || control.items.length > 8) {
            pushWarning(
              warnings,
              `${field}.controls[${ci}].items`,
              `opinionSort should have 6-8 statements. Got ${Array.isArray(control.items) ? control.items.length : 'none'}.`
            );
          }
          if (!Array.isArray(control.columns) || control.columns.length < 2) {
            pushError(errors, `${field}.controls[${ci}].columns`, 'opinionSort needs at least 2 columns.');
          }
          break;
        case 'discussionQuestions':
          if (!Array.isArray(control.items) || control.items.length < 3 || control.items.length > 4) {
            pushWarning(
              warnings,
              `${field}.controls[${ci}].items`,
              'discussionQuestions fallback should have 3-4 items.'
            );
          }
          break;
        case 'definitionMatch':
          if (!Array.isArray(control.items) || control.items.length < 6) {
            pushWarning(
              warnings,
              `${field}.controls[${ci}].items`,
              'definitionMatch should have about 10 items.'
            );
          }
          control.items.forEach((item, ii) => {
            if (!isKebabCase(item && item.id)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].id`, 'definitionMatch item id must be kebab-case.');
            }
            if (!isNonEmptyString(item && item.term)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].term`, 'definitionMatch term is required.');
            }
            if (!isNonEmptyString(item && item.definition)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].definition`, 'definitionMatch definition is required.');
            }
          });
          break;
        case 'gapFillBank':
          if (!Array.isArray(control.wordBank) || control.wordBank.length === 0) {
            pushError(errors, `${field}.controls[${ci}].wordBank`, 'gapFillBank wordBank is required.');
          }
          if (!Array.isArray(control.items) || control.items.length < 6) {
            pushWarning(warnings, `${field}.controls[${ci}].items`, 'gapFillBank should have 8-10 items.');
          }
          (control.items || []).forEach((item, ii) => {
            if (!isKebabCase(item && item.id)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].id`, 'gapFillBank item id must be kebab-case.');
            }
            if (!isNonEmptyString(item && item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'gapFillBank answer is required.');
            } else if (Array.isArray(control.wordBank) && !control.wordBank.includes(item.answer)) {
              pushError(
                errors,
                `${field}.controls[${ci}].items[${ii}].answer`,
                `gapFillBank answer "${item.answer}" is not present in wordBank.`
              );
            }
          });
          break;
        case 'phrasalVerbPractice':
          if (!Array.isArray(control.matchItems) || control.matchItems.length < 3) {
            pushWarning(warnings, `${field}.controls[${ci}].matchItems`, 'phrasalVerbPractice should have 4-5 matchItems.');
          }
          if (!Array.isArray(control.gapFillItems) || control.gapFillItems.length < 5) {
            pushWarning(warnings, `${field}.controls[${ci}].gapFillItems`, 'phrasalVerbPractice should have 6-8 gapFillItems.');
          }
          if (!Array.isArray(control.wordBank) || control.wordBank.length === 0) {
            pushError(errors, `${field}.controls[${ci}].wordBank`, 'phrasalVerbPractice wordBank is required.');
          }
          (control.gapFillItems || []).forEach((item, ii) => {
            if (!isKebabCase(item && item.id)) {
              pushError(errors, `${field}.controls[${ci}].gapFillItems[${ii}].id`, 'phrasalVerbPractice gapFillItem id must be kebab-case.');
            }
            if (Array.isArray(control.wordBank) && isNonEmptyString(item && item.answer) && !control.wordBank.includes(item.answer)) {
              pushError(
                errors,
                `${field}.controls[${ci}].gapFillItems[${ii}].answer`,
                `phrasalVerbPractice answer "${item.answer}" is not in wordBank.`
              );
            }
          });
          break;
        case 'taskList':
          if (!Array.isArray(control.items) || control.items.length === 0) {
            pushError(errors, `${field}.controls[${ci}].items`, 'taskList items required.');
          }
          break;
        case 'readingText':
          if (!Array.isArray(control.paragraphs) || control.paragraphs.length < 4 || control.paragraphs.length > 6) {
            pushWarning(warnings, `${field}.controls[${ci}].paragraphs`, 'readingText should have 4-6 paragraphs.');
          }
          break;
        case 'readingQuizRadio':
          if (!Array.isArray(control.items) || control.items.length < 4 || control.items.length > 6) {
            pushWarning(warnings, `${field}.controls[${ci}].items`, 'readingQuizRadio should have 4-6 items.');
          }
          (control.items || []).forEach((item, ii) => {
            if (!isKebabCase(item && item.id)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].id`, 'readingQuizRadio item id must be kebab-case.');
            }
            if (!Array.isArray(item && item.options) || item.options.length !== 3) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].options`, 'Each quiz question must have exactly 3 options.');
            }
            if (!isNonEmptyString(item && item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'readingQuizRadio answer is required.');
            } else if (Array.isArray(item && item.options) && !item.options.includes(item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'readingQuizRadio answer must match one option.');
            }
          });
          break;
        case 'grammarRuleCards':
          if (!Array.isArray(control.cards) || control.cards.length < 2) {
            pushWarning(warnings, `${field}.controls[${ci}].cards`, 'grammarRuleCards should have 2-4 cards.');
          }
          break;
        case 'completeRule':
          if (!Array.isArray(control.items) || control.items.length < 3) {
            pushWarning(warnings, `${field}.controls[${ci}].items`, 'completeRule should have 3-5 items.');
          }
          (control.items || []).forEach((item, ii) => {
            if (!isKebabCase(item && item.id)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].id`, 'completeRule item id must be kebab-case.');
            }
            if (!Array.isArray(item && item.options) || item.options.length < 2) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].options`, 'completeRule item needs at least 2 options.');
            }
            if (!isNonEmptyString(item && item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'completeRule answer is required.');
            } else if (Array.isArray(item && item.options) && !item.options.includes(item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'completeRule answer must match one option.');
            }
          });
          break;
        case 'chooseCorrect':
          if (!Array.isArray(control.items) || control.items.length < 4) {
            pushWarning(warnings, `${field}.controls[${ci}].items`, 'chooseCorrect should have 5-6 items.');
          }
          (control.items || []).forEach((item, ii) => {
            if (!isKebabCase(item && item.id)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].id`, 'chooseCorrect item id must be kebab-case.');
            }
            if (!Array.isArray(item && item.options) || item.options.length < 2) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].options`, 'chooseCorrect item needs at least 2 options.');
            }
            if (!isNonEmptyString(item && item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'chooseCorrect answer is required.');
            } else if (Array.isArray(item && item.options) && !item.options.includes(item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'chooseCorrect answer must match one option.');
            }
          });
          break;
        case 'controlledInputPractice':
          if (!Array.isArray(control.items) || control.items.length < 6) {
            pushWarning(warnings, `${field}.controls[${ci}].items`, 'controlledInputPractice should have 6-8 items.');
          }
          (control.items || []).forEach((item, ii) => {
            if (!isKebabCase(item && item.id)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].id`, 'controlledInputPractice item id must be kebab-case.');
            }
            if (!isNonEmptyString(item && item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'controlledInputPractice answer is required.');
            }
          });
          break;
        case 'dropdownChoicePractice':
          if (!Array.isArray(control.items) || control.items.length < 6) {
            pushWarning(warnings, `${field}.controls[${ci}].items`, 'dropdownChoicePractice should have 6-8 items.');
          }
          (control.items || []).forEach((item, ii) => {
            if (!isKebabCase(item && item.id)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].id`, 'dropdownChoicePractice item id must be kebab-case.');
            }
            if (!Array.isArray(item && item.options) || item.options.length < 2) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].options`, 'dropdownChoicePractice item needs at least 2 options.');
            }
            if (!isNonEmptyString(item && item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'dropdownChoicePractice answer is required.');
            } else if (Array.isArray(item && item.options) && !item.options.includes(item.answer)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answer`, 'dropdownChoicePractice answer must match one option.');
            }
          });
          break;
        case 'speakingQuestions':
          if (!Array.isArray(control.items) || control.items.length < 4) {
            pushWarning(warnings, `${field}.controls[${ci}].items`, 'speakingQuestions should have 4-6 items.');
          }
          break;
        case 'translationSelfCheck':
          if (!Array.isArray(control.items) || control.items.length < 5) {
            pushWarning(warnings, `${field}.controls[${ci}].items`, 'translationSelfCheck should have 6-8 items.');
          }
          (control.items || []).forEach((item, ii) => {
            if (!isKebabCase(item && item.id)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].id`, 'translationSelfCheck item id must be kebab-case.');
            }
            if (!isNonEmptyString(item && item.sourceRu)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].sourceRu`, 'translationSelfCheck sourceRu is required.');
            }
            if (!isNonEmptyString(item && item.answerEn)) {
              pushError(errors, `${field}.controls[${ci}].items[${ii}].answerEn`, 'translationSelfCheck answerEn is required.');
            }
          });
          break;
        case 'resourceNotes':
          if (!isNonEmptyString(control.id)) {
            pushError(errors, `${field}.controls[${ci}].id`, 'resourceNotes id is required.');
          }
          break;
        default:
          break;
      }
    });
  });

  ensureControlType(errors, sectionById.get('warmup') ? sectionById.get('warmup').controls : [], 'wordAssociationStrikeList', 'warmup');
  ensureControlType(errors, sectionById.get('lead-in') ? sectionById.get('lead-in').controls : [], 'opinionSort', 'lead-in');
  ensureControlType(errors, sectionById.get('target-vocabulary') ? sectionById.get('target-vocabulary').controls : [], 'definitionMatch', 'target-vocabulary');
  ensureControlType(errors, sectionById.get('target-vocabulary') ? sectionById.get('target-vocabulary').controls : [], 'gapFillBank', 'target-vocabulary');
  ensureControlType(errors, sectionById.get('reading') ? sectionById.get('reading').controls : [], 'readingText', 'reading');
  ensureControlType(errors, sectionById.get('reading') ? sectionById.get('reading').controls : [], 'readingQuizRadio', 'reading');
  ensureControlType(errors, sectionById.get('grammar') ? sectionById.get('grammar').controls : [], 'grammarRuleCards', 'grammar');
  ensureControlType(errors, sectionById.get('grammar') ? sectionById.get('grammar').controls : [], 'completeRule', 'grammar');
  ensureControlType(errors, sectionById.get('grammar') ? sectionById.get('grammar').controls : [], 'chooseCorrect', 'grammar');
  ensureControlType(errors, sectionById.get('grammar-practice') ? sectionById.get('grammar-practice').controls : [], 'controlledInputPractice', 'grammar-practice');
  ensureControlType(errors, sectionById.get('grammar-practice') ? sectionById.get('grammar-practice').controls : [], 'dropdownChoicePractice', 'grammar-practice');
  ensureControlType(errors, sectionById.get('speaking') ? sectionById.get('speaking').controls : [], 'speakingQuestions', 'speaking');
  ensureControlType(errors, sectionById.get('resources') ? sectionById.get('resources').controls : [], 'resourceNotes', 'resources');

  const teacherNotes = data.teacherNotes;
  if (!teacherNotes || typeof teacherNotes !== 'object') {
    pushWarning(warnings, 'teacherNotes', 'teacherNotes is recommended.');
  } else {
    if (!Array.isArray(teacherNotes.lessonFlow) || teacherNotes.lessonFlow.length === 0) {
      pushWarning(warnings, 'teacherNotes.lessonFlow', 'lessonFlow should have 5-8 steps.');
    }
  }

  return { errors, warnings };
}

module.exports = { validateLesson, ALLOWED_CONTROLS, REQUIRED_SECTIONS };
