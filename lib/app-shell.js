const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SHELL_PATH = path.join(__dirname, 'app-shell.html');

const APP_PAGES = Object.freeze({
  home: Object.freeze({
    documentTitle: 'EasyClass — кабинет преподавателя',
    fragmentPath: path.join(ROOT, 'dashboard.html'),
    pageStylesheet: '/assets/home.css',
    pageScript: '/assets/home.js',
    contentClass: 'content--home',
    subtitle: 'У вас пока нет уроков и учебных классов — давайте быстро всё настроим.',
  }),
  library: Object.freeze({
    documentTitle: 'Библиотека уроков — EasyClass',
    fragmentPath: path.join(ROOT, 'library.html'),
    pageStylesheet: '/assets/library.css',
    pageScript: '/assets/library.js',
    contentClass: 'content--library',
    subtitle: 'Выберите готовый урок и начните занятие за пару минут.',
  }),
});

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function replaceToken(template, token, value) {
  return template.replaceAll(`{{${token}}}`, value);
}

async function renderAppPage(pageId, context = {}) {
  const page = APP_PAGES[pageId];
  if (!page) throw new Error(`Unknown app page: ${pageId}`);

  const [shell, pageContent] = await Promise.all([
    fs.promises.readFile(SHELL_PATH, 'utf8'),
    fs.promises.readFile(page.fragmentPath, 'utf8'),
  ]);

  const active = route => route === pageId;
  const user = context.user || null;
  const adminMenuItem = user?.role === 'admin'
    ? '            <button type="button" role="menuitem" data-coming-soon="Создать урок">Создать урок</button>'
    : '';
  const replacements = {
    DOCUMENT_TITLE: escapeHtml(page.documentTitle),
    PAGE_ID: pageId,
    PAGE_STYLESHEET: page.pageStylesheet,
    PAGE_SCRIPT: page.pageScript,
    CONTENT_CLASS: page.contentClass,
    PAGE_SUBTITLE: escapeHtml(page.subtitle),
    PAGE_CONTENT: pageContent.trim(),
    BRAND_HREF: user ? '/app' : '/',
    USER_DISPLAY_NAME: escapeHtml(user ? user.displayName : 'Гость'),
    USER_EMAIL: escapeHtml(user ? user.email : 'Войдите в кабинет'),
    AUTH_STATE: user ? 'authenticated' : 'guest',
    MOBILE_ADMIN_MENU_ITEMS: adminMenuItem,
    DESKTOP_ADMIN_MENU_ITEMS: adminMenuItem,
    HOME_ACTIVE_CLASS: active('home') ? ' nav-item--active' : '',
    HOME_ARIA_CURRENT: active('home') ? ' aria-current="page"' : '',
    LIBRARY_ACTIVE_CLASS: active('library') ? ' nav-item--active' : '',
    LIBRARY_ARIA_CURRENT: active('library') ? ' aria-current="page"' : '',
  };

  const html = Object.entries(replacements).reduce(
    (result, [token, value]) => replaceToken(result, token, value),
    shell,
  );

  if (/{{[A-Z_]+}}/.test(html)) throw new Error(`Unresolved AppShell token for page: ${pageId}`);
  return html;
}

module.exports = { APP_PAGES, renderAppPage };
