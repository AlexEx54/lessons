const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { renderAppPage } = require('../lib/app-shell.js');

const ROOT = path.join(__dirname, '..');

function activeNavigationItems(html) {
  return [...html.matchAll(/<a class="nav-item nav-item--active" href="([^"]+)" aria-current="page">/g)]
    .map(match => match[1]);
}

test('home renders inside the shared shell with one active navigation item', async () => {
  const html = await renderAppPage('home');

  assert.match(html, /<title>EasyClass — кабинет преподавателя<\/title>/);
  assert.match(html, /href="\/assets\/app-shell\.css"/);
  assert.match(html, /href="\/assets\/home\.css"/);
  assert.match(html, /src="\/assets\/app-shell\.js"/);
  assert.match(html, /src="\/assets\/home\.js"/);
  assert.deepEqual(activeNavigationItems(html), ['/app']);
});

test('home renders authenticated teacher profile data', async () => {
  const html = await renderAppPage('home', {
    user: { displayName: 'Анна & Ко', email: 'anna@example.com' },
  });

  assert.match(html, /data-auth-state="authenticated"/);
  assert.match(html, /Анна &amp; Ко/);
  assert.match(html, /anna@example\.com/);
});

test('library renders inside the shared shell with one active navigation item', async () => {
  const html = await renderAppPage('library');

  assert.match(html, /<title>Библиотека уроков — EasyClass<\/title>/);
  assert.match(html, /href="\/assets\/library\.css"/);
  assert.match(html, /src="\/assets\/library\.js"/);
  assert.match(html, /class="content content--library"/);
  assert.deepEqual(activeNavigationItems(html), ['/library.html']);
});

test('renderer rejects unknown application pages', async () => {
  await assert.rejects(renderAppPage('unknown'), /Unknown app page/);
});

test('logout returns the teacher to the public landing page', () => {
  const appShellScript = fs.readFileSync(path.join(ROOT, 'assets', 'app-shell.js'), 'utf8');
  assert.match(appShellScript, /window\.location\.assign\('\/'\)/);
  assert.doesNotMatch(appShellScript, /window\.location\.assign\('\/login'\)/);
});
