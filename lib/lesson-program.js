'use strict';

// Where a library lesson sits in the course: a grammar point of the program and an optional season.
// The list is shared with the browser, which reads the same file from /assets.
const { grammar, seasons } = require('../assets/lesson-program.json');

const GRAMMAR = new Map(grammar.map(point => [point.key, point]));
const SEASONS = new Map(seasons.map(season => [season.key, season.label]));

function grammarTitle(key) {
  return GRAMMAR.get(key)?.title ?? null;
}

function seasonLabel(key) {
  return SEASONS.get(key) ?? null;
}

module.exports = { grammarTitle, isGrammarPoint: key => GRAMMAR.has(key), isSeason: key => SEASONS.has(key), seasonLabel };
