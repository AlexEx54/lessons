const assert = require('node:assert/strict');
const test = require('node:test');

const { renderAppPage } = require('../lib/app-shell.js');

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
  assert.deepEqual(activeNavigationItems(html), ['/']);
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
