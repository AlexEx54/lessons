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
  assert.match(html, /family=Inter:wght@400;500;600;700;800/);
  assert.match(html, /src="\/assets\/app-shell\.js"/);
  assert.match(html, /src="\/assets\/home\.js"/);
  assert.deepEqual(activeNavigationItems(html), ['/app']);
});

test('home renders authenticated teacher profile data', async () => {
  const html = await renderAppPage('home', {
    user: { displayName: 'Анна & Ко', email: 'anna@example.com', role: 'teacher' },
  });

  assert.match(html, /data-auth-state="authenticated"/);
  assert.equal((html.match(/class="brand(?: brand--mobile)?" href="\/app"/g) || []).length, 2);
  assert.match(html, /Анна &amp; Ко/);
  assert.match(html, /anna@example\.com/);
  assert.doesNotMatch(html, /data-open-new-lesson-modal/);
  assert.doesNotMatch(html, /id="new-lesson-modal"/);
});

test('admin sees lesson creation and drafts links in both profile menus without a generator link', async () => {
  const html = await renderAppPage('home', {
    user: { displayName: 'Администратор', email: 'admin@example.com', role: 'admin' },
  });

  assert.equal((html.match(/data-open-new-lesson-modal/g) || []).length, 2);
  assert.equal((html.match(/>Создать урок<\/button>/g) || []).length, 2);
  assert.equal((html.match(/>Создать урок<\/button>\s*<a href="\/lesson-drafts" role="menuitem">Черновики уроков<\/a>/g) || []).length, 2);
  assert.equal((html.match(/href="\/lesson-drafts"/g) || []).length, 2);
  assert.doesNotMatch(html, /href="\/generator[^\"]*"[^>]*>Создать урок/);
  assert.equal((html.match(/id="new-lesson-modal"/g) || []).length, 1);
  assert.match(html, /placeholder="Напр\. Luca Cartoon"/);
  assert.equal((html.match(/data-value="template-1"[^>]*>Шаблон 1<\/li>/g) || []).length, 1);
  assert.match(html, /data-new-lesson-select/);
  assert.match(html, /name="template" value="template-1"/);
  assert.match(html, /class="new-lesson-dialog__create" type="button" data-create-lesson-draft/);
});

test('guest does not see create lesson', async () => {
  const html = await renderAppPage('library');
  assert.doesNotMatch(html, /data-open-new-lesson-modal/);
  assert.doesNotMatch(html, /id="new-lesson-modal"/);
});

test('library renders inside the shared shell with one active navigation item', async () => {
  const html = await renderAppPage('library');

  assert.match(html, /<title>Библиотека уроков — EasyClass<\/title>/);
  assert.equal((html.match(/class="brand(?: brand--mobile)?" href="\/"/g) || []).length, 2);
  assert.match(html, /href="\/assets\/library\.css"/);
  assert.match(html, /src="\/assets\/library\.js"/);
  assert.match(html, /class="content content--library"/);
  assert.deepEqual(activeNavigationItems(html), ['/library.html']);
});

test('lesson drafts render inside the shared shell for an admin', async () => {
  const html = await renderAppPage('lessonDrafts', {
    user: { displayName: 'Администратор', email: 'admin@example.com', role: 'admin' },
  });

  assert.match(html, /<title>Черновики уроков — EasyClass<\/title>/);
  assert.match(html, /href="\/assets\/lesson-drafts\.css"/);
  assert.match(html, /src="\/assets\/lesson-drafts\.js"/);
  assert.match(html, /class="content content--lesson-drafts"/);
  assert.match(html, /id="draft-grid"/);
  assert.deepEqual(activeNavigationItems(html), []);
});

test('renderer rejects unknown application pages', async () => {
  await assert.rejects(renderAppPage('unknown'), /Unknown app page/);
});

test('logout returns the teacher to the public landing page', () => {
  const appShellScript = fs.readFileSync(path.join(ROOT, 'assets', 'app-shell.js'), 'utf8');
  assert.match(appShellScript, /window\.location\.assign\('\/'\)/);
  assert.doesNotMatch(appShellScript, /window\.location\.assign\('\/login'\)/);
});
