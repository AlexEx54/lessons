#!/usr/bin/env node
'use strict';

const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout, stderr } = require('process');
const { loadDotEnv } = require('../lib/env.js');

loadDotEnv(path.join(__dirname, '..', '.env'));

const { closeDatabase, getDatabase } = require('../lib/db.js');
const { hashPassword } = require('../lib/password.js');
const { createUser, findUserByEmail, normalizeEmail } = require('../lib/user-store.js');

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--email') result.email = argv[++index];
    else if (value === '--name') result.name = argv[++index];
    else if (value === '--help' || value === '-h') result.help = true;
    else throw new Error(`Неизвестный аргумент: ${value}`);
  }
  return result;
}

function printHelp() {
  stdout.write('Использование: npm run user:create -- --email teacher@example.com --name "Имя"\n');
}

function readHiddenPassword(prompt) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    const terminal = readline.createInterface({ input: stdin, output: stderr });
    return terminal.question(prompt).finally(() => terminal.close());
  }

  return new Promise((resolve, reject) => {
    let value = '';
    stderr.write(prompt);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();

    function finish() {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write('\n');
    }

    function onData(chunk) {
      for (const character of chunk) {
        if (character === '\r' || character === '\n') {
          finish();
          resolve(value);
          return;
        }
        if (character === '\u0003') {
          finish();
          reject(new Error('Создание пользователя отменено.'));
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
          continue;
        }
        if (character >= ' ') value += character;
      }
    }

    stdin.on('data', onData);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const email = normalizeEmail(args.email);
  const name = String(args.name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Укажите корректный --email.');
  if (!name || name.length > 100) throw new Error('Укажите --name длиной от 1 до 100 символов.');

  const database = getDatabase();
  if (findUserByEmail(email, database)) throw new Error(`Пользователь ${email} уже существует.`);

  const password = await readHiddenPassword('Пароль (минимум 10 символов): ');
  const confirmation = await readHiddenPassword('Повторите пароль: ');
  if (password.length < 10) throw new Error('Пароль должен содержать минимум 10 символов.');
  if (password !== confirmation) throw new Error('Пароли не совпадают.');

  const user = createUser({
    email,
    displayName: name,
    passwordHash: await hashPassword(password),
  }, database);
  stdout.write(`Создан преподаватель: ${user.displayName} <${user.email}>\n`);
}

main()
  .catch(error => {
    stderr.write(`Ошибка: ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(closeDatabase);
