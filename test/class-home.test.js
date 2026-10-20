'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const { createDocument } = require('./helpers/lesson-dom.js');
const source = fs.readFileSync(path.join(__dirname, '../assets/class-home.js'), 'utf8');
const classPath = `/join/anna-${'a'.repeat(48)}`;
const at = minutes => new Date(Date.now() + minutes * 60000).toISOString();
const session = (id, minutes, patch) => ({ id, title: `Lesson ${id}`, level: 'A2', duration: '30–45 мин', cover: `/api/sessions/${id}/assets/cover.png`, scheduledAt: at(minutes), path: `/sessions/${id}/student`, ...patch });
async function open(pathname, overview, { ok = true, hash = '' } = {}) {
  const document = createDocument();
  // Mirrors the elements that class-home.html renders hidden.
  for (const id of ['class-home', 'class-home-current', 'class-home-empty', 'class-home-cover', 'class-home-enter', 'class-home-all', 'class-sessions', 'class-sessions-empty', 'class-home-error']) document.getElementById(id).hidden = true;
  for (const name of ['upcoming', 'past']) {
    const tab = document.getElementById(`class-sessions-tab-${name}`);
    tab.dataset.tab = name;
    tab.append(document.createElement('span'));
  }
  const window = { location: { pathname, hash }, history: { replaceState: (_state, _title, url) => { window.location.hash = url; } } };
  const requests = [];
  vm.runInNewContext(source, { window, document, fetch: async url => { requests.push(url); return { ok, json: async () => overview }; } });
  await new Promise(resolve => setImmediate(resolve));
  const byId = id => document.getElementById(id);
  const items = () => byId('class-sessions-list').children.map(item => {
    const [, text] = item.children[0].children;
    return { href: item.children[0].href, title: text.children[1].textContent, live: text.children[0].children.length > 0 };
  });
  return { document, window, requests, byId, items };
}
test('class home offers the running session with a big entry button and the list', async () => {
  const running = session('running', -10), lastWeek = session('last-week', -7 * 24 * 60);
  const { document, requests, byId } = await open(classPath, { className: 'Анна', current: running, upcoming: [session('next', 60)], past: [running, lastWeek] });
  assert.deepEqual(requests, [`/api${classPath}`]);
  assert.equal(document.title, 'Анна — EasyClass');
  assert.equal(byId('class-home').hidden, false);
  assert.equal(byId('class-home-loading').hidden, true);
  assert.equal(byId('class-home-class').textContent, 'Ваш класс · Анна');
  assert.equal(byId('class-home-empty').hidden, true);
  assert.match(byId('class-home-when').textContent, /^Идёт сейчас · началось в \d\d:\d\d$/);
  assert.equal(byId('class-home-title').textContent, 'Lesson running');
  assert.equal(byId('class-home-meta').textContent, 'A2 · 30–45 мин');
  assert.equal(byId('class-home-cover').src, running.cover);
  assert.equal(byId('class-home-enter').hidden, false);
  assert.equal(byId('class-home-enter').href, '/sessions/running/student');
  assert.equal(byId('class-home-all').hidden, false);
  assert.equal(byId('class-home-all').href, `${classPath}/sessions`);
  assert.equal(byId('class-sessions').hidden, true);
});
test('class home announces the nearest session or that none is scheduled yet', async () => {
  const next = session('next', 24 * 60, { cover: '' });
  const upcoming = await open(classPath, { className: 'Анна', current: next, upcoming: [next], past: [] });
  assert.match(upcoming.byId('class-home-when').textContent, /^Ближайшее занятие · /);
  assert.equal(upcoming.byId('class-home-cover').hidden, true);
  const empty = await open(classPath, { className: 'Анна', current: null, upcoming: [], past: [] });
  assert.equal(empty.byId('class-home-empty').hidden, false);
  assert.equal(empty.byId('class-home-current').hidden, true);
  assert.equal(empty.byId('class-home-enter').hidden, true);
  assert.equal(empty.byId('class-home-all').hidden, true);
  const finished = await open(classPath, { className: 'Анна', current: null, upcoming: [], past: [session('old', -500)] });
  assert.equal(finished.byId('class-home-empty').hidden, false);
  assert.equal(finished.byId('class-home-all').hidden, false);
});
test('session list switches between upcoming and past sessions and remembers the tab', async () => {
  const running = session('running', -10);
  const overview = { className: 'Анна', current: running, upcoming: [session('tomorrow', 24 * 60), session('next-week', 7 * 24 * 60)], past: [running, session('old', -500)] };
  const { window, byId, items } = await open(`${classPath}/sessions`, overview);
  assert.equal(byId('class-home').hidden, true);
  assert.equal(byId('class-sessions').hidden, false);
  assert.equal(byId('class-sessions-back').href, classPath);
  assert.equal(byId('class-sessions-tab-upcoming').getAttribute('aria-selected'), 'true');
  assert.equal(byId('class-sessions-tab-upcoming').children[0].textContent, 2);
  assert.deepEqual(items().map(item => item.title), ['Lesson tomorrow', 'Lesson next-week']);
  assert.equal(items()[0].href, '/sessions/tomorrow/student');
  byId('class-sessions-tab-past').click();
  assert.equal(window.location.hash, '#past');
  assert.equal(byId('class-sessions-tab-past').getAttribute('aria-selected'), 'true');
  assert.equal(byId('class-sessions-tab-upcoming').getAttribute('aria-selected'), 'false');
  assert.deepEqual(items().map(item => [item.title, item.live]), [['Lesson running', true], ['Lesson old', false]]);
  assert.equal(byId('class-sessions-empty').hidden, true);
  const reopened = await open(`${classPath}/sessions`, overview, { hash: '#past' });
  assert.deepEqual(reopened.items().map(item => item.title), ['Lesson running', 'Lesson old']);
});
test('session list opens past sessions when nothing is upcoming and explains an empty tab', async () => {
  const { byId, items } = await open(`${classPath}/sessions`, { className: 'Анна', current: null, upcoming: [], past: [session('old', -500)] });
  assert.equal(byId('class-sessions-tab-past').getAttribute('aria-selected'), 'true');
  assert.deepEqual(items().map(item => item.title), ['Lesson old']);
  byId('class-sessions-tab-upcoming').click();
  assert.deepEqual(items(), []);
  assert.equal(byId('class-sessions-empty').hidden, false);
  assert.equal(byId('class-sessions-empty').textContent, 'Предстоящих занятий пока нет.');
});
test('class home reports a failed request', async () => {
  const { byId } = await open(classPath, { error: 'Класс не найден.' }, { ok: false });
  assert.equal(byId('class-home-error').hidden, false);
  assert.equal(byId('class-home-error-message').textContent, 'Класс не найден.');
  assert.equal(byId('class-home').hidden, true);
});
