'use strict';

// Checks that the SMTP settings from .env can log in. Sends nothing.
const path = require('path');
const { loadDotEnv } = require('../lib/env.js');

loadDotEnv(path.join(__dirname, '..', '.env'));
const { verifyMailConnection } = require('../lib/mailer.js');

verifyMailConnection().then(
  config => console.log(`SMTP OK: ${config.user} вошёл на ${config.host}:${config.port}.`),
  error => {
    console.error(`SMTP FAIL: ${error.message}`);
    process.exitCode = 1;
  },
);
