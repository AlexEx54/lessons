'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createDocument } = require('./helpers/lesson-dom');

const sources = ['session-call.js', 'session-panel.js'].map(file => fs.readFileSync(path.join(__dirname, '../assets', file), 'utf8'));
const SESSION = '11111111-2222-3333-4444-555555555555';

// Runs the real panel and call with fake call modules and a fake chat; each join records the media and connection
// (or, in a group, the room) it created.
function setup({ role = 'teacher', stored = {}, callInfo = { status: 200, body: { names: { teacher: 'Анна', student: 'Маша' } } },
  endStatus = 200, commandStatus = 200, group = false } = {}) {
  const document = createDocument();
  const toasts = [], requests = [], bodies = [], calls = [], windowListeners = {};
  const chat = { log: [] };
  const storage = { ...stored };
  const snapshot = { microphone: true, camera: true, screen: false, screenShareBusy: false, screenAudioStatus: '',
    background: 'none', backgroundStatus: { text: '', state: '' }, effectProgress: null, error: '' };
  const window = {
    location: { protocol: 'https:', host: 'class.test' },
    localStorage: { getItem: key => storage[key] ?? null, setItem: (key, value) => { storage[key] = value; } },
    addEventListener: (name, listener) => (windowListeners[name] ||= []).push(listener),
    CallMedia: {
      BACKGROUND_OPTIONS: [{ id: 'none', label: 'Без фона' }, { id: 'blur', label: 'Размытие' }],
      create(options) {
        const media = { options, log: [], snapshot: () => ({ ...snapshot }), previewTrack: () => null,
          prepare() { media.log.push('prepare'); }, stop() { media.log.push('stop'); },
          toggle(kind) { media.log.push(`toggle:${kind}`); }, setPageHidden() {} };
        calls.push({ media });
        return media;
      },
    },
    CallConnection: {
      create(options) {
        const connection = { options, log: [], status: 'idle',
          remoteState: { present: false, name: '', audio: undefined, video: undefined, screen: false, videoVisible: false },
          remote: () => connection.remoteState, remoteStream: { getVideoTracks: () => [], getAudioTracks: () => [] },
          join() { connection.log.push('join'); }, leave() { connection.log.push('leave'); },
          close() { connection.log.push('close'); }, publishMediaState() { connection.log.push('media-state'); },
          diagnostic() {} };
        calls.at(-1).connection = connection;
        return connection;
      },
    },
    CallRoom: {
      create(options) {
        const room = { options, log: [], state: 'connecting', peerList: [], blocked: false,
          peers: () => room.peerList, status: () => room.state, audioBlocked: () => room.blocked,
          join() { room.log.push('join'); }, close() { room.log.push('close'); }, sync() {},
          startAudio() { room.log.push('start-audio'); } };
        calls.at(-1).room = room;
        return room;
      },
    },
    CallChat: {
      create(options) {
        chat.options = options;
        return { receive: message => chat.log.push(`receive:${message.id}`), sync: () => chat.log.push('sync'),
          setVisible: visible => { chat.visible = visible; } };
      },
    },
    CallRecorder: { supported: () => false, control: () => ({ state: () => ({ recording: false, busy: false, unsaved: false, message: '' }),
      stop: async () => {}, toggle: async () => {} }) },
  };
  async function fetch(url, options = {}) {
    requests.push(`${options.method || 'GET'} ${url}`);
    if (options.body) bodies.push(JSON.parse(options.body));
    if (url.endsWith('/call/end')) return { ok: endStatus === 200, json: async () => ({}) };
    if (/\/call\/(mute|remove)$/.test(url)) return { ok: commandStatus === 200, json: async () => (commandStatus === 200 ? { done: true } : { error: 'Ученика нет в звонке.' }) };
    return { ok: callInfo.status === 200, json: async () => callInfo.body };
  }
  const context = vm.createContext({ window, document, fetch, navigator: { mediaDevices: { getDisplayMedia() {} } },
    MediaStream: class { constructor(tracks) { this.tracks = tracks; } } });
  sources.forEach(source => vm.runInContext(source, context));
  const icon = document.createElement('svg');
  icon.append(document.createElement('path'));
  document.getElementById('call-toggle').append(icon);
  document.getElementById('call-tiles').append(document.getElementById('call-remote-tile'), document.getElementById('call-local-tile'));
  const panel = window.SessionPanel.create({ sessionId: SESSION, role, notify: text => toasts.push(text), group });
  const byId = id => document.getElementById(id);
  const press = key => document.listeners.keydown.forEach(listener => listener({ key }));
  return { panel, chat, document, byId, toasts, requests, bodies, calls, storage, windowListeners, snapshot, press,
    current: () => calls.at(-1), settle: () => new Promise(setImmediate),
    unload() { const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      windowListeners.beforeunload.forEach(listener => listener(event)); return event.defaultPrevented; } };
}

test('the panel opens without joining, reports the student and remembers being collapsed', async () => {
  const s = setup();
  await s.settle();
  assert.equal(s.byId('call-panel').hidden, false);
  assert.equal(s.byId('call-toggle').hidden, false);
  assert.equal(s.calls.length, 0);
  assert.deepEqual(s.requests, [`GET /api/sessions/${SESSION}/call?role=teacher`]);

  s.panel.presence({ teacher: false, student: true });
  assert.deepEqual(s.toasts, [], 'the first snapshot is not news');
  assert.equal(s.byId('call-panel-status').textContent, 'Маша уже в звонке');
  assert.equal(s.byId('call-toggle').dataset.call, 'peer');
  s.panel.presence({ teacher: false, student: false });
  s.panel.presence({ teacher: false, student: true });
  assert.deepEqual(s.toasts, ['Маша больше не в звонке', 'В звонке: Маша']);

  s.byId('call-panel-collapse').click();
  assert.equal(s.byId('call-panel').hidden, true);
  assert.equal(s.byId('call-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(setup({ stored: { ...s.storage } }).byId('call-panel').hidden, true);
  s.byId('call-toggle').click();
  assert.equal(s.byId('call-panel').hidden, false);
  assert.equal(s.storage['easyclass.sessionCallCollapsed'], '0');
});

test('a group student waiting for a place has no panel until the lesson lets them in, collapsing stays as chosen', async () => {
  const s = setup({ role: 'student', group: true, stored: { 'easyclass.sessionCallCollapsed': '1' } });
  await s.settle();
  s.panel.setWaiting(true);
  assert.equal(s.byId('call-toggle').hidden, true);
  assert.equal(s.byId('call-panel').hidden, true);
  s.panel.setWaiting(false);
  assert.equal(s.byId('call-toggle').hidden, false);
  assert.equal(s.byId('call-panel').hidden, true, 'the panel was collapsed before');
  s.byId('call-toggle').click();
  s.panel.setWaiting(false);
  assert.equal(s.byId('call-panel').hidden, false, 'a repeated «not waiting» changes nothing');
});

test('the chat tab hides the running call, and unread messages show on the tab or the collapsed header button', async () => {
  const s = setup();
  await s.settle();
  assert.equal(s.chat.options.container, s.byId('chat-section'));
  assert.equal(s.chat.options.endpoint, `/api/sessions/${SESSION}/chat`);
  assert.deepEqual({ ...s.chat.options.params }, { role: 'teacher' });
  assert.deepEqual([s.byId('call-section').hidden, s.byId('chat-section').hidden, s.chat.visible], [false, true, false], 'the panel opens on the call');

  s.chat.options.onUnread(2);
  assert.deepEqual([s.byId('chat-tab-badge').hidden, s.byId('chat-tab-badge').textContent], [false, '2']);
  assert.equal(s.byId('call-toggle-badge').hidden, true, 'the open panel shows the count on its tab');
  s.byId('call-panel-collapse').click();
  assert.deepEqual([s.byId('call-toggle-badge').hidden, s.byId('call-toggle-badge').textContent], [false, '2']);
  assert.equal(s.byId('call-toggle').getAttribute('aria-label'), 'Звонок, новых сообщений: 2');

  s.byId('call-toggle').click();
  s.byId('call-join').click();
  s.byId('call-more').click();
  assert.equal(s.byId('call-more-menu').hidden, false);
  s.byId('chat-tab').click();
  assert.equal(s.chat.visible, true);
  assert.deepEqual([s.byId('call-section').hidden, s.byId('chat-section').hidden], [true, false]);
  assert.equal(s.byId('call-more-menu').hidden, true, 'a hidden call closes its menus');
  assert.deepEqual(s.current().connection.log, ['join'], 'the call keeps running behind the chat');
  assert.equal(s.document.body.classList.contains('lesson-chat-open'), true);
  s.chat.options.onUnread(0);
  assert.equal(s.byId('chat-tab-badge').hidden, true);

  s.byId('call-panel-tabs').listeners.keydown.forEach(listener => listener({ key: 'Home', preventDefault() {} }));
  assert.equal(s.byId('call-tab').getAttribute('aria-selected'), 'true');
  assert.equal(s.document.activeElement, s.byId('call-tab'));
  assert.equal(s.chat.visible, false);

  s.panel.receiveChat({ id: 7 });
  s.panel.syncChat();
  assert.deepEqual(s.chat.log, ['receive:7', 'sync']);
});

test('the student joins with fresh media, leaves, and a late event of the old call changes nothing', async () => {
  const s = setup({ role: 'student' });
  await s.settle();
  assert.equal(s.unload(), false);
  s.byId('call-join').click();
  const first = s.current();
  assert.deepEqual(first.media.log, ['prepare']);
  assert.deepEqual(first.connection.log, ['join']);
  assert.equal(first.connection.options.role, 'guest');
  assert.equal(first.connection.options.socketUrl(), `wss://class.test/ws/session-calls/${SESSION}?role=student`);
  assert.equal(first.connection.options.localDetails().name, 'Маша');
  assert.equal(s.byId('call-room').hidden, false);
  assert.equal(s.byId('call-lobby').hidden, true);
  assert.equal(s.byId('call-leave').getAttribute('aria-label'), 'Выйти из звонка');
  assert.equal(s.unload(), true);

  first.connection.remoteState = { ...first.connection.remoteState, present: true, audio: false };
  first.connection.options.onStatus('connected');
  assert.equal(s.byId('call-panel-status').textContent, 'Соединение установлено');
  assert.equal(s.byId('call-remote-name').textContent, 'Анна');
  const mutedIcon = s.byId('call-remote-muted');
  assert.equal(mutedIcon.getAttribute('hidden'), null);
  first.connection.remoteState.audio = true;
  first.connection.options.onStatus('connected');
  assert.equal(mutedIcon.getAttribute('hidden'), '');
  s.byId('call-mic').click();
  assert.deepEqual(first.media.log, ['prepare', 'toggle:audio']);

  s.byId('call-leave').click();
  await s.settle();
  assert.deepEqual(first.connection.log, ['join', 'leave', 'close']);
  assert.deepEqual(first.media.log, ['prepare', 'toggle:audio', 'stop']);
  assert.equal(s.byId('call-lobby').hidden, false);
  assert.equal(s.unload(), false);

  s.byId('call-join').click();
  assert.equal(s.calls.length, 2);
  assert.notEqual(s.current().media, first.media);
  first.connection.options.onEnded('ended');
  first.connection.options.onStatus('offline');
  assert.equal(s.byId('call-room').hidden, false);
  assert.equal(s.byId('call-panel-status').textContent, 'Подключаемся…');
  assert.deepEqual(s.current().media.log, ['prepare']);
});

test("the peer's screen opens over the lesson once per share and the own screen is not mirrored", async () => {
  const s = setup();
  await s.settle();
  s.byId('call-join').click();
  const { connection } = s.current();
  const share = screen => {
    connection.remoteState = { ...connection.remoteState, present: true, name: 'Маша', screen, videoVisible: true };
    connection.options.onRemote();
  };
  assert.equal(s.byId('call-stage').hidden, true);

  share(true);
  assert.equal(s.byId('call-stage').hidden, false);
  assert.equal(s.byId('call-stage-video').srcObject, connection.remoteStream);
  assert.equal(s.byId('call-stage-name').textContent, 'Экран: Маша');
  assert.equal(s.byId('call-remote-video').dataset.screen, 'true');
  assert.equal(s.byId('call-stage-open').hidden, true);

  s.press('Escape');
  assert.equal(s.byId('call-stage').hidden, true);
  assert.equal(s.byId('call-stage-video').srcObject, null);
  assert.equal(s.byId('call-stage-open').hidden, false);
  share(true);
  assert.equal(s.byId('call-stage').hidden, true, 'a closed stage waits for the next share');
  s.byId('call-stage-open').click();
  assert.equal(s.byId('call-stage').hidden, false);
  s.byId('call-stage-close').click();
  assert.equal(s.byId('call-stage').hidden, true);

  share(false);
  assert.equal(s.byId('call-stage-open').title, 'Развернуть видео: Маша', 'the camera can be expanded too');
  assert.equal(s.byId('call-remote-video').dataset.screen, 'false');
  s.byId('call-stage-open').click();
  assert.equal(s.byId('call-stage-name').textContent, 'Маша');
  assert.equal(s.byId('call-stage-placeholder').hidden, true);
  connection.remoteState = { ...connection.remoteState, videoVisible: false };
  connection.options.onRemote();
  assert.equal(s.byId('call-stage-placeholder').hidden, false, 'a camera turned off leaves the stage open');
  connection.remoteState = { ...connection.remoteState, present: false };
  connection.options.onRemote();
  assert.equal(s.byId('call-stage').hidden, true, 'the stage closes when the peer leaves');
  assert.equal(s.byId('call-stage-open').hidden, true);
  share(true);
  assert.equal(s.byId('call-stage').hidden, false, 'a new share opens again');
  share(false);
  assert.equal(s.byId('call-stage').hidden, true, 'the stage closes with the share');

  share(true);
  s.byId('call-leave').click();
  await s.settle();
  assert.equal(s.byId('call-stage').hidden, true, 'leaving the call closes the stage');

  s.snapshot.screen = true;
  s.byId('call-join').click();
  assert.equal(s.byId('call-local-video').dataset.screen, 'true');
});

test('ending reasons stay in the panel until the next join', async () => {
  const s = setup({ role: 'student' });
  await s.settle();
  for (const [reason, note] of [['ended', 'Учитель завершил звонок.'], ['occupied', /другой ученик/], ['elsewhere', /другой вкладке/]]) {
    s.byId('call-join').click();
    s.current().connection.options.onEnded(reason);
    await s.settle();
    assert.match(s.byId('call-note').textContent, note instanceof RegExp ? note : new RegExp(note));
    assert.equal(s.byId('call-room').hidden, true);
    assert.deepEqual(s.current().media.log, ['prepare', 'stop']);
  }
  s.byId('call-join').click();
  assert.equal(s.byId('call-note').hidden, true);
});

test('the teacher ends the call for both and stays in it when the server refuses', async () => {
  const s = setup({ endStatus: 500 });
  await s.settle();
  s.byId('call-join').click();
  assert.equal(s.byId('call-leave').getAttribute('aria-label'), 'Завершить звонок для всех');
  s.byId('call-leave').click();
  await s.settle();
  assert.equal(s.requests.at(-1), `POST /api/sessions/${SESSION}/call/end`);
  assert.deepEqual(s.toasts, ['Не удалось завершить звонок. Попробуйте ещё раз.']);
  assert.equal(s.byId('call-room').hidden, false);

  const ok = setup();
  await ok.settle();
  ok.byId('call-join').click();
  ok.byId('call-leave').click();
  await ok.settle();
  assert.deepEqual(ok.current().connection.log, ['join', 'close']);
  assert.equal(ok.byId('call-room').hidden, true);
  assert.equal(ok.byId('call-note').hidden, true);
});

test('a refused call info keeps the join button off and explains why', async () => {
  const s = setup({ callInfo: { status: 403, body: { error: 'Откройте действующую ссылку на класс.' } } });
  await s.settle();
  assert.equal(s.byId('call-join').disabled, true);
  assert.equal(s.byId('call-note').textContent, 'Откройте действующую ссылку на класс.');
  s.byId('call-join').click();
  assert.equal(s.calls.length, 0);
});

// A participant of a group call as CallRoom reports them; video is a LiveKit track the tile attaches.
const peer = (identity, name, fields = {}) => ({ identity, name, teacher: false, audio: true, camera: true, screen: null,
  video: { attached: [], attach(element) { this.attached.push(element); }, detach(element) { this.attached = this.attached.filter(item => item !== element); } },
  speaking: false, ...fields });
const peerTilesOf = s => s.byId('call-tiles').children.filter(tile => !tile.hidden && tile !== s.byId('call-local-tile'));
const tileNames = s => peerTilesOf(s).map(tile => tile.querySelector('span').children[0].textContent);

test('a group session has the call too; outside it the lobby names who is in, the student hears only about the teacher', async () => {
  const s = setup({ role: 'student', group: true });
  await s.settle();
  assert.equal(s.byId('call-tab').hidden, false);
  assert.deepEqual(s.requests, [], 'the pass is asked for only on joining');
  assert.equal(s.byId('call-toggle-label').textContent, 'Звонок');
  assert.equal(s.byId('call-remote-tile').hidden, true);
  assert.equal(s.byId('call-tiles').className, 'call-tiles--group');

  s.panel.presence({ teacher: false, students: [] });
  assert.equal(s.byId('call-panel-status').textContent, 'В звонке пока никого');
  s.panel.presence({ teacher: false, students: ['Петя'] });
  s.panel.presence({ teacher: true, students: ['Оля', 'Петя'] });
  assert.equal(s.byId('call-panel-status').textContent, 'Учитель, Оля и Петя уже в звонке');
  assert.equal(s.byId('call-toggle').dataset.call, 'peer');
  assert.deepEqual(s.toasts, ['В звонке: Учитель']);

  const teacher = setup({ group: true });
  await teacher.settle();
  teacher.panel.presence({ teacher: true, students: [] });
  teacher.panel.presence({ teacher: true, students: ['Маша'] });
  assert.equal(teacher.byId('call-panel-status').textContent, 'Маша уже в звонке');
  assert.deepEqual(teacher.toasts, ['В звонке: Маша']);
  assert.equal(teacher.byId('call-record').parentNode, null, 'no recording in a group yet');
});

test('in a group call everyone else has a tile, and the screen of the expanded tile opens over the lesson', async () => {
  const s = setup({ role: 'student', group: true });
  await s.settle();
  s.byId('call-join').click();
  const { room, media } = s.current();
  assert.deepEqual([room.log, media.log, room.options.endpoint], [['join'], ['prepare'], `/api/sessions/${SESSION}/call?role=student`]);
  assert.equal(s.byId('call-panel-status').textContent, 'Подключаемся…');

  room.state = 'connected';
  room.options.onChange();
  assert.equal(s.byId('call-panel-status').textContent, 'Пока в звонке только вы');
  const anna = peer('teacher-1', 'Анна', { teacher: true }), olya = peer('s-2', 'Оля', { audio: false, video: null, camera: false });
  room.peerList = [anna, olya];
  room.options.onChange();
  assert.equal(s.byId('call-panel-status').textContent, 'Соединение установлено');
  assert.deepEqual(tileNames(s), ['Анна', 'Оля']);
  assert.equal(s.byId('call-tiles').children.at(-1), s.byId('call-local-tile'), 'the own tile stays last');
  const [annaTile, olyaTile] = peerTilesOf(s);
  assert.equal(anna.video.attached[0], annaTile.children[0]);
  assert.deepEqual([annaTile.querySelector('.call-tile__placeholder').hidden, olyaTile.querySelector('.call-tile__placeholder').hidden], [true, false]);
  assert.equal(olyaTile.querySelector('span').children[1].getAttribute('hidden'), null);
  assert.equal(annaTile.querySelector('span').children[1].getAttribute('hidden'), '');
  assert.equal(annaTile.querySelector('.call-tile__menu'), null, 'a student commands nobody');

  // Оля shares her screen: it opens over the lesson once, and her tile can open it again.
  const screen = peer('s-2', 'Оля').video;
  room.peerList = [anna, { ...olya, screen, video: screen }];
  room.options.onChange();
  assert.equal(s.byId('call-stage').hidden, false);
  assert.equal(s.byId('call-stage-name').textContent, 'Экран: Оля');
  assert.equal(screen.attached.length, 2, 'the tile and the stage');
  s.byId('call-stage-close').click();
  assert.equal(s.byId('call-stage').hidden, true);
  assert.equal(screen.attached.length, 1);
  olyaTile.children[2].click(); // the expand button, cloned from the peer tile's
  assert.equal(s.byId('call-stage').hidden, false);

  // Анна's camera can be expanded too; Оля's share ending closes only her own screen.
  annaTile.children[2].click();
  assert.equal(s.byId('call-stage-name').textContent, 'Анна');
  assert.deepEqual([anna.video.attached.length, screen.attached.length], [2, 1]);
  room.peerList = [anna, olya];
  room.options.onChange();
  assert.equal(s.byId('call-stage').hidden, false);
  room.peerList = [{ ...anna, video: null, camera: false }, olya];
  room.options.onChange();
  assert.deepEqual([s.byId('call-stage').hidden, s.byId('call-stage-placeholder').hidden, anna.video.attached.length], [false, false, 0]);
  room.peerList = [anna, { ...olya, screen, video: screen }];
  room.options.onChange();
  assert.equal(s.byId('call-stage-name').textContent, 'Экран: Оля', 'a new share takes the stage');
  assert.equal(olyaTile.children[2].title, 'Развернуть экран: Оля');
  room.peerList = [anna, olya];
  room.options.onChange();
  assert.equal(s.byId('call-stage').hidden, true, 'the stage closes with the shown screen');
  assert.equal(annaTile.children[2].title, 'Развернуть видео: Анна');
  olyaTile.children[2].click();
  assert.deepEqual([s.byId('call-stage-name').textContent, s.byId('call-stage-placeholder').hidden], ['Оля', false]);

  room.peerList = [anna];
  room.options.onChange();
  assert.deepEqual(tileNames(s), ['Анна']);
  assert.equal(s.byId('call-stage').hidden, true);

  room.blocked = true;
  room.options.onChange();
  assert.equal(s.byId('call-audio').hidden, false);
  s.byId('call-audio').click();
  assert.deepEqual(room.log, ['join', 'start-audio']);
});

test("the teacher mutes a student's microphone or camera and removes them from the menu of their tile", async () => {
  const s = setup({ group: true });
  await s.settle();
  s.byId('call-join').click();
  const { room } = s.current();
  room.state = 'connected';
  room.peerList = [peer('s-1', 'Маша', { camera: false, video: null }), peer('s-2', 'Петя')];
  room.options.onChange();
  const menuOf = index => peerTilesOf(s)[index].querySelector('.call-tile__menu');
  menuOf(0).click();
  assert.equal(s.byId('call-peer-menu').hidden, false);
  assert.equal(s.byId('call-peer-menu-name').textContent, 'Маша');
  assert.deepEqual([s.byId('call-peer-mute-microphone').disabled, s.byId('call-peer-mute-camera').disabled], [false, true]);
  s.byId('call-peer-mute-microphone').click();
  assert.equal(s.byId('call-peer-menu').hidden, true);
  menuOf(1).click();
  s.byId('call-peer-mute-camera').click();
  menuOf(1).click();
  s.byId('call-peer-remove').click();
  await s.settle();
  assert.deepEqual(s.requests.slice(-3), ['mute', 'mute', 'remove'].map(action => `POST /api/sessions/${SESSION}/call/${action}`));
  assert.deepEqual(s.bodies, [{ identity: 's-1', source: 'microphone' }, { identity: 's-2', source: 'camera' }, { identity: 's-2' }]);
  assert.deepEqual(s.toasts, []);

  // The student left before the teacher pressed: the server's answer is shown, and a menu of a gone student closes.
  const late = setup({ group: true, commandStatus: 404 });
  await late.settle();
  late.byId('call-join').click();
  const lateRoom = late.current().room;
  lateRoom.state = 'connected';
  lateRoom.peerList = [peer('s-1', 'Маша')];
  lateRoom.options.onChange();
  peerTilesOf(late)[0].querySelector('.call-tile__menu').click();
  late.byId('call-peer-remove').click();
  await late.settle();
  assert.deepEqual(late.toasts, ['Ученика нет в звонке.']);
  peerTilesOf(late)[0].querySelector('.call-tile__menu').click();
  lateRoom.peerList = [];
  lateRoom.options.onChange();
  assert.equal(late.byId('call-peer-menu').hidden, true);
});

test('a group call ends with the reason, and the teacher ends it for everyone', async () => {
  const s = setup({ role: 'student', group: true });
  await s.settle();
  for (const [reason, message, note] of [['removed', undefined, 'Учитель убрал вас из звонка.'], ['ended', undefined, 'Учитель завершил звонок.'],
    ['lost', undefined, 'Связь со звонком прервалась. Войдите снова.'], ['refused', 'Звонок откроется, когда вы войдёте в занятие.', 'Звонок откроется, когда вы войдёте в занятие.']]) {
    s.byId('call-join').click();
    s.current().room.options.onEnded(reason, message);
    await s.settle();
    assert.equal(s.byId('call-note').textContent, note);
    assert.equal(s.byId('call-room').hidden, true);
    assert.deepEqual([s.current().room.log, s.current().media.log], [['join', 'close'], ['prepare', 'stop']]);
  }
  s.byId('call-join').click();
  s.byId('call-leave').click();
  await s.settle();
  assert.deepEqual(s.current().room.log, ['join', 'close']);
  assert.equal(s.requests.length, 0, 'a student just leaves');

  const teacher = setup({ group: true });
  await teacher.settle();
  teacher.byId('call-join').click();
  teacher.byId('call-leave').click();
  await teacher.settle();
  assert.deepEqual(teacher.requests, [`POST /api/sessions/${SESSION}/call/end`]);
  assert.deepEqual(teacher.current().room.log, ['join', 'close']);
});
