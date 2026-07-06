#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { validateLesson } = require('./lib/lesson-validate.js');
const { buildLessonHtml, defaultOutputPath } = require('./lib/lesson-build.js');

function parseArgs(argv) {
  const args = { input: null, output: null, help: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') args.help = true;
    else if (arg === '-o' || arg === '--output') { args.output = argv[++i]; }
    else if (!args.input) args.input = arg;
    else { console.error(`Unexpected argument: ${arg}`); args.help = true; }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node generate-lesson.js <input.json> [-o output.html]

Reads a lesson-spec-v1 JSON file, validates it, and writes a standalone
interactive HTML lesson page (with embedded CSS, renderer, sync, and JSON).

Options:
  -o, --output <file>   Output HTML path. Default: input name with .html extension.
  -h, --help            Show this help.`);
}

function reportValidation(result) {
  if (result.errors.length) {
    console.error('Validation errors:');
    result.errors.forEach(e => console.error(`  [${e.field}] ${e.message}`));
  }
  if (result.warnings.length) {
    console.warn('Validation warnings:');
    result.warnings.forEach(w => console.warn(`  [${w.field}] ${w.message}`));
  }
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.input) { printHelp(); process.exit(args.help ? 0 : 1); }

  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }

  let raw;
  try { raw = fs.readFileSync(inputPath, 'utf8'); }
  catch (e) { console.error(`Cannot read input: ${e.message}`); process.exit(1); }

  let data;
  try { data = JSON.parse(raw); }
  catch (e) { console.error(`Input is not valid JSON: ${e.message}`); process.exit(1); }

  const result = validateLesson(data);
  reportValidation(result);
  if (result.errors.length) {
    console.error('Fix validation errors before generating the page.');
    process.exit(1);
  }

  const html = buildLessonHtml(data);
  const outputPath = path.resolve(args.output || defaultOutputPath(inputPath));
  try { fs.writeFileSync(outputPath, html, 'utf8'); }
  catch (e) { console.error(`Cannot write output: ${e.message}`); process.exit(1); }

  console.log(`Generated: ${outputPath}`);
  if (result.warnings.length) console.log(`(${result.warnings.length} warning(s) — page still generated.)`);
}

main();
