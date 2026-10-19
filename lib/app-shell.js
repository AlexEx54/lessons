const fs = require('fs');
const path = require('path');
const { DEFAULT_AVATARS } = require('./user-store.js');
const { renderClassModalKit } = require('./class-modal-kit.js');

const ROOT = path.join(__dirname, '..');
const SHELL_PATH = path.join(__dirname, 'app-shell.html');
const NEW_LESSON_MODAL_PATH = path.join(__dirname, 'new-lesson-modal.html');
const SUPPORT_URL = 'https://t.me/+albE0gXCUfY1YmJi';

const APP_PAGES = Object.freeze({
  home: Object.freeze({
    documentTitle: 'EasyClass — кабинет преподавателя',
    fragmentPath: path.join(ROOT, 'dashboard.html'),
    pageStylesheet: '/assets/home.css',
    pageScripts: Object.freeze(['/assets/home.js']),
    contentClass: 'content--home',
    subtitle: 'У вас пока нет уроков и учебных классов — давайте быстро всё настроим.',
  }),
  schedule: Object.freeze({
    documentTitle: 'Расписание — EasyClass',
    fragmentPath: path.join(ROOT, 'schedule.html'),
    pageStylesheet: '/assets/schedule.css',
    pageScripts: Object.freeze(['/assets/schedule.js']),
    contentClass: 'content--schedule',
    subtitle: 'Предстоящие уроки и подготовленные классы.',
  }),
  library: Object.freeze({
    documentTitle: 'Библиотека уроков — EasyClass',
    fragmentPath: path.join(ROOT, 'library.html'),
    pageStylesheet: '/assets/library.css',
    pageScripts: Object.freeze(['/assets/library.js']),
    contentClass: 'content--library',
    subtitle: 'Выберите готовый урок и начните занятие за пару минут.',
  }),
  lessonDrafts: Object.freeze({
    documentTitle: 'Черновики уроков — EasyClass',
    fragmentPath: path.join(ROOT, 'lesson-drafts.html'),
    pageStylesheet: '/assets/lesson-drafts.css',
    pageScripts: Object.freeze(['/assets/lesson-drafts.js']),
    contentClass: 'content--lesson-drafts',
    subtitle: 'Следите за генерацией и готовьте новые уроки к публикации.',
  }),
  videoCalls: Object.freeze({
    documentTitle: 'Видеозвонки — EasyClass',
    fragmentPath: path.join(ROOT, 'video-calls.html'),
    pageStylesheet: '/assets/video-calls.css',
    pageScripts: Object.freeze(['/assets/video-calls.js']),
    contentClass: 'content--video-calls',
    subtitle: 'Создавайте личные комнаты и проводите занятия прямо в EasyClass.',
  }),
  settings: Object.freeze({
    documentTitle: 'Настройки — EasyClass',
    fragmentPath: path.join(ROOT, 'settings.html'),
    pageStylesheet: '/assets/settings.css',
    pageScripts: Object.freeze(['/assets/settings.js']),
    contentClass: 'content--settings',
    subtitle: 'Имя и аватарка, которые видны в вашем кабинете.',
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

async function renderAppPage(pageId, context = {}) {
  const page = APP_PAGES[pageId];
  if (!page) throw new Error(`Unknown app page: ${pageId}`);

  const [shell, pageContent, newLessonModal, classModalKit] = await Promise.all([
    fs.promises.readFile(SHELL_PATH, 'utf8'),
    fs.promises.readFile(page.fragmentPath, 'utf8'),
    fs.promises.readFile(NEW_LESSON_MODAL_PATH, 'utf8'),
    renderClassModalKit(),
  ]);

  const active = route => route === pageId;
  const user = context.user || null;
  const adminMenuItems = user?.role === 'admin'
    ? `            <button type="button" role="menuitem" data-open-new-lesson-modal>Создать урок</button>
            <a href="/lesson-drafts" role="menuitem">Черновики уроков</a>
`
    : '';
  const teacherMenuItems = user
    ? `${adminMenuItems}            <a href="/video-calls" role="menuitem" data-video-calls-link>Видеозвонки</a>`
    : '';
  const replacements = {
    DOCUMENT_TITLE: escapeHtml(page.documentTitle),
    PAGE_ID: pageId,
    PAGE_STYLESHEET: page.pageStylesheet,
    PAGE_SCRIPTS: page.pageScripts.map(src => `  <script src="${src}" defer></script>`).join('\n'),
    CONTENT_CLASS: page.contentClass,
    PAGE_SUBTITLE: escapeHtml(page.subtitle),
    PAGE_CONTENT: pageContent.trim(),
    BRAND_HREF: user ? '/app' : '/',
    USER_DISPLAY_NAME: escapeHtml(user ? user.displayName : 'Гость'),
    USER_EMAIL: escapeHtml(user ? user.email : 'Войдите в кабинет'),
    USER_AVATAR_URL: escapeHtml(user ? user.avatarUrl : DEFAULT_AVATARS.female),
    AUTH_STATE: user ? 'authenticated' : 'guest',
    USER_ROLE: user ? user.role : '',
    MOBILE_TEACHER_MENU_ITEMS: teacherMenuItems,
    DESKTOP_TEACHER_MENU_ITEMS: teacherMenuItems,
    TEACHER_SCRIPTS: user ? '  <script src="/assets/video-call-presence.js" defer></script>' : '',
    SUPPORT_URL,
    NEW_LESSON_MODAL: user?.role === 'admin' ? newLessonModal.trim() : '',
    CLASS_MODAL_STYLESHEETS: classModalKit.stylesheets,
    CLASS_MODAL: classModalKit.markup,
    CLASS_MODAL_SCRIPTS: classModalKit.scripts,
    HOME_ACTIVE_CLASS: active('home') ? ' nav-item--active' : '',
    HOME_ARIA_CURRENT: active('home') ? ' aria-current="page"' : '',
    SCHEDULE_ACTIVE_CLASS: active('schedule') ? ' nav-item--active' : '',
    SCHEDULE_ARIA_CURRENT: active('schedule') ? ' aria-current="page"' : '',
    LIBRARY_ACTIVE_CLASS: active('library') ? ' nav-item--active' : '',
    LIBRARY_ARIA_CURRENT: active('library') ? ' aria-current="page"' : '',
    VIDEO_CALLS_ACTIVE_CLASS: active('videoCalls') ? ' nav-item--active' : '',
    VIDEO_CALLS_ARIA_CURRENT: active('videoCalls') ? ' aria-current="page"' : '',
    SETTINGS_ACTIVE_CLASS: active('settings') ? ' nav-item--active' : '',
    SETTINGS_ARIA_CURRENT: active('settings') ? ' aria-current="page"' : '',
  };

  // One pass, so a teacher name that looks like a token is never substituted again.
  return shell.replace(/{{([A-Z_]+)}}/g, (_match, token) => {
    if (!Object.hasOwn(replacements, token)) throw new Error(`Unresolved AppShell token for page: ${pageId}`);
    return replacements[token];
  });
}

module.exports = { APP_PAGES, renderAppPage };
