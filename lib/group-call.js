'use strict';

// The call of a group session runs on LiveKit, one room per session. The app hands the participants their passes,
// lets the teacher end the call, mute a student's microphone or camera and remove a student, and tells the lesson pages
// who is in the call. LiveKit reports joins and leaves with webhooks, which may be lost (a restarted LiveKit sends none),
// so the app also asks LiveKit itself: at start and every minute.
// Without LiveKit configured (`livekit` is null) a group has no call, and there is nobody in one.
const RESYNC_MS = 60 * 1000;
const PREFIX = 'session:';

function fail(statusCode, message) {
  throw Object.assign(new Error(message), { statusCode });
}

function createGroupCall({ livekit, broadcast, resyncMs = RESYNC_MS }) {
  const room = sessionId => PREFIX + sessionId;
  const presences = new Map(); // sessionId → { teacher, students: [names] } while someone is in the call
  const latest = new Map(); // sessionId → the last ListParticipants asked, so that an older answer does not win
  let asked = 0;

  function api() {
    if (!livekit) fail(503, 'Групповые звонки не настроены.');
    return livekit;
  }
  // A call made for the teacher: a missing participant is theirs to know about, any other refusal is LiveKit's failure.
  async function rooms(method, body) {
    try { return await api().rooms(method, body); }
    catch (error) {
      if (error.statusCode) throw error;
      if (error.status === 404) fail(404, 'Ученика нет в звонке.');
      console.error('Group call:', error.message);
      fail(502, 'Сервер звонков не ответил. Попробуйте ещё раз.');
    }
  }

  function presence(sessionId) {
    return presences.get(sessionId) || { teacher: false, students: [] };
  }
  function setPresence(sessionId, next) {
    const changed = JSON.stringify(next) !== JSON.stringify(presence(sessionId));
    if (next.teacher || next.students.length) presences.set(sessionId, next);
    else presences.delete(sessionId);
    if (changed) broadcast(sessionId, { type: 'call-presence', ...next });
  }
  // Who is in the call, as LiveKit knows it; each participant's role travels in the metadata of their pass.
  async function refresh(sessionId) {
    const ask = ++asked;
    latest.set(sessionId, ask);
    const { participants = [] } = await livekit.rooms('ListParticipants', { room: room(sessionId) });
    if (latest.get(sessionId) !== ask) return;
    latest.delete(sessionId);
    const role = participant => { try { return JSON.parse(participant.metadata).role; } catch { return null; } };
    setPresence(sessionId, { teacher: participants.some(participant => role(participant) === 'teacher'),
      students: participants.filter(participant => role(participant) === 'student').map(participant => participant.name)
        .sort((a, b) => a.localeCompare(b, 'ru')) });
  }
  // Every room LiveKit has, and every call we think someone is still in.
  async function resync() {
    const { rooms: listed = [] } = await livekit.rooms('ListRooms', {});
    const ids = new Set([...presences.keys(), ...listed.map(({ name }) => name)
      .filter(name => name.startsWith(PREFIX)).map(name => name.slice(PREFIX.length))]);
    await Promise.all([...ids].map(refresh));
  }
  const logged = promise => promise.catch(error => console.error('Group call presence:', error.message));
  if (livekit) {
    logged(resync());
    setInterval(() => logged(resync()), resyncMs).unref();
  }

  return {
    presence,

    // The pass of a participant of the lesson: the lesson identity, so a second device of the same person replaces the first.
    join(access, name) {
      return { url: api().publicUrl, token: livekit.token({ room: room(access.sessionId), identity: access.identity, name,
        metadata: { role: access.role } }) };
    },

    // Ending the call disconnects everyone; anyone may join again.
    async end(sessionId) {
      if (!livekit) return;
      try { await livekit.rooms('DeleteRoom', { room: room(sessionId) }); }
      catch (error) { if (error.status !== 404) throw error; }
      latest.delete(sessionId); // an answer still on its way is about the room that is gone
      setPresence(sessionId, { teacher: false, students: [] });
    },

    // The student may turn it back on: LiveKit lets nobody but the owner unmute a track.
    async mute(sessionId, { identity, source } = {}) {
      if (!['microphone', 'camera'].includes(source)) fail(400, 'Укажите микрофон или камеру.');
      const participant = await rooms('GetParticipant', { room: room(sessionId), identity: String(identity) });
      const track = participant.tracks?.find(item => item.source === source.toUpperCase());
      if (track && !track.muted) await rooms('MutePublishedTrack', { room: room(sessionId), identity: String(identity), track_sid: track.sid, muted: true });
    },

    // The student leaves the call; their pass still lets them back in until it expires.
    async remove(sessionId, { identity } = {}) {
      await rooms('RemoveParticipant', { room: room(sessionId), identity: String(identity) });
    },

    // A webhook LiveKit signed: the room it is about is asked who is in it now.
    webhook(rawBody, authorization) {
      const name = api().verifyWebhook(rawBody, authorization).room?.name || '';
      if (name.startsWith(PREFIX)) logged(refresh(name.slice(PREFIX.length)));
    },
  };
}

module.exports = { createGroupCall };
