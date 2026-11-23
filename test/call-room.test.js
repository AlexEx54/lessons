'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { createDocument } = require('./helpers/lesson-dom');

const source = fs.readFileSync(path.join(__dirname, '../assets/call-room.js'), 'utf8');
const Source = { Microphone: 'microphone', Camera: 'camera', ScreenShare: 'screen_share', ScreenShareAudio: 'screen_share_audio' };

// A participant as livekit-client shows them: publications by source.
function participant(identity, name, role, publications = {}) {
  return { identity, name, metadata: JSON.stringify({ role }), isSpeaking: false,
    getTrackPublication: source => publications[source] };
}

// Runs the real CallRoom with a fake livekit-client and a fake CallMedia whose state the test sets.
function setup({ pass = { status: 200, body: { url: 'wss://class.test', token: 'pass' } } } = {}) {
  const document = createDocument();
  const log = [], ended = [];
  const rooms = [];
  const published = {};
  const local = {
    getTrackPublication: source => published[source],
    async publishTrack(track, options) {
      log.push(`publish ${options.source}${options.simulcast ? ' simulcast' : ''}`);
      const publication = { source: options.source, isMuted: false,
        track: { mediaStreamTrack: track, async replaceTrack(next, replaceOptions) {
          log.push(`replace ${options.source}${replaceOptions.userProvidedTrack ? ' provided' : ''}`); this.mediaStreamTrack = next; } },
        async mute() { log.push(`mute ${options.source}`); this.isMuted = true; },
        async unmute() { log.push(`unmute ${options.source}`); this.isMuted = false; } };
      published[options.source] = publication;
      return publication;
    },
    async unpublishTrack(track, stop) {
      const [source] = Object.entries(published).find(([, publication]) => publication.track === track);
      log.push(`unpublish ${source}${stop ? ' stop' : ''}`);
      delete published[source];
    },
  };
  class Room {
    constructor(options) {
      Object.assign(this, { options, handlers: {}, localParticipant: local, remoteParticipants: new Map(), canPlaybackAudio: true });
      rooms.push(this);
    }
    on(event, handler) { (this.handlers[event] ||= []).push(handler); return this; }
    emit(event, ...args) { (this.handlers[event] || []).forEach(handler => handler(...args)); }
    async connect(url, token) { log.push(`connect ${url} ${token}`); }
    async disconnect() { log.push('disconnect'); }
  }
  const lk = { Room, Track: { Kind: { Audio: 'audio', Video: 'video' }, Source },
    RoomEvent: Object.fromEntries(['TrackSubscribed', 'TrackUnsubscribed', 'TrackMuted', 'TrackUnmuted', 'TrackPublished', 'TrackUnpublished',
      'ParticipantConnected', 'ParticipantDisconnected', 'ParticipantNameChanged', 'ActiveSpeakersChanged', 'AudioPlaybackStatusChanged',
      'Reconnecting', 'Reconnected', 'Disconnected'].map(name => [name, name])),
    DisconnectReason: { DUPLICATE_IDENTITY: 2, PARTICIPANT_REMOVED: 4, ROOM_DELETED: 5 } };
  const tracks = { microphone: { id: 'mic' }, camera: { id: 'camera' }, effect: { id: 'effect' }, screen: { id: 'screen' }, screenAudio: { id: 'screen-audio' } };
  const state = { audio: true, video: 'camera', screen: false, screenAudio: false, camera: true };
  const media = {
    sentState: () => ({ audio: state.audio, video: Boolean(state.video), screen: state.screen }),
    outboundVideoTrack: () => (state.screen ? tracks.screen : tracks[state.video] || null),
    track: kind => (kind === 'audio' ? tracks.microphone : tracks.camera),
    screenAudioTrack: () => (state.screen && state.screenAudio ? tracks.screenAudio : null),
    snapshot: () => ({ camera: state.camera }),
    toggle(kind) { log.push(`toggle ${kind}`); },
  };
  const requests = [];
  const window = {};
  const context = vm.createContext({ window, document, console: { error() {} },
    fetch: async (url, options) => { requests.push([url, options]); return { ok: pass.status === 200, json: async () => pass.body }; } });
  vm.runInContext(source, context);
  let changes = 0;
  const room = window.CallRoom.create({ endpoint: '/api/sessions/1/call?role=student', media, onChange: () => { changes += 1; },
    onEnded: (...args) => ended.push(args), load: async () => { log.push('load'); return lk; } });
  const settle = () => new Promise(setImmediate);
  return { room, log, ended, requests, rooms, published, tracks, state, media, settle, changes: () => changes, document };
}

test('joining takes a pass, connects and sends the microphone and the camera; tracks change in place', async () => {
  const s = setup();
  s.room.sync(); // CallMedia may report its tracks before the room is connected: nothing is sent yet.
  await s.room.join();
  await s.settle();
  assert.deepEqual(s.requests.map(([url]) => url), ['/api/sessions/1/call?role=student']);
  assert.equal(s.rooms[0].options.stopLocalTrackOnUnpublish, false, 'CallMedia owns its tracks');
  assert.deepEqual(s.log, ['load', 'connect wss://class.test pass', 'publish microphone', 'publish camera simulcast']);
  assert.equal(s.room.status(), 'connected');

  // The microphone is muted in the room; the background effect replaces the camera track.
  s.log.length = 0;
  s.state.audio = false;
  s.state.video = 'effect';
  s.room.sync();
  await s.settle();
  assert.deepEqual(s.log, ['mute microphone', 'replace camera provided']);

  // The screen goes as a screen with its sound, the camera pauses; after the share the camera comes back.
  s.log.length = 0;
  Object.assign(s.state, { screen: true, screenAudio: true });
  s.room.sync();
  await s.settle();
  assert.deepEqual(s.log, ['unpublish camera', 'publish screen_share', 'publish screen_share_audio']);
  s.log.length = 0;
  Object.assign(s.state, { screen: false, audio: true, video: null });
  s.room.sync();
  await s.settle();
  assert.deepEqual(s.log, ['unmute microphone', 'unpublish screen_share', 'unpublish screen_share_audio']);
});

test("the teacher's mute of the camera turns it off in CallMedia, and the end of the call says why", async () => {
  const s = setup();
  await s.room.join();
  await s.settle();
  const [lkRoom] = s.rooms;
  s.log.length = 0;
  lkRoom.emit('TrackMuted', { source: Source.Camera }, lkRoom.localParticipant);
  assert.deepEqual(s.log, ['toggle video']);
  s.state.camera = false; // the own mute that follows finds the camera already off
  lkRoom.emit('TrackMuted', { source: Source.Camera }, lkRoom.localParticipant);
  lkRoom.emit('TrackMuted', { source: Source.Microphone }, lkRoom.localParticipant);
  assert.deepEqual(s.log, ['toggle video']);

  lkRoom.emit('Reconnecting');
  assert.equal(s.room.status(), 'reconnecting');
  lkRoom.emit('Reconnected');
  lkRoom.emit('Disconnected', 4);
  lkRoom.emit('Disconnected', 5);
  assert.deepEqual(s.ended, [['removed', undefined]], 'only the first end counts');
  assert.ok(s.log.includes('disconnect'));

  const reasons = [];
  for (const reason of [5, 2, 3]) {
    const other = setup();
    await other.room.join();
    other.rooms[0].emit('Disconnected', reason);
    reasons.push(other.ended[0][0]);
  }
  assert.deepEqual(reasons, ['ended', 'elsewhere', 'lost']);

  // Leaving is not an end the page hears about.
  const leaving = setup();
  await leaving.room.join();
  leaving.room.close();
  leaving.rooms[0].emit('Disconnected', 1);
  assert.deepEqual(leaving.ended, []);
});

test('a refused pass ends the call with the reason of the app and never loads LiveKit', async () => {
  const s = setup({ pass: { status: 403, body: { error: 'Звонок откроется, когда вы войдёте в занятие.' } } });
  await s.room.join();
  assert.deepEqual(s.ended, [['refused', 'Звонок откроется, когда вы войдёте в занятие.']]);
  assert.deepEqual(s.log, []);
});

test('the others are listed teacher first, then by name, with what each of them shows', async () => {
  const s = setup();
  await s.room.join();
  const [lkRoom] = s.rooms;
  const shown = (fields = {}) => ({ isMuted: false, track: { id: 'video' }, ...fields });
  lkRoom.remoteParticipants.set('3', participant('3', 'Петя', 'student', { microphone: shown({ isMuted: true }) }));
  lkRoom.remoteParticipants.set('t', participant('t', 'Анна', 'teacher', { microphone: shown(), camera: shown() }));
  lkRoom.remoteParticipants.set('2', participant('2', 'Оля', 'student', { camera: shown(), screen_share: shown({ track: { id: 'screen' } }) }));
  const peers = s.room.peers();
  assert.deepEqual(Array.from(peers, peer => [peer.name, peer.teacher, peer.audio, peer.camera, peer.video?.id ?? null, peer.screen?.id ?? null]), [
    ['Анна', true, true, true, 'video', null],
    ['Оля', false, false, true, 'screen', 'screen'],
    ['Петя', false, false, false, null, null],
  ]);

  // Sound plays from elements of the page, and the browser may hold it until a press.
  const audio = { kind: 'audio', element: { remove() { this.removed = true; } } };
  Object.assign(audio, { attach: () => audio.element, detach: () => [audio.element] });
  lkRoom.emit('TrackSubscribed', audio);
  lkRoom.emit('TrackUnsubscribed', audio);
  assert.equal(audio.element.removed, true);
  lkRoom.canPlaybackAudio = false;
  assert.equal(s.room.audioBlocked(), true);
});
