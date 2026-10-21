'use strict';

// Shared pieces of template controls: prompt wording, answer checks and example data.

const NUMBER_WORDS = Object.freeze([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
]);

const CYRILLIC = /[Ѐ-ӿ]/u;

// Names the fields, so that a neighbouring block may still ask for Markdown.
function plainTextRule(fields) {
  const names = fields.length > 1 ? `${fields.slice(0, -1).join(', ')} and ${fields.at(-1)}` : fields[0];
  return `Use plain text only in ${names}: no Markdown, asterisks, underscores, brackets, hashes, backticks, or HTML.`;
}

// Copies the given presentation keys that the template actually set.
function pick(source, keys) {
  return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]));
}

function countWord(count) {
  return NUMBER_WORDS[count] ?? String(count);
}

// "once", "twice", "three times" — for rules such as "use the grammar at least twice".
function timesWord(count) {
  if (count === 1) return 'once';
  if (count === 2) return 'twice';
  return `${countWord(count)} times`;
}

function fail(message) {
  throw new Error(message);
}

// How a block is named in error messages: its visible title without Markdown, or its id.
function blockName({ id, chrome = {} }) {
  const title = String(chrome.title || chrome.heading || '').replace(/\*/g, '').trim();
  return title ? `«${title}»` : id;
}

function exactList(value, count, what, context) {
  if (!Array.isArray(value) || value.length !== count) {
    fail(`${blockName(context)}: нужно ровно ${count} (${what}), получено ${Array.isArray(value) ? value.length : 0}.`);
  }
  return value;
}

function requiredText(value, what, context) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) fail(`${blockName(context)}: не заполнено: ${what}.`);
  return text;
}

// Model text on one line: trimmed, with runs of whitespace collapsed to one space.
function oneLine(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

// Task components reject Markdown; strip it instead of failing the whole generation. Keeps surrounding spaces.
function stripMarkdown(value, where, context) {
  const text = typeof value === 'string' ? value : '';
  const plain = text.replace(/[*_`]/g, '');
  if (plain !== text) console.warn(`${blockName(context)}: убрана Markdown-разметка в ${where}.`);
  return plain;
}

function warnCyrillic(value, context) {
  const found = [];
  (function collect(item) {
    if (typeof item === 'string' && CYRILLIC.test(item)) found.push(item);
    else if (Array.isArray(item)) item.forEach(collect);
    else if (item && typeof item === 'object') Object.values(item).forEach(collect);
  })(value);
  if (found.length) console.warn(`${blockName(context)} содержит кириллицу в английском тексте: ${found.join(' | ')}`);
}

function assertUnique(values, what, context) {
  if (new Set(values.map(value => value.toLocaleLowerCase())).size !== values.length) {
    fail(`${blockName(context)}: ${what} не должны повторяться.`);
  }
  return values;
}

function shuffle(values, random = Math.random) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

// The model copies entries from a vocabulary variable; map them to the exact terms,
// drop repeats and warn about words that are not in the vocabulary.
function pickVocabulary(requested, vocabulary, where, context) {
  const lookup = new Map(vocabulary.map(item => [item.term.trim().toLocaleLowerCase(), item.term.trim()]));
  const picked = new Map();
  for (const value of Array.isArray(requested) ? requested : []) {
    const term = String(value || '').trim();
    const key = term.toLocaleLowerCase();
    if (!lookup.has(key)) console.warn(`${blockName(context)}: слово не из словаря в ${where}: ${term}.`);
    if (picked.has(key)) console.warn(`${blockName(context)}: повтор в ${where}: ${term}.`);
    else picked.set(key, lookup.get(key) || term);
  }
  return [...picked.values()];
}

// Strict variant for tasks built around one exact word: a word outside the vocabulary
// is an error. Returns the term as the vocabulary spells it.
function vocabularyTerm(value, vocabulary, what, context) {
  const requested = requiredText(value, what, context);
  const key = requested.toLocaleLowerCase();
  const term = vocabulary.map(item => item.term.trim()).find(candidate => candidate.toLocaleLowerCase() === key);
  if (!term) fail(`${blockName(context)}: ${what} должно точно совпадать со словом из словаря, получено «${requested}».`);
  return term;
}

// Example data has a fixed length; parameters may ask for fewer or more items.
function cycle(items, count) {
  return Array.from({ length: count }, (_, index) => items[index % items.length]);
}

function listSchema(count, items = { type: 'string', minLength: 1 }) {
  return { type: 'array', minItems: count, maxItems: count, items };
}

// Block parameters, as the template editor shows them: the label comes first.
// `atMost` names a parameter this one may not exceed, e.g. minWords → maxWords.
const integer = (label, min, max, value, { atMost } = {}) => Object.freeze({
  type: 'integer', label, min, max, default: value, ...(atMost ? { atMost } : {}),
});
// `options` maps each value to its label.
const choice = (label, options, value) => Object.freeze({ type: 'choice', label, options: Object.freeze(options), default: value });
const flag = (label, value) => Object.freeze({ type: 'flag', label, default: value });
const text = (label, value) => Object.freeze({ type: 'text', label, default: value });

module.exports = {
  assertUnique,
  blockName,
  choice,
  countWord,
  cycle,
  exactList,
  fail,
  flag,
  integer,
  listSchema,
  oneLine,
  pick,
  pickVocabulary,
  plainTextRule,
  requiredText,
  shuffle,
  stripMarkdown,
  text,
  timesWord,
  vocabularyTerm,
  warnCyrillic,
};
