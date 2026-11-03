#!/usr/bin/env node
'use strict';

const path = require('path');
const { stdout, stderr } = require('process');
const { loadDotEnv } = require('../lib/env.js');

loadDotEnv(path.join(__dirname, '..', '.env'));

const { closeDatabase, getDatabase } = require('../lib/db.js');
const { announce } = require('../lib/notification-store.js');

const OPTIONS = { '--key': 'key', '--title': 'title', '--text': 'text' };

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--help' || value === '-h') result.help = true;
    else if (OPTIONS[value]) result[OPTIONS[value]] = String(argv[++index] || '').trim();
    else throw new Error(`Неизвестный аргумент: ${value}`);
  }
  return result;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    stdout.write('Использование: npm run announce -- --key session-calls --title "Заголовок" --text "Текст"\n');
    return;
  }
  if (!/^[a-z0-9-]+$/.test(args.key || '')) throw new Error('Укажите --key из латинских букв, цифр и дефисов.');
  if (!args.title) throw new Error('Укажите --title.');
  if (!args.text) throw new Error('Укажите --text.');

  const count = announce(args, getDatabase());
  stdout.write(`Объявление announcement:${args.key} отправлено: ${count}\n`);
}

try {
  main();
} catch (error) {
  stderr.write(`Ошибка: ${error.message}\n`);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
