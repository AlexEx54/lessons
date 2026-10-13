'use strict';

const nodemailer = require('nodemailer');

let transport = null;

function mailConfig() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT || 465),
    user,
    pass,
    from: process.env.MAIL_FROM || `EasyClass <${user}>`,
  };
}

// Port 465 is implicit TLS; Stalwart on the prod VPS has no 587 listener.
function getTransport(config) {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transport;
}

function registrationCodeMessage(code) {
  const subject = `Код подтверждения EasyClass: ${code}`;
  const text = [
    'Здравствуйте!',
    '',
    `Ваш код подтверждения для регистрации в EasyClass: ${code}`,
    'Код действует 15 минут.',
    '',
    'Если вы не регистрировались — просто проигнорируйте письмо.',
  ].join('\n');
  const html = `<!doctype html>
<html lang="ru">
<body style="margin:0;padding:32px 16px;background:#f4f2ff;font-family:Arial,Helvetica,sans-serif;color:#171335;">
  <div style="max-width:480px;margin:0 auto;padding:32px;border-radius:16px;background:#ffffff;">
    <p style="margin:0 0 24px;font-size:20px;font-weight:bold;">Easy<span style="color:#5937ef;">Class</span></p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Ваш код подтверждения для регистрации:</p>
    <p style="margin:0 0 16px;font-size:34px;font-weight:bold;letter-spacing:8px;color:#5937ef;">${code}</p>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.5;color:#5d586b;">Код действует 15 минут.</p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#85808f;">Если вы не регистрировались — просто проигнорируйте письмо.</p>
  </div>
</body>
</html>`;
  return { subject, text, html };
}

// Without SMTP settings outside production the code goes to the server log, so local registration still works.
async function sendRegistrationCode(email, code) {
  const config = mailConfig();
  if (!config) {
    if (process.env.NODE_ENV === 'production') throw new Error('SMTP is not configured: set SMTP_HOST, SMTP_USER, SMTP_PASSWORD.');
    console.log(`Registration code for ${email}: ${code}`);
    return;
  }
  await getTransport(config).sendMail({ from: config.from, to: email, ...registrationCodeMessage(code) });
}

// Logs in to the SMTP server without sending anything; used by `npm run mail:check`.
async function verifyMailConnection() {
  const config = mailConfig();
  if (!config) throw new Error('SMTP не настроен: задайте SMTP_HOST, SMTP_USER, SMTP_PASSWORD.');
  await getTransport(config).verify();
  return config;
}

module.exports = { sendRegistrationCode, verifyMailConnection };
